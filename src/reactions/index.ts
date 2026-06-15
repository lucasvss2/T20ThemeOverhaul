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
/*  Reações PÓS-DANO (redução de dano após ser atingido)                      */
/* -------------------------------------------------------------------------- */

export type PostDamageKind = "half" | "flat" | "flat-per-pm" | "roll-reduce" | "roll-weapon" | "to-zero";

export interface PostDamageReaction {
    label:        string;
    kind:         PostDamageKind;
    pm:           number;   // custo fixo em PM (flat-per-pm calcula pelo perPmAmount/maxPmAttr)
    flat?:        number;   // redução fixa
    perPmAmount?: number;   // redução por PM (flat-per-pm)
    maxPmAttr?:   string;   // atributo que limita o PM gasto (ex.: "sab")
    rollSkill?:   string;   // perícia rolada para reduzir (ex.: "inti")
    status?:      string;   // condição aplicada após o uso (ex.: "caido")
    note?:        string;   // observação curta (ex.: "vs dano não mágico")
}

/** Reações pós-dano (poderes E magias), chave normalizada → dados. */
export const POSTDAMAGE_REACTIONS: Record<string, PostDamageReaction> = {
    "rolamento defensivo": { label: "Rolamento Defensivo", kind: "half",        pm: 2, status: "caido" },
    "heroi da realidade":  { label: "Herói da Realidade",  kind: "half",        pm: 5 },
    "duro na queda":       { label: "Duro na Queda",       kind: "flat",        pm: 1, flat: 5 },
    "forca dos penhascos": { label: "Força dos Penhascos", kind: "flat-per-pm", pm: 0, perPmAmount: 10, maxPmAttr: "sab" },
    "intimidar a morte":   { label: "Intimidar a Morte",   kind: "roll-reduce", pm: 2, rollSkill: "inti" },
    "sacrificar servo":    { label: "Sacrificar Servo",    kind: "to-zero",     pm: 0 },
    "instante estoico":    { label: "Instante Estoico",    kind: "flat",        pm: 1, flat: 10, note: "dano não mágico" },
    "campo de forca":      { label: "Campo de Força",      kind: "flat",        pm: 4, flat: 30 },
    "bloqueio brutal":     { label: "Bloqueio Brutal",     kind: "roll-weapon", pm: 2 },
};

function pmOf(actor: ActorLike): number {
    return Number(actor.system?.attributes?.pm?.value ?? 0);
}
function attrMod(actor: AnyActor, key: string): number {
    return Number((actor?.system as AnyObj | undefined)?.["atributos"] && ((actor.system as AnyObj)["atributos"] as AnyObj)?.[key] && (((actor.system as AnyObj)["atributos"] as AnyObj)[key] as AnyObj)?.["value"] || 0);
}
function pericValue(actor: AnyActor, key: string): number {
    const per = (actor?.system as AnyObj | undefined)?.["pericias"] as AnyObj | undefined;
    return Number((per?.[key] as AnyObj | undefined)?.["value"] ?? 0);
}

type AnyActor = ActorLike & {
    toggleStatusEffect?: (id: string, opts?: { active?: boolean }) => Promise<unknown>;
};

/** Custo mínimo de PM para a reação aparecer como opção. */
function minPm(reg: PostDamageReaction): number {
    return reg.kind === "flat-per-pm" ? 1 : reg.pm;
}

export interface PostDamageOption {
    key:           string;
    label:         string;
    kind:          PostDamageKind;
    pmHint:        number | string;
    reductionHint: string;
}

/** Reações pós-dano que o ator conhece, pode pagar e não usou nesta rodada. */
export function getPostDamageReactions(opts: {
    actor: AnyActor | null | undefined;
    currentRoundKey?: string | null;
}): PostDamageOption[] {
    const { actor } = opts;
    if (!actor) return [];
    const pm = pmOf(actor);
    const currentRoundKey = opts.currentRoundKey ?? roundKey();
    if (!reactionAvailable(actor.getFlag?.(MODULE_ID, REACTION_USED_FLAG), currentRoundKey)) return [];

    const out: PostDamageOption[] = [];
    const seen = new Set<string>();
    for (const it of itemsOf(actor)) {
        if (it.type !== "poder" && it.type !== "magia") continue;
        const n = normalizeName(it.name ?? "");
        if (!Object.prototype.hasOwnProperty.call(POSTDAMAGE_REACTIONS, n) || seen.has(n)) continue;
        const reg = POSTDAMAGE_REACTIONS[n] as PostDamageReaction;
        if (pm < minPm(reg)) continue;
        seen.add(n);
        out.push({
            key: n, label: reg.label, kind: reg.kind,
            pmHint: reg.kind === "flat-per-pm" ? `${reg.perPmAmount}/PM` : reg.pm,
            reductionHint: reductionHint(reg),
        });
    }
    return out;
}

function reductionHint(reg: PostDamageReaction): string {
    switch (reg.kind) {
        case "half":        return "dano à metade";
        case "flat":        return `−${reg.flat}${reg.note ? ` (${reg.note})` : ""}`;
        case "to-zero":     return "anula o dano";
        case "flat-per-pm": return `−${reg.perPmAmount}/PM`;
        case "roll-reduce": return "−resultado de Intimidação";
        case "roll-weapon": return "−rolagem de dano corpo a corpo";
    }
}

/** Cálculo puro da redução para os tipos sem rolagem (testável). */
export function reduceDamage(kind: PostDamageKind, damage: number, params: { flat?: number; perPmAmount?: number; pmSpent?: number; rolled?: number } = {}): number {
    switch (kind) {
        case "half":        return Math.floor(damage / 2);
        case "flat":        return Math.max(0, damage - (params.flat ?? 0));
        case "to-zero":     return 0;
        case "flat-per-pm": return Math.max(0, damage - (params.perPmAmount ?? 0) * (params.pmSpent ?? 0));
        case "roll-reduce":
        case "roll-weapon": return Math.max(0, damage - (params.rolled ?? 0));
    }
}

/** Fórmula de dano corpo a corpo do ator (arma equipada ou desarmado 1d3). */
function meleeDamageFormula(actor: AnyActor): string {
    const items = itemsOf(actor) as Array<ItemLike & { system?: AnyObj }>;
    for (const it of items) {
        if (it.type !== "arma") continue;
        const sys = it.system as AnyObj | undefined;
        const prop = String(sys?.["proposito"] ?? "");
        const equip = sys?.["equipado"];
        if (!prop.includes("corpo-a-corpo")) continue;
        if (!equip) continue;
        const rolls = (sys?.["rolls"] as Array<AnyObj> | undefined) ?? [];
        const dano = rolls.find((r) => r["type"] === "dano");
        const parts = (dano?.["parts"] as Array<Array<unknown>> | undefined) ?? [];
        const f = String(parts[0]?.[0] ?? sys?.["dano"] ?? "").trim();
        if (f) return f;
    }
    return "1d3"; // desarmado
}

/** Quanto PM gastar e qual a redução final (resolve rolagem se necessário). */
export async function computePostDamageReduction(key: string, damage: number, actor: AnyActor): Promise<{ final: number; pmSpent: number; desc: string; rollHtml?: string }> {
    const reg = Object.prototype.hasOwnProperty.call(POSTDAMAGE_REACTIONS, key) ? POSTDAMAGE_REACTIONS[key] : undefined;
    if (!reg) return { final: damage, pmSpent: 0, desc: "" };
    switch (reg.kind) {
        case "half":    return { final: reduceDamage("half", damage), pmSpent: reg.pm, desc: "dano à metade" };
        case "flat":    return { final: reduceDamage("flat", damage, { flat: reg.flat }), pmSpent: reg.pm, desc: `−${reg.flat}` };
        case "to-zero": return { final: 0, pmSpent: reg.pm, desc: "dano anulado" };
        case "flat-per-pm": {
            const maxByAttr = Math.max(0, attrMod(actor, reg.maxPmAttr ?? "sab"));
            const need = Math.ceil(damage / (reg.perPmAmount ?? 10));
            const pmSpent = Math.max(0, Math.min(maxByAttr, need, pmOf(actor)));
            const final = reduceDamage("flat-per-pm", damage, { perPmAmount: reg.perPmAmount, pmSpent });
            return { final, pmSpent, desc: `−${(reg.perPmAmount ?? 10) * pmSpent} (${pmSpent} PM)` };
        }
        case "roll-reduce": {
            const mod = pericValue(actor, reg.rollSkill ?? "inti");
            const { total, html } = await rollFormula(`1d20 + ${mod}`);
            return { final: reduceDamage("roll-reduce", damage, { rolled: total }), pmSpent: reg.pm, desc: `−${total} (Intimidação)`, rollHtml: html };
        }
        case "roll-weapon": {
            const { total, html } = await rollFormula(meleeDamageFormula(actor));
            return { final: reduceDamage("roll-weapon", damage, { rolled: total }), pmSpent: reg.pm, desc: `−${total} (dano corpo a corpo)`, rollHtml: html };
        }
    }
}

/** Rola uma fórmula e retorna total + HTML renderizado (helper compartilhado). */
async function rollFormula(formula: string): Promise<{ total: number; html?: string }> {
    const RollCls = (globalThis as unknown as { Roll?: new (f: string) => { evaluate: (o?: AnyObj) => Promise<unknown>; total?: number; render: () => Promise<string> } }).Roll;
    if (!RollCls) return { total: 0 };
    try {
        const roll = new RollCls(formula);
        await roll.evaluate({ async: true });
        let html: string | undefined;
        try { html = await roll.render(); } catch { /* ignore */ }
        return { total: roll.total ?? 0, html };
    } catch {
        return { total: 0 };
    }
}

/**
 * Finaliza uma reação pós-dano: marca o uso da rodada, aplica condição (se houver)
 * e posta o card. O DANO reduzido e o débito de PM são aplicados pelo chamador
 * (auto-damage) via applyDamage, para uma única atualização do ator.
 */
export async function finalizePostDamageReaction(opts: {
    actor: AnyActor | null | undefined;
    key: string;
    originalDamage: number;
    finalDamage: number;
    desc: string;
    pmSpent: number;
    rollHtml?: string;
    attackerName: string;
    targetName: string;
}): Promise<void> {
    const reg = Object.prototype.hasOwnProperty.call(POSTDAMAGE_REACTIONS, opts.key) ? POSTDAMAGE_REACTIONS[opts.key] : undefined;
    const actor = opts.actor;
    if (!reg || !actor) return;

    try {
        const curKey = roundKey();
        if (curKey) await actor.setFlag?.(MODULE_ID, REACTION_USED_FLAG, curKey);
        if (reg.status) await actor.toggleStatusEffect?.(reg.status, { active: true });
    } catch (err) {
        warn(`reactions: falha ao marcar uso/condição pós-dano:`, err);
    }

    const statusNote = reg.status === "caido" ? `<div class="bg3-reac-note">Fica Caído.</div>` : "";
    const content = `
<div class="bg3-reaction-block">
  <div class="bg3-reac-title"><i class="fa-solid fa-shield-halved"></i> Dano Reduzido</div>
  <div class="bg3-reac-line"><b>${escHtml(opts.targetName)}</b> reagiu com <b>${escHtml(reg.label)}</b> contra o ataque de ${escHtml(opts.attackerName)}.</div>
  <div class="bg3-reac-stat">Dano ${opts.originalDamage} <span class="bg3-reac-arrow">→</span> <b>${opts.finalDamage}</b> (${escHtml(opts.desc)}).</div>
  ${opts.pmSpent > 0 ? `<div class="bg3-reac-cost">−${opts.pmSpent} PM</div>` : ""}
  ${statusNote}
</div>${opts.rollHtml ?? ""}`;
    try {
        const ChatMessageCls = (globalThis as unknown as { ChatMessage?: { create: (d: AnyObj) => Promise<unknown> } }).ChatMessage;
        await ChatMessageCls?.create({ content, flags: { [MODULE_ID]: { reactionReduce: true } } });
    } catch (err) {
        warn(`reactions: falha ao postar card pós-dano:`, err);
    }
    log(`Reação pós-dano: ${reg.label} (${opts.targetName}) reduziu dano ${opts.originalDamage} → ${opts.finalDamage}.`);
}

/* -------------------------------------------------------------------------- */
/*  Reações de CONTRA-ATAQUE (causa dano de volta no atacante)                */
/* -------------------------------------------------------------------------- */

export interface CounterReaction {
    label:  string;
    pm:     number;
    kind:   "melee-attack" | "fixed-damage";
    damage?: string;   // fixed-damage: fórmula (ex.: "2d6")
    note?:  string;
}
/** Contra-ataques que disparam ao SER ATINGIDO (aparecem no prompt de dano). */
export const COUNTER_REACTIONS: Record<string, CounterReaction> = {
    "revide":          { label: "Revide",          pm: 2, kind: "melee-attack", note: "ataque corpo a corpo no atacante" },
    "arma espiritual": { label: "Arma Espiritual", pm: 0, kind: "fixed-damage", damage: "2d6", note: "a arma fere o atacante (magia ativa)" },
};

/** Contra-ataques que disparam quando o inimigo ERRA (prompt próprio no erro). */
export const ONMISS_COUNTER_REACTIONS: Record<string, CounterReaction> = {
    "contra-ataque": { label: "Contra-Ataque", pm: 2, kind: "melee-attack", note: "ataque corpo a corpo no atacante" },
};

export interface CounterOption { key: string; label: string; pm: number; note?: string; }

function listCounters(registry: Record<string, CounterReaction>, actor: AnyActor | null | undefined, currentRoundKey: string | null): CounterOption[] {
    if (!actor) return [];
    const pm = pmOf(actor);
    if (!reactionAvailable(actor.getFlag?.(MODULE_ID, REACTION_USED_FLAG), currentRoundKey)) return [];
    const out: CounterOption[] = [];
    const seen = new Set<string>();
    for (const it of itemsOf(actor)) {
        if (it.type !== "poder" && it.type !== "magia") continue;
        const n = normalizeName(it.name ?? "");
        if (!Object.prototype.hasOwnProperty.call(registry, n) || seen.has(n)) continue;
        const reg = registry[n] as CounterReaction;
        if (pm < reg.pm) continue;
        seen.add(n);
        out.push({ key: n, label: reg.label, pm: reg.pm, note: reg.note });
    }
    return out;
}

export function getCounterReactions(opts: { actor: AnyActor | null | undefined; currentRoundKey?: string | null }): CounterOption[] {
    return listCounters(COUNTER_REACTIONS, opts.actor, opts.currentRoundKey ?? roundKey());
}

/** Contra-ataques de "erro do inimigo" que o ator pode usar agora. */
export function getMissCounterReactions(opts: { actor: AnyActor | null | undefined; currentRoundKey?: string | null }): CounterOption[] {
    return listCounters(ONMISS_COUNTER_REACTIONS, opts.actor, opts.currentRoundKey ?? roundKey());
}

/**
 * Resolve um contra-ataque: debita PM, marca o uso, rola o ataque/dano e posta o
 * card. Retorna o DANO a aplicar no atacante (o chamador aplica no token do
 * atacante). melee-attack rola 1d20+Luta vs a Defesa do atacante; fixed-damage
 * causa o dano automaticamente.
 */
export async function resolveCounterAttack(opts: {
    actor: AnyActor | null | undefined; key: string; attackerDefesa: number; attackerName: string; targetName: string;
}): Promise<{ damageToAttacker: number }> {
    const reg = Object.prototype.hasOwnProperty.call(COUNTER_REACTIONS, opts.key)
        ? COUNTER_REACTIONS[opts.key]
        : (Object.prototype.hasOwnProperty.call(ONMISS_COUNTER_REACTIONS, opts.key) ? ONMISS_COUNTER_REACTIONS[opts.key] : undefined);
    const actor = opts.actor;
    if (!reg || !actor) return { damageToAttacker: 0 };

    await consumeReaction(actor, reg.pm);

    let damageToAttacker = 0;
    let bodyHtml = "";
    if (reg.kind === "fixed-damage") {
        const { total, html } = await rollFormula(reg.damage ?? "1d6");
        damageToAttacker = total;
        bodyHtml = `<div class="bg3-reac-stat"><b>${total}</b> de dano em ${escHtml(opts.attackerName)} (${escHtml(reg.damage ?? "")}).</div>${html ?? ""}`;
    } else {
        const luta = pericValue(actor, "luta");
        const { total: atk, html: atkHtml } = await rollFormula(`1d20 + ${luta}`);
        const hit = atk >= opts.attackerDefesa;
        if (hit) {
            const { total: dmg, html: dmgHtml } = await rollFormula(meleeDamageFormula(actor));
            damageToAttacker = dmg;
            bodyHtml = `<div class="bg3-reac-stat">Ataque ${atk} vs Defesa ${opts.attackerDefesa} — <b>acertou!</b> ${dmg} de dano.</div>${atkHtml ?? ""}${dmgHtml ?? ""}`;
        } else {
            bodyHtml = `<div class="bg3-reac-stat">Ataque ${atk} vs Defesa ${opts.attackerDefesa} — <b>errou</b>.</div>${atkHtml ?? ""}`;
        }
    }
    const content = `
<div class="bg3-reaction-block bg3-reaction-counter">
  <div class="bg3-reac-title"><i class="fa-solid fa-reply"></i> Contra-Ataque</div>
  <div class="bg3-reac-line"><b>${escHtml(opts.targetName)}</b> revida com <b>${escHtml(reg.label)}</b> contra ${escHtml(opts.attackerName)}.</div>
  ${bodyHtml}
  ${reg.pm > 0 ? `<div class="bg3-reac-cost">−${reg.pm} PM</div>` : ""}
</div>`;
    await postCard(content, { reactionCounter: true });
    return { damageToAttacker };
}

/* -------------------------------------------------------------------------- */
/*  Reação de APARAR (bloqueio por teste de ataque vs rolagem inimiga)        */
/* -------------------------------------------------------------------------- */

export interface ContestReaction { label: string; pm: number; }
export const CONTEST_REACTIONS: Record<string, ContestReaction> = {
    "aparar": { label: "Aparar", pm: 1 },
};

export function getContestReactions(opts: {
    actor: AnyActor | null | undefined; attackTotal: number; defesa: number; currentRoundKey?: string | null;
}): Array<{ key: string; label: string; pm: number }> {
    const { actor, attackTotal, defesa } = opts;
    if (!actor) return [];
    if (attackTotal < defesa) return []; // só quando o ataque acerta
    const pm = pmOf(actor);
    const currentRoundKey = opts.currentRoundKey ?? roundKey();
    if (!reactionAvailable(actor.getFlag?.(MODULE_ID, REACTION_USED_FLAG), currentRoundKey)) return [];
    const out: Array<{ key: string; label: string; pm: number }> = [];
    const seen = new Set<string>();
    for (const it of itemsOf(actor)) {
        if (it.type !== "poder") continue;
        const n = normalizeName(it.name ?? "");
        if (!Object.prototype.hasOwnProperty.call(CONTEST_REACTIONS, n) || seen.has(n)) continue;
        const reg = CONTEST_REACTIONS[n] as ContestReaction;
        if (pm < reg.pm) continue;
        seen.add(n);
        out.push({ key: n, label: reg.label, pm: reg.pm });
    }
    return out;
}

function nivelOf(actor: AnyActor): number {
    return Number(((actor?.system as AnyObj | undefined)?.["nivel"] as AnyObj | undefined)?.["value"] ?? 0);
}

/**
 * Aparar: rola um teste de ataque (1d20 + Luta + nível) contra a rolagem do
 * inimigo. Retorna se bloqueou. Debita PM, marca o uso e posta o card.
 */
export async function applyContestReaction(opts: {
    actor: AnyActor | null | undefined; key: string; attackTotal: number; attackerName: string; targetName: string;
}): Promise<{ blocked: boolean }> {
    const reg = Object.prototype.hasOwnProperty.call(CONTEST_REACTIONS, opts.key) ? CONTEST_REACTIONS[opts.key] : undefined;
    const actor = opts.actor;
    if (!reg || !actor) return { blocked: false };

    const luta = pericValue(actor, "luta");
    const nivel = nivelOf(actor);
    const { total, html } = await rollFormula(`1d20 + ${luta} + ${nivel}`);
    const blocked = total > opts.attackTotal;

    try {
        const pm = pmOf(actor);
        await actor.update?.({ "system.attributes.pm.value": Math.max(0, pm - reg.pm) });
        const curKey = roundKey();
        if (curKey) await actor.setFlag?.(MODULE_ID, REACTION_USED_FLAG, curKey);
    } catch (err) { warn(`reactions: falha Aparar (PM/uso):`, err); }

    const content = `
<div class="bg3-reaction-block ${blocked ? "" : "bg3-reaction-fail"}">
  <div class="bg3-reac-title"><i class="fa-solid fa-hand-back-fist"></i> Aparar — ${blocked ? "Bloqueado" : "Falhou"}</div>
  <div class="bg3-reac-line"><b>${escHtml(opts.targetName)}</b> apara o ataque de ${escHtml(opts.attackerName)}.</div>
  <div class="bg3-reac-stat">Teste ${total} vs ataque ${opts.attackTotal} — <b>${blocked ? "evitou o ataque" : "não evitou"}</b>.</div>
  <div class="bg3-reac-cost">−${reg.pm} PM</div>
</div>${html ?? ""}`;
    await postCard(content, { reactionContest: true, blocked });
    return { blocked };
}

/* -------------------------------------------------------------------------- */
/*  Reações de REROLAR (força o atacante a repetir a rolagem de ataque)       */
/* -------------------------------------------------------------------------- */

export interface RerollReaction { label: string; pm: number; keepWorst: boolean; }
export const REROLL_REACTIONS: Record<string, RerollReaction> = {
    "reparar injustica": { label: "Reparar Injustiça", pm: 2,  keepWorst: true },   // pior dos dois
    "premonicao":        { label: "Premonição",        pm: 13, keepWorst: false },  // aceita o novo (base 10 + aprim 3)
};

export function getRerollReactions(opts: { actor: AnyActor | null | undefined; currentRoundKey?: string | null }): Array<{ key: string; label: string; pm: number; keepWorst: boolean }> {
    const { actor } = opts;
    if (!actor) return [];
    const pm = pmOf(actor);
    const currentRoundKey = opts.currentRoundKey ?? roundKey();
    if (!reactionAvailable(actor.getFlag?.(MODULE_ID, REACTION_USED_FLAG), currentRoundKey)) return [];
    const out: Array<{ key: string; label: string; pm: number; keepWorst: boolean }> = [];
    const seen = new Set<string>();
    for (const it of itemsOf(actor)) {
        if (it.type !== "poder" && it.type !== "magia") continue;
        const n = normalizeName(it.name ?? "");
        if (!Object.prototype.hasOwnProperty.call(REROLL_REACTIONS, n) || seen.has(n)) continue;
        const reg = REROLL_REACTIONS[n] as RerollReaction;
        if (pm < reg.pm) continue;
        seen.add(n);
        out.push({ key: n, label: reg.label, pm: reg.pm, keepWorst: reg.keepWorst });
    }
    return out;
}

/** Debita o PM da reação e marca o uso da rodada (para a reação de rerolar). */
export async function consumeReaction(actor: AnyActor | null | undefined, pm: number): Promise<void> {
    if (!actor) return;
    try {
        const cur = pmOf(actor);
        if (pm > 0) await actor.update?.({ "system.attributes.pm.value": Math.max(0, cur - pm) });
        const curKey = roundKey();
        if (curKey) await actor.setFlag?.(MODULE_ID, REACTION_USED_FLAG, curKey);
    } catch (err) { warn(`reactions: falha consumeReaction:`, err); }
}

async function postCard(content: string, flags: AnyObj): Promise<void> {
    try {
        const ChatMessageCls = (globalThis as unknown as { ChatMessage?: { create: (d: AnyObj) => Promise<unknown> } }).ChatMessage;
        await ChatMessageCls?.create({ content, flags: { [MODULE_ID]: flags } });
    } catch (err) { warn(`reactions: falha ao postar card:`, err); }
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
.bg3-reaction-counter { border-left-color: #ff8a4a; }
.bg3-reaction-counter .bg3-reac-title { color: #ff8a4a; }
.bg3-reaction-fail { border-left-color: #cc4444; }
.bg3-reaction-fail .bg3-reac-title { color: #e06666; }
`;
    document.head.appendChild(style);
}

export function setupReactions(): void {
    Hooks.once("ready", () => {
        injectStyles();
        log(`Reações (defesa) ativas — ${Object.keys(DEFENSE_REACTIONS).length} magias no registro.`);
    });
}
