import { describe, it, expect } from "vitest";
import {
    isInspiracaoPower,
    inspiracaoImprovementOf,
    maxBonusForLevel,
    maxAffordableBonus,
    resolveBaseBonus,
    pmCostForBonus,
    gaitaCD,
    computeFinalBonus,
    espirituosaPmTemp,
    arteMagicaCdChanges,
    cornamusaAdjustedCost,
    clarimResistChanges,
    tamboreteMoveChanges,
} from "@/inspiracao/format";

describe("isInspiracaoPower", () => {
    it("detecta o poder base por igualdade (e sufixo p/ prefixo de categoria)", () => {
        expect(isInspiracaoPower({ type: "poder", name: "Inspiração" })).toBe(true);
        expect(isInspiracaoPower({ type: "poder", name: "Música: Inspiração" })).toBe(true);
    });
    it("NÃO casa as melhorias nem outros tipos", () => {
        expect(isInspiracaoPower({ type: "poder", name: "Inspiração Marcial" })).toBe(false);
        expect(isInspiracaoPower({ type: "poder", name: "Inspiração Resoluta" })).toBe(false);
        expect(isInspiracaoPower({ type: "magia", name: "Inspiração" })).toBe(false);
    });
});

describe("inspiracaoImprovementOf", () => {
    it("classifica as melhorias por nome", () => {
        expect(inspiracaoImprovementOf("Inspiração Marcial")).toBe("marcial");
        expect(inspiracaoImprovementOf("Inspiração Resoluta")).toBe("resoluta");
        expect(inspiracaoImprovementOf("Inspiração Revigorante")).toBe("revigorante");
        expect(inspiracaoImprovementOf("Inspiração Espirituosa")).toBe("espirituosa");
        expect(inspiracaoImprovementOf("Arte Mágica")).toBe("artemagica");
        expect(inspiracaoImprovementOf("Inspiração")).toBe(null);
        expect(inspiracaoImprovementOf("Ataque Poderoso")).toBe(null);
    });
});

describe("maxBonusForLevel", () => {
    it("segue a tabela 1/5/9/13/17", () => {
        expect(maxBonusForLevel(1)).toBe(1);
        expect(maxBonusForLevel(4)).toBe(1);
        expect(maxBonusForLevel(5)).toBe(2);
        expect(maxBonusForLevel(8)).toBe(2);
        expect(maxBonusForLevel(9)).toBe(3);
        expect(maxBonusForLevel(13)).toBe(4);
        expect(maxBonusForLevel(17)).toBe(5);
        expect(maxBonusForLevel(20)).toBe(5); // teto em +5
    });
    it("nível inválido → mínimo +1", () => {
        expect(maxBonusForLevel(0)).toBe(1);
    });
});

describe("pmCostForBonus / maxAffordableBonus", () => {
    it("2 PM por ponto de bônus", () => {
        expect(pmCostForBonus(1)).toBe(2);
        expect(pmCostForBonus(3)).toBe(6);
    });
    it("bônus pagável = floor(PM/2)", () => {
        expect(maxAffordableBonus(1)).toBe(0); // não paga nem o mínimo
        expect(maxAffordableBonus(2)).toBe(1);
        expect(maxAffordableBonus(7)).toBe(3);
    });
});

describe("resolveBaseBonus", () => {
    it("limita pela escolha, teto de nível e PM disponível", () => {
        // nível 20 (teto 5), PM 20 (paga 10) → escolha manda
        expect(resolveBaseBonus(3, 20, 20)).toBe(3);
        // escolha 5, nível 5 (teto 2) → 2
        expect(resolveBaseBonus(5, 5, 20)).toBe(2);
        // escolha 5, nível 20, PM 6 (paga 3) → 3
        expect(resolveBaseBonus(5, 20, 6)).toBe(3);
        // PM insuficiente → 0 (caller avisa)
        expect(resolveBaseBonus(2, 20, 1)).toBe(0);
    });
});

describe("gaitaCD", () => {
    it("20 + PM total gasto", () => {
        expect(gaitaCD(2)).toBe(22);
        expect(gaitaCD(6)).toBe(26);
        expect(gaitaCD(0)).toBe(20);
    });
});

describe("computeFinalBonus", () => {
    it("Gaita e Adamante somam acima da base", () => {
        expect(computeFinalBonus({ base: 2 })).toBe(2);
        expect(computeFinalBonus({ base: 2, gaitaPassed: true })).toBe(3);
        expect(computeFinalBonus({ base: 2, adamante: true })).toBe(3);
        expect(computeFinalBonus({ base: 2, gaitaPassed: true, adamante: true })).toBe(4);
    });
});

describe("espirituosaPmTemp", () => {
    it("PM temp = bônus só na 1ª vez no combate", () => {
        expect(espirituosaPmTemp(3, true)).toBe(3);
        expect(espirituosaPmTemp(3, false)).toBe(0);
        expect(espirituosaPmTemp(0, true)).toBe(0);
    });
});

describe("arteMagicaCdChanges", () => {
    it("+2 em system.attributes.cd só com o poder", () => {
        expect(arteMagicaCdChanges(false)).toEqual([]);
        expect(arteMagicaCdChanges(true)).toEqual([
            { key: "system.attributes.cd", mode: 2, value: "2", priority: 20 },
        ]);
    });
});

describe("cornamusaAdjustedCost", () => {
    it("−1 PM (mín. 1) só com a Cornamusa", () => {
        expect(cornamusaAdjustedCost(4, true)).toBe(3);
        expect(cornamusaAdjustedCost(2, true)).toBe(1);
        expect(cornamusaAdjustedCost(1, true)).toBe(1); // não zera
        expect(cornamusaAdjustedCost(4, false)).toBe(4);
    });
});

describe("clarimResistChanges / tamboreteMoveChanges", () => {
    it("Clarim → +1 resistência só com o instrumento", () => {
        expect(clarimResistChanges(false)).toEqual([]);
        expect(clarimResistChanges(true)).toEqual([
            { key: "system.modificadores.pericias.resistencia", mode: 2, value: "1", priority: 20 },
        ]);
    });
    it("Tamborete → +3 m de deslocamento só com o instrumento", () => {
        expect(tamboreteMoveChanges(false)).toEqual([]);
        expect(tamboreteMoveChanges(true)).toEqual([
            { key: "system.attributes.movement.walk.bonus", mode: 2, value: "3", priority: 20 },
        ]);
    });
});
