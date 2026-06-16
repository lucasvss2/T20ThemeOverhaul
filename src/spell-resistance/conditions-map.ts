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
}

export interface AprimoramentoOverride {
    /** Tested (case-insensitively) against each selected onUseEffect description. */
    match: RegExp;
    /** Conditions added when the aprimoramento is active. */
    add?: MappedCondition[];
    /** Swap a base condition (by statusId) for another when active. */
    replace?: { statusId: string; with: MappedCondition }[];
}

export interface SpellConditionEntry {
    conditions: MappedCondition[];
    aprimoramentos?: AprimoramentoOverride[];
    /** Free-text reminder of nuances not modelled (chained conditions, etc.). */
    note?: string;
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
    // Amedrontar — falha: Apavorado por 1 rodada, depois Abalado (encadeamento
    // não modelado — só o Apavorado é auto-aplicado). Vontade parcial.
    "amedrontar": {
        conditions: [{ statusId: "apavorado", applyOn: "fail", durKind: "rounds", rounds: 1 }],
        note: "Após o Apavorado, o alvo fica Abalado (aplicar manualmente).",
    },
};

export interface ResolvedCondition {
    statusId: string;
    durKind: DurKind;
    rounds?: number;
    formula?: string;
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

/**
 * Resolve which conditions to apply / suggest for a spell, given the resistance
 * outcome and the cast's selected aprimoramentos.
 */
export function resolveSpellConditions(
    spellName: string,
    passed: boolean,
    onUseEffects?: unknown,
): { apply: ResolvedCondition[]; suggest: string[] } {
    const entry = lookupSpellEntry(spellName);
    if (!entry) return { apply: [], suggest: [] };

    let conds = entry.conditions.slice();
    if (entry.aprimoramentos && Array.isArray(onUseEffects)) {
        const list = onUseEffects as Array<{ description?: unknown; qty?: unknown }>;
        for (const apr of entry.aprimoramentos) {
            const active = list.some(
                (e) => apr.match.test(String(e.description ?? "")) && Number(e.qty ?? 0) >= 1,
            );
            if (!active) continue;
            if (apr.replace) {
                for (const r of apr.replace) {
                    conds = conds.map((c) => (c.statusId === r.statusId ? r.with : c));
                }
            }
            if (apr.add) conds = conds.concat(apr.add);
        }
    }

    const wantFail = !passed;
    const matching = conds.filter((c) => (c.applyOn === "fail") === wantFail);
    const apply: ResolvedCondition[] = [];
    const suggest: string[] = [];
    for (const c of matching) {
        if (c.suggest) suggest.push(c.statusId);
        else apply.push({ statusId: c.statusId, durKind: c.durKind, rounds: c.rounds, formula: c.formula });
    }
    return { apply, suggest };
}
