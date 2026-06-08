import { describe, it, expect } from "vitest";
import { isDeformidadePoder, buildSkillBonusChanges } from "@/deformidade/index";

describe("isDeformidadePoder", () => {
    it("is true for a poder named Deformidade (accent/case-insensitive)", () => {
        expect(isDeformidadePoder({ type: "poder", name: "Deformidade" })).toBe(true);
        expect(isDeformidadePoder({ type: "poder", name: "DEFORMIDADE" })).toBe(true);
    });

    it("matches when the name carries a prefix", () => {
        expect(isDeformidadePoder({ type: "poder", name: "Lefou: Deformidade" })).toBe(true);
    });

    it("is false for non-poderes or other names", () => {
        expect(isDeformidadePoder({ type: "race", name: "Deformidade" })).toBe(false);
        expect(isDeformidadePoder({ type: "poder", name: "Audácia" })).toBe(false);
        expect(isDeformidadePoder(null)).toBe(false);
        expect(isDeformidadePoder(undefined)).toBe(false);
    });
});

describe("buildSkillBonusChanges", () => {
    it("creates a +2 ADD change on system.pericias.<key>.bonus per skill", () => {
        expect(buildSkillBonusChanges(["acro", "perc"])).toEqual([
            { key: "system.pericias.acro.bonus", value: "2", mode: 2, priority: 20 },
            { key: "system.pericias.perc.bonus", value: "2", mode: 2, priority: 20 },
        ]);
    });

    it("deduplicates repeated skills (não dá +4 na mesma)", () => {
        expect(buildSkillBonusChanges(["luta", "luta"])).toEqual([
            { key: "system.pericias.luta.bonus", value: "2", mode: 2, priority: 20 },
        ]);
    });

    it("ignores empty keys and returns [] for none", () => {
        expect(buildSkillBonusChanges(["", "  ".trim()])).toEqual([]);
        expect(buildSkillBonusChanges([])).toEqual([]);
    });
});
