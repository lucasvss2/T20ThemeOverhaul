import { describe, it, expect } from "vitest";
import {
    effectCusto,
    eligibleInitiativeBuffEffects,
    hasUsableInitiativeBuff,
    type EffectLike,
} from "@/iniciativa-buff/index";

// Shape real (colhido ao vivo): a cópia da Audácia em actor.effects vem
// disabled:true com flags { onuse:true, skill:true, custo:"2" }.
const buff = (flags: Record<string, unknown> = {}, over: Record<string, unknown> = {}): EffectLike =>
    ({
        disabled: true,
        flags: { tormenta20: { onuse: true, skill: true, custo: "2", ...flags } },
        ...over,
    }) as EffectLike;

describe("effectCusto", () => {
    it("lê o custo numérico do flag; vazio/ausente/negativo → 0", () => {
        expect(effectCusto(buff())).toBe(2);
        expect(effectCusto(buff({ custo: 1 }))).toBe(1);
        expect(effectCusto(buff({ custo: "" }))).toBe(0);
        expect(effectCusto(buff({ custo: undefined }))).toBe(0);
        expect(effectCusto(buff({ custo: -3 }))).toBe(0);
        expect(effectCusto({} as EffectLike)).toBe(0);
    });
});

describe("eligibleInitiativeBuffEffects", () => {
    it("aceita onuse+skill com custo pagável — mesmo disabled (default do T20)", () => {
        expect(eligibleInitiativeBuffEffects([buff()], 2)).toHaveLength(1);
        expect(eligibleInitiativeBuffEffects([buff({ custo: "" })], 0)).toHaveLength(1);
        expect(eligibleInitiativeBuffEffects([buff({}, { disabled: false })], 2)).toHaveLength(1);
    });
    it("rejeita: sem onuse, sem flag skill (só attack), custo acima do PM", () => {
        expect(eligibleInitiativeBuffEffects([buff({ onuse: false })], 9)).toHaveLength(0);
        expect(eligibleInitiativeBuffEffects([buff({ skill: undefined, attack: true })], 9)).toHaveLength(0);
        expect(eligibleInitiativeBuffEffects([buff({ custo: "2" })], 1)).toHaveLength(0);
    });
    it("respeita a restrição `items` (lista de perícias separada por ;)", () => {
        expect(eligibleInitiativeBuffEffects([buff({ items: "Atletismo; Luta" })], 9)).toHaveLength(0);
        expect(eligibleInitiativeBuffEffects([buff({ items: "Iniciativa; Luta" })], 9)).toHaveLength(1);
        expect(eligibleInitiativeBuffEffects([buff({ items: "" })], 9)).toHaveLength(1);
    });
    it("filtra lista mista pelo PM (Audácia 2 PM não paga com 1 PM; grátis passa)", () => {
        const audacia = buff();
        const gratis = buff({ custo: "" });
        expect(eligibleInitiativeBuffEffects([audacia, gratis], 1)).toEqual([gratis]);
    });
});

describe("hasUsableInitiativeBuff", () => {
    const actor = (effects: EffectLike[], pm: number, extra: Record<string, unknown> = {}) =>
        ({
            rollPericia: async () => null,
            effects: { contents: effects },
            system: { attributes: { pm: { value: pm, temp: 0 } }, pericias: { inic: { label: "Iniciativa" } } },
            ...extra,
        }) as never;

    it("true com buff pagável (soma pm.temp)", () => {
        expect(hasUsableInitiativeBuff(actor([buff()], 2))).toBe(true);
        const a = {
            rollPericia: async () => null,
            effects: { contents: [buff()] },
            system: { attributes: { pm: { value: 1, temp: 1 } }, pericias: {} },
        } as never;
        expect(hasUsableInitiativeBuff(a)).toBe(true);
    });
    it("false: sem efeitos, sem PM p/ pagar, sem rollPericia", () => {
        expect(hasUsableInitiativeBuff(actor([], 9))).toBe(false);
        expect(hasUsableInitiativeBuff(actor([buff({ custo: "3" })], 2))).toBe(false);
        expect(hasUsableInitiativeBuff(actor([buff()], 9, { rollPericia: undefined }))).toBe(false);
    });
});
