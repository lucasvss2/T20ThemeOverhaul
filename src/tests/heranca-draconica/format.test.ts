import { describe, it, expect } from "vitest";
import {
    ELEMENT_KEYS,
    isElementKey,
    computeHerancaRd,
    buildHerancaChanges,
    RD_BASE,
    RD_ESCAMAS,
} from "@/heranca-draconica/format";

describe("ELEMENT_KEYS", () => {
    it("são exatamente os 6 elementos dracônicos", () => {
        expect([...ELEMENT_KEYS]).toEqual(["acido", "eletricidade", "fogo", "frio", "luz", "trevas"]);
    });
});

describe("isElementKey", () => {
    it("aceita elementos válidos", () => {
        expect(isElementKey("fogo")).toBe(true);
        expect(isElementKey("trevas")).toBe(true);
    });
    it("rejeita outros tipos de dano e nulos", () => {
        expect(isElementKey("corte")).toBe(false);
        expect(isElementKey("perfuracao")).toBe(false);
        expect(isElementKey(null)).toBe(false);
        expect(isElementKey(undefined)).toBe(false);
    });
});

describe("computeHerancaRd", () => {
    it("RD 5 sem Escamas, 10 com Escamas", () => {
        expect(computeHerancaRd(false)).toBe(RD_BASE);
        expect(computeHerancaRd(false)).toBe(5);
        expect(computeHerancaRd(true)).toBe(RD_ESCAMAS);
        expect(computeHerancaRd(true)).toBe(10);
    });
});

describe("buildHerancaChanges", () => {
    it("RD no bonus[] do elemento + tipo monstro", () => {
        const ch = buildHerancaChanges("fogo", 5);
        expect(ch).toContainEqual({ key: "system.tracos.resistencias.fogo.bonus", value: "5", mode: 2, priority: 20 });
        expect(ch).toContainEqual({ key: "system.detalhes.tipo", value: "mon", mode: 5, priority: 20 });
    });
    it("usa o elemento e a RD informados", () => {
        const ch = buildHerancaChanges("trevas", 10);
        expect(ch[0]).toEqual({ key: "system.tracos.resistencias.trevas.bonus", value: "10", mode: 2, priority: 20 });
    });
});
