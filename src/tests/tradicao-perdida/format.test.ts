import { describe, it, expect } from "vitest";
import {
    ATTR_KEYS,
    isAttrKey,
    tierAboveIniciante,
    pmCap,
    cappedChosen,
    buildTradicaoChanges,
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

describe("cappedChosen", () => {
    it("aplica o teto do patamar", () => {
        expect(cappedChosen(7, 6)).toBe(6);   // CON 7, iniciante cap 6
        expect(cappedChosen(9, 8)).toBe(8);   // veterano cap 8
        expect(cappedChosen(5, 6)).toBe(5);   // abaixo do teto
    });
});

describe("buildTradicaoChanges", () => {
    it("desliga o atributo da classe (prio 1000) + soma o valor capado", () => {
        const ch = buildTradicaoChanges(6, "sab");
        expect(ch).toContainEqual({ key: "system.attributes.pm.atributos.sab", value: "false", mode: 5, priority: 1000 });
        expect(ch).toContainEqual({ key: "system.attributes.pm.bonus.total", value: "6", mode: 2, priority: 1000 });
    });
    it("sem classKeyAttr → só soma o valor", () => {
        const ch = buildTradicaoChanges(6, null);
        expect(ch).toEqual([{ key: "system.attributes.pm.bonus.total", value: "6", mode: 2, priority: 1000 }]);
    });
    it("valor 0 → só desliga o atributo da classe", () => {
        expect(buildTradicaoChanges(0, "int")).toEqual([
            { key: "system.attributes.pm.atributos.int", value: "false", mode: 5, priority: 1000 },
        ]);
    });
});
