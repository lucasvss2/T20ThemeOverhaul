/**
 * Kiai Divino — Dano Máximo
 *
 * Texto: "Uma vez por rodada, quando faz um ataque corpo a corpo, você pode
 * pagar 3 PM. Se acertar o ataque, causa dano máximo, sem necessidade de
 * rolar dados."
 *
 * Mecânica: AE em `actor.effects` com `flags.tormenta20.{onuse, attack, custo:"3"}`
 * + change `{key:"dano", value:"max", mode:0 (CUSTOM)}`. T20 `applyRollChanges`
 * detecta isso e seta `options.minmax="max"` → `damageRoll` → `roll.evaluate({maximize:true})`.
 * 3 PM debitados via `consumeMana` do T20.
 *
 * ── Problema multi-source de AE ──────────────────────────────────────────────
 *
 * Em uma cena real, podem co-existir 3 fontes de AE "Kiai Divino" para o mesmo
 * poder:
 *
 *  (1) AE nativa no ITEM (vinda do compêndio do T20). Tem nome "Kiai Divino",
 *      flags T20 corretas (onuse, attack, custo:3) MAS `changes: []` (vazia —
 *      só placeholder pra aparecer no AbilityUseDialog). `transfer: true`.
 *
 *  (2) Cópia auto-transferida no ACTOR pela máquina `transfer:true` do Foundry
 *      v13. Mesma data da (1), mas vive em `actor.effects` como documento
 *      persistente com origin = poder.uuid.
 *
 *  (3) AE nossa criada por versões anteriores do módulo, também no ACTOR, com
 *      changes corretas (maximize) + flag `t20-theme-overhaul.kiai`.
 *
 * O T20 AbilityUseDialog (linha 6193) itera `item.actor.effects.filter(...)`
 * e vê (2) E (3) → DOIS "Kiai Divino" no dialog (observado pelo usuário em v1.20.2).
 *
 * ── Estratégia (v1.20.4+) ────────────────────────────────────────────────────
 *
 * `ensureKiaiAE`:
 *   (a) Coleta todas AEs no actor com nome /kiai divino/i + origin = poder.uuid.
 *   (b) Escolhe uma PRIMARY (prefere a que tem maximize change + nossa flag).
 *   (c) Deleta as outras (duplicatas).
 *   (d) Atualiza a primary garantindo maximize change + nossa flag + disabled:true.
 *   (e) Se NENHUMA existe, cria uma na hora.
 *   (f) Item-level AE nativa: força `transfer:false` pra impedir Foundry de
 *       re-criar a cópia transferida em reloads/migrações. Não deletamos a AE
 *       do item pra não bagunçar o estado nativo do compêndio T20.
 *
 * `cleanupKiaiAE` (deleteItem hook): remove qualquer AE residual no actor
 * cuja origin aponte pro poder deletado.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

// ── Constantes ────────────────────────────────────────────────────────────────

const KIAI_FLAG = "kiai";
const KIAI_PODER_NAME = "kiai divino";
const KIAI_NAME_REGEX = /kiai\s*divino/i;

// ── Helpers de tipos ──────────────────────────────────────────────────────────

interface AEChange { key: string; value: unknown; mode: number; priority?: number | null }
interface AELike {
    id?: string;
    name?: string;
    origin?: string;
    changes?: AEChange[];
    flags?: Record<string, Record<string, unknown> | undefined>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isKiaiDivinoPoder(item: FoundryItem): boolean {
    if (item.type !== "poder") return false;
    return normalizeCondName(item.name).includes(KIAI_PODER_NAME);
}

function aeNameMatchesKiai(ae: AELike): boolean {
    return Boolean(ae.name && KIAI_NAME_REGEX.test(ae.name));
}

function hasMaximizeChange(ae: AELike): boolean {
    return (ae.changes ?? []).some(c =>
        c.key === "dano" && c.value === "max" && c.mode === 0
    );
}

function hasOurFlag(ae: AELike): boolean {
    return Boolean(ae.flags?.[MODULE_ID]?.[KIAI_FLAG]);
}

/** Score: prefere AEs que já têm a flag E maximize. */
function preferenceScore(ae: AELike): number {
    return (hasOurFlag(ae) ? 2 : 0) + (hasMaximizeChange(ae) ? 1 : 0);
}

function buildKiaiAEData(itemUuid: string): Record<string, unknown> {
    return {
        name: "Kiai Divino",
        icon: "systems/tormenta20/icons/svg/skills.svg",
        origin: itemUuid,
        disabled: true,
        transfer: false,
        changes: [
            { key: "dano", value: "max", mode: 0, priority: 20 },
        ],
        flags: {
            tormenta20: {
                onuse: true,
                durationScene: false,
                attack: true,
                custo: "3",
            },
            [MODULE_ID]: {
                [KIAI_FLAG]: true,
            },
        },
    };
}

async function deleteAEs(target: FoundryActor, ids: string[], label: string): Promise<void> {
    if (!ids.length) return;
    try {
        await target.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
    } catch (err) {
        warn(`Kiai Divino: falha ao deletar ${label}:`, err);
    }
}

/**
 * Força `transfer:false` na AE nativa do item (placeholder do compêndio T20).
 * Sem isso, o Foundry pode re-criar a cópia transferida em `actor.effects` em
 * reloads ou re-imports, voltando o estado duplicado.
 */
async function disableItemTransfer(item: FoundryItem): Promise<void> {
    const nativeAEs = (item.effects?.contents ?? []).filter(ae =>
        aeNameMatchesKiai(ae) && ae.transfer === true,
    );
    for (const ae of nativeAEs) {
        try {
            await ae.update({ transfer: false }, { render: false });
        } catch (err) {
            warn(`Kiai Divino: falha ao setar transfer:false na AE nativa do item:`, err);
        }
    }
}

/**
 * Garante exatamente UMA Kiai AE em `actor.effects` ligada ao poder, com
 * `changes: [{dano: max}]` e nossa flag. Deduplica AEs nativas transferidas e
 * versões antigas.
 */
async function ensureKiaiAE(item: FoundryItem): Promise<void> {
    const actor = item.actor;
    if (!actor) return;
    const itemUuid = item.uuid;
    if (!itemUuid) return;

    // (f) Primeiro: força transfer:false na AE nativa do item pra não regenerar
    // cópia transferida no actor depois.
    await disableItemTransfer(item);

    // (a) Coleta todas Kiai AEs no actor ligadas a este poder.
    const kiaiAEs = (actor.effects?.contents ?? [])
        .filter(e => e.origin === itemUuid && aeNameMatchesKiai(e));

    if (kiaiAEs.length === 0) {
        // (e) Nenhuma — cria.
        try {
            const effectData = buildKiaiAEData(itemUuid);
            await actor.createEmbeddedDocuments("ActiveEffect", [effectData], { render: false });
            log(`Kiai Divino: AE criada em "${actor.name}".`);
        } catch (err) {
            warn(`Kiai Divino: falha ao criar AE:`, err);
        }
        return;
    }

    // (b) Escolhe primary (maior score).
    const sorted = [...kiaiAEs].sort((a, b) => preferenceScore(b) - preferenceScore(a));
    const primary = sorted[0];
    const extras  = sorted.slice(1);

    // (c) Deleta duplicatas.
    if (extras.length) {
        const ids = extras.map(e => e.id).filter((id): id is string => Boolean(id));
        await deleteAEs(actor, ids, `${ids.length} AE(s) duplicada(s) no actor`);
        log(`Kiai Divino: ${ids.length} AE(s) duplicada(s) removida(s) de "${actor.name}".`);
    }

    // (d) Atualiza primary garantindo maximize + flag.
    if (primary && (!hasMaximizeChange(primary) || !hasOurFlag(primary))) {
        const newChanges: AEChange[] = hasMaximizeChange(primary)
            ? (primary.changes ?? [])
            : [
                ...(primary.changes ?? []),
                { key: "dano", value: "max", mode: 0, priority: 20 },
            ];
        try {
            await primary.update({
                changes: newChanges,
                disabled: true,
                [`flags.${MODULE_ID}.${KIAI_FLAG}`]: true,
            }, { render: false });
            log(`Kiai Divino: AE primary atualizada em "${actor.name}".`);
        } catch (err) {
            warn(`Kiai Divino: falha ao atualizar AE primary:`, err);
        }
    }
}

/**
 * Remove AEs residuais no actor quando o poder é deletado.
 */
async function cleanupKiaiAE(item: FoundryItem): Promise<void> {
    const actor = item.actor ?? item.parent;
    if (!actor) return;
    const itemUuid = item.uuid;
    if (!itemUuid) return;

    const stale = (actor.effects?.contents ?? []).filter(e =>
        e.origin === itemUuid && aeNameMatchesKiai(e),
    );
    if (!stale.length) return;

    const ids = stale.map(e => e.id).filter((id): id is string => Boolean(id));
    await deleteAEs(actor, ids, "AE residual no actor (poder deletado)");
}

// ── Entrada pública ───────────────────────────────────────────────────────────

export function setupKiaiDivino(): void {
    // ready: cada usuário processa SEUS atores controlados (owner level ≥ 3).
    // GM faz fallback pra atores sem owner explícito.
    Hooks.once("ready", () => {
        const myId = game.user?.id;
        if (!myId) return;
        for (const actorLike of game.actors?.contents ?? []) {
            const actor = actorLike as FoundryActor;
            const ownLevel = (actor.ownership as Record<string, number> | undefined)?.[myId] ?? 0;
            const isOwner = ownLevel >= 3;
            const isFallbackGM = game.user?.isGM && ownLevel === 0;
            if (!isOwner && !isFallbackGM) continue;
            for (const item of actor.items?.contents ?? []) {
                if (isKiaiDivinoPoder(item)) {
                    void ensureKiaiAE(item);
                }
            }
        }
    });

    // createItem: novo poder adicionado (drag&drop, importação).
    Hooks.on("createItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;

        if (!userId || userId !== game.user?.id) return;
        if (!item.parent) return;
        if (!isKiaiDivinoPoder(item)) return;

        void ensureKiaiAE(item);
    });

    // deleteItem: cleanup.
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;

        if (!userId || userId !== game.user?.id) return;
        if (!isKiaiDivinoPoder(item)) return;

        void cleanupKiaiAE(item);
    });
}
