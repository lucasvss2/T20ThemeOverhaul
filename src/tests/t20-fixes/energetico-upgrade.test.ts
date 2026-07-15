import { describe, it, expect } from "vitest";
import { needsCustoFix } from "@/t20-fixes/energetico-upgrade";

describe("needsCustoFix", () => {
    const flags = (custo: unknown) => ({ tormenta20: { upgrade: "energetic", custo } });

    it("true quando o efeito energetic não tem custo (undefined/null/vazio)", () => {
        expect(needsCustoFix({ tormenta20: { upgrade: "energetic" } })).toBe(true);
        expect(needsCustoFix(flags(null))).toBe(true);
        expect(needsCustoFix(flags(""))).toBe(true);
    });
    it("false quando já tem custo definido", () => {
        expect(needsCustoFix(flags("0"))).toBe(false);
        expect(needsCustoFix(flags("1"))).toBe(false);
    });
    it("false para efeitos que não são o energetic", () => {
        expect(needsCustoFix({ tormenta20: { upgrade: "powerful", custo: undefined } })).toBe(false);
        expect(needsCustoFix({ tormenta20: {} })).toBe(false);
        expect(needsCustoFix(undefined)).toBe(false);
    });
});
