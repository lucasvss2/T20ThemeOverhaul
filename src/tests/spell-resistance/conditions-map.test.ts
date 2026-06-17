import { describe, it, expect } from "vitest";
import {
    resolveSpellConditions,
    lookupSpellEntry,
    SPELL_CONDITIONS,
} from "@/spell-resistance/conditions-map";

describe("lookupSpellEntry", () => {
    it("finds an entry by normalized name (accents/case)", () => {
        expect(lookupSpellEntry("Despedaçar")).toBe(SPELL_CONDITIONS["despedacar"]);
        expect(lookupSpellEntry("ADAGA MENTAL")).toBe(SPELL_CONDITIONS["adaga mental"]);
    });

    it("falls back to substring for prefixed names", () => {
        expect(lookupSpellEntry("Magia: Adaga Mental")).toBe(SPELL_CONDITIONS["adaga mental"]);
    });

    it("returns null for unknown spells", () => {
        expect(lookupSpellEntry("Bola de Fogo")).toBeNull();
    });
});

describe("resolveSpellConditions", () => {
    it("applies the fail condition when the target fails (Adaga Mental → Atordoado 1 rodada)", () => {
        const r = resolveSpellConditions("Adaga Mental", false);
        expect(r.apply).toEqual([{ statusId: "atordoado", durKind: "rounds", rounds: 1, formula: undefined }]);
        expect(r.suggest).toEqual([]);
    });

    it("applies nothing on a pass for a fail-only spell", () => {
        const r = resolveSpellConditions("Adaga Mental", true);
        expect(r.apply).toEqual([]);
    });

    it("applies the per-outcome condition (Imobilizar: fail→Paralisado, pass→Lento)", () => {
        const fail = resolveSpellConditions("Imobilizar", false);
        expect(fail.apply.map((c) => c.statusId)).toEqual(["paralisado"]);
        expect(fail.apply[0]!.durKind).toBe("scene");

        const pass = resolveSpellConditions("Imobilizar", true);
        expect(pass.apply.map((c) => c.statusId)).toEqual(["lento"]);
    });

    it("returns empty for uncurated spells", () => {
        expect(resolveSpellConditions("Magia Inexistente", false)).toEqual({ apply: [], suggest: [] });
    });

    it("respects an aprimoramento that adds a condition", () => {
        const entry = {
            conditions: [{ statusId: "cego", applyOn: "fail" as const, durKind: "rounds" as const, rounds: 1 }],
            aprimoramentos: [
                {
                    match: /paralisa/i,
                    add: [{ statusId: "paralisado", applyOn: "fail" as const, durKind: "scene" as const }],
                },
            ],
        };
        // Inline test of the override logic via a temporary registration.
        SPELL_CONDITIONS["__test_apr"] = entry;
        try {
            const without = resolveSpellConditions("__test_apr", false, []);
            expect(without.apply.map((c) => c.statusId)).toEqual(["cego"]);
            const withApr = resolveSpellConditions("__test_apr", false, [
                { description: "o alvo também fica paralisado", qty: 1 },
            ]);
            expect(withApr.apply.map((c) => c.statusId).sort()).toEqual(["cego", "paralisado"]);
        } finally {
            delete SPELL_CONDITIONS["__test_apr"];
        }
    });

    it("respects an aprimoramento that replaces a condition", () => {
        SPELL_CONDITIONS["__test_rep"] = {
            conditions: [{ statusId: "atordoado", applyOn: "fail", durKind: "rounds", rounds: 1 }],
            aprimoramentos: [
                {
                    match: /paralis/i,
                    replace: [
                        {
                            statusId: "atordoado",
                            with: { statusId: "paralisado", applyOn: "fail", durKind: "scene" },
                        },
                    ],
                },
            ],
        };
        try {
            const swapped = resolveSpellConditions("__test_rep", false, [
                { description: "muda a condição para paralisado", qty: 1 },
            ]);
            expect(swapped.apply.map((c) => c.statusId)).toEqual(["paralisado"]);
        } finally {
            delete SPELL_CONDITIONS["__test_rep"];
        }
    });

    it("Explosão de Chamas: no condition at base, Em Chamas only with the aprimoramento (on fail)", () => {
        // Base cast (no aprimoramentos) → só dano, sem condição.
        expect(resolveSpellConditions("Explosão de Chamas", false, []).apply).toEqual([]);
        expect(resolveSpellConditions("Explosão de Chamas", true, []).apply).toEqual([]);

        // Com o aprimoramento "Reflexos parcial / em chamas": falha → Em Chamas.
        const apr = [{ description: "muda a resistência para Reflexos parcial; se falhar fica em chamas", qty: 1 }];
        const fail = resolveSpellConditions("Explosão de Chamas", false, apr);
        expect(fail.apply.map((c) => c.statusId)).toEqual(["emchamas"]);
        expect(fail.apply[0]!.durKind).toBe("indeterminate");

        // Passar no teste com o aprimoramento → sem condição (só metade do dano).
        expect(resolveSpellConditions("Explosão de Chamas", true, apr).apply).toEqual([]);
    });

    it("routes suggest-flagged conditions to the suggest list", () => {
        SPELL_CONDITIONS["__test_sug"] = {
            conditions: [{ statusId: "enfeiticado", applyOn: "fail", durKind: "scene", suggest: true }],
        };
        try {
            const r = resolveSpellConditions("__test_sug", false);
            expect(r.apply).toEqual([]);
            expect(r.suggest).toEqual(["enfeiticado"]);
        } finally {
            delete SPELL_CONDITIONS["__test_sug"];
        }
    });
});
