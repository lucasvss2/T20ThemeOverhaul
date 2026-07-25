import { describe, expect, it } from "vitest";

import {
    actorHasAdvantage,
    actorImposesDisadvantage,
    computeConfig,
    isConcentracaoCombate,
    parseTiers,
    resolveAttackRollKeep,
} from "@/concentracao-combate/index";
import { MODULE_ID } from "@/constants";

describe("isConcentracaoCombate", () => {
    it("detecta por nome normalizado (com/sem acento)", () => {
        expect(isConcentracaoCombate("Concentração de Combate")).toBe(true);
        expect(isConcentracaoCombate("concentracao de combate")).toBe(true);
        expect(isConcentracaoCombate("Bola de Fogo")).toBe(false);
        expect(isConcentracaoCombate(null)).toBe(false);
    });
});

describe("parseTiers", () => {
    it("mapeia por custo", () => {
        expect(parseTiers([{ cost: 5 }])).toEqual({ t2: false, t5: true, t9: false, t14: false });
        expect(parseTiers([{ cost: 2 }, { cost: 14 }])).toEqual({ t2: true, t5: false, t9: false, t14: true });
    });
    it("fallback por descrição quando custo ausente", () => {
        expect(parseTiers([{ description: "um inimigo deve rolar dois dados e usar o pior resultado" }]).t5).toBe(true);
        expect(parseTiers([{ description: "alvo para criaturas escolhidas" }]).t9).toBe(true);
        expect(parseTiers([{ description: "você recebe um sexto sentido; fica imune" }]).t14).toBe(true);
    });
    it("sem aprimoramentos → todos falsos", () => {
        expect(parseTiers([])).toEqual({ t2: false, t5: false, t9: false, t14: false });
        expect(parseTiers(undefined)).toEqual({ t2: false, t5: false, t9: false, t14: false });
    });
});

describe("computeConfig", () => {
    it("base: vantagem, 1 rodada, sem extras", () => {
        const c = computeConfig({ t2: false, t5: false, t9: false, t14: false });
        expect(c).toMatchObject({ advantage: true, imposesDisadvantage: false, targetsOthers: false, duration: "round", defReflBonus: 0 });
    });
    it("+2 → cena; +5 → desvantagem imposta", () => {
        expect(computeConfig({ t2: true, t5: false, t9: false, t14: false }).duration).toBe("scene");
        expect(computeConfig({ t2: false, t5: true, t9: false, t14: false }).imposesDisadvantage).toBe(true);
    });
    it("+9 → alvos escolhidos + cena", () => {
        const c = computeConfig({ t2: false, t5: false, t9: true, t14: false });
        expect(c.targetsOthers).toBe(true);
        expect(c.duration).toBe("scene");
    });
    it("+14 → 1 dia, +10 Def/Refl, imunidades", () => {
        const c = computeConfig({ t2: false, t5: false, t9: false, t14: true });
        expect(c).toMatchObject({ duration: "day", defReflBonus: 10, immunities: true, sixthSense: true });
    });
    it("+14 vence +2/+9 na duração", () => {
        expect(computeConfig({ t2: true, t5: false, t9: true, t14: true }).duration).toBe("day");
    });
});

describe("resolveAttackRollKeep", () => {
    it("desvantagem imposta prevalece sobre vantagem", () => {
        expect(resolveAttackRollKeep(true, true)).toBe("kld20");
    });
    it("só vantagem → khd20", () => {
        expect(resolveAttackRollKeep(true, false)).toBe("khd20");
    });
    it("só desvantagem → kld20", () => {
        expect(resolveAttackRollKeep(false, true)).toBe("kld20");
    });
    it("nenhum → undefined", () => {
        expect(resolveAttackRollKeep(false, false)).toBeUndefined();
    });
});

function actorWithEffect(flagData: Record<string, unknown> | null) {
    const effects = flagData
        ? [{ id: "e1", disabled: false, flags: { [MODULE_ID]: { concentracaoCombate: flagData } } }]
        : [];
    return { id: "a1", effects: { contents: effects } };
}

describe("actorHasAdvantage / actorImposesDisadvantage", () => {
    it("lê a flag da AE ativa", () => {
        const adv = actorWithEffect({ advantage: true });
        expect(actorHasAdvantage(adv)).toBe(true);
        expect(actorImposesDisadvantage(adv)).toBe(false);

        const dis = actorWithEffect({ advantage: true, imposesDisadvantage: true });
        expect(actorImposesDisadvantage(dis)).toBe(true);
    });
    it("efeito desabilitado não conta", () => {
        const a = { id: "a1", effects: { contents: [{ id: "e1", disabled: true, flags: { [MODULE_ID]: { concentracaoCombate: { advantage: true } } } }] } };
        expect(actorHasAdvantage(a)).toBe(false);
    });
    it("sem efeito → false", () => {
        expect(actorHasAdvantage(actorWithEffect(null))).toBe(false);
        expect(actorHasAdvantage(null)).toBe(false);
    });
});
