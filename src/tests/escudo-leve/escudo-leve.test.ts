import { describe, it, expect } from "vitest";
import { isLightShield, forearmSlotFor, isGripSlot } from "@/escudo-leve/index";

describe("isLightShield", () => {
    it("detects an Escudo Leve by tipo + name", () => {
        expect(isLightShield({ type: "equipamento", name: "Escudo Leve", system: { tipo: "escudo" } })).toBe(true);
        expect(isLightShield({ type: "equipamento", name: "Escudo leve Ajustado", system: { tipo: "escudo" } })).toBe(true);
        expect(isLightShield({ type: "equipamento", name: "Escudo Leve de Madeira", system: { subtipo: "escudo" } })).toBe(true);
    });

    it("rejects heavy shields and non-shields", () => {
        expect(isLightShield({ type: "equipamento", name: "Escudo Pesado", system: { tipo: "escudo" } })).toBe(false);
        expect(isLightShield({ type: "equipamento", name: "Escudo Corporal", system: { tipo: "escudo" } })).toBe(false);
        expect(isLightShield({ type: "arma", name: "Escudo Leve" })).toBe(false); // não é equipamento
        expect(isLightShield({ type: "equipamento", name: "Elmo Leve", system: { tipo: "traje" } })).toBe(false);
        expect(isLightShield(null)).toBe(false);
        expect(isLightShield(undefined)).toBe(false);
    });
});

describe("forearmSlotFor", () => {
    it("returns a hand-type slot one index beyond the grips", () => {
        expect(forearmSlotFor(2)).toBeCloseTo(3.1);
        expect(forearmSlotFor(3)).toBeCloseTo(4.1);
        expect(forearmSlotFor(null)).toBeCloseTo(3.1); // default limite 2
        expect(forearmSlotFor(undefined)).toBeCloseTo(3.1);
    });
});

describe("isGripSlot", () => {
    it("is true for real grip slots (1..limit) and two-handed (12)", () => {
        expect(isGripSlot(1.1, 2)).toBe(true);
        expect(isGripSlot(2.1, 2)).toBe(true);
        expect(isGripSlot(12.1, 2)).toBe(true); // duas mãos
    });

    it("is false for the forearm slot and body/unequipped slots", () => {
        expect(isGripSlot(3.1, 2)).toBe(false);  // antebraço — além dos grips
        expect(isGripSlot(1.2, 2)).toBe(false);  // slot de corpo (tipo .2)
        expect(isGripSlot(0, 2)).toBe(false);    // desequipado
        expect(isGripSlot(null, 2)).toBe(false);
    });

    it("respects a larger limiteEmpunhado", () => {
        expect(isGripSlot(3.1, 3)).toBe(true);   // grip 3 existe quando limite=3
        expect(isGripSlot(4.1, 3)).toBe(false);  // antebraço quando limite=3
    });
});
