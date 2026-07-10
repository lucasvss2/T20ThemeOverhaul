import { describe, it, expect } from "vitest";
import {
    computeGolpeCost, pickCost, letalMargemBonus, elementalDice, sequencialDie,
    impactantePushMeters, sifaoTempPm, sifaoCapRemaining, atordoanteCD,
    pertoDaMorteOk, validateBuild, buildSummary, hasEffect,
    type GolpeBuild, type GolpeEffectPick,
} from "@/golpe-pessoal/effects";

const b = (effects: GolpeEffectPick[], weaponName = "Espada longa"): GolpeBuild =>
    ({ weaponName, effects, builtAtLevel: 5 });

const PASSOS = [["1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "1d12", "2d6", "2d8", "2d10", "2d12"]];

describe("computeGolpeCost", () => {
    it("soma os custos com mínimo 1", () => {
        expect(computeGolpeCost(b([{ key: "brutal" }]))).toBe(1);
        expect(computeGolpeCost(b([{ key: "brutal" }, { key: "letal" }]))).toBe(3);
        // Brutal(1)+Letal(2)+Lento(−2) = 1
        expect(computeGolpeCost(b([{ key: "brutal" }, { key: "letal" }, { key: "lento" }]))).toBe(1);
        // Brutal(1)+Lento(−2)+Sacrifício(−2) = −3 → mínimo 1
        expect(computeGolpeCost(b([{ key: "brutal" }, { key: "lento" }, { key: "sacrificio" }]))).toBe(1);
    });
    it("Elemental multiplica por qty; Letal 2× custa 4", () => {
        expect(computeGolpeCost(b([{ key: "elemental", qty: 3, element: "fogo" }]))).toBe(6);
        expect(computeGolpeCost(b([{ key: "letal", qty: 2 }]))).toBe(4);
    });
    it("Conjurador = custo da magia + 1", () => {
        expect(pickCost({ key: "conjurador", spellCost: 2, spellName: "Adaga Mental" })).toBe(3);
        expect(computeGolpeCost(b([{ key: "conjurador", spellCost: 4, spellName: "X" }, { key: "brutal" }]))).toBe(6);
    });
});

describe("letalMargemBonus / elementalDice / sequencialDie", () => {
    it("Letal: +2 com 1 pick, +5 com 2", () => {
        expect(letalMargemBonus(b([]))).toBe(0);
        expect(letalMargemBonus(b([{ key: "letal" }]))).toBe(2);
        expect(letalMargemBonus(b([{ key: "letal", qty: 2 }]))).toBe(5);
    });
    it("Elemental agrega por elemento (2d6 por pick)", () => {
        const dice = elementalDice(b([
            { key: "elemental", element: "fogo" },
            { key: "elemental", element: "fogo" },
            { key: "elemental", element: "frio" },
        ]));
        expect(dice).toContainEqual({ element: "fogo", dice: "4d6" });
        expect(dice).toContainEqual({ element: "frio", dice: "2d6" });
    });
    it("Sequencial sobe um passo por acerto a partir de 1d6", () => {
        expect(sequencialDie(0, PASSOS)).toBe("1d6");
        expect(sequencialDie(1, PASSOS)).toBe("1d8");
        expect(sequencialDie(3, PASSOS)).toBe("1d12");
        expect(sequencialDie(99, PASSOS)).toBe("2d12"); // capa no fim da tabela
    });
});

describe("pós-dano puros", () => {
    it("Impactante: 1,5m por 10 de dano", () => {
        expect(impactantePushMeters(22)).toBe(3);
        expect(impactantePushMeters(9)).toBe(0);
        expect(impactantePushMeters(40)).toBe(6);
    });
    it("Sifão: 1 PM por 10 de dano, com cap por cena", () => {
        expect(sifaoTempPm(37)).toBe(3);
        expect(sifaoCapRemaining(8, 6)).toBe(2);
        expect(sifaoCapRemaining(8, 9)).toBe(0);
    });
    it("Atordoante: CD = 10 + ½ nível + For", () => {
        expect(atordoanteCD(10, 4)).toBe(19);
        expect(atordoanteCD(5, 3)).toBe(15);
    });
    it("Perto da Morte: PV ≤ ¼ do máximo", () => {
        expect(pertoDaMorteOk(10, 40)).toBe(true);
        expect(pertoDaMorteOk(11, 40)).toBe(false);
    });
});

describe("validateBuild", () => {
    it("ok: arma + efeito positivo", () => {
        expect(validateBuild(b([{ key: "brutal" }]))).toEqual([]);
    });
    it("sem arma exige Qualquer Arma", () => {
        expect(validateBuild(b([{ key: "brutal" }], "")).length).toBe(1);
        expect(validateBuild(b([{ key: "brutal" }, { key: "qualquer-arma" }], ""))).toEqual([]);
    });
    it("erros: sem efeitos, acima do máximo, Elemental sem elemento, Conjurador sem magia, só redutores", () => {
        expect(validateBuild(b([])).length).toBeGreaterThan(0);
        expect(validateBuild(b([{ key: "letal", qty: 3 }])).some(e => /máximo 2/.test(e))).toBe(true);
        expect(validateBuild(b([{ key: "elemental" }])).some(e => /elemento/.test(e))).toBe(true);
        expect(validateBuild(b([{ key: "conjurador" }])).some(e => /magia/.test(e))).toBe(true);
        expect(validateBuild(b([{ key: "lento" }])).some(e => /custo positivo/.test(e))).toBe(true);
    });
});

describe("buildSummary / hasEffect", () => {
    it("resume efeitos e custo", () => {
        const s = buildSummary(b([{ key: "brutal" }, { key: "elemental", qty: 2, element: "fogo" }, { key: "lento" }]));
        expect(s).toContain("Brutal");
        expect(s).toContain("Elemental (fogo ×2)");
        expect(s).toContain("3 PM"); // 1 + 4 − 2
        expect(hasEffect(b([{ key: "lento" }]), "lento")).toBe(true);
    });
});
