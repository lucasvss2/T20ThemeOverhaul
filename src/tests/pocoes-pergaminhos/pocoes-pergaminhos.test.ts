import { describe, expect, it } from "vitest";

import { getPocaoPergaminhoFlag, isPocaoPergaminhoItem, UNIDENTIFIED_NAME } from "@/pocoes-pergaminhos/index";
import { actorHasVisaoMistica, identifyCD } from "@/pocoes-pergaminhos/identify";

describe("identifyCD", () => {
    it("CD = 15 + custo em PM (regra citada pelo usuário)", () => {
        expect(identifyCD(1)).toBe(16);
        expect(identifyCD(6)).toBe(21);
        expect(identifyCD(0)).toBe(15);
    });
});

describe("actorHasVisaoMistica", () => {
    it("detecta a magia Visão Mística conhecida", () => {
        const actor = { items: [{ name: "Visão Mística" }] };
        expect(actorHasVisaoMistica(actor)).toBe(true);
    });
    it("detecta poderes raciais equivalentes (Sentidos Místicos / Visão Feérica)", () => {
        expect(actorHasVisaoMistica({ items: [{ name: "Sentidos Místicos" }] })).toBe(true);
        expect(actorHasVisaoMistica({ items: [{ name: "Visão Feérica" }] })).toBe(true);
    });
    it("ignora acentuação/caixa", () => {
        expect(actorHasVisaoMistica({ items: [{ name: "VISAO MISTICA" }] })).toBe(true);
    });
    it("false sem o item, ator nulo, ou lista vazia", () => {
        expect(actorHasVisaoMistica({ items: [{ name: "Bola de Fogo" }] })).toBe(false);
        expect(actorHasVisaoMistica(null)).toBe(false);
        expect(actorHasVisaoMistica({ items: [] })).toBe(false);
    });
});

describe("getPocaoPergaminhoFlag / isPocaoPergaminhoItem", () => {
    const flagData = {
        kind: "pocao" as const, spellUuid: "Compendium.x.y.Item.z", spellName: "Bola de Fogo",
        custoPM: 3, aprimoramentoName: null, identificado: false,
    };
    it("lê a flag do módulo", () => {
        const item = { flags: { "t20-theme-overhaul": { pocaoPergaminho: flagData } } };
        expect(getPocaoPergaminhoFlag(item)).toEqual(flagData);
        expect(isPocaoPergaminhoItem(item)).toBe(true);
    });
    it("null/false sem a flag", () => {
        expect(getPocaoPergaminhoFlag({ flags: {} })).toBeNull();
        expect(isPocaoPergaminhoItem({ flags: {} })).toBe(false);
        expect(isPocaoPergaminhoItem(null)).toBe(false);
    });
});

describe("UNIDENTIFIED_NAME", () => {
    it("tem rótulo genérico por categoria", () => {
        expect(UNIDENTIFIED_NAME.pocao).toBe("Poção desconhecida");
        expect(UNIDENTIFIED_NAME.pergaminho).toBe("Pergaminho desconhecido");
    });
});
