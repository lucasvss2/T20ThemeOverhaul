import { describe, it, expect } from "vitest";
import { computeBolsaDiscount, isEncIluSpell, hasBolsaDePo } from "@/bolsa-de-po/index";

describe("computeBolsaDiscount", () => {
    it("até 2 PM, limitado ao custo dos aprimoramentos", () => {
        expect(computeBolsaDiscount(0)).toBe(0);  // sem aprimoramento → sem desconto (base intacta)
        expect(computeBolsaDiscount(1)).toBe(1);
        expect(computeBolsaDiscount(2)).toBe(2);  // Adaga Mental: apr 2 → de graça
        expect(computeBolsaDiscount(5)).toBe(2);  // teto 2
        expect(computeBolsaDiscount(-3)).toBe(0);
    });
});

describe("isEncIluSpell", () => {
    it("magias de Encantamento e Ilusão", () => {
        expect(isEncIluSpell({ type: "magia", system: { escola: "enc" } })).toBe(true);
        expect(isEncIluSpell({ type: "magia", system: { escola: "ilu" } })).toBe(true);
    });
    it("false: outra escola, não-magia, nulo", () => {
        expect(isEncIluSpell({ type: "magia", system: { escola: "evo" } })).toBe(false);
        expect(isEncIluSpell({ type: "poder", system: { escola: "enc" } })).toBe(false);
        expect(isEncIluSpell(null)).toBe(false);
    });
});

describe("hasBolsaDePo", () => {
    const bolsa = (over: Record<string, unknown> = {}) =>
        ({ type: "equipamento", name: "Bolsa de Pó Poderoso", system: { equipado: true, ...over } });
    const actorWith = (items: unknown[]) => ({ items: { contents: items } }) as never;

    it("acha a bolsa equipada (boolean OU slot)", () => {
        expect(hasBolsaDePo(actorWith([bolsa()]))).toBe(true);
        expect(hasBolsaDePo(actorWith([bolsa({ equipado: false, equipado2: { slot: 1.1 } })]))).toBe(true);
    });
    it("false: desequipada, outro nome, sem ator", () => {
        expect(hasBolsaDePo(actorWith([bolsa({ equipado: false, equipado2: { slot: 0 } })]))).toBe(false);
        expect(hasBolsaDePo(actorWith([{ type: "equipamento", name: "Mochila", system: { equipado: true } }]))).toBe(false);
        expect(hasBolsaDePo(null)).toBe(false);
    });
});
