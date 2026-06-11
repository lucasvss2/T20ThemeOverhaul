import { describe, it, expect } from "vitest";
import {
    extractDamageType,
    damageTypeFromFormula,
    parseNpcResistText,
    computeTargetRd,
} from "@/auto-damage/rd";

// ── damageTypeFromFormula ─────────────────────────────────────────────────────

describe("damageTypeFromFormula", () => {
    it("extrai o tipo do flavor da fórmula", () => {
        expect(damageTypeFromFormula("5d6[acido]")).toBe("acido");
        expect(damageTypeFromFormula("5d6[trevas] + 2")).toBe("trevas");
        expect(damageTypeFromFormula("3d10[fogo]")).toBe("fogo");
    });
    it("fórmula mista → primeiro tipo específico", () => {
        expect(damageTypeFromFormula("6d6[fogo] + 6d6[luz]")).toBe("fogo");
    });
    it("sem flavor de tipo → null", () => {
        expect(damageTypeFromFormula("2d8+4")).toBe(null);
        expect(damageTypeFromFormula("")).toBe(null);
        expect(damageTypeFromFormula(null)).toBe(null);
        expect(damageTypeFromFormula(undefined)).toBe(null);
    });
    it("ignora flavors que não são tipos específicos (dano genérico/perda)", () => {
        expect(damageTypeFromFormula("2d6[dano]")).toBe(null);
        expect(damageTypeFromFormula("2d6[perda] + 1d6[frio]")).toBe("frio");
    });
    it("acentos normalizados", () => {
        expect(damageTypeFromFormula("1d6[ácido]")).toBe("acido");
    });
});

// ── extractDamageType ─────────────────────────────────────────────────────────

describe("extractDamageType", () => {
    const roll = (flavors: Array<string | null>) => ({
        terms: flavors.map(f => ({ options: f === null ? null : { flavor: f } })),
    });

    it("returns the first specific damage-type flavor", () => {
        // "1d12[perfuracao] + 0 + 2[perfuracao] + 5 + 2"
        expect(extractDamageType(roll(["perfuracao", null, "perfuracao", null, null]))).toBe("perfuracao");
    });

    it("strips accents from the flavor", () => {
        expect(extractDamageType(roll(["Perfuração"]))).toBe("perfuracao");
        expect(extractDamageType(roll(["fogo"]))).toBe("fogo");
    });

    it("ignores the generic 'dano' and untyped terms", () => {
        expect(extractDamageType(roll([null, "dano", null]))).toBeNull();
        expect(extractDamageType(roll([null, null]))).toBeNull();
    });

    it("tolerates null/empty rolls", () => {
        expect(extractDamageType(null)).toBeNull();
        expect(extractDamageType({})).toBeNull();
    });
});

// ── parseNpcResistText ────────────────────────────────────────────────────────

describe("parseNpcResistText", () => {
    it("parses a multi-type RD clause (Esqueleto)", () => {
        const { rd } = parseNpcResistText("redução de corte, frio e perfuração 5");
        expect(rd).toEqual({ corte: 5, frio: 5, perfuracao: 5 });
    });

    it("parses generic 'redução de dano N'", () => {
        const { rd } = parseNpcResistText("redução de dano 10");
        expect(rd["dano"]).toBe(10);
    });

    it("parses multiple clauses and keeps the highest per type", () => {
        const { rd } = parseNpcResistText("redução de fogo 10; redução de fogo 5, redução de frio 3");
        expect(rd["fogo"]).toBe(10);
        expect(rd["frio"]).toBe(3);
    });

    it("parses immunity", () => {
        const { immune } = parseNpcResistText("imunidade a fogo e veneno");
        expect(immune.has("fogo")).toBe(true);
    });

    it("returns empty for no/blank text", () => {
        expect(parseNpcResistText("").rd).toEqual({});
        expect(parseNpcResistText(null).rd).toEqual({});
    });
});

// ── computeTargetRd ───────────────────────────────────────────────────────────

describe("computeTargetRd", () => {
    it("reads RD from the NPC text when the structure is empty (Esqueleto case)", () => {
        const out = computeTargetRd(undefined, "redução de corte, frio e perfuração 5", "perfuracao");
        expect(out).toEqual({ rd: 5, immune: false });
    });

    it("returns 0 for a type not covered by the text", () => {
        expect(computeTargetRd(undefined, "redução de corte, frio e perfuração 5", "fogo").rd).toBe(0);
    });

    it("reads RD from the structured resistencias (PC)", () => {
        const struct = { perfuracao: { value: 4 }, dano: { value: 0 } };
        expect(computeTargetRd(struct, undefined, "perfuracao").rd).toBe(4);
    });

    it("adds the generic 'dano' reduction to the specific type", () => {
        const struct = { fogo: { base: 5 }, dano: { base: 2 } };
        expect(computeTargetRd(struct, undefined, "fogo").rd).toBe(7);
    });

    it("flags immunity from structure or text", () => {
        expect(computeTargetRd({ fogo: { imunidade: true } }, undefined, "fogo").immune).toBe(true);
        expect(computeTargetRd(undefined, "imune a fogo", "fogo").immune).toBe(true);
    });

    it("uses the larger of structured vs text RD", () => {
        const struct = { corte: { value: 2 } };
        expect(computeTargetRd(struct, "redução de corte 5", "corte").rd).toBe(5);
    });

    it("returns 0 RD when no resistances and no damage type", () => {
        expect(computeTargetRd(undefined, undefined, null)).toEqual({ rd: 0, immune: false });
    });
});
