import { describe, it, expect } from "vitest";
import {
    ENVIRONMENTS,
    bracketIndexForLevel,
    findRow,
    padRange,
    getEnvironment,
    lookupEncounter,
    validateEnvironments,
    type EnvironmentDef,
} from "@/encounter-roller/encounter-data";

// ── data integrity ────────────────────────────────────────────────────────────

describe("ENVIRONMENTS data", () => {
    // Expansion-friendly: assert the core six are PRESENT (não lista exata),
    // de modo que adicionar um novo ambiente não quebre este teste.
    it("includes the six core environments and has unique ids", () => {
        const ids = ENVIRONMENTS.map(e => e.id);
        for (const core of ["esgoto", "caverna", "estrada", "floresta", "becos", "ruinas"]) {
            expect(ids).toContain(core);
        }
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("every environment passes validateEnvironments (1-100 coverage, 4 brackets)", () => {
        // Validação genérica → cobre automaticamente qualquer ambiente novo.
        expect(validateEnvironments()).toEqual([]);
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

// ── validateEnvironments ──────────────────────────────────────────────────────

describe("validateEnvironments", () => {
    const row = (min: number, max: number): EnvironmentDef["rows"][number] => ({
        min, max, title: "T", flavor: "",
        levels: ["a", "b", "c", "d"],
    });

    it("accepts a well-formed environment (any contiguous 1-100 partition)", () => {
        const env: EnvironmentDef = { id: "pantano", label: "Pântano", rows: [row(1, 20), row(21, 50), row(51, 100)] };
        expect(validateEnvironments([env])).toEqual([]);
    });

    it("flags a gap in d100 coverage", () => {
        const env: EnvironmentDef = { id: "x", label: "X", rows: [row(1, 40), row(50, 100)] };
        const out = validateEnvironments([env]);
        expect(out.some(p => /buraco|sobreposi/i.test(p))).toBe(true);
    });

    it("flags coverage not starting at 1 or not ending at 100", () => {
        const env: EnvironmentDef = { id: "x", label: "X", rows: [row(5, 100)] };
        expect(validateEnvironments([env]).some(p => /começar em 1/i.test(p))).toBe(true);
    });

    it("flags a row without 4 level brackets", () => {
        const env: EnvironmentDef = {
            id: "x", label: "X",
            rows: [{ min: 1, max: 100, title: "T", flavor: "", levels: ["a", "b"] as unknown as [string, string, string, string] }],
        };
        expect(validateEnvironments([env]).some(p => /4 brackets/i.test(p))).toBe(true);
    });

    it("flags an empty level bracket", () => {
        const env: EnvironmentDef = {
            id: "x", label: "X",
            rows: [{ min: 1, max: 100, title: "T", flavor: "", levels: ["a", " ", "c", "d"] }],
        };
        expect(validateEnvironments([env]).some(p => /vazio/i.test(p))).toBe(true);
    });

    it("flags duplicate ids", () => {
        const env: EnvironmentDef = { id: "dup", label: "A", rows: [row(1, 100)] };
        const env2: EnvironmentDef = { id: "dup", label: "B", rows: [row(1, 100)] };
        expect(validateEnvironments([env, env2]).some(p => /duplicad/i.test(p))).toBe(true);
    });
});
