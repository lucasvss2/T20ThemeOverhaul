import { describe, it, expect } from "vitest";
import {
    computeBaforadaCD,
    maxBaforadaPm,
    clampBaforadaPm,
    buildBaforadaFormula,
    RESIST_TXT,
    ELEMENT_KEYS,
} from "@/baforada/format";

describe("computeBaforadaCD", () => {
    it("10 + ½ nível + Con", () => {
        expect(computeBaforadaCD(2, 7)).toBe(18);  // 10 + 1 + 7
        expect(computeBaforadaCD(9, 7)).toBe(21);  // 10 + 4 + 7
        expect(computeBaforadaCD(1, 0)).toBe(10);
    });
});

describe("maxBaforadaPm", () => {
    it("limitado por min(Con, nível, PM atual)", () => {
        expect(maxBaforadaPm(7, 9, 12)).toBe(7);   // Con limita
        expect(maxBaforadaPm(7, 9, 3)).toBe(3);    // PM limita
        expect(maxBaforadaPm(7, 2, 12)).toBe(2);   // NÍVEL limita (Al nv2, Con7 → 2)
        expect(maxBaforadaPm(0, 9, 10)).toBe(0);
        expect(maxBaforadaPm(5, 9, 0)).toBe(0);
        expect(maxBaforadaPm(-1, 9, 10)).toBe(0);
    });
});

describe("clampBaforadaPm", () => {
    it("mantém dentro de [1, max]", () => {
        expect(clampBaforadaPm(3, 7)).toBe(3);
        expect(clampBaforadaPm(99, 7)).toBe(7);
        expect(clampBaforadaPm(0, 7)).toBe(1);
        expect(clampBaforadaPm(-5, 7)).toBe(1);
    });
    it("max 0 → 0", () => {
        expect(clampBaforadaPm(3, 0)).toBe(0);
    });
    it("trunca frações", () => {
        expect(clampBaforadaPm(3.9, 7)).toBe(3);
    });
});

describe("buildBaforadaFormula", () => {
    it("Nd10 com flavor do elemento", () => {
        expect(buildBaforadaFormula(5, "fogo")).toBe("5d10[fogo]");
        expect(buildBaforadaFormula(1, "trevas")).toBe("1d10[trevas]");
    });
});

describe("constantes", () => {
    it("resistência é Reflexos reduz à metade", () => {
        expect(RESIST_TXT.toLowerCase()).toContain("reflexos");
        expect(RESIST_TXT.toLowerCase()).toContain("metade");
    });
    it("reexporta os 6 elementos", () => {
        expect([...ELEMENT_KEYS]).toEqual(["acido", "eletricidade", "fogo", "frio", "luz", "trevas"]);
    });
});
