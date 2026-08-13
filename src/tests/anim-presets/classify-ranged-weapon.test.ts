import { describe, expect, it } from "vitest";

import { classifyRangedWeapon } from "@/anim-presets/index";

describe("classifyRangedWeapon", () => {
    it("null pra armas que não são de disparo (corpo-a-corpo/arremesso/ausente)", () => {
        expect(classifyRangedWeapon("Espada longa", "corpo-a-corpo")).toBeNull();
        expect(classifyRangedWeapon("Azagaia", "arremesso")).toBeNull();
        expect(classifyRangedWeapon("Arco longo", undefined)).toBeNull();
        expect(classifyRangedWeapon("Arco longo", null)).toBeNull();
    });

    it("classifica arcos pelo nome (com acentos/maiúsculas)", () => {
        expect(classifyRangedWeapon("Arco longo", "disparo")).toBe("arco");
        expect(classifyRangedWeapon("Arco de Guerra Maciço", "disparo")).toBe("arco");
        expect(classifyRangedWeapon("ARCO CURTO", "disparo")).toBe("arco");
    });

    it("classifica bestas pelo nome", () => {
        expect(classifyRangedWeapon("Besta leve", "disparo")).toBe("besta");
        expect(classifyRangedWeapon("Besta pesada", "disparo")).toBe("besta");
    });

    it("cai em arma-fogo por padrão (não é arco nem besta) — cobre armas de fogo de verdade e casos avulsos (funda, zarabatana)", () => {
        expect(classifyRangedWeapon("Traque", "disparo")).toBe("arma-fogo");
        expect(classifyRangedWeapon("Pistola", "disparo")).toBe("arma-fogo");
        expect(classifyRangedWeapon("Mosquete", "disparo")).toBe("arma-fogo");
        expect(classifyRangedWeapon("Funda", "disparo")).toBe("arma-fogo");
    });

    it("'arcabuz' não é falso-positivo de 'arco' (substring não bate)", () => {
        expect(classifyRangedWeapon("Arcabuz", "disparo")).toBe("arma-fogo");
    });
});
