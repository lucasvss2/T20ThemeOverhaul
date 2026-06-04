import { describe, it, expect } from "vitest";
import {
    parseResistance,
    extractCD,
    extractItemId,
    normalizeCondName,
} from "@/spell-resistance/index";

const msg = (content: string) => ({ content } as unknown as ChatMessage);

// ── parseResistance ───────────────────────────────────────────────────────────

describe("parseResistance — no resistance", () => {
    it("treats empty / whitespace / 'nenhuma' as no resistance", () => {
        expect(parseResistance("")).toEqual({ skill: null, outcome: "none" });
        expect(parseResistance("   ")).toEqual({ skill: null, outcome: "none" });
        expect(parseResistance("Nenhuma")).toEqual({ skill: null, outcome: "none" });
    });
});

describe("parseResistance — skill detection", () => {
    it("detects Vontade", () => {
        expect(parseResistance("Vontade parcial").skill).toBe("vont");
    });
    it("detects Reflexos", () => {
        expect(parseResistance("Reflexos reduz à metade").skill).toBe("refl");
    });
    it("detects Fortitude", () => {
        expect(parseResistance("Fortitude (veja texto)").skill).toBe("fort");
    });
    it("is case-insensitive", () => {
        expect(parseResistance("VONTADE ANULA").skill).toBe("vont");
    });
});

describe("parseResistance — outcome detection", () => {
    it("maps 'anula' to anula", () => {
        expect(parseResistance("Reflexos anula").outcome).toBe("anula");
    });
    it("maps 'reduz à metade' to metade", () => {
        expect(parseResistance("Reflexos reduz à metade").outcome).toBe("metade");
    });
    it("maps bare 'metade' to metade", () => {
        expect(parseResistance("Reflexos metade").outcome).toBe("metade");
    });
    it("maps 'parcial' to parcial", () => {
        expect(parseResistance("Vontade parcial").outcome).toBe("parcial");
    });
    it("maps 'desacredita' to parcial", () => {
        expect(parseResistance("Vontade desacredita").outcome).toBe("parcial");
    });
    it("maps 'veja texto' to texto", () => {
        expect(parseResistance("Fortitude (veja texto)").outcome).toBe("texto");
    });
    it("falls back to 'texto' when a skill is present but no known outcome word", () => {
        expect(parseResistance("Vontade").outcome).toBe("texto");
    });
    it("returns 'none' outcome when neither skill nor outcome word is present", () => {
        const r = parseResistance("alguma coisa irrelevante");
        expect(r).toEqual({ skill: null, outcome: "none" });
    });
});

// ── extractCD ─────────────────────────────────────────────────────────────────

describe("extractCD", () => {
    it("extracts the number after 'CD'", () => {
        expect(extractCD(msg("<p>Teste de resistência CD 18</p>"))).toBe(18);
    });
    it("tolerates no space between CD and the number", () => {
        expect(extractCD(msg("CD20"))).toBe(20);
    });
    it("returns 0 when there is no CD in the content", () => {
        expect(extractCD(msg("<p>Cura Ferimentos</p>"))).toBe(0);
    });
    it("returns the first CD when several are present", () => {
        expect(extractCD(msg("CD 15 ... CD 22"))).toBe(15);
    });
});

// ── extractItemId ─────────────────────────────────────────────────────────────

describe("extractItemId", () => {
    it("reads data-item-id from the card HTML", () => {
        expect(extractItemId(msg('<div data-item-id="abc123">'))).toBe("abc123");
    });
    it("returns undefined when the attribute is absent", () => {
        expect(extractItemId(msg("<div>no id here</div>"))).toBeUndefined();
    });
});

// ── normalizeCondName ─────────────────────────────────────────────────────────

describe("normalizeCondName", () => {
    it("lowercases", () => {
        expect(normalizeCondName("Vontade")).toBe("vontade");
    });
    it("strips diacritics", () => {
        expect(normalizeCondName("Égide Sagrada")).toBe("egide sagrada");
    });
    it("trims surrounding whitespace", () => {
        expect(normalizeCondName("  Aura Sagrada  ")).toBe("aura sagrada");
    });
    it("does NOT replace internal spaces with hyphens", () => {
        // Documented gotcha: multi-word names keep their space.
        expect(normalizeCondName("Aura Sagrada")).toBe("aura sagrada");
        expect(normalizeCondName("Aura Sagrada")).not.toContain("-");
    });
});
