/**
 * Curated spell → condition map for automatic condition application.
 *
 * T20 does NOT encode the conditions a spell applies in structured data — they
 * live in the spell's prose description (sometimes as `@UUID{Condition}` links,
 * sometimes plain text, often with context like "cure", "summon" or "immune"
 * that makes naive extraction unsafe). So this map is hand-curated: each entry
 * is verified against the spell's actual rules text.
 *
 * Behaviour (see modal integration in index.ts):
 *  - On the resistance roll resolving, conditions whose `applyOn` matches the
 *    outcome (fail/pass) are applied automatically, with the duration tagged for
 *    the duration manager (variable durations are rolled).
 *  - Entries flagged `suggest` are pre-marked in the manual grid instead of
 *    auto-applied (for ambiguous "veja texto" / choice spells).
 *  - Aprimoramentos that change/add a condition are matched against the cast's
 *    selected `onUseEffects` descriptions.
 *
 * Coverage grows in batches; uncurated spells fall back to the manual grid.
 */

import type { DurKind } from "@/duration-manager/types";

export type ApplyOn = "fail" | "pass";

export interface MappedCondition {
    /** CONFIG.statusEffects id, e.g. "atordoado". */
    statusId: string;
    /** Which outcome applies it. */
    applyOn: ApplyOn;
    durKind: DurKind;
    /** Fixed round count (kind="rounds"). */
    rounds?: number;
    /** Dice formula rolled for the round count, e.g. "1d4" (kind="rounds"). */
    formula?: string;
    /** Pre-mark in the grid instead of auto-applying (ambiguous cases). */
    suggest?: boolean;
    /** Só se aplica em combate / fora de combate (ex.: Sono). Ausente = sempre. */
    when?: "combat" | "no-combat";
    /**
     * Condição SUCESSORA aplicada quando ESTA (kind=rounds) expira — encadeamento
     * como Amedrontar (Apavorado → Abalado cena). Evita aplicar as duas juntas
     * (a superior suprimiria a base via `stack`).
     */
    then?: { statusId: string; durKind: DurKind; rounds?: number; formula?: string };
}

export interface AprimoramentoOverride {
    /** Tested (case-insensitively) against each selected onUseEffect description. */
    match?: RegExp;
    /** Ativa quando a magia foi lançada como TRUQUE (ex.: Hipnotismo → Pasmo). */
    matchTruque?: boolean;
    /** Conditions added when the aprimoramento is active. */
    add?: MappedCondition[];
    /** Swap a base condition (by statusId) for another when active. */
    replace?: { statusId: string; with: MappedCondition }[];
    /** Remove condições base (ex.: Enfeitiçar +2 PM sugestão → mestre resolve). */
    remove?: string[];
}

export interface SpellConditionEntry {
    conditions: MappedCondition[];
    aprimoramentos?: AprimoramentoOverride[];
    /** Free-text reminder of nuances not modelled (chained conditions, etc.). */
    note?: string;
    /**
     * Bônus situacional que a PRÓPRIA magia dá ao teste de resistência quando o
     * alvo está em combate (ex.: Enfeitiçar/Hipnotismo +5). Somado ao bônus
     * base do modal quando há combate ativo.
     */
    resistBonusInCombat?: number;
}

function norm(s: string): string {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
}

/**
 * Curated map, keyed by the normalized spell name. Verified per spell against
 * the T20 compendium description.
 */
export const SPELL_CONDITIONS: Record<string, SpellConditionEntry> = {
    // Adaga Mental — 2d6 psíquico + Atordoado 1 rodada; Vontade parcial (passa:
    // metade + evita a condição). 1×/cena (limite do conjurador, não modelado).
    "adaga mental": {
        conditions: [{ statusId: "atordoado", applyOn: "fail", durKind: "rounds", rounds: 1 }],
    },
    // Despedaçar — 1d8+2 impacto + Atordoado 1 rodada; Fortitude reduz à metade
    // e evita o atordoamento.
    "despedacar": {
        conditions: [{ statusId: "atordoado", applyOn: "fail", durKind: "rounds", rounds: 1 }],
    },
    // Imobilizar — falha: Paralisado; passa: em vez disso fica Lento. Vontade
    // parcial, dura a cena (com novo teste a cada rodada — não modelado).
    "imobilizar": {
        conditions: [
            { statusId: "paralisado", applyOn: "fail", durKind: "scene" },
            { statusId: "lento", applyOn: "pass", durKind: "scene" },
        ],
    },
    // Amedrontar (lote 2) — Vontade. Passa: Abalado 1d4 rodadas. Falha:
    // Apavorado 1 rodada E Abalado pela cena (aplicados juntos — quando o
    // Apavorado expira, o Abalado segue até o fim da cena). +2 PM: a falha vira
    // Apavorado 1d4+1 rodadas. Restrição de alvo (animal/humanoide; +2 PM p/
    // criatura) fica na nota — o mestre governa.
    "amedrontar": {
        conditions: [
            { statusId: "abalado", applyOn: "pass", durKind: "rounds", formula: "1d4" },
            // Falha: SÓ Apavorado (1 rod). Ao expirar, o encadeamento aplica
            // Abalado pela cena (aplicar as duas juntas suprimiria o Abalado —
            // ele tem `stack:"apavorado"`, é a versão inferior).
            {
                statusId: "apavorado", applyOn: "fail", durKind: "rounds", rounds: 1,
                then: { statusId: "abalado", durKind: "scene" },
            },
        ],
        aprimoramentos: [
            {
                match: /1d4\s*\+\s*1/i,
                replace: [{
                    statusId: "apavorado",
                    with: {
                        statusId: "apavorado", applyOn: "fail", durKind: "rounds", formula: "1d4+1",
                        then: { statusId: "abalado", durKind: "scene" },
                    },
                }],
            },
        ],
        note: "Alvo: 1 animal ou humanoide (outros tipos exigem o aprimoramento \"+2 PM: muda o alvo para criatura\"). Na falha: Apavorado primeiro; quando ele expira, o alvo fica Abalado até o fim da cena.",
    },
    // Enfeitiçar (lote 2) — Vontade anula. Falha: Enfeitiçado pela cena. Alvo
    // hostil OU em combate: +5 na resistência (o modal soma o +5 quando há
    // combate ativo; hostil fora de combate é manual). +2 PM (sugestão): sem
    // condição — o mestre resolve. Ação hostil do conjurador/aliados dissipa
    // (manual).
    "enfeiticar": {
        conditions: [{ statusId: "enfeiticado", applyOn: "fail", durKind: "scene" }],
        aprimoramentos: [
            { match: /sugere\s+uma\s+a[cç][aã]o|sugest[aã]o/i, remove: ["enfeiticado"] },
        ],
        resistBonusInCombat: 5,
        note: "Alvo hostil ou em combate: +5 na resistência (em combate o modal já soma). Ação hostil sua ou dos aliados dissipa a condição. Alvo: 1 humanoide (+5 PM: espírito/monstro, requer 3º círculo).",
    },
    // Hipnotismo (lote 2) — Vontade anula; em combate o alvo recebe +5 (o modal
    // soma). Falha: Fascinado 1d4 rodadas. Passou: imune por 1 dia (manual).
    // Truque: Pasmo 1 rodada em vez de Fascinado (1×/cena por alvo — manual).
    // +2 PM: duração sustentada.
    "hipnotismo": {
        conditions: [{ statusId: "fascinado", applyOn: "fail", durKind: "rounds", formula: "1d4" }],
        aprimoramentos: [
            {
                matchTruque: true,
                replace: [{ statusId: "fascinado", with: { statusId: "pasmo", applyOn: "fail", durKind: "rounds", rounds: 1 } }],
            },
            {
                match: /sustentad/i,
                replace: [{ statusId: "fascinado", with: { statusId: "fascinado", applyOn: "fail", durKind: "sustained" } }],
            },
        ],
        resistBonusInCombat: 5,
        note: "Em combate o alvo recebe +5 na resistência (o modal já soma). Passou: fica imune a este efeito por 1 dia (controle manual). Alvo: 1 animal ou humanoide (aprimoramentos de PM ampliam os tipos).",
    },
    // Sono (lote 2) — Vontade. Passa: Fatigado 1d4 rodadas. Falha FORA de
    // combate: Inconsciente + Caído (dorme até ser acordado — remoção manual).
    // Falha EM combate/perigo: Exausto 1 rodada e, ao expirar, Fatigado pela
    // cena (aplicados juntos). +2 PM: Exausto por 1d4+1 rodadas.
    "sono": {
        conditions: [
            { statusId: "fatigado", applyOn: "pass", durKind: "rounds", formula: "1d4" },
            { statusId: "inconsciente", applyOn: "fail", durKind: "indeterminate", when: "no-combat" },
            { statusId: "caido", applyOn: "fail", durKind: "indeterminate", when: "no-combat" },
            // Em combate: SÓ Exausto (1 rod); ao expirar, encadeia Fatigado cena
            // (Fatigado é a versão inferior — `stack:"exausto"` — não pode ir junto).
            {
                statusId: "exausto", applyOn: "fail", durKind: "rounds", rounds: 1, when: "combat",
                then: { statusId: "fatigado", durKind: "scene" },
            },
        ],
        aprimoramentos: [
            {
                match: /1d4\s*\+\s*1/i,
                replace: [{
                    statusId: "exausto",
                    with: {
                        statusId: "exausto", applyOn: "fail", durKind: "rounds", formula: "1d4+1", when: "combat",
                        then: { statusId: "fatigado", durKind: "scene" },
                    },
                }],
            },
        ],
        note: "Fora de combate a falha derruba o alvo Inconsciente e Caído (acorda com dano ou com uma ação para sacudi-lo — remoção manual). Em combate: Exausto primeiro; quando ele expira, o alvo fica Fatigado pela cena. Alvo: 1 humanoide (+2 PM: criatura).",
    },

    // Explosão de Chamas — base: só dano (Reflexos reduz à metade), sem
    // condição. Com o aprimoramento "+1 PM: Reflexos parcial" a criatura que
    // FALHAR fica Em Chamas (até ser removida manualmente → indeterminada). O
    // tick de 1d6 de fogo por turno é aplicado por `conditions/em-chamas.ts`.
    "explosao de chamas": {
        conditions: [],
        aprimoramentos: [
            {
                match: /em\s*chamas|reflexos\s*parcial/i,
                add: [{ statusId: "emchamas", applyOn: "fail", durKind: "indeterminate" }],
            },
        ],
    },
};

export interface ResolvedCondition {
    statusId: string;
    durKind: DurKind;
    rounds?: number;
    formula?: string;
    then?: { statusId: string; durKind: DurKind; rounds?: number; formula?: string };
}

export function lookupSpellEntry(spellName: string): SpellConditionEntry | null {
    const key = norm(spellName);
    const direct = SPELL_CONDITIONS[key];
    if (direct) return direct;
    // Some spells/powers arrive with a category prefix — fall back to substring.
    for (const k of Object.keys(SPELL_CONDITIONS)) {
        if (key.includes(k)) return SPELL_CONDITIONS[k]!;
    }
    return null;
}

export interface ResolveContext {
    /** Há combate ativo? (filtra condições `when`). Default: false. */
    inCombat?: boolean;
    /** A magia foi lançada como Truque? (ativa overrides `matchTruque`). */
    truque?: boolean;
}

/**
 * Resolve which conditions to apply / suggest for a spell, given the resistance
 * outcome, the cast's selected aprimoramentos and the combat context.
 */
export function resolveSpellConditions(
    spellName: string,
    passed: boolean,
    onUseEffects?: unknown,
    ctx: ResolveContext = {},
): { apply: ResolvedCondition[]; suggest: string[] } {
    const entry = lookupSpellEntry(spellName);
    if (!entry) return { apply: [], suggest: [] };

    let conds = entry.conditions.slice();
    if (entry.aprimoramentos) {
        const list = Array.isArray(onUseEffects)
            ? (onUseEffects as Array<{ description?: unknown; qty?: unknown }>)
            : [];
        for (const apr of entry.aprimoramentos) {
            const active = apr.matchTruque
                ? !!ctx.truque
                : !!apr.match && list.some(
                    (e) => apr.match!.test(String(e.description ?? "")) && Number(e.qty ?? 0) >= 1,
                );
            if (!active) continue;
            if (apr.remove?.length) conds = conds.filter((c) => !apr.remove!.includes(c.statusId));
            if (apr.replace) {
                for (const r of apr.replace) {
                    conds = conds.map((c) => (c.statusId === r.statusId ? r.with : c));
                }
            }
            if (apr.add) conds = conds.concat(apr.add);
        }
    }

    const wantFail = !passed;
    const inCombat = !!ctx.inCombat;
    const matching = conds.filter((c) =>
        (c.applyOn === "fail") === wantFail
        && (!c.when || (c.when === "combat") === inCombat));
    const apply: ResolvedCondition[] = [];
    const suggest: string[] = [];
    for (const c of matching) {
        if (c.suggest) suggest.push(c.statusId);
        else apply.push({ statusId: c.statusId, durKind: c.durKind, rounds: c.rounds, formula: c.formula, then: c.then });
    }
    return { apply, suggest };
}
