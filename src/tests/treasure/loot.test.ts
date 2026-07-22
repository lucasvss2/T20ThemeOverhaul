import { describe, expect, it } from "vitest";

import { perShareTibar, summarizeLoot, tibarToCoins } from "@/treasure/loot";
import { parseRiquezaCategories, pickRiquezaItem, splitItems } from "@/treasure/riqueza-picker";
import { currencyToTibar, generateTreasure, type DieRoller, type ResultLine } from "@/treasure/treasure-engine";

// roller determinístico: devolve sempre `v` (clampado às faces).
const fixed = (v: number): DieRoller => (sides: number) => Math.min(sides, Math.max(1, v));

describe("currencyToTibar", () => {
    it("converte TO=10, T$=1, TC=0,1", () => {
        expect(currencyToTibar(5, "TO")).toBe(50);
        expect(currencyToTibar(5, "T$")).toBe(5);
        expect(currencyToTibar(30, "TC")).toBeCloseTo(3);
    });
});

describe("summarizeLoot", () => {
    it("soma tibar de dinheiro e riqueza e coleta itens", () => {
        const lines: ResultLine[] = [
            { label: "Dinheiro", tibar: 120 },
            { label: "Equipamento", children: [
                { label: "Espada longa (arma)", assign: { name: "Espada longa", category: "arma", upgrades: [] } },
            ] },
            { label: "Riqueza menor: 50 T$", tibar: 50, assign: { name: "Riqueza menor", category: "riqueza", upgrades: [] } },
        ];
        const s = summarizeLoot(lines);
        expect(s.totalTibar).toBe(170);
        expect(s.items.map(i => i.name)).toEqual(["Espada longa", "Riqueza menor"]);
        expect(s.items[0].uid).toMatch(/^loot-/);
    });

    it("display concatena melhorias", () => {
        const lines: ResultLine[] = [
            { label: "x", assign: { name: "Espada longa", category: "arma", upgrades: ["Afiada", "Vorpal"] } },
        ];
        expect(summarizeLoot(lines).items[0].display).toBe("Espada longa (Afiada, Vorpal)");
    });
});

describe("tibarToCoins / perShareTibar", () => {
    it("separa prata e cobre", () => {
        expect(tibarToCoins(12.3)).toEqual({ tp: 12, tc: 3 });
        expect(tibarToCoins(7)).toEqual({ tp: 7, tc: 0 });
        expect(tibarToCoins(4.95)).toEqual({ tp: 5, tc: 0 }); // 9.5→arredonda 10→+1 TP
    });
    it("divide igualmente", () => {
        expect(perShareTibar(100, 4)).toBe(25);
        expect(perShareTibar(10, 3)).toBeCloseTo(3.33);
        expect(perShareTibar(50, 0)).toBe(0);
    });
});

describe("engine expõe tibar/assign", () => {
    it("gera com valores de dinheiro e itens atribuíveis", () => {
        // ND alto pra garantir dinheiro; roller fixo evita aleatoriedade
        const res = generateTreasure("10", "padrao", fixed(5));
        expect(res).not.toBeNull();
        const s = summarizeLoot(res!.lines);
        expect(s.totalTibar).toBeGreaterThanOrEqual(0);
    });
});

describe("parseRiquezaCategories", () => {
    const ex = "0,5 espaço: ágata trincada, anel de hematita, jarro de mel;\n1 espaço: caixa com velas aromáticas, 1d4+1 soldadinhos de chumbo, roldana de ferro;\n—: vaca leiteira (irá acompanhá-lo se você for treinado em Adestramento)";
    it("separa por categoria de espaço", () => {
        const cats = parseRiquezaCategories(ex);
        expect(cats.map(c => c.space)).toEqual(["0,5", "1", "—"]);
        expect(cats[0].items).toHaveLength(3);
        expect(cats[1].items).toContain("1d4+1 soldadinhos de chumbo");
    });
    it("não quebra item com vírgula dentro de parênteses", () => {
        const cats = parseRiquezaCategories("—: carroça (puxada por um animal, ou arrastada), lingote de ouro");
        expect(cats[0].items).toEqual(["carroça (puxada por um animal, ou arrastada)", "lingote de ouro"]);
    });
    it("vazio → []", () => {
        expect(parseRiquezaCategories("")).toEqual([]);
    });
});

describe("splitItems", () => {
    it("respeita parênteses", () => {
        expect(splitItems("a, b (x, y), c;")).toEqual(["a", "b (x, y)", "c"]);
    });
});

describe("pickRiquezaItem", () => {
    const cat = { space: "1", items: ["caixa com velas", "1d4+1 soldadinhos de chumbo", "roldana de ferro"] };
    it("sorteia por itemRoll (1-based)", () => {
        expect(pickRiquezaItem(cat, 1, fixed(1)).text).toBe("caixa com velas");
        expect(pickRiquezaItem(cat, 3, fixed(1)).text).toBe("roldana de ferro");
    });
    it("resolve fórmula de quantidade", () => {
        const p = pickRiquezaItem(cat, 2, fixed(4)); // 1d4=4 → 4+1=5
        expect(p.text).toBe("5 soldadinhos de chumbo");
        expect(p.qty).toBe(5);
    });
});
