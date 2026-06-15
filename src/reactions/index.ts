/**
 * Reações — Parte 1a: reações de DEFESA contra um ataque.
 *
 * Quando um ataque acerta o alvo mas poderia ser bloqueado por uma reação que
 * eleva a Defesa (ex.: Armadura Arcana +5), o dono do alvo recebe a opção de
 * reagir. Se a nova Defesa passar a superar a rolagem de ataque, o ataque é
 * bloqueado (dano cancelado), gasta-se PM e consome-se a reação da rodada.
 *
 * Integra ao prompt de dano do `auto-damage` (mesmo padrão da Aura de
 * Invencibilidade): `getBlockingDefenseReactions` lista as reações utilizáveis;
 * `applyDefenseReaction` debita PM, marca o uso e posta o card de bloqueio.
 *
 * Conjunto curado (3 magias) — confirmado por varredura completa dos packs:
 * Armadura Arcana, Escudo da Fé (nativa) e Salto Dimensional (aprimoramento
 * só-texto, por isso registro curado em vez de parsing). Regra T20: 1 reação
 * por rodada — usar qualquer uma consome a reação da rodada.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";

export interface DefenseReaction {
    label:   string;
    bonus:   number;   // bônus na Defesa contra o ataque
    pm:      number;   // custo total em PM (base + aprimoramento)
    reflex?: number;   // bônus em Reflexos (informativo)
    moveM?:  number;   // deslocamento concedido em metros (informativo)
    circulo: number;
}

/** Chaves normalizadas (sem acento, minúsculas) → dados da reação. */
export const DEFENSE_REACTIONS: Record<string, DefenseReaction> = {
    "armadura arcana":   { label: "Armadura Arcana",   bonus: 5, pm: 2, circulo: 1 },
    "escudo da fe":      { label: "Escudo da Fé",      bonus: 2, pm: 1, circulo: 1 },
    "salto dimensional": { label: "Salto Dimensional", bonus: 5, pm: 5, reflex: 5, moveM: 1.5, circulo: 2 },
};

const REACTION_USED_FLAG = "reactionUsedRound";
const STYLE_ID = "bg3-reactions-styles";

/* -------------------------------------------------------------------------- */
/*  Núcleo (puro / testável)                                                  */
/* -------------------------------------------------------------------------- */

export function normalizeName(s: string): string {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** O ataque acerta (>= Defesa) mas o bônus o transformaria em erro? */
export function canBlock(attackTotal: number, defesa: number, bonus: number): boolean {
    return attackTotal >= defesa && attackTotal < defesa + bonus;
}

/** A reação ainda está disponível nesta rodada? (fora de combate: sempre). */
export function reactionAvailable(usedKey: unknown, currentRoundKey: string | null): boolean {
    if (!currentRoundKey) return true;
    return usedKey !== currentRoundKey;
}

export interface BlockingReaction {
    key:     string;
    label:   string;
    bonus:   number;
    pm:      number;
    itemId:  string | null;
    reflex?: number;
    moveM?:  number;
}

interface ActorLike {
    system?: { attributes?: { pm?: { value?: number } } };
    items?:  { contents?: ItemLike[] } | ItemLike[];
    getFlag?: (scope: string, key: string) => unknown;
    setFlag?: (scope: string, key: string, val: unknown) => Promise<unknown>;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
    name?:   string;
}
interface ItemLike { type?: string; name?: string; id?: string | null; }

function itemsOf(actor: ActorLike): ItemLike[] {
    const it = actor.items;
    if (!it) return [];
    if (Array.isArray(it)) return it;
    return it.contents ?? [];
}

/**
 * Reações de defesa que o ator pode usar AGORA para bloquear este ataque:
 * conhece a magia, tem PM, ainda não reagiu nesta rodada, e o bônus bloqueia.
 * Ordenadas pela mais barata primeiro.
 */
export function getBlockingDefenseReactions(opts: {
    actor: ActorLike | null | undefined;
    attackTotal: number;
    defesa: number;
    currentRoundKey?: string | null;
}): BlockingReaction[] {
    const { actor, attackTotal, defesa } = opts;
    if (!actor) return [];
    const pmAvail = Number(actor.system?.attributes?.pm?.value ?? 0);
    const currentRoundKey = opts.currentRoundKey ?? roundKey();
    if (!reactionAvailable(actor.getFlag?.(MODULE_ID, REACTION_USED_FLAG), currentRoundKey)) return [];

    const out: BlockingReaction[] = [];
    const seen = new Set<string>();
    for (const it of itemsOf(actor)) {
        if (it.type !== "magia") continue;
        const n = normalizeName(it.name ?? "");
        if (!Object.prototype.hasOwnProperty.call(DEFENSE_REACTIONS, n)) continue;
        if (seen.has(n)) continue;
        const reg = DEFENSE_REACTIONS[n] as DefenseReaction;
        if (pmAvail < reg.pm) continue;
        if (!canBlock(attackTotal, defesa, reg.bonus)) continue;
        seen.add(n);
        out.push({ key: n, label: reg.label, bonus: reg.bonus, pm: reg.pm, itemId: it.id ?? null, reflex: reg.reflex, moveM: reg.moveM });
    }
    out.sort((a, b) => a.pm - b.pm);
    return out;
}

/* -------------------------------------------------------------------------- */
/*  Runtime helpers                                                           */
/* -------------------------------------------------------------------------- */

type AnyObj = Record<string, unknown>;

/** Chave da rodada atual (`combatId:round`) ou null fora de combate. */
export function roundKey(): string | null {
    const c = (game as unknown as { combat?: { id?: string; round?: number; started?: boolean } }).combat;
    if (!c || !c.started) return null;
    return `${c.id}:${c.round}`;
}

function escHtml(s: string): string {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

/**
 * Aplica a reação de defesa: debita PM, marca a reação como usada na rodada e
 * posta o card de bloqueio. NÃO aplica dano (o ataque é bloqueado).
 */
export async function applyDefenseReaction(opts: {
    actor: ActorLike | null | undefined;
    key: string;
    attackTotal: number;
    defesa: number;
    attackerName: string;
    targetName: string;
}): Promise<void> {
    const reg = Object.prototype.hasOwnProperty.call(DEFENSE_REACTIONS, opts.key)
        ? DEFENSE_REACTIONS[opts.key]
        : undefined;
    const actor = opts.actor;
    if (!reg || !actor) return;

    try {
        const pm = Number(actor.system?.attributes?.pm?.value ?? 0);
        await actor.update?.({ "system.attributes.pm.value": Math.max(0, pm - reg.pm) });
        const curKey = roundKey();
        if (curKey) await actor.setFlag?.(MODULE_ID, REACTION_USED_FLAG, curKey);
    } catch (err) {
        warn(`reactions: falha ao debitar PM/marcar uso:`, err);
    }

    const newDef = opts.defesa + reg.bonus;
    const moveNote = reg.moveM ? `<div class="bg3-reac-note">Salta ${reg.moveM}m (mova o token).</div>` : "";
    const reflexNote = reg.reflex ? `<div class="bg3-reac-note">+${reg.reflex} em Reflexos contra o efeito.</div>` : "";
    const content = `
<div class="bg3-reaction-block">
  <div class="bg3-reac-title"><i class="fa-solid fa-shield-halved"></i> Ataque Bloqueado</div>
  <div class="bg3-reac-line"><b>${escHtml(opts.targetName)}</b> reagiu com <b>${escHtml(reg.label)}</b> contra o ataque de ${escHtml(opts.attackerName)}.</div>
  <div class="bg3-reac-stat">Defesa ${opts.defesa} <span class="bg3-reac-arrow">→</span> <b>${newDef}</b> · ataque ${opts.attackTotal} — <b>errou</b>.</div>
  <div class="bg3-reac-cost">−${reg.pm} PM</div>
  ${reflexNote}${moveNote}
</div>`;
    try {
        const ChatMessageCls = (globalThis as unknown as { ChatMessage?: { create: (d: AnyObj) => Promise<unknown> } }).ChatMessage;
        await ChatMessageCls?.create({ content, flags: { [MODULE_ID]: { reactionBlock: true } } });
    } catch (err) {
        warn(`reactions: falha ao postar card:`, err);
    }
    log(`Reação de defesa aplicada: ${reg.label} (${opts.targetName}) bloqueou ataque (${opts.attackTotal} vs ${newDef}).`);
}

/* -------------------------------------------------------------------------- */

function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.bg3-reaction-block { border: 1px solid var(--bg3-btn-border, #8b6914); border-left: 4px solid var(--bg3-accent, #c8a96e);
  border-radius: 5px; padding: 8px 12px; background: linear-gradient(to right, rgba(200,169,110,0.10), rgba(0,0,0,0.15));
  color: var(--bg3-text-primary, #f0ebe0); font-family: "Palatino Linotype", serif; }
.bg3-reaction-block .bg3-reac-title { color: var(--bg3-accent, #c8a96e); font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; font-size: 0.9rem; margin-bottom: 4px; }
.bg3-reaction-block .bg3-reac-title i { margin-right: 6px; }
.bg3-reaction-block .bg3-reac-line { font-size: 0.9rem; }
.bg3-reaction-block .bg3-reac-stat { font-size: 0.95rem; margin-top: 4px; }
.bg3-reaction-block .bg3-reac-arrow { color: var(--bg3-accent, #c8a96e); }
.bg3-reaction-block .bg3-reac-cost { color: #8fc8ff; font-size: 0.82rem; margin-top: 3px; }
.bg3-reaction-block .bg3-reac-note { color: var(--bg3-text-muted, #9a8e7a); font-size: 0.8rem; margin-top: 2px; }
`;
    document.head.appendChild(style);
}

export function setupReactions(): void {
    Hooks.once("ready", () => {
        injectStyles();
        log(`Reações (defesa) ativas — ${Object.keys(DEFENSE_REACTIONS).length} magias no registro.`);
    });
}
