import { describe, it, expect } from "vitest";
import {
    computeSublimeCD,
    parseND,
    perceptionPasses,
} from "@/disparo-sublime/index";

// ── computeSublimeCD ──────────────────────────────────────────────────────────

describe("computeSublimeCD", () => {
    it("is 15 + ND", () => {
        expect(computeSublimeCD(2)).toBe(17);
        expect(computeSublimeCD(0)).toBe(15);
        expect(computeSublimeCD(10)).toBe(25);
    });

    it("treats a non-finite ND as 0", () => {
        expect(computeSublimeCD(NaN)).toBe(15);
        expect(computeSublimeCD(Infinity)).toBe(15);
    });
});

// ── parseND ───────────────────────────────────────────────────────────────────

describe("parseND", () => {
    it("reads a plain number", () => {
        expect(parseND(3)).toBe(3);
    });

    it("truncates a fractional number", () => {
        expect(parseND(2.9)).toBe(2);
    });

    it("extracts the integer from a string", () => {
        expect(parseND("2")).toBe(2);
        expect(parseND("ND 4")).toBe(4);
    });

    it("returns 0 for invalid / empty input", () => {
        expect(parseND("")).toBe(0);
        expect(parseND(null)).toBe(0);
        expect(parseND(undefined)).toBe(0);
        expect(parseND({})).toBe(0);
    });
});

// ── perceptionPasses ──────────────────────────────────────────────────────────

describe("perceptionPasses", () => {
    it("passes when total meets or exceeds the CD", () => {
        expect(perceptionPasses(17, 17)).toBe(true);
        expect(perceptionPasses(20, 17)).toBe(true);
    });

    it("fails when total is below the CD", () => {
        expect(perceptionPasses(16, 17)).toBe(false);
    });
});
