import { describe, it, expect } from "vitest";
import {
    ENVIRONMENTS,
    bracketIndexForLevel,
    findRow,
    padRange,
    getEnvironment,
    lookupEncounter,
} from "@/encounter-roller/encounter-data";

// ── data integrity ────────────────────────────────────────────────────────────

describe("ENVIRONMENTS data", () => {
    it("has the six expected environments", () => {
        expect(ENVIRONMENTS.map(e => e.id)).toEqual([
            "esgoto", "caverna", "estrada", "floresta", "becos", "ruinas",
        ]);
    });

    it("every environment has 7 rows fully covering 1..100 with no gaps/overlaps", () => {
        for (const env of ENVIRONMENTS) {
            expect(env.rows).toHaveLength(7);
            const sorted = [...env.rows].sort((a, b) => a.min - b.min);
            expect(sorted[0].min).toBe(1);
            expect(sorted[sorted.length - 1].max).toBe(100);
            for (let i = 1; i < sorted.length; i++) {
                expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
            }
        }
    });

    it("every row has exactly 4 non-empty level brackets", () => {
        for (const env of ENVIRONMENTS) {
            for (const row of env.rows) {
                expect(row.levels).toHaveLength(4);
                for (const lv of row.levels) expect(lv.trim().length).toBeGreaterThan(0);
            }
        }
    });
});

// ── bracketIndexForLevel ──────────────────────────────────────────────────────

describe("bracketIndexForLevel", () => {
    it("maps 1-2→0, 3-4→1, 5-6→2, 7-8→3", () => {
        expect([1, 2].map(bracketIndexForLevel)).toEqual([0, 0]);
        expect([3, 4].map(bracketIndexForLevel)).toEqual([1, 1]);
        expect([5, 6].map(bracketIndexForLevel)).toEqual([2, 2]);
        expect([7, 8].map(bracketIndexForLevel)).toEqual([3, 3]);
    });

    it("clamps out-of-range levels", () => {
        expect(bracketIndexForLevel(0)).toBe(0);
        expect(bracketIndexForLevel(-5)).toBe(0);
        expect(bracketIndexForLevel(99)).toBe(3);
    });
});

// ── findRow ───────────────────────────────────────────────────────────────────

describe("findRow", () => {
    const esgoto = getEnvironment("esgoto")!;

    it("finds the row containing the roll (inclusive bounds)", () => {
        expect(findRow(esgoto, 1)?.title).toBe("Pragas Rastejantes");
        expect(findRow(esgoto, 15)?.title).toBe("Pragas Rastejantes");
        expect(findRow(esgoto, 16)?.title).toBe("Contrabandistas");
        expect(findRow(esgoto, 100)?.title).toBe("Predador do Fosso");
    });

    it("returns null for out-of-range rolls", () => {
        expect(findRow(esgoto, 0)).toBeNull();
        expect(findRow(esgoto, 101)).toBeNull();
    });
});

// ── padRange ──────────────────────────────────────────────────────────────────

describe("padRange", () => {
    it("pads single digits to two", () => {
        expect(padRange(1)).toBe("01");
        expect(padRange(9)).toBe("09");
    });
    it("leaves multi-digit numbers unchanged", () => {
        expect(padRange(15)).toBe("15");
        expect(padRange(100)).toBe("100");
    });
});

// ── lookupEncounter ───────────────────────────────────────────────────────────

describe("lookupEncounter", () => {
    it("resolves environment + level bracket + d100 range", () => {
        // Esgotos, 91-100 "Predador do Fosso", level 7 → bracket 3
        const r = lookupEncounter("esgoto", 7, 95);
        expect(r).toMatchObject({
            envLabel: "Esgotos",
            roll: 95,
            level: 7,
            rangeLabel: "91-100",
            title: "Predador do Fosso",
            encounter: "1 Hidra Adulta (5 cabeças)",
        });
    });

    it("picks the correct bracket entry for low levels", () => {
        // Florestas, 01-15 "Predadores Selvagens", level 1 → bracket 0
        expect(lookupEncounter("floresta", 1, 5)?.encounter).toBe("3 Lobos");
    });

    it("returns null for an unknown environment", () => {
        expect(lookupEncounter("vulcao", 3, 50)).toBeNull();
    });

    it("returns null for an out-of-range roll", () => {
        expect(lookupEncounter("becos", 3, 0)).toBeNull();
    });
});
