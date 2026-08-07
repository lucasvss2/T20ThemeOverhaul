import { describe, expect, it } from "vitest";

import { pocaoBaseMatchesSpell, stripTableSuffix } from "@/treasure/item-resolver";

describe("stripTableSuffix", () => {
    it("remove sufixo entre parênteses da tabela de tesouro", () => {
        expect(stripTableSuffix("Bola de Fogo (granada)")).toBe("Bola de Fogo");
        expect(stripTableSuffix("Arma Mágica (óleo)")).toBe("Arma Mágica");
        expect(stripTableSuffix("Curar Ferimentos (2d8+2 PV)")).toBe("Curar Ferimentos");
    });
    it("sem sufixo, retorna como está", () => {
        expect(stripTableSuffix("Compreensão")).toBe("Compreensão");
    });
});

describe("pocaoBaseMatchesSpell", () => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    it("bate a variante base (Poção/Granada/Óleo) com a magia-alvo", () => {
        expect(pocaoBaseMatchesSpell(norm("Poção de Curar Ferimentos"), norm("Curar Ferimentos"))).toBe(true);
        expect(pocaoBaseMatchesSpell(norm("Granada de Bola de Fogo"), norm("Bola de Fogo"))).toBe(true);
        expect(pocaoBaseMatchesSpell(norm("Óleo de Arma Mágica"), norm("Arma Mágica"))).toBe(true);
    });
    it("rejeita variantes com aprimoramento", () => {
        expect(pocaoBaseMatchesSpell(norm("Poção de Bola de Fogo (Aprimorada 1)"), norm("Bola de Fogo"))).toBe(false);
    });
    it("rejeita nomes sem o prefixo esperado ou de outra magia", () => {
        expect(pocaoBaseMatchesSpell(norm("Espada longa"), norm("Bola de Fogo"))).toBe(false);
        expect(pocaoBaseMatchesSpell(norm("Poção de Curar Ferimentos"), norm("Bola de Fogo"))).toBe(false);
    });
});
