import { describe, it, expect } from "vitest";
import {
    deriveBaseDamageFormula,
    critifyFormula,
    isRollMaximized,
} from "@/auto-damage/index";

// ── Roll-term stubs ───────────────────────────────────────────────────────────
// These functions only read `.terms` (with `.expression` / `.faces` / `.number`)
// and, for isRollMaximized, `.results`. We build plain objects and cast to Roll.

type TermStub = {
    expression?: string;
    faces?: number;
    number?: number;
    results?: Array<{ result: number; active: boolean }>;
};

const die = (number: number, faces: number): TermStub => ({
    number, faces, expression: `${number}d${faces}`,
});
const op = (sym: string): TermStub => ({ expression: sym });
const num = (n: number): TermStub => ({ expression: String(n) });

const roll = (terms: TermStub[]): Roll =>
    ({ terms } as unknown as Roll);

// ── critifyFormula ────────────────────────────────────────────────────────────

describe("critifyFormula", () => {
    it("multiplies dice counts by criticoX", () => {
        expect(critifyFormula("4d6 + 5", 3)).toBe("12d6 + 5");
    });

    it("is a no-op for criticoX <= 1", () => {
        expect(critifyFormula("4d6 + 5", 1)).toBe("4d6 + 5");
        expect(critifyFormula("4d6 + 5", 0)).toBe("4d6 + 5");
    });

    it("multiplies every die term, leaving flat modifiers intact", () => {
        expect(critifyFormula("2d6 + 1d8 + 3", 2)).toBe("4d6 + 2d8 + 3");
    });

    it("handles criticoX of 2 (the default weapon multiplier)", () => {
        expect(critifyFormula("1d12", 2)).toBe("2d12");
    });
});

// ── deriveBaseDamageFormula ───────────────────────────────────────────────────

describe("deriveBaseDamageFormula", () => {
    it("returns the whole expression as base when criticoX <= 1", () => {
        const r = roll([die(2, 6), op("+"), num(3)]);
        expect(deriveBaseDamageFormula(r, 1)).toEqual({ base: "2d6 + 3", critOnly: "" });
    });

    it("divides weapon dice back by criticoX and keeps modifiers", () => {
        // critted "12d6 + 5" with criticoX 3 → base "4d6 + 5"
        const r = roll([die(12, 6), op("+"), num(5)]);
        expect(deriveBaseDamageFormula(r, 3)).toEqual({ base: "4d6 + 5", critOnly: "" });
    });

    it("routes non-divisible dice to critOnly (T20 adds them post-crit)", () => {
        // "12d6 + 5 + 1d6" with criticoX 3: 12 is divisible (→4d6), 1 is not (→critOnly)
        const r = roll([die(12, 6), op("+"), num(5), op("+"), die(1, 6)]);
        expect(deriveBaseDamageFormula(r, 3)).toEqual({ base: "4d6 + 5", critOnly: "1d6" });
    });

    it("handles a crit-only die appearing before a flat modifier", () => {
        // "12d6 + 1d6 + 2" with criticoX 3 → base "4d6 + 2", critOnly "1d6"
        const r = roll([die(12, 6), op("+"), die(1, 6), op("+"), num(2)]);
        const out = deriveBaseDamageFormula(r, 3);
        expect(out.critOnly).toBe("1d6");
        // base must contain the divided weapon die and the flat modifier
        expect(out.base).toContain("4d6");
        expect(out.base).toContain("2");
    });

    it("joins multiple crit-only dice with ' + '", () => {
        // criticoX 2: 4d6 divisible; 1d6 and 1d8 not → both crit-only
        const r = roll([die(4, 6), op("+"), die(1, 6), op("+"), die(1, 8)]);
        const out = deriveBaseDamageFormula(r, 2);
        expect(out.base).toBe("2d6");
        expect(out.critOnly).toBe("1d6 + 1d8");
    });
});

// ── isRollMaximized ───────────────────────────────────────────────────────────

describe("isRollMaximized", () => {
    const maxed = (number: number, faces: number) => ({
        faces,
        results: Array.from({ length: number }, () => ({ result: faces, active: true })),
    });
    const rolled = (results: Array<{ result: number; active: boolean }>, faces = 6) => ({
        faces, results,
    });

    it("returns true when every active die shows its max face (>= 2 dice)", () => {
        const r = { terms: [maxed(4, 6)] } as unknown as Roll;
        expect(isRollMaximized(r)).toBe(true);
    });

    it("returns false when any active die is below its max", () => {
        const r = { terms: [rolled([{ result: 6, active: true }, { result: 3, active: true }])] } as unknown as Roll;
        expect(isRollMaximized(r)).toBe(false);
    });

    it("ignores discarded (inactive) dice", () => {
        const r = {
            terms: [rolled([
                { result: 6, active: true },
                { result: 6, active: true },
                { result: 1, active: false },
            ])],
        } as unknown as Roll;
        expect(isRollMaximized(r)).toBe(true);
    });

    it("returns false for a single max die (guards against natural 1d20=20)", () => {
        const r = { terms: [maxed(1, 20)] } as unknown as Roll;
        expect(isRollMaximized(r)).toBe(false);
    });

    it("ignores non-dice terms", () => {
        const r = {
            terms: [maxed(2, 6), { expression: "+" }, { expression: "5" }],
        } as unknown as Roll;
        expect(isRollMaximized(r)).toBe(true);
    });
});
