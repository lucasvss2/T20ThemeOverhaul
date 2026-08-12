import { describe, expect, it } from "vitest";

import {
    buildPataWeaponData, computeMaxLegsByPm, isMembrosExtrasPoder, isPataWeapon, PM_COST,
} from "@/membros-extras/index";

describe("isMembrosExtrasPoder", () => {
    it("casa poder pelo nome (acentos/caixa)", () => {
        expect(isMembrosExtrasPoder({ type: "poder", name: "Membros Extras" })).toBe(true);
        expect(isMembrosExtrasPoder({ type: "poder", name: "MEMBROS EXTRAS" })).toBe(true);
    });
    it("rejeita outro tipo, outro nome, nulo", () => {
        expect(isMembrosExtrasPoder({ type: "magia", name: "Membros Extras" })).toBe(false);
        expect(isMembrosExtrasPoder({ type: "poder", name: "Couraça Rubra" })).toBe(false);
        expect(isMembrosExtrasPoder(null)).toBe(false);
    });
});

describe("isPataWeapon", () => {
    it("casa item flagado pelo módulo", () => {
        const data = buildPataWeaponData(1);
        expect(isPataWeapon(data as { flags?: Record<string, Record<string, unknown> | undefined> })).toBe(true);
    });
    it("rejeita item sem a flag", () => {
        expect(isPataWeapon({ type: "arma", name: "Espada longa" })).toBe(false);
        expect(isPataWeapon(null)).toBe(false);
    });
});

describe("computeMaxLegsByPm", () => {
    it("limita a 2 pernas mesmo com PM de sobra", () => {
        expect(computeMaxLegsByPm(10, PM_COST)).toBe(2);
    });
    it("dá 1 perna com PM pra só uma", () => {
        expect(computeMaxLegsByPm(3, PM_COST)).toBe(1);
        expect(computeMaxLegsByPm(2, PM_COST)).toBe(1);
    });
    it("0 pernas sem PM suficiente", () => {
        expect(computeMaxLegsByPm(1, PM_COST)).toBe(0);
        expect(computeMaxLegsByPm(0, PM_COST)).toBe(0);
        expect(computeMaxLegsByPm(-5, PM_COST)).toBe(0);
    });
});

describe("buildPataWeaponData", () => {
    it("monta arma 1d4 corte, crítico x2, sem ocupar espaço", () => {
        const data = buildPataWeaponData(2) as {
            name: string; type: string;
            system: { criticoM: number; criticoX: number; espacos: number; rolls: Array<{ type: string; parts: string[][] }> };
        };
        expect(data.name).toBe("Pata Inseto 2 (Membros Extras)");
        expect(data.type).toBe("arma");
        expect(data.system.criticoM).toBe(20);
        expect(data.system.criticoX).toBe(2);
        expect(data.system.espacos).toBe(0);
        const dano = data.system.rolls.find(r => r.type === "dano");
        expect(dano?.parts[0]).toEqual(["1d4", "corte", ""]);
    });

    it("usa o ícone bundled da Pata Inseto", () => {
        const data = buildPataWeaponData(1) as { img: string };
        expect(data.img).toBe("modules/t20-theme-overhaul/assets/Items/pata-inseto.png");
    });
});
