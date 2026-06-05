/**
 * Disparo Sublime — poder do Caçador (Arqueiro).
 *
 * Texto: "Você pode gastar uma ação de movimento e 2 PM para fazer um teste de
 * Percepção (CD 15 + ND da criatura) contra uma criatura em alcance médio. Se
 * passar no teste e acertar um ataque com arco contra o alvo na mesma rodada,
 * esse ataque é um acerto crítico automático."
 *
 * ── Arquitetura ───────────────────────────────────────────────────────────────
 *
 * Duas fases:
 *
 * 1. ATIVAÇÃO (uso do poder):
 *    - O T20 posta o card do poder mas NÃO debita os 2 PM (poder sem rolls /
 *      sem on-use selecionável → não passa pelo AbilityUseDialog).
 *    - Detectamos o card via `extractSpellName` ~ "disparo sublime" (autor = o
 *      próprio usuário). Pegamos o alvo de `game.user.targets` (1 criatura),
 *      debitamos 2 PM, rolamos Percepção (1d20 + perc) vs CD = 15 + ND do alvo,
 *      e postamos um card BG3 com o resultado.
 *    - Se PASSAR: criamos uma AE on-use TRANSIENTE no caster com
 *      `{key:"criticoM", value:"1", mode:OVERRIDE}` + flags
 *      `{onuse:true, attack:true}`. Com a margem de ameaça em 1, QUALQUER
 *      acerto vira ameaça → crítico (T20 trata nativamente: ameaça que acerta =
 *      crítico, sem confirmação). A AE aparece como checkbox "Disparo Sublime
 *      (Crítico)" no AbilityUseDialog do próximo ataque com arma.
 *
 * 2. ATAQUE (consumo):
 *    - O jogador marca o checkbox no ataque com arco → o T20 aplica criticoM=1
 *      → o ataque é crítico automático se acertar.
 *    - Detectamos o consumo via `onUseEffects` incluindo a AE → removemos a AE
 *      (one-shot) e postamos uma nota de confirmação.
 *
 * ── Expiração ("mesma rodada") ────────────────────────────────────────────────
 * Em combate, o GM ativo remove a AE no fim do turno do caster (combatTurnChange
 * com `prior` = caster). Fora de combate, a AE persiste até ser consumida ou
 * re-armada (novo uso do poder substitui a anterior).
 *
 * ── Restrição "com arco" ──────────────────────────────────────────────────────
 * A AE on-use aparece em qualquer ataque com arma; cabe ao jogador marcá-la no
 * ataque com arco (mesmo padrão do Mira Apurada). Isso também resolve "contra o
 * alvo" — o jogador aplica no ataque correto.
 */

import { MODULE_ID } from "@/constants";
import { isActiveGM } from "@/_shared";
import { extractSpellName, extractItemId, normalizeCondName, getMsgAuthorId } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";
import DS_STYLES from "./disparo-sublime.css?inline";

// ── Constantes ────────────────────────────────────────────────────────────────

const SUBLIME_PODER_NAME = "disparo sublime";
const SUBLIME_NAME_REGEX = /disparo\s*sublime/i;
const SUBLIME_AE_NAME    = "Disparo Sublime (Crítico)";
const SUBLIME_FLAG       = "disparoSublime";
const PM_COST            = 2;
const BASE_CD            = 15;
/** Margem de ameaça forçada quando armado — 1 = qualquer acerto vira crítico. */
const FORCED_CRITICO_M   = "1";
const STYLES_ID          = "bg3-t20-disparo-sublime-styles";

// ── CSS ─────────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (!document.getElementById(STYLES_ID)) {
        const el = document.createElement("style");
        el.id = STYLES_ID;
        el.textContent = DS_STYLES;
        document.head.appendChild(el);
    }
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Funções puras (testáveis) ─────────────────────────────────────────────────

/** CD do teste de Percepção: 15 + ND da criatura. */
export function computeSublimeCD(nd: number): number {
    return BASE_CD + (Number.isFinite(nd) ? nd : 0);
}

/** Converte um ND (string "2", number 2, "ND 3"…) em inteiro. 0 se inválido. */
export function parseND(raw: unknown): number {
    if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : 0;
    if (typeof raw === "string") {
        const m = raw.match(/-?\d+/);
        return m ? parseInt(m[0], 10) : 0;
    }
    return 0;
}

/** Teste de Percepção passou? (total >= CD) */
export function perceptionPasses(total: number, cd: number): boolean {
    return total >= cd;
}

// ── Detecção ──────────────────────────────────────────────────────────────────

/** A mensagem é a ativação do poder Disparo Sublime? (card do poder, sem ataque) */
function isSublimeActivation(message: ChatMessage): boolean {
    const hasAttack = (message.rolls ?? []).some(
        r => (r.options as Record<string, unknown>)?.["type"] === "attack",
    );
    if (hasAttack) return false;
    const name = normalizeCondName(extractSpellName(message));
    return name.includes(SUBLIME_PODER_NAME);
}

/** A mensagem é um ataque que consumiu (marcou) a AE de Disparo Sublime? */
function isSublimeConsumption(message: ChatMessage): boolean {
    const hasAttack = (message.rolls ?? []).some(
        r => (r.options as Record<string, unknown>)?.["type"] === "attack",
    );
    if (!hasAttack) return false;
    type OnUseEntry = { description?: string };
    const t20 = (message.flags as Record<string, unknown>)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    if (!Array.isArray(raw)) return false;
    return (raw as OnUseEntry[]).some(ef => SUBLIME_NAME_REGEX.test(ef.description ?? ""));
}

// ── Resolução de ator / alvo ──────────────────────────────────────────────────

function resolveActorFromMessage(message: ChatMessage): FoundryActor | null {
    const speaker = message.speaker as { token?: string; actor?: string } | undefined;
    type CanvasTokenLyr = { get(id: string): { actor: FoundryActor | null } | undefined };
    const tokenLyr = (canvas as unknown as { tokens?: CanvasTokenLyr }).tokens;
    const tokActor = speaker?.token ? tokenLyr?.get(speaker.token)?.actor : null;
    return tokActor ?? (speaker?.actor ? game.actors?.get(speaker.actor) ?? null : null);
}

interface TargetInfo { actor: FoundryActor | null; name: string; tokenId: string }

function getSingleTarget(): TargetInfo | null {
    const targets = [...((game.user?.targets as Set<unknown> | undefined) ?? [])] as Array<{
        actor?: FoundryActor | null;
        id?: string;
        document?: { name?: string };
        name?: string;
    }>;
    if (targets.length !== 1) return null;
    const t = targets[0];
    return {
        actor: t.actor ?? null,
        name: t.document?.name ?? t.name ?? "alvo",
        tokenId: t.id ?? "",
    };
}

// ── AE management ─────────────────────────────────────────────────────────────

function buildSublimeAEData(poderUuid: string, round: number, target: TargetInfo): Record<string, unknown> {
    return {
        name: SUBLIME_AE_NAME,
        icon: "systems/tormenta20/icons/svg/eye.svg",
        origin: poderUuid,
        disabled: true,
        transfer: false,
        changes: [{ key: "criticoM", value: FORCED_CRITICO_M, mode: 5 }], // OVERRIDE → ameaça em qualquer acerto
        flags: {
            tormenta20: { onuse: true, durationScene: false, attack: true, custo: "" },
            [MODULE_ID]: {
                [SUBLIME_FLAG]: true,
                round,
                targetTokenId: target.tokenId,
                targetName: target.name,
            },
        },
    };
}

function collectSublimeAEs(actor: FoundryActor): FoundryItemEffect[] {
    return (actor.effects?.contents ?? []).filter(
        e => Boolean(e.flags?.[MODULE_ID]?.[SUBLIME_FLAG]) || (e.name ?? "") === SUBLIME_AE_NAME,
    );
}

async function deleteSublimeAEs(actor: FoundryActor): Promise<number> {
    const ids = collectSublimeAEs(actor).map(e => e.id).filter((id): id is string => Boolean(id));
    if (!ids.length) return 0;
    try {
        await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
    } catch (err) {
        warn(`Disparo Sublime: falha ao remover AE:`, err);
    }
    return ids.length;
}

// ── PM ──────────────────────────────────────────────────────────────────────────

function getPM(actor: FoundryActor): number {
    const pm = (actor.system as { attributes?: { pm?: { value?: number } } })?.attributes?.pm;
    return Number(pm?.value ?? 0);
}

async function debitPM(actor: FoundryActor, cost: number): Promise<void> {
    const cur = getPM(actor);
    await actor.update({ "system.attributes.pm.value": Math.max(0, cur - cost) });
}

// ── Perícia ───────────────────────────────────────────────────────────────────

function getPercepcaoBonus(actor: FoundryActor): number {
    const per = (actor.system as { pericias?: Record<string, { value?: number }> })?.pericias?.["perc"];
    return Number(per?.value ?? 0);
}

// ── Card ────────────────────────────────────────────────────────────────────────

function buildCard(opts: {
    targetName: string;
    rollTotal: number;
    natural: number;
    cd: number;
    nd: number;
    passed: boolean;
    casterName: string;
}): string {
    const outcome = opts.passed
        ? `<div class="ds-outcome ds-pass">✓ PASSOU — próximo acerto com arco é CRÍTICO</div>`
        : `<div class="ds-outcome ds-fail">✗ Falhou — sem crítico automático</div>`;
    const hint = opts.passed
        ? `<div class="ds-hint">Marque "${esc(SUBLIME_AE_NAME)}" no seu ataque com arco contra o alvo nesta rodada.</div>`
        : "";
    return `
        <div class="ds-card">
            <div class="ds-header"><i class="fas fa-bullseye"></i> Disparo Sublime — ${esc(opts.casterName)}</div>
            <div class="ds-target-row">Alvo: <span class="ds-target-name">${esc(opts.targetName)}</span> (ND ${opts.nd})</div>
            <div class="ds-divider"></div>
            <div class="ds-test-row">
                <div class="ds-block">
                    <div class="ds-block-label">Percepção</div>
                    <div class="ds-block-value">${opts.rollTotal}</div>
                    <div class="ds-block-label" style="margin-top:3px;">natural ${opts.natural}</div>
                </div>
                <div class="ds-vs">VS</div>
                <div class="ds-block">
                    <div class="ds-block-label">CD</div>
                    <div class="ds-block-value">${opts.cd}</div>
                    <div class="ds-block-label" style="margin-top:3px;">15 + ND</div>
                </div>
            </div>
            <div class="ds-divider"></div>
            ${outcome}
            ${hint}
        </div>
    `;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function processActivation(message: ChatMessage): Promise<void> {
    ensureStyles();

    const actor = resolveActorFromMessage(message);
    if (!actor) return;

    const target = getSingleTarget();
    if (!target || !target.actor) {
        ui.notifications?.warn("Disparo Sublime: alve exatamente uma criatura antes de usar o poder.");
        return;
    }

    if (getPM(actor) < PM_COST) {
        ui.notifications?.warn(`Disparo Sublime: PM insuficiente (custa ${PM_COST}).`);
        return;
    }

    // ND do alvo (NPC: system.attributes.nd)
    const nd = parseND(
        (target.actor.system as { attributes?: { nd?: unknown } })?.attributes?.nd,
    );
    const cd = computeSublimeCD(nd);

    // Debita PM e rola Percepção
    await debitPM(actor, PM_COST);

    const percBonus = getPercepcaoBonus(actor);
    const roll = new Roll(`1d20 + ${percBonus}`);
    await (roll as unknown as { evaluate: (o?: object) => Promise<unknown> }).evaluate();
    const total = roll.total ?? 0;
    const natural = ((roll.dice?.[0] as { results?: Array<{ result: number }> } | undefined)?.results?.[0]?.result) ?? 0;
    const passed = perceptionPasses(total, cd);

    const casterName = (message.speaker as { alias?: string })?.alias ?? actor.name ?? "Caçador";

    // Re-arma: remove qualquer AE anterior antes de criar a nova
    await deleteSublimeAEs(actor);

    if (passed) {
        const round = (game.combat as { round?: number } | null)?.round ?? 0;
        const itemId = extractItemId(message);
        const poder = itemId ? actor.items?.get(itemId) : null;
        const poderUuid = (poder as { uuid?: string } | null)?.uuid ?? "";
        try {
            await actor.createEmbeddedDocuments(
                "ActiveEffect", [buildSublimeAEData(poderUuid, round, target)], { render: false },
            );
        } catch (err) {
            warn(`Disparo Sublime: falha ao criar AE armada:`, err);
        }
    }

    await ChatMessage.create({
        content: buildCard({ targetName: target.name, rollTotal: total, natural, cd, nd, passed, casterName }),
        rolls: [roll.toJSON()],
        type: 5,
        speaker: { alias: casterName },
    });

    log(`Disparo Sublime: ${casterName} vs ${target.name} (ND ${nd}) — Percepção ${total} vs CD ${cd} → ${passed ? "PASSOU (armado)" : "falhou"}.`);
}

async function processConsumption(message: ChatMessage): Promise<void> {
    const actor = resolveActorFromMessage(message);
    if (!actor) return;
    const removed = await deleteSublimeAEs(actor);
    if (removed > 0) {
        log(`Disparo Sublime: crítico automático consumido por "${actor.name}" — AE removida.`);
    }
}

// ── Entrada pública ───────────────────────────────────────────────────────────

export function setupDisparoSublime(): void {
    Hooks.once("ready", () => {
        ensureStyles();
    });

    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;
        if (getMsgAuthorId(message) !== game.user?.id) return;
        if (isSublimeActivation(message)) {
            void processActivation(message);
            return;
        }
        if (isSublimeConsumption(message)) {
            void processConsumption(message);
        }
    });

    // Expiração "mesma rodada": o GM ativo remove a AE no fim do turno do caster.
    Hooks.on("combatTurnChange", (...args: unknown[]): void => {
        if (!isActiveGM()) return;
        const prior = args[1] as { tokenId?: string; actorId?: string } | undefined;
        if (!prior) return;
        type CanvasTokenLyr = { get(id: string): { actor: FoundryActor | null } | undefined };
        const tokenLyr = (canvas as unknown as { tokens?: CanvasTokenLyr }).tokens;
        const actor = (prior.tokenId ? tokenLyr?.get(prior.tokenId)?.actor : null)
            ?? (prior.actorId ? game.actors?.get(prior.actorId) ?? null : null);
        if (!actor) return;
        if (collectSublimeAEs(actor).length) void deleteSublimeAEs(actor);
    });

    // Limpeza se o poder for removido do ator.
    Hooks.on("deleteItem", (...args: unknown[]): void => {
        const item = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;
        if (item.type !== "poder") return;
        if (!normalizeCondName(item.name).includes(SUBLIME_PODER_NAME)) return;
        const actor = item.actor ?? item.parent;
        if (actor) void deleteSublimeAEs(actor as FoundryActor);
    });
}
