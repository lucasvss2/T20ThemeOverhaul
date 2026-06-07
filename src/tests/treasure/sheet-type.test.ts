import { describe, it, expect } from "vitest";
import { parseTreasureType } from "@/treasure/index";

describe("parseTreasureType", () => {
    it("returns null for empty / Nenhum", () => {
        expect(parseTreasureType("")).toBeNull();
        expect(parseTreasureType(null)).toBeNull();
        expect(parseTreasureType("Nenhum")).toBeNull();
        expect(parseTreasureType("nenhum tesouro")).toBeNull();
    });

    it("detects dobro / metade (accent-insensitive)", () => {
        expect(parseTreasureType("Dobro")).toBe("dobro");
        expect(parseTreasureType("DOBRO")).toBe("dobro");
        expect(parseTreasureType("Metade")).toBe("metade");
    });

    it("defaults to padrao for Padrão or descriptive text", () => {
        expect(parseTreasureType("Padrão")).toBe("padrao");
        expect(parseTreasureType("padrao")).toBe("padrao");
        expect(parseTreasureType("tesouro típico de bandido")).toBe("padrao");
    });
});
