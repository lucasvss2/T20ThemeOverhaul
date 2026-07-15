import { describe, it, expect } from "vitest";
import { isEssenciaDeMana, computeRecoveredPm } from "@/essencia-mana/index";

describe("isEssenciaDeMana", () => {
    it("casa consumível pelo nome (acentos/caixa)", () => {
        expect(isEssenciaDeMana({ type: "consumivel", name: "Essência de mana" })).toBe(true);
        expect(isEssenciaDeMana({ type: "consumivel", name: "ESSENCIA DE MANA" })).toBe(true);
    });
    it("rejeita outro tipo, outro nome, nulo", () => {
        expect(isEssenciaDeMana({ type: "equipamento", name: "Essência de mana" })).toBe(false);
        expect(isEssenciaDeMana({ type: "consumivel", name: "Poção de cura" })).toBe(false);
        expect(isEssenciaDeMana(null)).toBe(false);
    });
});

describe("computeRecoveredPm", () => {
    it("recupera a rolagem quando cabe abaixo do máximo", () => {
        expect(computeRecoveredPm(10, 20, 4)).toBe(4);
        expect(computeRecoveredPm(0, 20, 1)).toBe(1);
    });
    it("limita ao máximo", () => {
        expect(computeRecoveredPm(19, 20, 4)).toBe(1);
        expect(computeRecoveredPm(20, 20, 4)).toBe(0);
    });
    it("nunca negativo; tolera valores inválidos", () => {
        expect(computeRecoveredPm(25, 20, 4)).toBe(0);
        expect(computeRecoveredPm(NaN as unknown as number, 20, 3)).toBe(3);
    });
});
