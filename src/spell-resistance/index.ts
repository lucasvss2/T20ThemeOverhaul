import { MODULE_ID } from "@/constants";
import { computeSkillTotal, computeSkillBreakdown } from "@/hidden-test/skills";
import { getAuraAntimagiaContextForActor } from "@/area-spells/aura-sagrada";
import { getSocket, onSocketReady } from "@/socket";
import {
    getActivatableItems,
    type ActivatableItem,
} from "@/hidden-test/HiddenTestPlayerDialog";
import type {
    SpellResistPreRollRequest,
    ResistSkill,
    ResistOutcome,
} from "./types";
import SPELL_RESIST_STYLES from "./spell-resistance.css?inline";
import { computeTargetRd, damageTypeFromFormula, extractDamageType } from "@/auto-damage/rd";
import { getMagicReactions, consumeReaction, getPresencaOption, resolvePresenca, getEvasaoLevel, actorHasActiveEffectNamed, type EvasaoLevel, type MagicReactionOption } from "@/reactions";
import { warn } from "@/utils/logging";
import { registerExpectedCondition } from "@/duration-manager/index";
import { classifyDuration } from "@/duration-manager/classify";
import type { DurData } from "@/duration-manager/types";

// ── socketlib handler names ──────────────────────────────────────────────────

const SOCKET_PRE_ROLL    = "spell-resist/preroll";
const SOCKET_AUTO_APPLY  = "spell-resist/auto-apply-buff";
const SOCKET_PURIFY      = "spell-resist/purification";

// ── Constantes ────────────────────────────────────────────────────────────────

const SPELL_TIPOS = ["arc", "div", "uni"] as const;

const SKILL_LABELS: Record<ResistSkill, string> = {
    fort: "Fortitude",
    refl: "Reflexos",
    vont: "Vontade",
};

// ── Rastreamento de modais abertos (para Contramágica fechar ao anular) ─────────
// Chave = messageId da conjuração; valor = conjunto de dialogs abertos para essa
// magia (1 por alvo neste cliente). Limpo no `.finally` de cada modal.
type ClosableDialog = { close: () => void };
const openSpellModals = new Map<string, Set<ClosableDialog>>();

function trackSpellModal(messageId: string, dialog: ClosableDialog): void {
    if (!messageId) return;
    let set = openSpellModals.get(messageId);
    if (!set) { set = new Set(); openSpellModals.set(messageId, set); }
    set.add(dialog);
}
function untrackSpellModal(messageId: string, dialog: ClosableDialog): void {
    const set = openSpellModals.get(messageId);
    if (!set) return;
    set.delete(dialog);
    if (set.size === 0) openSpellModals.delete(messageId);
}

/**
 * Fecha qualquer modal de resistência aberto neste cliente para a conjuração
 * dada (usado pela Contramágica quando a magia é anulada). No-op se não houver.
 */
export function closeSpellModalForMessage(messageId: string): void {
    const set = openSpellModals.get(messageId);
    if (!set) return;
    for (const dlg of Array.from(set)) {
        try { dlg.close(); } catch { /* ignore */ }
    }
    openSpellModals.delete(messageId);
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const SPELL_RESIST_STYLES_ID = "bg3-t20-spell-resist-styles";

function ensureStyles(): void {
    if (!document.getElementById(SPELL_RESIST_STYLES_ID)) {
        const el = document.createElement("style");
        el.id = SPELL_RESIST_STYLES_ID;
        el.textContent = SPELL_RESIST_STYLES;
        document.head.appendChild(el);
    }
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Parsing de resistência ────────────────────────────────────────────────────

interface ResistInfo {
    skill: ResistSkill | null;
    outcome: ResistOutcome;
}

export function parseResistance(txt: string): ResistInfo {
    if (!txt || txt.trim() === "" || txt.toLowerCase() === "nenhuma") {
        return { skill: null, outcome: "none" };
    }
    const lower = txt.toLowerCase();
    const skill: ResistSkill | null =
        lower.includes("vontade") ? "vont" :
        lower.includes("reflexos") ? "refl" :
        lower.includes("fortitude") ? "fort" :
        null;
    const outcome: ResistOutcome =
        lower.includes("anula") ? "anula" :
        (lower.includes("reduz") && lower.includes("metade")) ? "metade" :
        lower.includes("metade") ? "metade" :
        lower.includes("parcial") ? "parcial" :
        lower.includes("desacredita") ? "parcial" :
        lower.includes("veja texto") ? "texto" :
        skill != null ? "texto" :
        "none";
    return { skill, outcome };
}

// ── Extração de dados do chat ─────────────────────────────────────────────────

export function extractCD(message: ChatMessage): number {
    const match = message.content?.match(/CD\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * Calcula a CD de magia do lançador: attributes.cd (base, ex. 15) + valor do
 * atributo de conjuração (ex. Sabedoria do clérigo). Inclui automaticamente
 * qualquer bônus já aplicado no atributo (racial, item, etc.).
 *
 * Para Curar Ferimentos sem resistência o chat card não tem "CD X" explícito,
 * então usamos isso como fallback quando extractCD retorna 0.
 */
export function computeCasterSpellCD(actor: FoundryActor | null | undefined): number {
    if (!actor) return 0;
    type T20Sys = {
        attributes?: { cd?: number; conjuracao?: string };
        atributos?:  Record<string, { value?: number } | undefined>;
    };
    const sys  = actor.system as T20Sys | undefined;
    const base = sys?.attributes?.cd ?? 0;
    const conj = sys?.attributes?.conjuracao;
    const mod  = (conj ? sys?.atributos?.[conj]?.value : undefined) ?? 0;
    return base + mod;
}

export function extractSpellName(message: ChatMessage): string {
    const actorId = message.content?.match(/data-actor-id="([^"]+)"/)?.[1];
    const itemId  = message.content?.match(/data-item-id="([^"]+)"/)?.[1];
    if (actorId && itemId) {
        const actor = game.actors?.get(actorId) as (FoundryActor & { items?: { get(id: string): FoundryItem | null } }) | undefined;
        const item  = actor?.items?.get(itemId);
        if (item?.name) return item.name;
    }
    const titleMatch = message.content?.match(/<img[^>]+title="([^"]+)"/);
    return titleMatch?.[1] ?? "Magia";
}

/**
 * Extrai o ID do item da mensagem de chat parseando o atributo data-item-id
 * do HTML do card. O T20 não inclui esse ID nos flags da mensagem, apenas no DOM.
 */
export function extractItemId(message: ChatMessage): string | undefined {
    return message.content?.match(/data-item-id="([^"]+)"/)?.[1];
}

/**
 * Aplica efeitos de buff nos alvos automaticamente. Se o usuário for GM, aplica
 * diretamente; caso contrário (player), delega ao GM via socket (necessário
 * porque players não têm permissão para modificar atores de terceiros).
 */
export async function autoApplyBuffEffects(
    effectGroups: Record<string, unknown>[][],
    targets: FoundryToken[],
    casterName: string,
): Promise<void> {
    type EffectData = Record<string, unknown>;

    // GM: aplica diretamente
    if (game.user?.isGM) {
        let appliedCount = 0;
        for (const group of effectGroups) {
            if (!Array.isArray(group) || !group.length) continue;
            for (const token of targets) {
                const actor = token.actor;
                if (!actor) continue;
                const data: EffectData[] = JSON.parse(JSON.stringify(group)) as EffectData[];
                const firstDur = data[0]?.["duration"] as Record<string, unknown> | undefined;
                if (firstDur?.["seconds"]) {
                    const g = game as unknown as { time?: { worldTime: number } };
                    firstDur["startTime"] = g.time?.worldTime ?? 0;
                }
                try {
                    await (actor as FoundryActor & {
                        createEmbeddedDocuments(t: string, d: unknown[], o?: Record<string, unknown>): Promise<unknown>;
                    }).createEmbeddedDocuments("ActiveEffect", data, { toChat: appliedCount === 0 });
                    appliedCount++;
                } catch (err) {
                    warn(`Auto-apply em ${actor.name}:`, err);
                }
            }
        }
        if (appliedCount > 0) {
            const names = targets.filter(t => t.actor).map(t => t.actor!.name).join(", ");
            ui.notifications?.info(`Buff aplicado automaticamente: ${names}`);
        }
        return;
    }

    // Player: delega ao GM via socket
    const gm = findActiveGM();
    if (!gm) {
        ui.notifications?.warn("Auto-apply: GM precisa estar online");
        return;
    }
    const targetUuids = targets.map(t => t.actor?.uuid).filter(Boolean) as string[];
    if (!targetUuids.length) return;

    const req: import("./types").AutoApplyBuffRequest = {
        type:         "auto-apply-buff",
        casterName,
        effectGroups,
        targetUuids,
    };
    void getSocket()?.executeAsGM(SOCKET_AUTO_APPLY, req);
    ui.notifications?.info(`Buff auto-aplicado via GM em ${targets.length} alvo(s)`);
}

/** Handler GM-side do socket auto-apply-buff. */
async function handleAutoApplyBuffSocket(req: import("./types").AutoApplyBuffRequest): Promise<void> {
    if (!game.user?.isGM) return;
    type EffectData = Record<string, unknown>;
    let appliedCount = 0;
    const appliedNames: string[] = [];

    for (const uuid of req.targetUuids) {
        const actor = fromUuidSync(uuid) as FoundryActor | null;
        if (!actor) continue;
        for (const group of req.effectGroups) {
            if (!Array.isArray(group) || !group.length) continue;
            const data: EffectData[] = JSON.parse(JSON.stringify(group)) as EffectData[];
            const firstDur = data[0]?.["duration"] as Record<string, unknown> | undefined;
            if (firstDur?.["seconds"]) {
                const g = game as unknown as { time?: { worldTime: number } };
                firstDur["startTime"] = g.time?.worldTime ?? 0;
            }
            try {
                await (actor as FoundryActor & {
                    createEmbeddedDocuments(t: string, d: unknown[], o?: Record<string, unknown>): Promise<unknown>;
                }).createEmbeddedDocuments("ActiveEffect", data, { toChat: appliedCount === 0 });
                appliedCount++;
                if (!appliedNames.includes(actor.name)) appliedNames.push(actor.name);
            } catch (err) {
                warn(`Auto-apply GM-socket em ${actor.name}:`, err);
            }
        }
    }
    if (appliedCount > 0) {
        ui.notifications?.info(`${req.casterName}: buff aplicado em ${appliedNames.join(", ")}`);
    }
}

// ── Purificação ───────────────────────────────────────────────────────────────

/** Condições removíveis pela magia Purificação (do livro do jogador). */
const PURIFICATION_CONDITIONS: ReadonlySet<string> = new Set([
    "abalado", "apavorado", "alquebrado", "atordoado", "cego", "confuso",
    "debilitado", "enjoado", "envenenado", "esmorecido", "exausto",
    "fascinado", "fatigado", "fraco", "frustrado", "lento", "ofuscado",
    "paralisado", "pasmo", "surdo",
]);

/** Normaliza nome de condição: minúsculo + sem acentos, para matching robusto. */
export function normalizeCondName(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Encontra ActiveEffects no ator que correspondem a condições purificáveis. */
function findPurifiableEffects(actor: FoundryActor): { id: string; name: string }[] {
    type EffectLike = { id: string; name?: string; statuses?: Set<string> | string[] };
    const effects = ((actor as unknown as { effects?: { contents?: EffectLike[] } }).effects?.contents) ?? [];
    const out: { id: string; name: string }[] = [];

    for (const eff of effects) {
        let matched: string | undefined;

        // 1. Via statuses (Foundry v11+)
        const statuses = eff.statuses;
        if (statuses) {
            const arr = Array.isArray(statuses) ? statuses : Array.from(statuses);
            for (const sid of arr) {
                if (PURIFICATION_CONDITIONS.has(normalizeCondName(sid))) {
                    matched = sid;
                    break;
                }
            }
        }
        // 2. Via nome do effect (fallback)
        if (!matched && eff.name && PURIFICATION_CONDITIONS.has(normalizeCondName(eff.name))) {
            matched = eff.name;
        }

        if (matched) out.push({ id: eff.id, name: eff.name ?? matched });
    }
    return out;
}

/** Handler principal da Purificação: remove condições matching dos alvos T. */
async function handlePurification(_message: ChatMessage, casterName: string): Promise<void> {
    const targets = Array.from(game.user?.targets ?? []) as FoundryToken[];
    if (!targets.length) {
        ui.notifications?.info("Purificação: nenhum alvo selecionado (T)");
        return;
    }

    type TargetInfo = { token: FoundryToken; matches: { id: string; name: string }[] };
    const targetsWithMatches: TargetInfo[] = [];
    for (const token of targets) {
        if (!token.actor) continue;
        const matches = findPurifiableEffects(token.actor);
        if (matches.length > 0) targetsWithMatches.push({ token, matches });
    }

    if (targetsWithMatches.length === 0) {
        ui.notifications?.info("Purificação: nenhum alvo tem condições purificáveis");
        return;
    }

    // GM: aplica direto. Player: delega via socket.
    if (game.user?.isGM) {
        for (const { token, matches } of targetsWithMatches) {
            const ids = matches.map(m => m.id);
            try {
                await (token.actor! as FoundryActor & {
                    deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
                }).deleteEmbeddedDocuments("ActiveEffect", ids);
                ui.notifications?.info(`Purificação: removida(s) ${matches.map(m => m.name).join(", ")} de ${token.actor!.name}`);
            } catch (err) {
                warn(`Purificação em ${token.actor!.name}:`, err);
            }
        }
        return;
    }

    const gm = findActiveGM();
    if (!gm) {
        ui.notifications?.warn("Purificação: GM precisa estar online para remover condições de alvos não-próprios");
        return;
    }

    const req: import("./types").PurificationRequest = {
        type:        "purification",
        casterName,
        targets:     targetsWithMatches.map(({ token, matches }) => ({
            actorUuid:   token.actor!.uuid,
            effectIds:   matches.map(m => m.id),
            effectNames: matches.map(m => m.name),
        })),
    };
    void getSocket()?.executeAsGM(SOCKET_PURIFY, req);
    const totalCond = targetsWithMatches.reduce((s, t) => s + t.matches.length, 0);
    ui.notifications?.info(`Purificação: ${totalCond} condição(ões) enviada(s) ao GM para remoção`);
}

/** Handler GM-side do socket purification. */
async function handlePurificationSocket(req: import("./types").PurificationRequest): Promise<void> {
    if (!game.user?.isGM) return;
    for (const t of req.targets) {
        const actor = fromUuidSync(t.actorUuid) as FoundryActor | null;
        if (!actor || !t.effectIds.length) continue;
        try {
            await (actor as FoundryActor & {
                deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
            }).deleteEmbeddedDocuments("ActiveEffect", t.effectIds);
            ui.notifications?.info(`Purificação (${req.casterName}): removida(s) ${t.effectNames.join(", ")} de ${actor.name}`);
        } catch (err) {
            warn(`Purificação GM-socket em ${actor.name}:`, err);
        }
    }
}

// ── Helpers de cálculo ────────────────────────────────────────────────────────

/**
 * Calcula o valor máximo possível de uma rolagem mantendo os modificadores
 * constantes intocados. Para 3d6+4 rolando 13: max = 18 + 4 = 22.
 */
function computeMaxRoll(roll: Roll): number {
    type DieLike = { number?: number; faces?: number; total?: number };
    const dice = (roll.dice ?? []) as unknown as DieLike[];
    const maxDice    = dice.reduce((s, d) => s + (d.number ?? 0) * (d.faces ?? 0), 0);
    const actualDice = dice.reduce((s, d) => s + (d.total ?? 0), 0);
    const constPart  = (roll.total ?? 0) - actualDice;
    return Math.max(0, maxDice + constPart);
}

// ── Resolução de ator ─────────────────────────────────────────────────────────

function resolveTargetActor(uuid: string | undefined, fallbackId: string): FoundryActor | null {
    if (uuid) {
        const a = fromUuidSync(uuid);
        if (a) return a;
    }
    return game.actors?.get(fallbackId) ?? null;
}

// ── Aplicação de efeitos ──────────────────────────────────────────────────────

async function applySpellDamage(actorUuid: string, actorId: string, amount: number): Promise<void> {
    const actor = resolveTargetActor(actorUuid, actorId);
    if (!actor) return;
    const pv          = actor.system?.attributes?.pv;
    const currentTemp = pv?.temp  ?? 0;
    const currentHp   = pv?.value ?? 0;
    let remaining = Math.max(0, amount);
    let newTemp   = currentTemp;
    if (newTemp > 0) {
        const used = Math.min(newTemp, remaining);
        remaining -= used;
        newTemp   -= used;
    }
    await actor.update({
        "system.attributes.pv.temp":  newTemp,
        "system.attributes.pv.value": Math.max(0, currentHp - remaining),
    });
}

async function applySpellHeal(actorUuid: string, actorId: string, amount: number): Promise<void> {
    const actor = resolveTargetActor(actorUuid, actorId);
    if (!actor) return;
    const pv  = actor.system?.attributes?.pv;
    const cur = pv?.value ?? 0;
    const max = pv?.max   ?? cur;
    await actor.update({ "system.attributes.pv.value": Math.min(max, cur + amount) });
}

async function applyCondition(actorUuid: string, actorId: string, statusId: string): Promise<void> {
    type ActorWithToggle = FoundryActor & {
        toggleStatusEffect(id: string, opts?: Record<string, unknown>): Promise<void>;
    };
    const actor = resolveTargetActor(actorUuid, actorId) as ActorWithToggle | null;
    if (!actor?.toggleStatusEffect) return;
    await actor.toggleStatusEffect(statusId, { active: true });
}

/**
 * Determina a duração de uma condição aplicada pelo modal, para o gerenciador
 * de duração: prefere a duração por-rodada que a magia cravou no effect
 * (ex.: Adaga Mental → Atordoado 1 rodada), senão classifica pela duração geral
 * da magia (`system.duracao.units`). Registra a duração ANTES do
 * toggleStatusEffect — o gerenciador a consome e não pergunta nada.
 */
function statusLabel(statusId: string): string {
    const list = (CONFIG as { statusEffects?: Array<{ id: string; name?: string; label?: string }> }).statusEffects ?? [];
    const s = list.find((e) => e.id === statusId);
    const raw = s?.name ?? s?.label ?? statusId;
    return game.i18n?.localize(raw) ?? raw;
}

function computeConditionDur(messageId: string, statusId: string): DurData {
    const label = statusLabel(statusId);
    const normLabel = normalizeCondName(label);
    const msg = game.messages?.get(messageId);

    // 1) Effect cravado pela magia com nome "(Condição)" e duração por rodadas.
    const groups = msg?.getFlag("tormenta20", "effects") as
        | Array<Array<{ name?: string; duration?: { type?: string; rounds?: number } }>>
        | undefined;
    for (const grp of groups ?? []) {
        for (const e of grp ?? []) {
            if (!e?.name) continue;
            const n = normalizeCondName(e.name);
            if (n.includes(normLabel) && e.duration?.type === "turns" && (e.duration.rounds ?? 0) > 0) {
                return { managed: true, kind: "rounds", rounds: e.duration.rounds!, source: "spell", label };
            }
        }
    }

    // 2) Duração geral da magia.
    const itemData = msg?.getFlag("tormenta20", "itemData") as
        | { duracao?: { units?: string; value?: number } }
        | undefined;
    const c = classifyDuration({ parentUnits: itemData?.duracao?.units, parentValue: itemData?.duracao?.value });
    const dur: DurData = { managed: true, kind: c.kind, source: "spell", label };
    if (c.kind === "rounds") dur.rounds = c.rounds ?? 1;
    return dur;
}

/**
 * Remove uma instância de condição de Fadiga (Fatigado) do ator alvo.
 * Usado pelo aprimoramento de Curar Ferimentos. Procura por ActiveEffect
 * com status "fatigado" ou nome "Fatigado"/"Fadiga" e remove o primeiro.
 */
async function removeFadigaCondition(actorUuid: string, actorId: string): Promise<boolean> {
    const actor = resolveTargetActor(actorUuid, actorId);
    if (!actor) return false;

    type EffectLike = { id: string; name?: string; statuses?: Set<string> | string[] };
    const effects = ((actor as unknown as { effects?: { contents?: EffectLike[] } }).effects?.contents) ?? [];

    let toRemove: string | undefined;
    for (const eff of effects) {
        let matched = false;
        const statuses = eff.statuses;
        if (statuses) {
            const arr = Array.isArray(statuses) ? statuses : Array.from(statuses);
            for (const sid of arr) {
                const n = normalizeCondName(sid);
                if (n === "fatigado" || n === "fadiga") { matched = true; break; }
            }
        }
        if (!matched && eff.name) {
            const n = normalizeCondName(eff.name);
            if (n === "fatigado" || n === "fadiga") matched = true;
        }
        if (matched) { toRemove = eff.id; break; }
    }

    if (!toRemove) return false;
    try {
        await (actor as FoundryActor & {
            deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
        }).deleteEmbeddedDocuments("ActiveEffect", [toRemove]);
        return true;
    } catch (err) {
        warn(`Falha ao remover Fadiga:`, err);
        return false;
    }
}

async function applyBuffEffect(messageId: string, effectIndex: number, actor: FoundryActor): Promise<void> {
    type ActorWithCreate = FoundryActor & {
        createEmbeddedDocuments(type: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
    };
    type EffectEntry = {
        duration?: { seconds?: number; startTime?: number };
        [key: string]: unknown;
    };
    const msg = game.messages?.get(messageId);
    if (!msg || !actor) return;
    const allEffects = msg.getFlag("tormenta20", "effects") as EffectEntry[][] | undefined;
    const chatEffect = allEffects?.[effectIndex];
    if (!chatEffect?.length) return;
    const toApply = chatEffect.map(e => {
        if (e.duration?.seconds) {
            return { ...e, duration: { ...e.duration, startTime: (game as Record<string, unknown>)["time"] != null ? ((game as Record<string, unknown>)["time"] as { worldTime: number }).worldTime : 0 } };
        }
        return { ...e };
    });
    await (actor as ActorWithCreate).createEmbeddedDocuments("ActiveEffect", toApply, { toChat: true });
}

// ── Modal unificado de magia ──────────────────────────────────────────────────

function openUnifiedSpellModal(preReq: SpellResistPreRollRequest): void {
    ensureStyles();

    const targetActor = resolveTargetActor(preReq.targetActorUuid, preReq.targetActorId);
    const targetName  = targetActor?.name ?? "Alvo";

    // ── Seção 1: Resistência ──────────────────────────────────────────────────

    const skillKey   = preReq.resistSkill;
    const skillLabel = skillKey ? SKILL_LABELS[skillKey] : "";
    const breakdown  = (targetActor && skillKey) ? computeSkillBreakdown(targetActor, skillKey) : null;
    const baseBonus  = breakdown?.total ?? 0;
    const bonusStr   = baseBonus >= 0 ? `+${baseBonus}` : `${baseBonus}`;
    // Tooltip detalhado: mostra a composição do bônus. Quando T20 já consolidou
    // em .value (fromValue:true), mostramos os componentes individuais como
    // "(consolidado pelo sistema)" — não duplicamos a soma.
    const bonusTooltip = (() => {
        if (!breakdown) return "";
        const lines: string[] = [];
        const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
        if (breakdown.fromValue) {
            lines.push(`Total: ${fmt(breakdown.total)} (consolidado pelo T20)`);
            if (breakdown.halfLevel) lines.push(`  Meio nível: ${fmt(breakdown.halfLevel)}`);
            if (breakdown.treino)    lines.push(`  Treino: ${fmt(breakdown.treino)}`);
            if (breakdown.attrKey)   lines.push(`  ${breakdown.attrKey.toUpperCase()}: ${fmt(breakdown.attrMod)}`);
            if (breakdown.outros)    lines.push(`  Outros: ${fmt(breakdown.outros)}`);
            if (breakdown.condi)     lines.push(`  Condição: ${fmt(breakdown.condi)}`);
        } else {
            lines.push(`Total: ${fmt(breakdown.total)} (não treinado — soma manual)`);
            if (breakdown.halfLevel) lines.push(`  Meio nível: ${fmt(breakdown.halfLevel)}`);
            if (breakdown.attrKey)   lines.push(`  ${breakdown.attrKey.toUpperCase()}: ${fmt(breakdown.attrMod)}`);
            if (breakdown.outros)    lines.push(`  Outros: ${fmt(breakdown.outros)}`);
            if (breakdown.condi)     lines.push(`  Condição: ${fmt(breakdown.condi)}`);
        }
        return lines.join("\n");
    })();
    const pmActual   = targetActor?.system?.attributes?.pm?.value ?? 0;

    const powers: ActivatableItem[] = (targetActor && skillKey
        ? getActivatableItems(targetActor, skillLabel).filter(p => p.itemType !== "tesouro")
        : []
    );

    // Gingado Elusivo: +5 Reflexos contra o efeito quando o alvo está sob Dança
    // Marcial. Injetado como "poder" sintético na lista de bônus (debita 2 PM no roll).
    if (targetActor && skillKey === "refl" && pmActual >= 2) {
        const itemsArr = ((targetActor as unknown as { items?: { contents?: Array<{ type?: string; name?: string }> } }).items?.contents) ?? [];
        const hasGingado = itemsArr.some(i => i.type === "poder" && normalizeCondName(i.name ?? "").includes("gingado elusivo"));
        if (hasGingado && actorHasActiveEffectNamed(targetActor as never, "danca marcial")) {
            powers.push({ itemType: "poder", name: "Gingado Elusivo", pm: 2, bonusFormula: "+5", isAdvantage: false, bonusLabel: "+5 Reflexos" } as unknown as ActivatableItem);
        }
    }

    // Evasão / Evasão Aprimorada: modifica o resultado de Reflexos-reduz-à-metade.
    const evasaoLevel: EvasaoLevel = (targetActor && skillKey === "refl") ? getEvasaoLevel(targetActor as never) : "none";
    const evasaoApplies = evasaoLevel !== "none" && (preReq.resistOutcome === "metade" || preReq.resistOutcome === "parcial");

    let resistBodyHtml: string;

    if (preReq.isHeal) {
        resistBodyHtml = `<div class="smf-na-text">Magia de cura — sem teste de resistência.</div>`;
    } else if (!skillKey) {
        const txt = preReq.resistTxt || "Sem resistência";
        resistBodyHtml = `<div class="smf-na-text">${esc(txt)}</div>`;
    } else {
        const outcomeHint =
            preReq.resistOutcome === "anula"   ? "Passa → sem efeito" :
            preReq.resistOutcome === "metade"  ? "Passa → metade do dano" :
            preReq.resistOutcome === "parcial" ? "Passa → metade + sem condições" :
            "Veja texto da magia";

        const powersHtml = powers.length > 0 ? `
            <div class="smf-powers-section" id="smf-powers-wrap">
                <div class="smf-powers-header">
                    <span></span><span>PM</span><span>PODER / HABILIDADE</span><span>BÔNUS</span>
                </div>
                ${powers.map(p => `
                <div class="smf-power-row">
                    <input type="checkbox" class="smf-power-check"
                        data-pm="${p.pm}"
                        data-bonus="${esc(p.bonusFormula)}"
                        data-advantage="${p.isAdvantage}"
                        data-label="${esc(p.bonusLabel)}"
                        data-name="${esc(p.name)}"
                        ${p.pm > pmActual ? "disabled title='PM insuficiente'" : ""}>
                    <span class="smf-pm-cost">${p.pm > 0 ? p.pm : "—"}</span>
                    <span>${esc(p.name)}</span>
                    <span class="${p.isAdvantage ? "smf-power-bonus-adv" : "smf-power-bonus-known"}">${esc(p.bonusLabel)}</span>
                </div>`).join("")}
                <div class="smf-pm-total-row">
                    <span class="smf-label-sm">PM a gastar (disponível: ${pmActual})</span>
                    <span class="smf-pm-display" id="smf-pm-total">0</span>
                </div>
            </div>
        ` : "";

        resistBodyHtml = `
            <div class="smf-resist-info">
                <span class="smf-label-sm" title="${esc(bonusTooltip)}">BÔNUS BASE</span>
                <span class="smf-resist-bonus smf-bonus-tooltip-host" title="${esc(bonusTooltip)}" tabindex="0">${bonusStr}</span>
                <span class="smf-resist-outcome">${esc(outcomeHint)}</span>
            </div>
            ${powersHtml}
            <div id="smf-extra-wrap">
                <div class="smf-label-sm" style="padding-bottom:4px;">BÔNUS EXTRA (opcional)</div>
                <input type="text" class="smf-extra-input" name="bonusExtra" placeholder="+1d4 ou +2" />
            </div>
            <button class="smf-action-btn" id="smf-roll-resist">
                <i class="fas fa-dice-d20"></i> Rolar ${esc(skillLabel)} (CD ${preReq.cd})
            </button>
            <div id="smf-resist-result" class="smf-resist-result"></div>
            <div id="smf-magic-reactions" class="smf-magic-reactions" style="display:none;"></div>
        `;
    }

    // Aura Antimagia (Paladino): se o alvo está dentro de uma aura sagrada
    // ativa cujo caster tem o aprimoramento "Aura Antimagia", mostra uma badge
    // dourada informativa avisando que o re-roll já permitido pelo dialog
    // (botão "Rerolar" após a primeira tentativa) é gratuito por esse motivo.
    const antimagiaContexts = targetActor
        ? getAuraAntimagiaContextForActor((targetActor as unknown as { id?: string }).id ?? "")
        : [];
    const antimagiaBadgeHtml = antimagiaContexts.length > 0 ? `
        <div class="smf-aura-antimagia-badge" title="Aura Antimagia permite ${esc(targetName)} rolar novamente o teste de resistência contra a magia sem custo adicional.">
            <i class="fas fa-sparkles"></i>
            <div class="smf-aura-antimagia-text">
                <div class="smf-aura-antimagia-title">Aura Antimagia disponível</div>
                <div class="smf-aura-antimagia-sub">
                    ${antimagiaContexts.length === 1
                        ? `<b>${esc(antimagiaContexts[0].casterName)}</b> permite re-roll deste teste`
                        : `${antimagiaContexts.map(c => `<b>${esc(c.casterName)}</b>`).join(" e ")} permitem re-roll`}
                </div>
            </div>
        </div>
    ` : "";

    const resistSectionHtml = `
        <div class="smf-section-title">
            <i class="fas fa-shield-halved"></i>
            RESISTÊNCIA${skillKey ? ` — ${esc(skillLabel.toUpperCase())} (CD ${preReq.cd})` : ""}
            <button type="button" class="smf-collapse-btn" title="Minimizar"><i class="fas fa-chevron-down"></i></button>
        </div>
        <div class="smf-section-body">
            ${antimagiaBadgeHtml}
            ${resistBodyHtml}
        </div>
    `;

    // ── Seção 2: Dano / Cura ──────────────────────────────────────────────────

    const halfDmg = Math.floor(preReq.damageTotal / 2);

    // RD automática por tipo de dano: lê tracos.resistencias (estrutura) +
    // detalhes.resistencias (texto de NPC) do ALVO — mesmo motor do auto-damage.
    const dmgType = preReq.damageType ?? damageTypeFromFormula(preReq.damageFormula);
    const tracosResist = (targetActor?.system as { tracos?: { resistencias?: Record<string, { value?: number | string; base?: number | string; imunidade?: boolean }> } } | undefined)
        ?.tracos?.resistencias;
    const npcResistText = (targetActor?.system as { detalhes?: { resistencias?: unknown } } | undefined)
        ?.detalhes?.resistencias;
    const { rd: autoRd, immune: dmgImmune } = computeTargetRd(
        tracosResist,
        typeof npcResistText === "string" ? npcResistText : null,
        dmgType,
    );
    const dmgTypeLabel = dmgType
        ? ((CONFIG as unknown as { T20?: { damageTypes?: Record<string, string> } }).T20?.damageTypes?.[dmgType] ?? dmgType)
        : "";
    // Mostra a linha de RD sempre que houver tipo conhecido OU RD genérica
    // ("redução de dano X" vale para qualquer tipo).
    const rdRowHtml = dmgImmune
        ? `<div class="smf-rd-row smf-rd-immune"><i class="fas fa-shield"></i> IMUNE a ${dmgTypeLabel} — dano anulado</div>`
        : (dmgType || autoRd > 0)
            ? `<div class="smf-rd-row"><label for="smf-rd-input">RD${dmgTypeLabel ? ` ${dmgTypeLabel}` : ""}:</label>` +
              `<input type="number" id="smf-rd-input" min="0" value="${autoRd}"/>` +
              `<span class="smf-rd-hint">${autoRd > 0 ? "detectada na ficha — subtraída ao aplicar" : "nenhuma detectada (ajuste se preciso)"}</span></div>`
            : "";

    let damageSectionHtml: string;

    if (preReq.isHeal && preReq.damageTotal > 0) {
        const showConsagrar = preReq.maxHealValue > preReq.damageTotal;
        const consagrarHtml = showConsagrar ? `
            <label class="smf-consagrar-label" title="Maximiza o valor da cura com os dados rolados.">
                <input type="checkbox" id="smf-consagrar" />
                <i class="fas fa-sun"></i> Consagrar
                <span class="smf-consagrar-max">(máx: ${preReq.maxHealValue})</span>
            </label>
        ` : "";
        const halfHeal = Math.floor(preReq.damageTotal / 2);
        const cdLabel  = preReq.cd > 0 ? `CD ${preReq.cd}` : "CD ?";
        const healHeaderHtml = preReq.truqueAtivo
            ? `<div class="smf-section-title"><i class="fas fa-bolt"></i> TRUQUE — DANO DE LUZ<button type="button" class="smf-collapse-btn" title="Minimizar"><i class="fas fa-chevron-down"></i></button></div>`
            : `<div class="smf-section-title"><i class="fas fa-heart"></i> CURA<button type="button" class="smf-collapse-btn" title="Minimizar"><i class="fas fa-chevron-down"></i></button></div>`;
        damageSectionHtml = `
            ${healHeaderHtml}
            <div class="smf-section-body">
            <div class="smf-heal-number" id="smf-heal-number">${preReq.damageTotal}</div>
            ${consagrarHtml}
            <label class="smf-undead-label" title="Magia de cura causa dano sagrado em mortos-vivos. O alvo rola Vontade ${cdLabel} — passa: metade do dano.">
                <input type="checkbox" id="smf-morto-vivo" />
                <i class="fas fa-skull"></i> Morto-Vivo
            </label>
            <div class="smf-dmg-btns">
                <button class="smf-heal-btn" id="smf-heal-full" data-heal-base="${preReq.damageTotal}" data-heal-max="${preReq.maxHealValue}">
                    <i class="fas fa-heart"></i> Curar (${preReq.damageTotal})${preReq.removeFadiga ? " e Remover Fadiga" : ""}
                </button>
                <button class="smf-dmg-btn" id="smf-no-heal">
                    <i class="fas fa-ban"></i> Não Aplicar
                </button>
            </div>
            <div class="smf-feedback" id="smf-dmg-feedback"></div>

            <div id="smf-undead-section" style="display:none; margin-top:8px; border-top:1px solid rgba(138,102,68,0.3); padding-top:8px;">
                <div class="smf-section-title" style="margin-bottom:4px;">
                    <i class="fas fa-skull-crossbones"></i> DANO SAGRADO — VONTADE ${cdLabel}
                </div>
                <button class="smf-action-btn" id="smf-undead-roll">
                    <i class="fas fa-dice-d20"></i> Rolar Vontade (${cdLabel})
                </button>
                <div id="smf-undead-result" class="smf-resist-result" style="display:none;"></div>
                <div id="smf-undead-dmg-btns" class="smf-dmg-btns" style="display:none; margin-top:6px;">
                    <button class="smf-undead-dmg-btn" id="smf-undead-full">
                        <i class="fas fa-skull-crossbones"></i> Dano Completo (${preReq.damageTotal})
                    </button>
                    <button class="smf-undead-dmg-btn" id="smf-undead-half">
                        <i class="fas fa-shield-halved"></i> Metade do Dano (${halfHeal})
                    </button>
                    <button class="smf-undead-dmg-btn" id="smf-undead-none">
                        <i class="fas fa-ban"></i> Não Aplicar
                    </button>
                </div>
                <div class="smf-feedback" id="smf-undead-feedback"></div>
            </div>
            </div>
        `;
    } else if (!preReq.isHeal && preReq.damageTotal > 0) {
        damageSectionHtml = `
            <div class="smf-section-title"><i class="fas fa-burst"></i> DANO${dmgTypeLabel ? ` <span class="smf-dmg-type">(${dmgTypeLabel})</span>` : ""}<button type="button" class="smf-collapse-btn" title="Minimizar"><i class="fas fa-chevron-down"></i></button></div>
            <div class="smf-section-body">
            <div class="smf-dmg-number">${preReq.damageTotal}</div>
            ${rdRowHtml}
            <div class="smf-dmg-btns">
                <button class="smf-dmg-btn" data-dmg="${preReq.damageTotal}" id="smf-dmg-full">
                    <i class="fas fa-bolt"></i> Aplicar Integral (${preReq.damageTotal})
                </button>
                <button class="smf-dmg-btn" data-dmg="${halfDmg}" id="smf-dmg-half">
                    <i class="fas fa-shield-halved"></i> Aplicar Metade (${halfDmg})
                </button>
                <button class="smf-dmg-btn" data-dmg="0" id="smf-dmg-none">
                    <i class="fas fa-ban"></i> Não Aplicar
                </button>
            </div>
            <div class="smf-feedback" id="smf-dmg-feedback"></div>
            </div>
        `;
    } else {
        damageSectionHtml = `
            <div class="smf-section-title"><i class="fas fa-burst"></i> DANO / CURA<button type="button" class="smf-collapse-btn" title="Minimizar"><i class="fas fa-chevron-down"></i></button></div>
            <div class="smf-section-body">
            <div class="smf-na-text">Sem dano ou cura direto para esta magia.</div>
            </div>
        `;
    }

    // ── Seção 3: Buff ─────────────────────────────────────────────────────────

    type EffectMeta = { name?: string; icon?: string; flags?: Record<string, unknown>; disabled?: boolean };
    const allMsgEffects = (
        (game.messages?.get(preReq.messageId)?.getFlag("tormenta20", "effects")) as EffectMeta[][] | undefined
    ) ?? [];

    // Exibe todos os grupos de efeitos (igual ao chat card original)
    const validEffects = allMsgEffects.filter(
        effArr => Array.isArray(effArr) && effArr.length > 0 && !effArr[0]?.disabled,
    );

    let buffSectionHtml: string;
    if (validEffects.length > 0) {
        const btns = validEffects.map((effArr, i) => {
            const eff  = effArr[0];
            const name = eff.name ?? `Efeito ${i + 1}`;
            const iconPart = eff.icon
                ? `<img src="${esc(eff.icon)}" width="16" height="16" />`
                : `<i class="fas fa-star"></i>`;
            return `<button class="smf-buff-btn" data-effect-index="${i}">${iconPart} ${esc(name)}</button>`;
        }).join("");
        buffSectionHtml = `
            <div class="smf-sub-section-title"><i class="fas fa-wand-magic-sparkles"></i> EFEITOS / BUFF</div>
            <div class="smf-buff-btns">${btns}</div>
            <div class="smf-feedback" id="smf-buff-feedback"></div>
        `;
    } else {
        buffSectionHtml = `
            <div class="smf-sub-section-title"><i class="fas fa-wand-magic-sparkles"></i> EFEITOS / BUFF</div>
            <div class="smf-na-text">Sem efeitos de buff nesta mensagem de chat.</div>
        `;
    }

    // ── Seção 4: Condições ────────────────────────────────────────────────────

    type StatusEntry = { id: string; name: string; icon?: string };
    const allStatuses = (
        (typeof CONFIG !== "undefined"
            ? (CONFIG as Record<string, unknown>).statusEffects
            : undefined) as StatusEntry[] | undefined
    ) ?? [];
    const sorted = [...allStatuses].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const condItemsHtml = sorted.map(s => {
        const iconPart = s.icon
            ? `<img src="${esc(s.icon)}" class="smf-cond-icon" />`
            : `<span class="smf-cond-ph"></span>`;
        return `
            <label class="smf-cond-item" data-name="${esc(s.name.toLowerCase())}">
                <input type="checkbox" value="${esc(s.id)}" />
                ${iconPart}
                <span>${esc(s.name)}</span>
            </label>
        `;
    }).join("");

    const condSectionHtml = `
        <div class="smf-sub-section-title"><i class="fas fa-list-check"></i> CONDIÇÕES</div>
        <input type="text" class="smf-cond-filter" id="smf-cond-filter" placeholder="Filtrar condições..." autocomplete="off" />
        <div class="smf-cond-grid">${condItemsHtml}</div>
        <button class="smf-cond-apply-btn" id="smf-cond-apply">
            <i class="fas fa-check-circle"></i> Aplicar Condições Selecionadas
        </button>
        <div class="smf-feedback" id="smf-cond-feedback"></div>
    `;

    // ── Conteúdo final ────────────────────────────────────────────────────────
    // Para magias de cura: Buff e Condições são omitidos (não fazem sentido)

    const buffAndCondHtml = preReq.isHeal ? "" : `
            <div class="smf-divider"></div>
            <div class="smf-section" id="smf-sect-effects">
                <div class="smf-section-title">
                    <i class="fas fa-sparkles"></i> EFEITOS / CONDIÇÕES
                    <button type="button" class="smf-collapse-btn" title="Minimizar"><i class="fas fa-chevron-down"></i></button>
                </div>
                <div class="smf-section-body">
                    ${buffSectionHtml}
                    <div class="smf-divider" style="margin: 8px -14px;"></div>
                    ${condSectionHtml}
                </div>
            </div>
    `;

    const content = `
        <div class="smf-body">
            <div class="smf-banner">
                <div class="smf-label-sm">VOCÊ ESTÁ SENDO ALVO DE UMA MAGIA</div>
                <div class="smf-spell-name">${esc(preReq.spellName)}</div>
                <div class="smf-caster-name">por ${esc(preReq.casterName)}</div>
                <div class="smf-target-name">Alvo: ${esc(targetName)}</div>
            </div>
            <div class="smf-divider"></div>
            <div class="smf-columns">
                <div class="smf-col smf-col-left">
                    <div class="smf-section" id="smf-presenca-sect" style="display:none;">
                        <div id="smf-presenca" class="smf-presenca"></div>
                    </div>
                    <div class="smf-section">${resistSectionHtml}</div>
                </div>
                <div class="smf-col smf-col-right">
                    <div class="smf-section">${damageSectionHtml}</div>
                    ${buffAndCondHtml}
                </div>
            </div>
        </div>
    `;

    // ── Dialog ────────────────────────────────────────────────────────────────


    // ── Dialog ────────────────────────────────────────────────────────────────

    let dlgRef: ClosableDialog | null = null;
    void foundry.applications.api.DialogV2.wait({
        id:      `spell-modal-${preReq.requestId}`,
        classes: ["bg3-dialog", "smf-dialog"],
        window:  { title: `${preReq.spellName} \u2014 ${targetName}` },
        // Cura \u00e9 simples \u2192 1 coluna estreita; o modal cheio (resist\u00eancia + dano +
        // condi\u00e7\u00f5es) usa 2 colunas (a container query em .smf-body decide a partir
        // de ~600px de largura interna).
        position: { width: preReq.isHeal ? 460 : 760 },
        content,
        buttons: [
            {
                type:    "submit",
                action:  "finalize",
                label:   "Finalizar",
                icon:    "fas fa-check",
                default: true,
                callback: () => { /* todos os efeitos já foram aplicados inline */ },
            },
        ],
        render: (_event, dialog) => {
            const root = dialog.element;

            // Registra o modal para que a Contramágica possa fechá-lo se a magia
            // for anulada (removido no .finally).
            dlgRef = dialog as unknown as ClosableDialog;
            trackSpellModal(preReq.messageId, dlgRef);

            // ── Botões de ação NÃO devem submeter/fechar o modal ──────────────
            // Botões dentro do <form> do DialogV2 sem `type` explícito viram
            // `type="submit"` → clicar (aplicar dano/cura/condição, rolar) fecharia
            // o modal. Forçamos `type="button"` em todos os botões de ação. O modal
            // só fecha pelo X ou pelo botão "Finalizar" (esse é o único submit).
            root.querySelectorAll<HTMLButtonElement>("button:not([type])").forEach((b) => {
                b.type = "button";
            });

            // ── Collapse sections ─────────────────────────────────────────────
            // Only section-title elements that have a .smf-collapse-btn child are
            // collapsible — prevents inner sub-titles from toggling the parent.
            root.querySelectorAll<HTMLElement>(".smf-section-title").forEach((title) => {
                if (!title.querySelector(".smf-collapse-btn")) return;
                title.addEventListener("click", () => {
                    title.closest(".smf-section")?.classList.toggle("smf-collapsed");
                });
            });

            // ── PM total ──────────────────────────────────────────────────────
            root.querySelectorAll(".smf-power-check").forEach((el) => {
                el.addEventListener("change", () => {
                    const total = Array.from(root.querySelectorAll<HTMLElement>(".smf-power-check:checked"))
                        .reduce((s, e) => s + parseInt(e.dataset["pm"] ?? "0", 10), 0);
                    const pmTotalEl = root.querySelector("#smf-pm-total");
                    if (pmTotalEl) pmTotalEl.textContent = String(total);
                });
            });

            // ── Rolar Resist\u00eancia (suporta reroll) ────────────────────────────
            let hasRolledResist = false;
            // Último resultado do teste (para Futuro Melhor: +2 no teste já rolado).
            let lastResistTotal = 0;
            let lastResistD20 = 0;
            const rollResistBtn = root.querySelector<HTMLButtonElement>("#smf-roll-resist");
            rollResistBtn?.addEventListener("click", (ev) => {
                const btn = ev.currentTarget as HTMLButtonElement;
                btn.disabled = true;

                const bonusExtra = (root.querySelector<HTMLInputElement>('[name="bonusExtra"]')?.value ?? "").trim();
                const selected = Array.from(root.querySelectorAll<HTMLElement>(".smf-power-check:checked")).map((el) => ({
                    pm:         parseInt(el.dataset["pm"]        ?? "0", 10),
                    bonus:      el.dataset["bonus"]     ?? "",
                    advantage:  el.dataset["advantage"] === "true",
                    bonusLabel: el.dataset["label"]     ?? "",
                    name:       el.dataset["name"]      ?? "",
                }));

                const hasAdvantage = selected.some((p) => p.advantage);
                const parts: string[] = [hasAdvantage ? "2d20kh1" : "1d20"];
                if (baseBonus !== 0) {
                    parts.push(baseBonus > 0 ? `+ ${baseBonus}` : `- ${Math.abs(baseBonus)}`);
                }
                for (const p of selected) {
                    if (!p.bonus || p.bonus === "kh") continue;
                    const b = p.bonus.trim();
                    parts.push(b.startsWith("+") || b.startsWith("-") ? b : `+ ${b}`);
                }
                if (bonusExtra) {
                    const b = bonusExtra.trim();
                    parts.push(b.startsWith("+") || b.startsWith("-") ? b : `+ ${b}`);
                }

                void (async () => {
                    const roll = new Roll(parts.join(" "));
                    await roll.evaluate({ async: true });

                    // Desconta PM apenas na PRIMEIRA rolagem; rerolls s\u00e3o livres
                    if (!hasRolledResist) {
                        const totalPm = selected.reduce((s, p) => s + p.pm, 0);
                        if (totalPm > 0 && targetActor) {
                            const cur = targetActor.system?.attributes?.pm?.value ?? 0;
                            await targetActor.update({ "system.attributes.pm.value": Math.max(0, cur - totalPm) });
                        }
                    }

                    const d20Res = (roll.dice?.[0] as { results?: { active?: boolean; result?: number }[] } | undefined)
                        ?.results?.find((r) => r.active)?.result ?? 0;
                    const total    = roll.total ?? 0;
                    const critFail = d20Res === 1;
                    const critPass = d20Res === 20;
                    const passed   = critPass || (!critFail && total >= preReq.cd);
                    const sl       = skillKey ? SKILL_LABELS[skillKey] : "Resist\u00eancia";

                    const appliedLabels: string[] = selected.map((p) => {
                        const pmStr = p.pm > 0 ? ` (${p.pm} PM)` : "";
                        return `${p.bonusLabel} \u00b7 ${p.name}${pmStr}`;
                    });
                    if (bonusExtra) appliedLabels.push(`${bonusExtra} (manual)`);

                    const chatBadge = critPass ? "\u2726 SUCESSO CR\u00cdTICO" : critFail ? "\u2620 FALHA CR\u00cdTICA" : (passed ? "\u2713 PASSOU" : "\u2717 FALHOU");
                    await ChatMessage.create({
                        content: await roll.render({ flavor: `Resist\u00eancia \u2014 ${sl} (${targetName}) vs CD ${preReq.cd} ${chatBadge}` }),
                        rolls:   [roll.toJSON()],
                        type:    5,
                        speaker: ChatMessage.getSpeaker({ actor: targetActor ?? null }),
                        flags:   { [MODULE_ID]: { resistanceRoll: true } },
                    });

                    lastResistTotal = total;
                    lastResistD20 = d20Res;

                    const outcomeText = evasaoApplies
                        ? (passed
                            ? `Sem dano (Evas\u00e3o${evasaoLevel === "aprimorada" ? " Aprimorada" : ""} \u2014 passou)`
                            : (evasaoLevel === "aprimorada" ? "Metade do dano (Evas\u00e3o Aprimorada \u2014 falhou)" : "Falhou \u2014 efeito completo"))
                        : (passed
                            ? (preReq.resistOutcome === "anula"   ? "Sem efeito (passou)" :
                               preReq.resistOutcome === "metade"  ? "Metade do dano (passou)" :
                               preReq.resistOutcome === "parcial" ? "Metade + sem condi\u00e7\u00f5es (passou)" :
                               "Passou \u2014 veja texto da magia")
                            : "Falhou \u2014 efeito completo");

                    const passClass  = passed ? "smf-rr-pass"       : "smf-rr-fail";
                    const badgeClass = passed ? "smf-rr-badge-pass" : "smf-rr-badge-fail";
                    const badgeText  = critPass ? "SUCESSO CR\u00cdTICO" : critFail ? "FALHA CR\u00cdTICA" : (passed ? "PASSOU" : "FALHOU");
                    const powersHtmlResult = appliedLabels.length > 0
                        ? `<div class="smf-applied-powers">${appliedLabels.map((l) => `<div class="smf-applied-power">\u2726 ${esc(l)}</div>`).join("")}</div>`
                        : "";

                    const resistResultEl = root.querySelector<HTMLElement>("#smf-resist-result");
                    if (resistResultEl) {
                        resistResultEl.innerHTML = `
                            <div class="smf-rr-row">
                                <span class="smf-label-sm">${esc(sl.toUpperCase())}</span>
                                <span class="${passClass}">${total}</span>
                                <span class="smf-label-sm">d20: ${d20Res} + ${baseBonus}</span>
                                <span class="smf-label-sm">CD ${preReq.cd}</span>
                                <span class="${badgeClass}">${badgeText}</span>
                            </div>
                            ${powersHtmlResult}
                            <div class="smf-rr-outcome">${esc(outcomeText)}</div>
                        `;
                        resistResultEl.style.display = "block";
                    }

                    const powersWrap = root.querySelector<HTMLElement>("#smf-powers-wrap");
                    if (powersWrap) powersWrap.style.display = "none";
                    if (!hasRolledResist) {
                        btn.innerHTML = `<i class="fas fa-rotate"></i> Rerolar ${esc(skillLabel)} (CD ${preReq.cd})`;
                        hasRolledResist = true;
                    }
                    btn.disabled = false;
                    renderMagicReactions(passed);
                })();
            });

            // ── Reações contra magia (Parte 2a) ───────────────────────────────
            // Resolve o conjurador (para refletir o efeito de volta nele).
            const srcMsg = game.messages?.get(preReq.messageId) as ChatMessage | undefined;
            const casterTokenId = (srcMsg?.speaker as { token?: string } | undefined)?.token ?? "";
            const casterActorId = (srcMsg?.speaker as { actor?: string } | undefined)?.actor ?? "";
            const casterTokenActor = casterTokenId
                ? (canvas as unknown as { tokens?: { get(id: string): { actor?: { uuid?: string } } | undefined } }).tokens?.get(casterTokenId)?.actor
                : null;
            const casterUuid = casterTokenActor?.uuid
                ?? (casterActorId ? (game.actors?.get(casterActorId) as { uuid?: string } | undefined)?.uuid : "")
                ?? "";

            const paintResult = (totalVal: number, d20: number, ok: boolean, note: string): void => {
                const sl = skillKey ? SKILL_LABELS[skillKey] : "Resistência";
                const el = root.querySelector<HTMLElement>("#smf-resist-result");
                if (!el) return;
                el.innerHTML = `
                    <div class="smf-rr-row">
                        <span class="smf-label-sm">${esc(sl.toUpperCase())}</span>
                        <span class="${ok ? "smf-rr-pass" : "smf-rr-fail"}">${totalVal}</span>
                        <span class="smf-label-sm">d20: ${d20}</span>
                        <span class="smf-label-sm">CD ${preReq.cd}</span>
                        <span class="${ok ? "smf-rr-badge-pass" : "smf-rr-badge-fail"}">${ok ? "PASSOU" : "FALHOU"}</span>
                    </div>
                    <div class="smf-rr-outcome">${esc(note)}</div>`;
                el.style.display = "block";
            };

            const reflectToCaster = async (label: string): Promise<void> => {
                if (!casterUuid && !casterActorId) { warn("reações-magia: conjurador não resolvido para reflexão"); return; }
                await applySpellDamage(casterUuid, casterActorId, preReq.damageTotal);
                await ChatMessage.create({
                    content: `<div class="bg3-reaction-block bg3-reaction-counter"><div class="bg3-reac-title"><i class="fa-solid fa-arrows-rotate"></i> Magia Refletida</div><div class="bg3-reac-line"><b>${esc(targetName)}</b> reflete <b>${esc(preReq.spellName)}</b> (${preReq.damageTotal}) de volta em ${esc(preReq.casterName)} com <b>${esc(label)}</b>.</div></div>`,
                    flags: { [MODULE_ID]: { reactionReflect: true } },
                });
            };

            const renderMagicReactions = (passed: boolean): void => {
                const wrap = root.querySelector<HTMLElement>("#smf-magic-reactions");
                if (!wrap || !targetActor) return;
                const opts: MagicReactionOption[] = getMagicReactions({
                    actor: targetActor as unknown as Parameters<typeof getMagicReactions>[0]["actor"],
                    passed,
                });
                if (!opts.length) { wrap.style.display = "none"; wrap.innerHTML = ""; return; }
                wrap.style.display = "block";
                wrap.innerHTML = `<div class="smf-label-sm" style="padding:6px 0 4px;"><i class="fas fa-bolt"></i> REAÇÕES CONTRA MAGIA</div>`
                    + opts.map((o) =>
                        `<button type="button" class="smf-action-btn smf-magic-reac" data-key="${o.key}" data-kind="${o.kind}" data-bonus="${o.rerollBonus ?? 0}" data-pm="${o.pm}">
                            <i class="fas fa-wand-sparkles"></i> ${esc(o.label)} <span class="smf-magic-reac-sub">${esc(o.note ?? "")} · ${o.pm} PM</span>
                        </button>`).join("");
                wrap.querySelectorAll<HTMLButtonElement>(".smf-magic-reac").forEach((b) => {
                    b.addEventListener("click", () => { void onMagicReaction(b); });
                });
            };

            const onMagicReaction = async (b: HTMLButtonElement): Promise<void> => {
                if (b.disabled) return;
                b.disabled = true;
                const kind = b.dataset["kind"] ?? "";
                const pm   = parseInt(b.dataset["pm"] ?? "0", 10);
                const bonus = parseInt(b.dataset["bonus"] ?? "0", 10);
                const label = b.textContent?.trim().split("\n")[0] ?? "Reação";
                const tActor = targetActor as unknown as Parameters<typeof consumeReaction>[0];

                if (kind === "reroll") {
                    const parts: string[] = ["1d20"];
                    if (baseBonus !== 0) parts.push(baseBonus > 0 ? `+ ${baseBonus}` : `- ${Math.abs(baseBonus)}`);
                    if (bonus !== 0) parts.push(`+ ${bonus}`);
                    const roll = new Roll(parts.join(" ")); await roll.evaluate({ async: true } as never);
                    const d20 = (roll.dice?.[0] as { results?: { active?: boolean; result?: number }[] } | undefined)?.results?.find((r) => r.active)?.result ?? 0;
                    const total = roll.total ?? 0;
                    const ok = d20 === 20 || (d20 !== 1 && total >= preReq.cd);
                    await consumeReaction(tActor, pm);
                    lastResistTotal = total; lastResistD20 = d20;
                    await ChatMessage.create({ content: await roll.render({ flavor: `Rerolar Resistência (${targetName}) vs CD ${preReq.cd} — ${ok ? "✓ PASSOU" : "✗ FALHOU"}` }), rolls: [roll.toJSON()], type: 5, speaker: ChatMessage.getSpeaker({ actor: targetActor ?? null }), flags: { [MODULE_ID]: { resistanceRoll: true } } });
                    paintResult(total, d20, ok, ok ? "Passou (rerolagem)" : "Falhou — efeito completo");
                    renderMagicReactions(ok);
                } else if (kind === "bonus") {
                    // Futuro Melhor: +2 (ou bonus) no teste já rolado.
                    const newTotal = lastResistTotal + (bonus || 2);
                    const ok = lastResistD20 === 20 || (lastResistD20 !== 1 && newTotal >= preReq.cd);
                    await consumeReaction(tActor, pm);
                    lastResistTotal = newTotal;
                    paintResult(newTotal, lastResistD20, ok, ok ? `Passou (+${bonus || 2} de ${label})` : "Falhou — efeito completo");
                    renderMagicReactions(ok);
                } else if (kind === "aparar") {
                    const luta  = targetActor ? computeSkillTotal(targetActor, "luta") : 0;
                    const nivel = Number(((targetActor?.system as { nivel?: { value?: number } } | undefined)?.nivel?.value) ?? 0);
                    const roll = new Roll(`1d20 + ${luta} + ${nivel}`); await roll.evaluate({ async: true } as never);
                    const total = roll.total ?? 0;
                    const ok = total >= preReq.cd;
                    const reflectAlso = total >= preReq.cd + 10;
                    await consumeReaction(tActor, pm);
                    lastResistTotal = total; lastResistD20 = 0;
                    await ChatMessage.create({ content: await roll.render({ flavor: `Aparar Magia (${targetName}) — ataque vs CD ${preReq.cd} — ${ok ? "✓ EVITOU" : "✗ NÃO EVITOU"}` }), rolls: [roll.toJSON()], type: 5, speaker: ChatMessage.getSpeaker({ actor: targetActor ?? null }), flags: { [MODULE_ID]: { resistanceRoll: true } } });
                    paintResult(total, 0, ok, ok ? (reflectAlso ? "Evitou e refletiu! (Aparar Magia)" : "Evitou totalmente (Aparar Magia)") : "Não evitou — efeito completo");
                    if (reflectAlso) await reflectToCaster("Aparar Magia");
                    renderMagicReactions(ok);
                } else if (kind === "reflect") {
                    await consumeReaction(tActor, pm);
                    await reflectToCaster(label);
                    const wrap = root.querySelector<HTMLElement>("#smf-magic-reactions");
                    if (wrap) wrap.innerHTML = `<div class="smf-rr-outcome">✦ Efeito refletido no conjurador.</div>`;
                }
            };

            // ── Presença Aristocrática (Parte 2b) ─────────────────────────────
            // Disponível imediatamente (pré-resolução) quando a magia tenta causar
            // dano ao alvo. O CONJURADOR faz Vontade (CD Car do alvo); se falhar, a
            // magia é anulada e ele perde a ação → fecha o modal.
            (() => {
                if (preReq.isHeal || preReq.damageTotal <= 0 || !targetActor) return;
                const csTok = (canvas as unknown as { tokens?: { get(id: string): { actor?: unknown } | undefined } }).tokens;
                const casterActor = (casterTokenId ? csTok?.get(casterTokenId)?.actor : null)
                    ?? (casterActorId ? game.actors?.get(casterActorId) : null);
                const attackerKey = casterTokenId || casterActorId || "";
                const sceneId = (canvas as unknown as { scene?: { id?: string } }).scene?.id ?? "";
                const opt = getPresencaOption({
                    actor: targetActor as unknown as Parameters<typeof getPresencaOption>[0]["actor"],
                    attackerKey, sceneId,
                    holderLevel: Number(((targetActor.system as { attributes?: { nivel?: { value?: number } } } | undefined)?.attributes?.nivel?.value) ?? 0),
                    carMod: Number(((targetActor.system as { atributos?: { car?: { value?: number } } } | undefined)?.atributos?.car?.value) ?? 0),
                });
                if (!opt) return;
                const sect = root.querySelector<HTMLElement>("#smf-presenca-sect");
                const wrap = root.querySelector<HTMLElement>("#smf-presenca");
                if (!sect || !wrap) return;
                sect.style.display = "block";
                wrap.innerHTML = `
                    <div class="smf-label-sm" style="padding:6px 0 4px;"><i class="fas fa-crown"></i> PRESENÇA ARISTOCRÁTICA</div>
                    <button type="button" class="smf-action-btn smf-presenca-btn">
                        <i class="fas fa-crown"></i> Forçar Vontade (CD ${opt.cd}) <span class="smf-magic-reac-sub">conjurador falha → magia anulada · ${opt.pm} PM</span>
                    </button>`;
                wrap.querySelector<HTMLButtonElement>(".smf-presenca-btn")?.addEventListener("click", (ev) => {
                    const btn = ev.currentTarget as HTMLButtonElement;
                    if (btn.disabled) return;
                    btn.disabled = true;
                    void (async () => {
                        const { negated } = await resolvePresenca({
                            holderActor:   targetActor as unknown as Parameters<typeof resolvePresenca>[0]["holderActor"],
                            attackerActor: casterActor as unknown as Parameters<typeof resolvePresenca>[0]["attackerActor"],
                            attackerKey, sceneId, cd: opt.cd,
                            attackerName: preReq.casterName, targetName, contextLabel: "a magia",
                        });
                        if (negated) {
                            wrap.innerHTML = `<div class="smf-rr-outcome">⚜ Magia anulada — o conjurador falhou na Vontade e perdeu a ação.</div>`;
                            // Fecha o modal: a magia não tem efeito.
                            setTimeout(() => { try { (dialog as unknown as { close: () => void }).close(); } catch { /* ignore */ } }, 1400);
                        } else {
                            wrap.innerHTML = `<div class="smf-rr-outcome">O conjurador resistiu — a magia prossegue.</div>`;
                        }
                    })();
                });
            })();

            // ── Consagrar (maximiza cura) ─────────────────────────────────────
            const consagrarCb = root.querySelector<HTMLInputElement>("#smf-consagrar");
            consagrarCb?.addEventListener("change", () => {
                const checked = consagrarCb.checked;
                const healBtn = root.querySelector<HTMLButtonElement>("#smf-heal-full");
                if (!healBtn) return;
                const baseVal = parseInt(healBtn.dataset["healBase"] ?? "", 10) || preReq.damageTotal;
                const maxVal  = parseInt(healBtn.dataset["healMax"]  ?? "", 10) || preReq.damageTotal;
                const val     = checked ? maxVal : baseVal;
                const halfU   = Math.floor(val / 2);
                const healNum = root.querySelector<HTMLElement>("#smf-heal-number");
                if (healNum) healNum.textContent = String(val);
                healBtn.dataset["healCurrent"] = String(val);
                healBtn.innerHTML = `<i class="fas fa-heart"></i> Curar (${val})${preReq.removeFadiga ? " e Remover Fadiga" : ""}`;
                const undeadFull = root.querySelector<HTMLButtonElement>("#smf-undead-full");
                const undeadHalf = root.querySelector<HTMLButtonElement>("#smf-undead-half");
                if (undeadFull) undeadFull.innerHTML = `<i class="fas fa-skull-crossbones"></i> Dano Completo (${val})`;
                if (undeadHalf) undeadHalf.innerHTML = `<i class="fas fa-shield-halved"></i> Metade do Dano (${halfU})`;
            });

            // ── Auto-marca Consagrar se o alvo est\u00e1 em \u00e1rea de Consagrar ──────
            if (preReq.isHeal && targetActor) {
                const hasBoost = (targetActor.effects?.contents ?? []).some((e) => {
                    const f = e.flags?.[MODULE_ID] as Record<string, unknown> | undefined;
                    return f?.["consagrarHealingBoost"] === true;
                });
                if (hasBoost && consagrarCb && !consagrarCb.checked) {
                    consagrarCb.checked = true;
                    consagrarCb.dispatchEvent(new Event("change"));
                    consagrarCb.closest<HTMLElement>(".smf-consagrar-label")?.setAttribute("title", "Alvo est\u00e1 em \u00e1rea de Consagrar \u2014 b\u00f4nus auto-aplicado");
                }
            }

            // ── Morto-Vivo ────────────────────────────────────────────────────
            const mortoCb = root.querySelector<HTMLInputElement>("#smf-morto-vivo");
            const undeadSection = root.querySelector<HTMLElement>("#smf-undead-section");
            mortoCb?.addEventListener("change", () => {
                if (undeadSection) undeadSection.style.display = mortoCb.checked ? "" : "none";
            });

            // ── Truque de Curar Ferimentos ────────────────────────────────────
            if (preReq.truqueAtivo) {
                consagrarCb?.closest<HTMLElement>(".smf-consagrar-label")?.style.setProperty("display", "none");
                const healFullBtn = root.querySelector<HTMLElement>("#smf-heal-full");
                if (healFullBtn) healFullBtn.style.display = "none";
                if (mortoCb) {
                    mortoCb.checked  = true;
                    mortoCb.disabled = true;
                    mortoCb.closest<HTMLElement>(".smf-undead-label")?.setAttribute("title", "Truque: alvo j\u00e1 \u00e9 morto-vivo (1d8 dano de luz)");
                }
                if (undeadSection) undeadSection.style.display = "block";
            }

            // ── Rolar Vontade (resist\u00eancia do morto-vivo) ─────────────────────
            const undeadRollBtn = root.querySelector<HTMLButtonElement>("#smf-undead-roll");
            undeadRollBtn?.addEventListener("click", (ev) => {
                const btn = ev.currentTarget as HTMLButtonElement;
                btn.disabled = true;
                const vontBonus = targetActor ? computeSkillTotal(targetActor, "vont") : 0;
                const bonusStr  = vontBonus >= 0 ? `+${vontBonus}` : `${vontBonus}`;
                void (async () => {
                    const roll = new Roll(`1d20 ${bonusStr}`);
                    await roll.evaluate({ async: true } as never);
                    const d20Res = (roll.dice?.[0] as { results?: { active?: boolean; result?: number }[] } | undefined)
                        ?.results?.find((r) => r.active)?.result ?? 0;
                    const total    = roll.total ?? 0;
                    const critFail = d20Res === 1;
                    const critPass = d20Res === 20;
                    const passed   = critPass || (!critFail && preReq.cd > 0 && total >= preReq.cd);
                    const cdLabel  = preReq.cd > 0 ? `CD ${preReq.cd}` : "CD ?";

                    const chatBadge = critPass ? "\u2726 SUCESSO CR\u00cdTICO" : critFail ? "\u2620 FALHA CR\u00cdTICA" : (passed ? "\u2713 PASSOU" : "\u2717 FALHOU");
                    await ChatMessage.create({
                        content: await roll.render({ flavor: `Resist\u00eancia Vontade (${targetName}) vs ${cdLabel} \u2014 ${chatBadge}` }),
                        rolls:   [roll.toJSON()],
                        type:    5,
                        speaker: ChatMessage.getSpeaker({ actor: targetActor ?? null }),
                        flags:   { [MODULE_ID]: { resistanceRoll: true } },
                    });

                    const passClass  = passed ? "smf-rr-pass"       : "smf-rr-fail";
                    const badgeClass = passed ? "smf-rr-badge-pass" : "smf-rr-badge-fail";
                    const badgeText  = critPass ? "SUCESSO CR\u00cdTICO" : critFail ? "FALHA CR\u00cdTICA" : (passed ? "PASSOU" : "FALHOU");
                    const outcome    = passed ? "Metade do dano (passou)" : "Dano completo (falhou)";

                    const undeadResultEl = root.querySelector<HTMLElement>("#smf-undead-result");
                    if (undeadResultEl) {
                        undeadResultEl.innerHTML = `
                            <div class="smf-rr-row">
                                <span class="smf-label-sm">VONTADE</span>
                                <span class="${passClass}">${total}</span>
                                <span class="smf-label-sm">d20 + ${vontBonus}</span>
                                <span class="smf-label-sm">${cdLabel}</span>
                                <span class="${badgeClass}">${badgeText}</span>
                            </div>
                            <div class="smf-rr-outcome">${esc(outcome)}</div>
                        `;
                        undeadResultEl.style.display = "block";
                    }
                    btn.style.display = "none";
                    const dmgBtns = root.querySelector<HTMLElement>("#smf-undead-dmg-btns");
                    if (dmgBtns) dmgBtns.style.display = "block";
                })();
            });

            // ── Dano sagrado ao morto-vivo ────────────────────────────────────
            root.querySelectorAll<HTMLButtonElement>(".smf-undead-dmg-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const healNum = root.querySelector<HTMLElement>("#smf-heal-number");
                    const curHeal = parseInt(healNum?.textContent ?? "", 10) || preReq.damageTotal;
                    const halfU   = Math.floor(curHeal / 2);
                    let amt   = 0;
                    let label = "";
                    if (btn.id === "smf-undead-full") {
                        amt   = curHeal;
                        label = `\u2713 ${amt} de dano sagrado aplicado`;
                    } else if (btn.id === "smf-undead-half") {
                        amt   = halfU;
                        label = `\u2713 ${amt} de dano sagrado (metade) aplicado`;
                    } else {
                        label = "\u2713 Dano sagrado n\u00e3o aplicado";
                    }
                    if (amt > 0) await applySpellDamage(preReq.targetActorUuid, preReq.targetActorId, amt);
                    root.querySelectorAll(".smf-undead-dmg-btn").forEach((b) => b.classList.add("smf-spent"));
                    const fb = root.querySelector<HTMLElement>("#smf-undead-feedback");
                    if (fb) { fb.textContent = label; fb.style.display = "block"; }
                });
            });

            // ── Dano / Cura ───────────────────────────────────────────────────
            root.querySelectorAll<HTMLButtonElement>(".smf-dmg-btn, .smf-heal-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    let label = "";
                    if (btn.id === "smf-heal-full") {
                        const healAmt = parseInt(btn.dataset["healCurrent"] ?? "", 10) || preReq.damageTotal;
                        await applySpellHeal(preReq.targetActorUuid, preReq.targetActorId, healAmt);
                        label = `\u2713 Cura de ${healAmt} aplicada`;
                        if (preReq.removeFadiga) {
                            const removed = await removeFadigaCondition(preReq.targetActorUuid, preReq.targetActorId);
                            label += removed ? " \u00b7 Fadiga removida" : " \u00b7 sem Fadiga para remover";
                        }
                    } else if (btn.id === "smf-no-heal" || btn.id === "smf-dmg-none") {
                        label = "\u2713 N\u00e3o aplicado";
                    } else {
                        const amt = parseInt(btn.dataset["dmg"] ?? "", 10) || 0;
                        // RD autom\u00e1tica por tipo: subtrai a RD do alvo (edit\u00e1vel
                        // no input); imunidade ao tipo anula o dano.
                        const rdInput = root.querySelector<HTMLInputElement>("#smf-rd-input");
                        const rdVal = Math.max(0, parseInt(rdInput?.value ?? "0", 10) || 0);
                        const finalAmt = dmgImmune ? 0 : Math.max(0, amt - rdVal);
                        if (finalAmt > 0) await applySpellDamage(preReq.targetActorUuid, preReq.targetActorId, finalAmt);
                        label = dmgImmune
                            ? `\u2713 Imune a ${dmgTypeLabel} \u2014 0 de dano`
                            : finalAmt > 0
                                ? (rdVal > 0 ? `\u2713 ${amt} \u2212 RD ${rdVal} = ${finalAmt} de dano aplicado` : `\u2713 ${finalAmt} de dano aplicado`)
                                : (amt > 0 && rdVal > 0 ? `\u2713 RD ${rdVal} absorveu todo o dano (${amt})` : "\u2713 N\u00e3o aplicado");
                    }
                    root.querySelectorAll(".smf-dmg-btn, .smf-heal-btn").forEach((b) => b.classList.add("smf-spent"));
                    const fb = root.querySelector<HTMLElement>("#smf-dmg-feedback");
                    if (fb) { fb.textContent = label; fb.style.display = "block"; }
                });
            });

            // ── Buff ──────────────────────────────────────────────────────────
            root.querySelectorAll<HTMLButtonElement>(".smf-buff-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    if (!targetActor) return;
                    const idx = parseInt(btn.dataset["effectIndex"] ?? "", 10);
                    if (isNaN(idx)) return;
                    await applyBuffEffect(preReq.messageId, idx, targetActor);
                    btn.classList.add("smf-spent");
                    btn.insertAdjacentText("beforeend", " \u2713");
                    const fb = root.querySelector<HTMLElement>("#smf-buff-feedback");
                    if (fb) { fb.textContent = "\u2713 Efeito aplicado"; fb.style.display = "block"; }
                });
            });

            // ── Filtro de condi\u00e7\u00f5es ───────────────────────────────────────────
            const condFilter = root.querySelector<HTMLInputElement>("#smf-cond-filter");
            condFilter?.addEventListener("input", () => {
                const q = condFilter.value.toLowerCase().trim();
                root.querySelectorAll<HTMLElement>(".smf-cond-item").forEach((el) => {
                    const name = el.dataset["name"] ?? "";
                    el.classList.toggle("smf-hidden", q.length > 0 && !name.includes(q));
                });
            });

            // ── Aplicar condi\u00e7\u00f5es ─────────────────────────────────────────────
            root.querySelector("#smf-cond-apply")?.addEventListener("click", () => {
                const checked: string[] = [];
                root.querySelectorAll<HTMLInputElement>(".smf-cond-grid input:checked").forEach((el) => {
                    if (el.value) {
                        // Tagueia a duração ANTES de aplicar — o gerenciador
                        // de duração a consome e expira sozinho (não pergunta).
                        registerExpectedCondition(
                            preReq.targetActorId,
                            el.value,
                            computeConditionDur(preReq.messageId, el.value),
                        );
                        void applyCondition(preReq.targetActorUuid, preReq.targetActorId, el.value);
                        checked.push(el.value);
                    }
                });
                if (checked.length > 0) {
                    const fb = root.querySelector<HTMLElement>("#smf-cond-feedback");
                    if (fb) { fb.textContent = `\u2713 ${checked.length} condi\u00e7\u00e3o(\u00f5es) aplicada(s)`; fb.style.display = "block"; }
                    root.querySelectorAll<HTMLInputElement>(".smf-cond-grid input:checked").forEach((el) => { el.checked = false; });
                }
            });
        },
        rejectClose: false,
    }).finally(() => {
        if (dlgRef) untrackSpellModal(preReq.messageId, dlgRef);
        // Notifica quem pediu (ex.: Coluna de Chamas) que este alvo terminou a
        // interação de resistência — usado pra remover grid/animação quando
        // TODOS os alvos resolverem. No-op se resolveNotify não foi setado.
        const rn = preReq.resolveNotify;
        if (rn) void getSocket()?.executeAsUser(rn.socketName, rn.userId, rn.payload);
    });
}

// ── Socket ────────────────────────────────────────────────────────────────────

function setupSocket(): void {
    onSocketReady((socket) => {
        // Target-side: open the unified resist modal. socketlib already
        // routes via executeAsUser so no targetUserId filtering needed.
        socket.register(SOCKET_PRE_ROLL, (...args: unknown[]) => {
            openUnifiedSpellModal(args[0] as SpellResistPreRollRequest);
        });
        // GM-side: apply buffs / purify conditions on behalf of a player.
        socket.register(SOCKET_AUTO_APPLY, (...args: unknown[]) => {
            void handleAutoApplyBuffSocket(args[0] as import("./types").AutoApplyBuffRequest);
        });
        socket.register(SOCKET_PURIFY, (...args: unknown[]) => {
            void handlePurificationSocket(args[0] as import("./types").PurificationRequest);
        });
    });
}

// ── Helpers de usuário / ator ─────────────────────────────────────────────────

export function getMsgAuthorId(message: ChatMessage): string {
    const m = message as unknown as { author?: { id: string }; user?: { id: string } | string };
    return m.author?.id ?? (typeof m.user === "object" ? m.user?.id : m.user) ?? "";
}

function findPlayerOwner(actor: FoundryActor): FoundryUser | undefined {
    const owners = Object.entries(actor.ownership ?? {})
        .filter(([, level]) => (level as number) >= 3)
        .map(([userId]) => userId);
    return (game.users?.contents ?? []).find(u => !u.isGM && u.active && owners.includes(u.id));
}

function findActiveGM(): FoundryUser | undefined {
    return (game.users?.contents ?? []).find(u => u.isGM && u.active);
}

export function getTargetUserId(actor: FoundryActor): string | null {
    return findPlayerOwner(actor)?.id ?? findActiveGM()?.id ?? null;
}

/**
 * Dispatch público — usado por handlers de magias de área (bola-de-fogo, etc.)
 * para abrir o modal de resistência num alvo. Se o alvo é o usuário atual,
 * abre direto; senão envia via socketlib pro cliente do dono do ator.
 */
export function dispatchSpellResistanceToTarget(preReq: SpellResistPreRollRequest): void {
    if (preReq.targetUserId === game.user?.id) {
        openUnifiedSpellModal(preReq);
    } else {
        void getSocket()?.executeAsUser(SOCKET_PRE_ROLL, preReq.targetUserId, preReq);
    }
}

// ── createChatMessage hook ────────────────────────────────────────────────────

async function processSpellMessage(message: ChatMessage): Promise<void> {
    // Parseia dados comuns (sem verificação de autor ainda — o GM também precisa)
    const itemData = message.getFlag("tormenta20", "itemData") as Record<string, unknown> | undefined;
    if (!itemData) return;

    const tipo = itemData["tipo"] as string | undefined;
    if (!tipo || !(SPELL_TIPOS as readonly string[]).includes(tipo)) return;

    const rolls = message.rolls ?? [];

    // Ignora se tiver roll de ataque (tratado pelo auto-damage)
    if (rolls.some(r => (r.options as Record<string, unknown>)?.["type"] === "attack")) return;

    // ── Purificação: handler especial (apenas o autor processa) ──────────────
    if (getMsgAuthorId(message) === game.user?.id) {
        const spellName = extractSpellName(message);
        if (normalizeCondName(spellName) === "purificacao") {
            await handlePurification(message, message.speaker?.alias ?? "Lançador");
            return;
        }
    }

    // ── Magias de área que NÃO devem abrir o modal de spell-resist ──────────
    // (Consagrar tem effects no item mas é magia de área persistente — alvos
    // são tokens DENTRO da área, não T-targets; o handler dedicado deve cuidar.)
    {
        const sn = normalizeCondName(extractSpellName(message));
        if (sn === "consagrar") return;
        if (sn === "bola de fogo") return;
        if (sn.includes("coluna de chamas")) return;   // handler de área dedicado
        if (sn.includes("miasma mefitico")) return;    // handler de área + Truque dedicados (src/miasma)
    }

    const damageRoll = rolls.find(r => (r.options as Record<string, unknown>)?.["type"] === "damage");

    // Detecta Truque cedo — o roll de cura original foi suprimido em preCreate,
    // então não podemos depender de damageRoll para determinar isHeal nesse caso.
    const spellNameEarly = extractSpellName(message);
    const truqueAtivo    =
        normalizeCondName(spellNameEarly) === "curar ferimentos"
        && /truque/i.test(message.content ?? "")
        && /1d8/i.test(message.content ?? "");
    const isHeal      = truqueAtivo
        || (damageRoll != null && (damageRoll.formula ?? "").includes("curapv"));
    const resistTxt   = ((itemData["resistencia"] as { txt?: string } | undefined)?.txt ?? "").trim();
    const damageTotal = damageRoll?.total ?? 0;

    const { skill: resistSkill, outcome: resistOutcome } = parseResistance(resistTxt);

    // Verifica se há efeitos de buff/condição na mensagem
    const hasMsgEffects = ((message.getFlag("tormenta20", "effects") as unknown[] | undefined)?.length ?? 0) > 0;

    // Abre o modal se tiver algo relevante para o alvo
    const shouldOpen = isHeal || resistSkill !== null || damageTotal > 0 || hasMsgEffects;
    if (!shouldOpen) return;

    const casterActorId = message.speaker?.actor ?? "";
    const isPureBuff    = !isHeal && resistSkill === null && damageTotal === 0 && hasMsgEffects;

    // Resolve flag do item para auto-apply (ID extraído do HTML, não dos flags)
    const casterActor  = game.actors?.get(casterActorId);
    const spellItemId   = extractItemId(message);
    type ActorWithFlags = FoundryActor & { getFlag(scope: string, key: string): unknown };
    const autoApplyMap  = (casterActor as ActorWithFlags | undefined)?.getFlag(MODULE_ID, "autoApplyItems") as Record<string, boolean> | undefined;
    const autoEnabled   = Boolean(spellItemId && autoApplyMap?.[spellItemId]);

    // ── Apenas o autor da mensagem processa (garante que os alvos T são corretos) ─
    if (getMsgAuthorId(message) !== game.user?.id) return;

    // ── Resolver alvos ────────────────────────────────────────────────────────
    const tTargets = Array.from(game.user?.targets ?? []);
    let effectiveTargets: FoundryToken[];

    if (tTargets.length > 0) {
        effectiveTargets = tTargets;
    } else {
        const cvs = canvas as unknown as { tokens?: { controlled?: FoundryToken[] } };
        const controlled = cvs.tokens?.controlled ?? [];
        effectiveTargets = controlled.filter(t => t.actor != null && t.actor.id !== casterActorId);
        if (effectiveTargets.length === 0) return;
    }

    // ── Auto-apply buff puro (sem modal) — GM aplica direto; player delega ao GM ─
    if (isPureBuff && autoEnabled && effectiveTargets.length > 0) {
        type EffectData = Record<string, unknown>;
        const effectGroups = (message.getFlag("tormenta20", "effects") as EffectData[][] | undefined) ?? [];
        const casterName   = message.speaker?.alias ?? "Lançador";
        await autoApplyBuffEffects(effectGroups, effectiveTargets, casterName);
        return;
    }

    const damageFormula = damageRoll?.formula ?? "";
    const casterName    = message.speaker?.alias ?? "Lançador";
    const casterUserId  = game.user?.id ?? "";
    const spellName     = extractSpellName(message);
    // CD: se o chat tiver "CD X" usa esse valor (já inclui modificadores do modal de configuração);
    // caso contrário (Curar Ferimentos sem resistência), calcula do ator lançador.
    const extractedCD = extractCD(message);
    const cd          = extractedCD > 0
        ? extractedCD
        : computeCasterSpellCD(game.actors?.get(message.speaker?.actor ?? "") ?? null);
    // Detecta o aprimoramento de Curar Ferimentos "+2 PM: remove uma condição de fadiga do alvo"
    const removeFadiga  = isHeal
        && normalizeCondName(spellName) === "curar ferimentos"
        && /fadiga/i.test(message.content ?? "");

    // truqueAtivo já foi calculado no topo de processSpellMessage.
    // O roll de 2d8+2 já foi suprimido pelo preCreate hook quando Truque está ativo.
    let effectiveDamage  = damageTotal;
    let effectiveMaxHeal = (isHeal && damageRoll) ? computeMaxRoll(damageRoll) : 0;

    if (truqueAtivo) {
        // Aprimoramento "Energético" (0 PM): adiciona +1d6 ao dano do Truque
        const energeticoAtivo = /energ[eé]tico/i.test(message.content ?? "");
        const formula  = energeticoAtivo ? "1d8 + 1d6" : "1d8";
        const dRoll    = new Roll(formula);
        await dRoll.evaluate({ async: true } as never);
        effectiveDamage  = dRoll.total ?? 0;
        effectiveMaxHeal = energeticoAtivo ? 14 : 8;
        const flavorSuffix = energeticoAtivo ? " · Energético (+1d6)" : "";
        await ChatMessage.create({
            content: await dRoll.render({
                flavor: `Curar Ferimentos — Truque · Dano de Luz vs Morto-Vivo (Vontade reduz à metade)${flavorSuffix}`,
            }),
            rolls:   [dRoll.toJSON()],
            type:    5,
            speaker: message.speaker,
        });
    }

    for (const token of effectiveTargets) {
        const targetActor = token.actor;
        if (!targetActor) continue;

        const targetUserId = getTargetUserId(targetActor);
        if (!targetUserId) {
            ui.notifications.warn(`Nenhum usuário ativo para "${spellName}" em ${targetActor.name}.`);
            continue;
        }

        const preReq: SpellResistPreRollRequest = {
            type:            "spell-resist-preroll",
            requestId:       randomID(),
            targetUserId,
            casterUserId,
            targetActorId:   targetActor.id,
            targetActorUuid: targetActor.uuid,
            casterName,
            spellName,
            resistTxt,
            resistSkill:     resistSkill ?? null,
            resistOutcome,
            cd,
            messageId:       message.id,
            damageTotal:     effectiveDamage,
            damageFormula:   truqueAtivo ? (/energ[eé]tico/i.test(message.content ?? "") ? "1d8 + 1d6" : "1d8") : damageFormula,
            // Truque de Curar Ferimentos é dano de LUZ; senão extrai do roll.
            damageType:      truqueAtivo ? "luz" : extractDamageType(damageRoll),
            isHeal,
            maxHealValue:    effectiveMaxHeal,
            removeFadiga,
            truqueAtivo,
            conditions:      [],
            customEffectNames: [],
        };

        if (targetUserId === game.user?.id) {
            openUnifiedSpellModal(preReq);
        } else {
            void getSocket()?.executeAsUser(SOCKET_PRE_ROLL, targetUserId, preReq);
        }
    }
}

function setupCreateChatHook(): void {
    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;
        void processSpellMessage(message);
    });
}

/**
 * Intercepta a mensagem ANTES de ser criada para remover o roll original de
 * cura (2d8+2 de Curar Ferimentos) quando o aprimoramento Truque está ativo —
 * o Truque substitui a cura por 1d8 de dano de luz, então a rolagem original
 * não deve aparecer no chat. Roda apenas no cliente do autor.
 */
function setupTruquePreCreateHook(): void {
    Hooks.on("preCreateChatMessage", (...args: unknown[]): void => {
        type DocLike = { updateSource(changes: Record<string, unknown>): void };
        const doc      = args[0] as DocLike;
        const data     = args[1] as Record<string, unknown>;
        const userId   = args[3] as string;
        if (userId !== game.user?.id) return;

        const content = (data["content"] as string | undefined) ?? "";
        if (!content) return;

        // Detecta Truque em Curar Ferimentos no conteúdo do card
        if (!/truque/i.test(content)) return;
        if (!/1d8/i.test(content)) return;
        if (!/curar\s+ferimentos/i.test(content)) return;

        // Remove rolls do tipo "damage" (que é o roll de cura 2d8+2)
        const rolls = data["rolls"] as unknown[] | undefined;
        if (!Array.isArray(rolls) || !rolls.length) return;
        const filtered = rolls.filter(r => {
            try {
                const rd = typeof r === "string" ? JSON.parse(r) as Record<string, unknown> : r as Record<string, unknown>;
                const opts = rd["options"] as Record<string, unknown> | undefined;
                return opts?.["type"] !== "damage";
            } catch {
                return true;
            }
        });
        if (filtered.length === rolls.length) return; // nada a remover
        doc.updateSource({ rolls: filtered });
    });
}

// ── Entrada pública ───────────────────────────────────────────────────────────

export function setupSpellResistance(): void {
    ensureStyles();
    setupSocket();
    setupTruquePreCreateHook();
    setupCreateChatHook();
}
