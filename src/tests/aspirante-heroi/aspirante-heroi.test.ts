import { describe, it, expect } from "vitest";
import { isAspiranteHeroiPoder, buildAttrBonusChange } from "@/aspirante-heroi/index";

type Item = Parameters<typeof isAspiranteHeroiPoder>[0];

describe("isAspiranteHeroiPoder", () => {
    it("true p/ poder com nome 'Aspirante a herói' (acentos/caixa)", () => {
        expect(isAspiranteHeroiPoder({ type: "poder", name: "Aspirante a herói" } as Item)).toBe(true);
        expect(isAspiranteHeroiPoder({ type: "poder", name: "ASPIRANTE A HEROI" } as Item)).toBe(true);
    });
    it("false p/ outros tipos ou nomes", () => {
        expect(isAspiranteHeroiPoder({ type: "magia", name: "Aspirante a herói" } as Item)).toBe(false);
        expect(isAspiranteHeroiPoder({ type: "poder", name: "Outro Poder" } as Item)).toBe(false);
        expect(isAspiranteHeroiPoder(null)).toBe(false);
    });
});

describe("buildAttrBonusChange", () => {
    it("monta change +1 no .value do atributo (mode ADD, igual Aumento de Atributo)", () => {
        expect(buildAttrBonusChange("for")).toEqual({
            key: "system.atributos.for.value", value: "1", mode: 2, priority: null,
        });
        expect(buildAttrBonusChange("sab").key).toBe("system.atributos.sab.value");
    });
});
