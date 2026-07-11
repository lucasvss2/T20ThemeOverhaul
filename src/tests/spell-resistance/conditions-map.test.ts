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

    it("Amedrontar: passa→Abalado 1d4; falha→Apavorado 1 rod + Abalado cena; +2 PM→Apavorado 1d4+1", () => {
        const pass = resolveSpellConditions("Amedrontar", true, []);
        expect(pass.apply).toEqual([{ statusId: "abalado", durKind: "rounds", rounds: undefined, formula: "1d4" }]);

        const fail = resolveSpellConditions("Amedrontar", false, []);
        expect(fail.apply.map((c) => c.statusId).sort()).toEqual(["abalado", "apavorado"]);
        expect(fail.apply.find((c) => c.statusId === "apavorado")!.rounds).toBe(1);
        expect(fail.apply.find((c) => c.statusId === "abalado")!.durKind).toBe("scene");

        const apr = [{ description: "alvos que falhem ficam apavorados por 1d4+1 rodadas, em vez de apenas 1", qty: 1 }];
        const boosted = resolveSpellConditions("Amedrontar", false, apr);
        expect(boosted.apply.find((c) => c.statusId === "apavorado")!.formula).toBe("1d4+1");
    });

    it("Enfeitiçar: falha→Enfeitiçado cena; +2 PM sugestão remove a condição; +5 em combate registrado", () => {
        expect(resolveSpellConditions("Enfeitiçar", true, []).apply).toEqual([]);
        const fail = resolveSpellConditions("Enfeitiçar", false, []);
        expect(fail.apply).toEqual([{ statusId: "enfeiticado", durKind: "scene", rounds: undefined, formula: undefined }]);

        const sugestao = [{ description: "em vez do normal, você sugere uma ação para o alvo e ele obedece", qty: 1 }];
        expect(resolveSpellConditions("Enfeitiçar", false, sugestao).apply).toEqual([]);

        expect(lookupSpellEntry("Enfeitiçar")!.resistBonusInCombat).toBe(5);
    });

    it("Hipnotismo: falha→Fascinado 1d4; Truque→Pasmo 1 rod; sustentada via aprimoramento", () => {
        const fail = resolveSpellConditions("Hipnotismo", false, []);
        expect(fail.apply).toEqual([{ statusId: "fascinado", durKind: "rounds", rounds: undefined, formula: "1d4" }]);

        const truque = resolveSpellConditions("Hipnotismo", false, [], { truque: true });
        expect(truque.apply).toEqual([{ statusId: "pasmo", durKind: "rounds", rounds: 1, formula: undefined }]);

        const sust = resolveSpellConditions("Hipnotismo", false, [{ description: "muda a duração para sustentada", qty: 1 }]);
        expect(sust.apply[0]!.durKind).toBe("sustained");
        expect(lookupSpellEntry("Hipnotismo")!.resistBonusInCombat).toBe(5);
    });

    it("Sono: ramifica por combate — fora: Inconsciente+Caído; dentro: Exausto 1 rod + Fatigado cena", () => {
        const pass = resolveSpellConditions("Sono", true, []);
        expect(pass.apply).toEqual([{ statusId: "fatigado", durKind: "rounds", rounds: undefined, formula: "1d4" }]);

        const failFora = resolveSpellConditions("Sono", false, [], { inCombat: false });
        expect(failFora.apply.map((c) => c.statusId).sort()).toEqual(["caido", "inconsciente"]);
        expect(failFora.apply.every((c) => c.durKind === "indeterminate")).toBe(true);

        const failDentro = resolveSpellConditions("Sono", false, [], { inCombat: true });
        expect(failDentro.apply.map((c) => c.statusId).sort()).toEqual(["exausto", "fatigado"]);
        expect(failDentro.apply.find((c) => c.statusId === "fatigado")!.durKind).toBe("scene");

        const apr = [{ description: "alvos que falhem ficam exaustos por 1d4+1 rodadas, em vez de apenas 1", qty: 1 }];
        const boosted = resolveSpellConditions("Sono", false, apr, { inCombat: true });
        expect(boosted.apply.find((c) => c.statusId === "exausto")!.formula).toBe("1d4+1");
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
