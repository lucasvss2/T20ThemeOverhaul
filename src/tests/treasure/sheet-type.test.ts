import { describe, it, expect } from "vitest";
import { parseTreasureType, isDeadNpcActor } from "@/treasure/index";

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

describe("isDeadNpcActor", () => {
    const npc = (pv: number | undefined, statuses?: string[]) => ({
        type: "npc",
        system: pv === undefined ? {} : { attributes: { pv: { value: pv } } },
        statuses: statuses ? new Set(statuses) : undefined,
    });

    it("is true for an npc at 0 or negative PV", () => {
        expect(isDeadNpcActor(npc(0))).toBe(true);
        expect(isDeadNpcActor(npc(-5))).toBe(true);
    });

    it("is false for an npc with PV remaining", () => {
        expect(isDeadNpcActor(npc(12))).toBe(false);
    });

    it("is true for an npc with a death status even if PV unknown", () => {
        expect(isDeadNpcActor(npc(undefined, ["morto"]))).toBe(true);
        expect(isDeadNpcActor(npc(undefined, ["dead"]))).toBe(true);
    });

    it("is false for non-npc actors and null", () => {
        expect(isDeadNpcActor({ type: "character", system: { attributes: { pv: { value: 0 } } } })).toBe(false);
        expect(isDeadNpcActor(null)).toBe(false);
        expect(isDeadNpcActor(undefined)).toBe(false);
    });

    it("is false for an npc with unknown PV and no status", () => {
        expect(isDeadNpcActor(npc(undefined))).toBe(false);
    });
});
