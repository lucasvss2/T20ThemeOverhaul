import { describe, it, expect } from "vitest";
import {
    ATTR_KEYS,
    isAttrKey,
    tierAboveIniciante,
    pmCap,
    computePmDelta,
    buildTradicaoPmChange,
} from "@/tradicao-perdida/format";

describe("ATTR_KEYS / isAttrKey", () => {
    it("são os 6 atributos T20", () => {
        expect([...ATTR_KEYS]).toEqual(["for", "des", "con", "int", "sab", "car"]);
    });
    it("valida chaves", () => {
        expect(isAttrKey("con")).toBe(true);
        expect(isAttrKey("xyz")).toBe(false);
        expect(isAttrKey(null)).toBe(false);
    });
});

describe("tierAboveIniciante", () => {
    it("Iniciante (1-4) → 0", () => {
        expect(tierAboveIniciante(1)).toBe(0);
        expect(tierAboveIniciante(4)).toBe(0);
    });
    it("Veterano (5-10) → 1", () => {
        expect(tierAboveIniciante(5)).toBe(1);
        expect(tierAboveIniciante(10)).toBe(1);
    });
    it("Campeão (11-16) → 2", () => {
        expect(tierAboveIniciante(11)).toBe(2);
        expect(tierAboveIniciante(16)).toBe(2);
    });
    it("Lendário (17-20) → 3", () => {
        expect(tierAboveIniciante(17)).toBe(3);
        expect(tierAboveIniciante(20)).toBe(3);
    });
});

describe("pmCap", () => {
    it("6 / 8 / 10 / 12 por patamar", () => {
        expect(pmCap(2)).toBe(6);
        expect(pmCap(7)).toBe(8);
        expect(pmCap(13)).toBe(10);
        expect(pmCap(19)).toBe(12);
    });
});

describe("computePmDelta", () => {
    it("substitui o atributo da classe pelo escolhido (capado)", () => {
        // CON 7 escolhido, classe usa SAB 2, cap 6 → min(7,6)=6 ; delta = 6-2 = 4
        expect(computePmDelta(7, 2, 6)).toBe(4);
    });
    it("aplica o teto do patamar", () => {
        // CON 9, cap 6 → 6 ; classe 0 → delta 6
        expect(computePmDelta(9, 0, 6)).toBe(6);
        // cap maior (veterano 8) → CON 9 vira 8
        expect(computePmDelta(9, 0, 8)).toBe(8);
    });
    it("delta negativo permitido se escolher atributo pior", () => {
        expect(computePmDelta(1, 3, 6)).toBe(-2);
    });
});

describe("buildTradicaoPmChange", () => {
    it("soma o delta ao pm.bonus.total", () => {
        expect(buildTradicaoPmChange(4)).toEqual([
            { key: "system.attributes.pm.bonus.total", value: "4", mode: 2, priority: 20 },
        ]);
    });
    it("delta zero → sem change", () => {
        expect(buildTradicaoPmChange(0)).toEqual([]);
    });
    it("delta negativo serializado", () => {
        expect(buildTradicaoPmChange(-2)[0].value).toBe("-2");
    });
});
