import { describe, it, expect } from "vitest";
import { TREASURE } from "@/treasure/treasure-data";
import {
    findRow,
    rollFormula,
    rollRiquezaValue,
    resolveMoney,
    resolveItem,
    generateTreasure,
    listNDs,
    getNDEntry,
    type DieRoller,
} from "@/treasure/treasure-engine";

/** Roller que devolve valores de uma fila (cicla no fim). */
const seq = (vals: number[]): DieRoller => {
    let i = 0;
    return () => vals[i++ % vals.length];
};
/** Roller fixo. */
const fixed = (v: number): DieRoller => () => v;

// ── data integrity (guarda re-exportações futuras) ────────────────────────────

describe("TREASURE data integrity", () => {
    const covers = (ranges: Array<[number, number]>, upTo = 100): boolean => {
        const seen = new Set<number>();
        for (const [a, b] of ranges) for (let x = a; x <= b; x++) seen.add(x);
        for (let x = 1; x <= upTo; x++) if (!seen.has(x)) return false;
        return true;
    };

    it("has all 22 NDs (1/4, 1/2, 1..20)", () => {
        expect(listNDs()).toEqual([
            "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
            "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
        ]);
    });

    it("every ND money + item column covers d% 1-100", () => {
        for (const e of TREASURE.main) {
            expect(covers(e.dinheiro.map(r => r.range))).toBe(true);
            expect(covers(e.itens.map(r => r.range))).toBe(true);
        }
    });

    it("sub-tables cover d% 1-100", () => {
        expect(covers(TREASURE.itensDiversos.map(r => r.range))).toBe(true);
        expect(covers(TREASURE.pocoes.map(r => r.range))).toBe(true);
        for (const t of ["arma", "armadura", "esoterico"]) {
            expect(covers(TREASURE.equipamentos[t].map(r => r.range))).toBe(true);
            expect(covers(TREASURE.superiores[t].map(r => r.range))).toBe(true);
            expect(covers(TREASURE.magicos[t].map(r => r.range))).toBe(true);
        }
        for (const t of ["menor", "medio", "maior"]) {
            expect(covers(TREASURE.acessorios[t].map(r => r.range))).toBe(true);
        }
    });

    it("riquezas categories each cover d% 1-100", () => {
        for (const cat of ["menor", "media", "maior"] as const) {
            const ranges = TREASURE.riquezas
                .map(r => r[cat])
                .filter((x): x is [number, number] => x !== null);
            expect(covers(ranges)).toBe(true);
        }
    });
});

// ── helpers ───────────────────────────────────────────────────────────────────

describe("findRow", () => {
    const rows = [{ range: [1, 30] as [number, number] }, { range: [31, 70] as [number, number] }];
    it("finds inclusive", () => {
        expect(findRow(rows, 30)).toBe(rows[0]);
        expect(findRow(rows, 31)).toBe(rows[1]);
        expect(findRow(rows, 200)).toBeNull();
    });
});

describe("rollFormula", () => {
    it("sums dice via the roller", () => {
        expect(rollFormula("2d6", fixed(3))).toBe(6);
        expect(rollFormula("1d4+1", fixed(3))).toBe(4);
        expect(rollFormula("4d12", fixed(1))).toBe(4);
    });
    it("returns a plain number when no dice", () => {
        expect(rollFormula("7", fixed(99))).toBe(7);
    });
});

describe("rollRiquezaValue", () => {
    it("multiplies dice by the x-multiplier (thousand separators)", () => {
        expect(rollRiquezaValue("2d4x10 (50)", fixed(2))).toBe(40);      // (2+2)*10
        expect(rollRiquezaValue("1d10x10.000 (55.000)", fixed(5))).toBe(50000);
    });
    it("handles a plain dice value", () => {
        expect(rollRiquezaValue("4d4 (10)", fixed(2))).toBe(8);
    });
});

// ── money ─────────────────────────────────────────────────────────────────────

describe("resolveMoney", () => {
    it("rolls NdMxK with currency", () => {
        expect(resolveMoney("1d6x10 TC", fixed(3), false)?.label).toBe("Dinheiro: 30 TC");
        expect(resolveMoney("2d4x1.000 T$", fixed(2), false)?.label).toBe("Dinheiro: 4000 T$");
    });
    it("halves money when half=true", () => {
        expect(resolveMoney("1d6x10 TC", fixed(4), true)?.label).toBe("Dinheiro: 20 TC (metade de 40 TC)");
    });
    it("returns null for —", () => {
        expect(resolveMoney("—", fixed(1), false)).toBeNull();
    });
    it("resolves a riqueza appearing in the money column", () => {
        // "1 riqueza menor": count=1, roll d% then roll value
        const line = resolveMoney("1 riqueza menor", seq([1 /*d% riqueza menor 01-25*/, 2 /*value dice*/]), false);
        expect(line?.label).toMatch(/riqueza menor/i);
    });
});

// ── items (drill-down) ────────────────────────────────────────────────────────

describe("resolveItem", () => {
    it("resolves Item diverso to a named item", () => {
        const line = resolveItem("Item diverso", fixed(1));
        expect(line?.label).toMatch(/^Item diverso: .+/);
        expect(line?.label).not.toMatch(/sem entrada/);
    });

    it("resolves Equipamento to a typed named item", () => {
        const line = resolveItem("Equipamento", seq([1 /*type d6 → arma*/, 1 /*d% equip*/]));
        expect(line?.label).toMatch(/^Equipamento/);
        expect(line?.children?.[0].label).toMatch(/\(arma\)/);
    });

    it("resolves potions with a count", () => {
        const line = resolveItem("1d3 poções", seq([1 /*count die → wait count uses rollFormula 1d3*/, 1, 1]));
        expect(line?.label).toMatch(/poç/i);
        expect(line?.children?.length).toBeGreaterThanOrEqual(1);
    });

    it("resolves Superior with N melhorias (equipment + improvements)", () => {
        const line = resolveItem("Superior (2 melhorias)", seq([1 /*type arma*/, 1 /*equip*/, 1 /*mel1*/, 1 /*mel2*/]));
        expect(line?.label).toMatch(/Superior \(2 melhorias\)/);
        expect(line?.children?.[0].children?.length).toBe(2);
    });

    it("resolves Mágico (médio) with 2 encantos", () => {
        // type die 1 → arma (não acessório), so encantos
        const line = resolveItem("Mágico (médio)", seq([1 /*type → arma*/, 1 /*equip*/, 1 /*enc1*/, 1 /*enc2*/]));
        expect(line?.label).toMatch(/Mágico \(médio\)/);
        expect(line?.children?.[0].children?.length).toBe(2);
    });

    it("resolves Mágico acessório branch (type die = 6)", () => {
        const line = resolveItem("Mágico (menor)", seq([6 /*type → acessório*/, 1 /*d% acessório menor*/]));
        expect(line?.children?.[0].label).toMatch(/Acessório/);
    });

    it("returns null for —", () => {
        expect(resolveItem("—", fixed(1))).toBeNull();
    });
});

// ── generateTreasure ──────────────────────────────────────────────────────────

describe("generateTreasure", () => {
    it("returns null for unknown ND", () => {
        expect(generateTreasure("99", "padrao", fixed(1))).toBeNull();
    });

    it("padrao → 1 money line + 1 item line", () => {
        const res = generateTreasure("1/4", "padrao", fixed(1))!;
        expect(res.lines).toHaveLength(2);
        expect(res.nd).toBe("1/4");
    });

    it("dobro → 2 money lines + 2 item lines", () => {
        const res = generateTreasure("1/4", "dobro", fixed(1))!;
        expect(res.lines).toHaveLength(4);
    });

    it("resolves a concrete money value for a known ND/roll", () => {
        // ND 1/4 dinheiro: 31-70 → "1d6x10 TC". d%=50 hits it; then 1d6 → 3 → 30 TC.
        const res = generateTreasure("1/4", "padrao", seq([50, 3, 1, 1]))!;
        expect(res.lines[0].label).toBe("Dinheiro: 30 TC");
    });

    it("getNDEntry returns the matching row", () => {
        expect(getNDEntry("1/2")?.nd).toBe("1/2");
        expect(getNDEntry("nope")).toBeNull();
    });
});
