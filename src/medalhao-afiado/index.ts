/**
 * Medalhão Afiado
 *
 * Quando o lançador tem o "Medalhão Afiado" equipado e lança uma magia que
 * fornece bônus em testes de ataque (ex: Bênção, Arma de Jade), os alvos
 * marcados com T também recebem +1 na margem de ameaça de todas as armas
 * equipadas — implementado como AE (-1 em system.criticoM) em cada arma.
 *
 * Fluxo:
 *   createChatMessage (autor) → detecta spell com AE de ataque → caster tem
 *   Medalhão equipado → para cada alvo T: armas equipadas → AE por arma.
 *   Player → delega ao GM via socket (permissão de editar itens de 3º).
 */

import { MODULE_ID } from "@/constants";
import { extractSpellName, getMsgAuthorId, normalizeCondName } from "@/spell-resistance/index";
import { isUndead } from "@/area-spells/consagrar";
import { getSocket, onSocketReady } from "@/socket";
import { warn } from "@/utils/logging";

// ── Constantes ────────────────────────────────────────────────────────────────

const SOCKET_APPLY   = "medalhao-afiado/apply-margem";
const SOCKET_CLEANUP = "medalhao-afiado/cleanup";
const MEDALHAO_FLAG = "medalhaoAfiado";
const MEDALHAO_NAME_NORMALIZED = "medalhao afiado";
const SPELL_TIPOS = ["arc", "div", "uni"] as const;

/**
 * Magias cujo bônus em testes (e portanto o Medalhão Afiado) só se aplica a
 * alvos específicos. Cada entrada define um filtro a ser aplicado nos alvos
 * antes de criar o AE Medalhão.
 *
 * Profanar (Necromancia divina): "mortos-vivos na área recebem +2 na Defesa
 * e +2 em todos os testes". Apenas alvos mortos-vivos recebem o bônus.
 */
const SPELL_TARGET_FILTERS: Record<string, (actor: FoundryActor) => boolean> = {
    "profanar": isUndead,
};

/**
 * Determina se a key (e value) de uma change AE concede bônus em testes de
 * ataque. Cobre:
 *
 *  1. Chave curta "ataque" — T20 internal (Arma de Jade, etc.) → modifica
 *     diretamente o roll de ataque do item.
 *  2. `system.modificadores.ataque.*` — bônus global/cac/ad direto no ataque.
 *  3. `system.modificadores.pericias.ataque*` — bônus específico em Luta/Pontaria.
 *  4. `system.modificadores.pericias.geral*` — bônus em TODAS as perícias
 *     (Heroísmo, Oração, Profanar). Inclui automaticamente Luta/Pontaria,
 *     portanto afeta testes de ataque.
 *
 * EXCLUI:
 *  - `system.modificadores.pericias.semataque*` — explicitamente "sem ataque",
 *    usado para bônus em todas perícias EXCETO Luta/Pontaria.
 *  - `system.modificadores.pericias.resistencia*` — testes de resistência (saves).
 *  - Changes com value/mode neutros (ex: value=0).
 *  - Penalidades (value negativo) — Medalhão é bônus, não compensa penalidade.
 *
 * Sufixos T20 `&bonus`, `&penalidade`, `&magico` são considerados — o key real
 * é o prefixo antes do `&`.
 */
function isAttackBonusChange(change: { key?: string; value?: string | number; mode?: number }): boolean {
    const fullKey = (change.key ?? "").toString();
    if (!fullKey) return false;

    // Parse sufixo &bonus / &penalidade / &magico etc.
    const [baseKey, suffix] = fullKey.split("&");

    // Penalidades não disparam o Medalhão (não compensa).
    if (suffix === "penalidade") return false;

    // Value > 0 (Medalhão é bônus). Strings tipo "1d4" também aceitas (valor > 0 implícito).
    const numVal = Number(change.value);
    if (Number.isFinite(numVal) && numVal <= 0) return false;

    // Lista de exclusões EXATAS (saves, sem-ataque).
    if (
        baseKey.startsWith("system.modificadores.pericias.semataque")
        || baseKey.startsWith("system.modificadores.pericias.resistencia")
    ) return false;

    // Lista de inclusões.
    if (baseKey === "ataque") return true;
    if (baseKey.startsWith("system.modificadores.ataque.")) return true;
    if (baseKey.startsWith("system.modificadores.pericias.ataque")) return true;
    if (baseKey.startsWith("system.modificadores.pericias.geral")) return true;

    return false;
}

// ── Tipos de payload socket ───────────────────────────────────────────────────

interface MargemApplyRequest {
    type: typeof SOCKET_APPLY;
    casterName: string;
    targets: Array<{
        actorUuid: string;
        weaponItemIds: string[];
    }>;
    aeData: Record<string, unknown>;
}

interface MargemCleanupRequest {
    type: typeof SOCKET_CLEANUP;
    actorUuid: string;
    deletedAEName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verifica se o item está equipado. T20 tem dois esquemas:
 *  - Legacy: `system.equipado` (number 0-2 para armas, boolean para equipamento)
 *  - Slot system (setting `equipmentSlots` true): `system.equipado2.slot > 0`
 *
 * Em mesas com `equipmentSlots: true` (caso da campanha atual), o campo legacy
 * `equipado` fica em 0 mesmo para armas equipadas — temos que checar `equipado2.slot`.
 */
function isItemEquipped(item: FoundryItem): boolean {
    type T20Sys = {
        equipado?: unknown;
        equipado2?: { slot?: unknown };
    };
    const sys = item.system as T20Sys;

    // Slot system: se o setting está ativo, prefere checar equipado2.slot
    const useSlots = (() => {
        try {
            return Boolean(game.settings?.get?.("tormenta20", "equipmentSlots"));
        } catch {
            return false;
        }
    })();

    if (useSlots) {
        const slot = sys.equipado2?.slot;
        if (typeof slot === "number") return slot > 0;
        if (typeof slot === "string") {
            const n = Number(slot);
            return Number.isFinite(n) && n > 0;
        }
    }

    // Fallback / legacy
    const eq = sys.equipado;
    if (typeof eq === "number") return eq > 0;
    if (typeof eq === "boolean") return eq;
    if (typeof eq === "string") return eq !== "" && eq !== "0" && eq !== "false";
    return Boolean(eq);
}

/**
 * Verifica se o ator tem "Medalhão Afiado" (equipamento) equipado.
 * Usa .includes() porque o item pode vir com sufixo de melhoria, ex:
 * "Medalhão Afiado Vigilante" — o nome base permanece como substring.
 */
function hasMedalhaoAfiado(actor: FoundryActor): boolean {
    for (const item of actor.items?.contents ?? []) {
        if (item.type !== "equipamento") continue;
        if (!normalizeCondName(item.name).includes(MEDALHAO_NAME_NORMALIZED)) continue;
        if (isItemEquipped(item)) return true;
    }
    return false;
}

/** Retorna true se algum grupo de efeito contém uma mudança de bônus de ataque. */
function hasAttackBonusEffect(effectGroups: Record<string, unknown>[][]): boolean {
    for (const group of effectGroups) {
        for (const ae of group) {
            const changes = (ae as { changes?: Array<{ key?: string; value?: string | number; mode?: number }> }).changes ?? [];
            for (const ch of changes) {
                if (isAttackBonusChange(ch)) return true;
            }
        }
    }
    return false;
}

/** Armas equipadas do ator. */
function getEquippedWeapons(actor: FoundryActor): FoundryItem[] {
    return (actor.items?.contents ?? []).filter(
        item => item.type === "arma" && isItemEquipped(item),
    );
}

/**
 * Constrói o AE de margem de ameaça para aplicar nas armas.
 * Copia a duração do primeiro AE do grupo de efeitos da magia, se disponível.
 *
 * `sourceSpellName` é o nome da magia (ex: "Bênção", "Arma de Jade") —
 * usado depois para fazer cleanup quando o buff da magia for removido.
 */
function buildMargemAEData(
    effectGroups: Record<string, unknown>[][],
    messageId: string,
    sourceSpellName: string,
): Record<string, unknown> {
    const baseDuration = (
        effectGroups[0]?.[0] as Record<string, unknown> | undefined
    )?.duration as Record<string, unknown> | undefined;

    const duration: Record<string, unknown> = {};
    if (baseDuration && typeof baseDuration.seconds === "number") {
        duration.seconds = baseDuration.seconds;
        const g = game as unknown as { time?: { worldTime: number } };
        duration.startTime = g.time?.worldTime ?? 0;
    } else if (baseDuration?.rounds) {
        duration.rounds = baseDuration.rounds;
    }

    return {
        name: "Medalhão Afiado — Margem de Ameaça",
        icon: "icons/equipment/neck/amulet-gem-brown.webp",
        // Key curta "criticoM" + flags T20 imita o T20WeaponUpgrades.precise:
        // applyOnUseEffects processa AEs com `onuse: true`+`self: true` durante
        // o roll do item, aplicando o -1 ao criticoM do clone (não persiste no
        // item original). O label da ficha é atualizado por
        // patchT20WeaponUpgradeLabels (que reconhece flag `tormenta20.upgrade`).
        changes: [
            { key: "criticoM", value: "-1", mode: 2, priority: 20 },
        ],
        duration,
        disabled: false,
        transfer: false,
        flags: {
            tormenta20: {
                onuse: true,
                durationScene: false,
                upgrade: "medalhao-afiado",
                self: true,
            },
            [MODULE_ID]: {
                [MEDALHAO_FLAG]: true,
                sourceMessageId: messageId,
                sourceSpellName,         // ex: "Bênção" — usado no cleanup
            },
        },
    };
}

// ── Aplicação de AE nas armas ─────────────────────────────────────────────────

async function applyMargemToWeapons(
    targets: MargemApplyRequest["targets"],
    aeData: Record<string, unknown>,
    casterName: string,
): Promise<void> {
    type ItemWithCreate = FoundryItem & {
        createEmbeddedDocuments(type: string, data: unknown[]): Promise<unknown>;
    };

    let weaponCount = 0;
    const actorNames: string[] = [];

    for (const { actorUuid, weaponItemIds } of targets) {
        const actor = fromUuidSync(actorUuid) as FoundryActor | null;
        if (!actor) continue;

        let actorApplied = false;
        for (const weaponId of weaponItemIds) {
            const weapon = actor.items?.get(weaponId) as ItemWithCreate | undefined;
            if (!weapon) continue;
            try {
                await weapon.createEmbeddedDocuments("ActiveEffect", [aeData]);
                weaponCount++;
                actorApplied = true;
            } catch (err) {
                warn(`Medalhão Afiado: falha ao aplicar em ${weapon.name} (${actor.name}):`,
                    err,
                );
            }
        }
        if (actorApplied && !actorNames.includes(actor.name)) {
            actorNames.push(actor.name);
        }
    }

    if (weaponCount > 0) {
        ui.notifications?.info(
            `${casterName}: Medalhão Afiado — margem de ameaça +1 em ${actorNames.join(", ")} (${weaponCount} arma(s))`,
        );
    }
}

// ── Handler GM-side do socket ─────────────────────────────────────────────────

async function handleApplyMargemSocket(req: unknown): Promise<void> {
    if (!game.user?.isGM) return;
    const r = req as MargemApplyRequest;
    await applyMargemToWeapons(r.targets, r.aeData, r.casterName);
}

// ── Cleanup do Medalhão quando o buff fonte é removido ────────────────────────

/**
 * Remove AEs Medalhão Afiado das armas do ator cujo `sourceSpellName` bate com
 * `deletedAEName` (com normalização). Chamada localmente pelo GM ou via socket
 * por player quando um AE buff é removido do ator.
 */
async function cleanupMedalhaoForActor(actor: FoundryActor, deletedAEName: string): Promise<void> {
    const normDeleted = normalizeCondName(deletedAEName);
    if (!normDeleted) return;

    type ItemWithDelete = FoundryItem & {
        deleteEmbeddedDocuments(type: string, ids: string[]): Promise<unknown>;
    };

    let cleaned = 0;
    for (const item of actor.items?.contents ?? []) {
        if (item.type !== "arma") continue;
        const toDelete: string[] = [];
        for (const eff of item.effects?.contents ?? []) {
            const flags = (eff.flags as Record<string, unknown> | undefined)?.[MODULE_ID] as
                | { medalhaoAfiado?: boolean; sourceSpellName?: string }
                | undefined;
            if (!flags?.medalhaoAfiado) continue;
            const sourceName = flags.sourceSpellName ?? "";
            const normSource = normalizeCondName(sourceName);
            // Match permissivo: normalizado igual OU um contém o outro
            // (cobre nomes como "Bênção" → AE "Benção" sem cedilha).
            const matches = normSource === normDeleted
                || normSource.includes(normDeleted)
                || normDeleted.includes(normSource);
            if (matches) toDelete.push(eff.id);
        }
        if (toDelete.length) {
            try {
                await (item as ItemWithDelete).deleteEmbeddedDocuments("ActiveEffect", toDelete);
                cleaned += toDelete.length;
            } catch (err) {
                warn(`Cleanup falhou em ${item.name} (${actor.name}):`, err);
            }
        }
    }

    if (cleaned > 0) {
        ui.notifications?.info(
            `Medalhão Afiado: removido(s) ${cleaned} efeito(s) de ${actor.name} (buff "${deletedAEName}" terminou)`,
        );
    }
}

/** Handler GM-side do socket de cleanup. */
async function handleCleanupSocket(req: unknown): Promise<void> {
    if (!game.user?.isGM) return;
    const r = req as MargemCleanupRequest;
    const actor = fromUuidSync(r.actorUuid) as FoundryActor | null;
    if (!actor) return;
    await cleanupMedalhaoForActor(actor, r.deletedAEName);
}

/**
 * Hook `deleteActiveEffect` — quando um AE é removido de um ator, verifica se
 * há AEs Medalhão Afiado nas armas desse ator linkados a esse buff e remove.
 *
 * Multi-client: o hook dispara em TODOS os clientes. Para evitar duplicação,
 * apenas o usuário QUE DISPAROU o delete (`userId === game.user.id`) processa.
 * Se ele for GM, aplica direto. Senão, delega via socketlib `executeAsGM`
 * (que pega um GM qualquer pra rodar).
 */
function onDeleteActiveEffect(...args: unknown[]): void {
    const effect = args[0] as {
        parent?: { documentName?: string; uuid?: string };
        name?: string;
        flags?: Record<string, unknown>;
    };
    const userId = args[2] as string | undefined;

    // Apenas o usuário que fez o delete processa (evita N execuções)
    if (!userId || userId !== game.user?.id) return;

    // Apenas AEs cuja parent é um Actor
    const parent = effect.parent;
    if (!parent || parent.documentName !== "Actor") return;

    // Ignora deleção do próprio AE Medalhão (defensivo)
    const ourFlag = (effect.flags?.[MODULE_ID] as { medalhaoAfiado?: boolean } | undefined);
    if (ourFlag?.medalhaoAfiado) return;

    const deletedName = effect.name ?? "";
    if (!deletedName) return;
    const actorUuid = parent.uuid;
    if (!actorUuid) return;

    const actor = fromUuidSync(actorUuid) as FoundryActor | null;
    if (!actor) return;

    // Skip se ator não tem armas com medalhão (evita socket round-trip à toa)
    const hasAnyMedalhao = (actor.items?.contents ?? []).some(it =>
        it.type === "arma"
        && (it.effects?.contents ?? []).some(e => {
            const f = (e.flags as Record<string, unknown> | undefined)?.[MODULE_ID] as
                | { medalhaoAfiado?: boolean }
                | undefined;
            return Boolean(f?.medalhaoAfiado);
        }),
    );
    if (!hasAnyMedalhao) return;

    // GM: aplica direto.
    if (game.user?.isGM) {
        void cleanupMedalhaoForActor(actor, deletedName);
        return;
    }

    // Player: delega via socketlib.executeAsGM (escolhe 1 GM internamente).
    const req: MargemCleanupRequest = {
        type: SOCKET_CLEANUP,
        actorUuid,
        deletedAEName: deletedName,
    };
    void getSocket()?.executeAsGM(SOCKET_CLEANUP, req);
}

// ── Lógica principal ──────────────────────────────────────────────────────────

async function processMedalhaoMessage(message: ChatMessage): Promise<void> {
    // 1. Apenas o autor processa
    if (getMsgAuthorId(message) !== game.user?.id) return;

    // 2. Apenas magias (arc/div/uni)
    const itemData = message.getFlag("tormenta20", "itemData") as Record<string, unknown> | undefined;
    if (!itemData) return;
    const tipo = itemData["tipo"] as string | undefined;
    if (!tipo || !(SPELL_TIPOS as readonly string[]).includes(tipo)) return;

    // 3. Deve ter grupos de efeito com bônus de ataque
    type EffectGroup = Record<string, unknown>[];
    const effectGroups = message.getFlag("tormenta20", "effects") as EffectGroup[] | undefined;
    if (!effectGroups?.length || !hasAttackBonusEffect(effectGroups)) return;

    // 4. Caster deve ter Medalhão Afiado equipado
    const casterActorId = message.speaker?.actor ?? "";
    const casterActor = game.actors?.get(casterActorId);
    if (!casterActor || !hasMedalhaoAfiado(casterActor)) return;

    // 5. Deve ter alvos T-marcados com armas equipadas
    const targets = Array.from(game.user?.targets ?? []) as FoundryToken[];
    if (!targets.length) {
        ui.notifications?.warn("Medalhão Afiado: nenhum alvo selecionado (T)");
        return;
    }

    const targetData: MargemApplyRequest["targets"] = [];
    for (const token of targets) {
        const actor = token.actor;
        if (!actor) continue;
        const weapons = getEquippedWeapons(actor);
        if (!weapons.length) continue;
        targetData.push({
            actorUuid: actor.uuid,
            weaponItemIds: weapons.map(w => w.id),
        });
    }

    if (!targetData.length) return;

    const casterName = message.speaker?.alias ?? casterActor.name ?? "Lançador";
    // itemData NÃO tem `name` top-level (é só `this.system` snapshot, T20 line 7339).
    // Usamos extractSpellName que resolve via data-item-id no HTML do card.
    const sourceSpellName = extractSpellName(message);

    // Filtra targetData por magias que só afetam alvos específicos (ex: Profanar
    // só atinge mortos-vivos). Comparação por nome normalizado.
    const normSpell = normalizeCondName(sourceSpellName);
    const targetFilter: ((actor: FoundryActor) => boolean) | undefined =
        Object.prototype.hasOwnProperty.call(SPELL_TARGET_FILTERS, normSpell)
            ? SPELL_TARGET_FILTERS[normSpell]
            : undefined;
    const filteredTargetData = targetFilter
        ? targetData.filter(t => {
            const a = fromUuidSync(t.actorUuid) as FoundryActor | null;
            return a ? targetFilter(a) : false;
        })
        : targetData;

    if (!filteredTargetData.length) {
        // Nenhum alvo elegível após filtro (ex: Profanar em um grupo sem mortos-vivos).
        if (targetFilter) {
            ui.notifications?.info(
                `Medalhão Afiado: ${sourceSpellName} só afeta alvos específicos — nenhum alvo elegível.`,
            );
        }
        return;
    }

    const aeData = buildMargemAEData(effectGroups, message.id, sourceSpellName);

    if (game.user?.isGM) {
        await applyMargemToWeapons(filteredTargetData, aeData, casterName);
        return;
    }

    // Player → delega ao GM
    const gm = (game.users?.contents ?? []).find(
        (u: FoundryUser) => (u as unknown as { isGM: boolean }).isGM && (u as unknown as { active: boolean }).active,
    );
    if (!gm) {
        ui.notifications?.warn("Medalhão Afiado: GM precisa estar online para aplicar margem de ameaça");
        return;
    }

    const req: MargemApplyRequest = {
        type: SOCKET_APPLY,
        casterName,
        targets: filteredTargetData,
        aeData,
    };
    void getSocket()?.executeAsGM(SOCKET_APPLY, req);
    ui.notifications?.info(
        `${casterName}: Medalhão Afiado — margem de ameaça enviada ao GM para aplicação`,
    );
}

// ── Entrada pública ───────────────────────────────────────────────────────────

export function setupMedalhaoAfiado(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_APPLY,   handleApplyMargemSocket);
        socket.register(SOCKET_CLEANUP, handleCleanupSocket);
    });

    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;
        void processMedalhaoMessage(message);
    });

    // Cleanup automático: ao remover o buff fonte do ator, remove o Medalhão.
    Hooks.on("deleteActiveEffect", onDeleteActiveEffect);
}
