import { describe, it, expect } from "vitest";
import {
    brigaBaseDie, sizeStep, computeUnarmedDie,
    isBrigaPoder, isLutadorClasse, isUnarmedWeapon, hookUserId,
} from "@/briga/index";

describe("brigaBaseDie (tabela do Lutador)", () => {
    it("escala a cada 4 níveis conforme a tabela oficial", () => {
        expect(brigaBaseDie(1)).toBe("1d6");
        expect(brigaBaseDie(4)).toBe("1d6");
        expect(brigaBaseDie(5)).toBe("1d8");
        expect(brigaBaseDie(8)).toBe("1d8");
        expect(brigaBaseDie(9)).toBe("1d10");
        expect(brigaBaseDie(12)).toBe("1d10");
        expect(brigaBaseDie(13)).toBe("2d6");
        expect(brigaBaseDie(16)).toBe("2d6");
        expect(brigaBaseDie(17)).toBe("2d8");
        expect(brigaBaseDie(19)).toBe("2d8");
        expect(brigaBaseDie(20)).toBe("2d10");
    });

    it("nível 0 (sem Lutador) fica no 1d6 base", () => {
        expect(brigaBaseDie(0)).toBe("1d6");
        expect(brigaBaseDie(NaN)).toBe("1d6");
    });
});

describe("sizeStep", () => {
    it("Minúsculo −1, Pequeno/Médio 0, Grande/Enorme +1, Colossal +2", () => {
        expect(sizeStep("min")).toBe(-1);
        expect(sizeStep("peq")).toBe(0);
        expect(sizeStep("med")).toBe(0);
        expect(sizeStep("gra")).toBe(1);
        expect(sizeStep("eno")).toBe(1);
        expect(sizeStep("col")).toBe(2);
        expect(sizeStep(undefined)).toBe(0);
    });
});

describe("computeUnarmedDie", () => {
    it("Médio usa a tabela direta", () => {
        expect(computeUnarmedDie(1, "med")).toBe("1d6");
        expect(computeUnarmedDie(13, "med")).toBe("2d6");
        expect(computeUnarmedDie(20, "med")).toBe("2d10");
    });

    it("ajusta por tamanho na cadeia padrão de dados", () => {
        expect(computeUnarmedDie(1, "min")).toBe("1d4");   // 1d6 −1
        expect(computeUnarmedDie(9, "gra")).toBe("1d12");  // 1d10 +1
        expect(computeUnarmedDie(13, "gra")).toBe("2d8");  // 2d6 +1
        expect(computeUnarmedDie(20, "col")).toBe("4d6");  // 2d10 +2 → 2d12 → 4d6
    });

    it("não passa do limite inferior da cadeia", () => {
        expect(computeUnarmedDie(1, "min")).toBe("1d4");
    });
});

describe("detecção de itens", () => {
    it("isBrigaPoder", () => {
        expect(isBrigaPoder({ type: "poder", name: "Briga" })).toBe(true);
        expect(isBrigaPoder({ type: "poder", name: "Golpe Relâmpago" })).toBe(false);
        expect(isBrigaPoder({ type: "arma", name: "Briga" })).toBe(false);
        expect(isBrigaPoder(null)).toBe(false);
    });
    it("isLutadorClasse", () => {
        expect(isLutadorClasse({ type: "classe", name: "Lutador" })).toBe(true);
        expect(isLutadorClasse({ type: "classe", name: "Guerreiro" })).toBe(false);
        expect(isLutadorClasse({ type: "poder", name: "Lutador" })).toBe(false);
    });
    it("isUnarmedWeapon", () => {
        expect(isUnarmedWeapon({ type: "arma", name: "Ataque desarmado" })).toBe(true);
        expect(isUnarmedWeapon({ type: "arma", name: "Espada longa" })).toBe(false);
        expect(isUnarmedWeapon({ type: "poder", name: "Ataque desarmado" })).toBe(false);
    });
});

describe("hookUserId (posição do userId difere entre create e update)", () => {
    const doc = { id: "x" };
    it("create/delete: (doc, options, userId) → último string", () => {
        expect(hookUserId([doc, {}, "user-123"])).toBe("user-123");
    });
    it("update: (doc, changed, options, userId) → último string (era o bug: args[2] é options)", () => {
        expect(hookUserId([doc, { system: { niveis: 9 } }, { diff: true }, "user-123"])).toBe("user-123");
    });
    it("retorna undefined sem string", () => {
        expect(hookUserId([doc, {}, {}])).toBeUndefined();
    });
});
