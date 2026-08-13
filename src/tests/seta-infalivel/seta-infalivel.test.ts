import { describe, it, expect } from "vitest";
import {
    computeArrowCount,
    isLancaVariant,
    arrowDieFaces,
    extractArrowResults,
    computeExtraBonus,
    groupArrowDamage,
    SPELL_NAME_NORM,
} from "@/seta-infalivel/index";

describe("SPELL_NAME_NORM", () => {
    it("bate com o nome normalizado da magia", () => {
        expect(SPELL_NAME_NORM).toBe("seta infalivel");
    });
});

describe("computeArrowCount", () => {
    it("base (sem aprimoramento) = 2", () => {
        expect(computeArrowCount([])).toBe(2);
    });
    it("+2 PM 'muda o número de setas/lanças para três' → 3", () => {
        expect(computeArrowCount([{ description: "muda o número de setas/lanças para três." }])).toBe(3);
    });
    it("+4 PM '...para cinco' → 5", () => {
        expect(computeArrowCount([{ description: "muda o número de setas/lanças para cinco. Requer 2º círculo." }])).toBe(5);
    });
    it("+9 PM '...para dez' → 10", () => {
        expect(computeArrowCount([{ description: "muda o número de setas/lanças para dez. Requer 4º círculo." }])).toBe(10);
    });
    it("aprimoramento de lanças (sem contagem) não muda o total", () => {
        expect(computeArrowCount([{ description: "muda as setas para lanças de energia que surgem e caem do céu. Cada lança causa 1d8+1 pontos de dano de essência. Requer 2º círculo." }])).toBe(2);
    });
    it("combinação lanças + três → 3", () => {
        expect(computeArrowCount([
            { description: "muda as setas para lanças de energia que surgem e caem do céu." },
            { description: "muda o número de setas/lanças para três." },
        ])).toBe(3);
    });
});

describe("isLancaVariant", () => {
    it("false sem o aprimoramento", () => {
        expect(isLancaVariant([{ description: "muda o número de setas/lanças para três." }])).toBe(false);
    });
    it("true com o aprimoramento de lanças", () => {
        expect(isLancaVariant([{ description: "muda as setas para lanças de energia que surgem e caem do céu. Cada lança causa 1d8+1 pontos de dano de essência. Requer 2º círculo." }])).toBe(true);
    });
});

describe("arrowDieFaces", () => {
    it("d4 pra setas, d8 pra lanças", () => {
        expect(arrowDieFaces(false)).toBe(4);
        expect(arrowDieFaces(true)).toBe(8);
    });
});

describe("extractArrowResults", () => {
    it("extrai os resultados ATIVOS do grupo de dados com as faces certas", () => {
        const roll = { dice: [{ faces: 4, results: [{ result: 3, active: true }, { result: 1, active: true }] }] };
        expect(extractArrowResults(roll, 4)).toEqual([3, 1]);
    });
    it("ignora dados inativos (rerolados)", () => {
        const roll = { dice: [{ faces: 4, results: [{ result: 1, active: false }, { result: 4, active: true }] }] };
        expect(extractArrowResults(roll, 4)).toEqual([4]);
    });
    it("[] quando não há dado com essas faces", () => {
        const roll = { dice: [{ faces: 8, results: [{ result: 5, active: true }] }] };
        expect(extractArrowResults(roll, 4)).toEqual([]);
    });
    it("[] pra roll nulo", () => {
        expect(extractArrowResults(null, 4)).toEqual([]);
    });
});

describe("computeExtraBonus", () => {
    it("0 quando o total bate exatamente com dados + 1 por seta", () => {
        // 2 setas: 3+1 e 2+1 = 7
        expect(computeExtraBonus(7, [3, 2], 2)).toBe(0);
    });
    it("detecta o bônus extra (ex.: Arcano de Batalha +2)", () => {
        // 2 setas: 3+1 e 2+1 = 7, + bônus 2 = 9
        expect(computeExtraBonus(9, [3, 2], 2)).toBe(2);
    });
    it("nunca negativo (defensivo)", () => {
        expect(computeExtraBonus(5, [3, 2], 2)).toBe(0);
    });
});

describe("groupArrowDamage", () => {
    it("agrupa setas por alvo (+1 fixo por seta)", () => {
        const totals = groupArrowDamage([3, 2], ["A", "B"], null, 0);
        expect(totals.get("A")).toBe(4); // 3+1
        expect(totals.get("B")).toBe(3); // 2+1
    });
    it("concentra múltiplas setas no mesmo alvo", () => {
        const totals = groupArrowDamage([3, 2, 4], ["A", "A", "B"], null, 0);
        expect(totals.get("A")).toBe(4 + 3); // (3+1)+(2+1)
        expect(totals.get("B")).toBe(5); // 4+1
    });
    it("soma o bônus extra só na seta marcada", () => {
        const totals = groupArrowDamage([3, 2], ["A", "B"], 1, 5);
        expect(totals.get("A")).toBe(4); // 3+1, sem bônus
        expect(totals.get("B")).toBe(8); // 2+1+5, com bônus
    });
    it("ignora setas sem alvo atribuído", () => {
        const totals = groupArrowDamage([3, 2], ["A", ""], null, 0);
        expect(totals.get("A")).toBe(4);
        expect(totals.has("")).toBe(false);
    });
});
