import { describe, it, expect } from "vitest";
import {
    collectOnUseDanoBonuses,
    danoBonusToFormula,
    correctMangledDanoFormula,
    type OnUseDanoBonus,
} from "@/t20-fixes/onuse-foreign-die-dano";

// Shapes accepted by collectOnUseDanoBonuses (kept minimal — the function only
// reads `.name` / `.changes` on candidates and `.description` / `.qty` on entries).
type AE = { name?: string; changes?: Array<{ key?: string; value?: string; mode?: number }> };
type Entry = { description?: string; qty?: number };

const ae = (name: string, key: string, value: string, mode = 0): AE => ({
    name,
    changes: [{ key, value, mode }],
});

// ── collectOnUseDanoBonuses ───────────────────────────────────────────────────

describe("collectOnUseDanoBonuses", () => {
    it("returns [] for non-array input", () => {
        expect(collectOnUseDanoBonuses(undefined, [])).toEqual([]);
        expect(collectOnUseDanoBonuses(null, [])).toEqual([]);
        expect(collectOnUseDanoBonuses({}, [])).toEqual([]);
    });

    it("matches an entry to a candidate AE by exact name and parses NdM", () => {
        const entries: Entry[] = [{ description: "Tomo do Rancor" }];
        const candidates: AE[] = [ae("Tomo do Rancor", "dano", "2d8")];
        const out = collectOnUseDanoBonuses(entries, candidates);
        expect(out).toEqual([
            { count: 2, faces: 8, flat: 0, dmgType: "", description: "Tomo do Rancor" },
        ]);
    });

    it("parses the flat modifier (NdM+K)", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "X" }],
            [ae("X", "dano", "2d8+2")],
        );
        expect(out[0]).toMatchObject({ count: 2, faces: 8, flat: 2 });
    });

    it("captures the damage type from a keyed change (dano:tipo)", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "Chama" }],
            [ae("Chama", "dano:fogo", "1d6")],
        );
        expect(out[0]).toMatchObject({ faces: 6, dmgType: "fogo" });
    });

    it("multiplies count and flat by qty", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "X", qty: 3 }],
            [ae("X", "dano", "1d6+1")],
        );
        expect(out[0]).toMatchObject({ count: 3, flat: 3 });
    });

    it("defaults qty to 1 when missing or invalid", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "X", qty: 0 }],
            [ae("X", "dano", "1d6")],
        );
        expect(out[0]).toMatchObject({ count: 1 });
    });

    it("matches via substring when no exact name match exists", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "Bola de Fogo - Tomo do Rancor" }],
            [ae("Tomo do Rancor", "dano", "2d8")],
        );
        expect(out[0]).toMatchObject({ count: 2, faces: 8 });
    });

    it("ignores non-CUSTOM modes", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "X" }],
            [ae("X", "dano", "2d8", 2 /* ADD */)],
        );
        expect(out).toEqual([]);
    });

    it("ignores changes whose key is not dano / dano:tipo", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "X" }],
            [ae("X", "ataque", "2d8")],
        );
        expect(out).toEqual([]);
    });

    it("ignores values with faces < 2", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "X" }],
            [ae("X", "dano", "2d1")],
        );
        expect(out).toEqual([]);
    });

    it("skips entries with no matching candidate", () => {
        const out = collectOnUseDanoBonuses(
            [{ description: "Unknown" }],
            [ae("Other", "dano", "2d8")],
        );
        expect(out).toEqual([]);
    });
});

// ── danoBonusToFormula ────────────────────────────────────────────────────────

describe("danoBonusToFormula", () => {
    const make = (p: Partial<OnUseDanoBonus>): OnUseDanoBonus => ({
        count: 2, faces: 8, flat: 0, dmgType: "", description: "", ...p,
    });

    it("formats a plain NdM", () => {
        expect(danoBonusToFormula(make({}))).toBe("2d8");
    });

    it("appends a positive flat modifier", () => {
        expect(danoBonusToFormula(make({ flat: 2 }))).toBe("2d8+2");
    });

    it("appends a negative flat modifier", () => {
        expect(danoBonusToFormula(make({ flat: -1 }))).toBe("2d8-1");
    });

    it("omits a zero flat modifier", () => {
        expect(danoBonusToFormula(make({ flat: 0 }))).toBe("2d8");
    });

    it("appends a damage-type tag", () => {
        expect(danoBonusToFormula(make({ dmgType: "fogo" }))).toBe("2d8[fogo]");
    });

    it("combines flat and damage type", () => {
        expect(danoBonusToFormula(make({ flat: 2, dmgType: "fogo" }))).toBe("2d8+2[fogo]");
    });
});

// ── correctMangledDanoFormula ─────────────────────────────────────────────────

describe("correctMangledDanoFormula", () => {
    it("returns null when there is nothing to reduce", () => {
        expect(correctMangledDanoFormula("8d6 + 2", 6, [])).toBeNull();
    });

    it("reduces the base die count and appends the foreign die", () => {
        // "8d6 + 2" with base 6 and a +2d8 foreign bonus → "6d6 + 2 + 2d8"
        const out = correctMangledDanoFormula("8d6 + 2", 6, [
            { count: 2, faces: 8, dmgType: "" },
        ]);
        expect(out).toBe("6d6 + 2 + 2d8");
    });

    it("appends a damage-type tag on the foreign die", () => {
        const out = correctMangledDanoFormula("8d6", 6, [
            { count: 2, faces: 8, dmgType: "fogo" },
        ]);
        expect(out).toBe("6d6 + 2d8[fogo]");
    });

    it("only reduces the first base-face die occurrence", () => {
        const out = correctMangledDanoFormula("8d6 + 1d6", 6, [
            { count: 2, faces: 8, dmgType: "" },
        ]);
        expect(out).toBe("6d6 + 1d6 + 2d8");
    });

    it("returns null when the reduction would drop the count below 1", () => {
        // base die count (2) minus foreign (2) = 0 → unsafe, no-op
        expect(correctMangledDanoFormula("2d6", 6, [
            { count: 2, faces: 8, dmgType: "" },
        ])).toBeNull();
    });

    it("returns null when the base face is not present in the formula", () => {
        expect(correctMangledDanoFormula("8d10", 6, [
            { count: 2, faces: 8, dmgType: "" },
        ])).toBeNull();
    });

    it("sums counts across multiple foreign bonuses", () => {
        const out = correctMangledDanoFormula("8d6", 6, [
            { count: 1, faces: 8, dmgType: "" },
            { count: 2, faces: 10, dmgType: "" },
        ]);
        expect(out).toBe("5d6 + 1d8 + 2d10");
    });
});
