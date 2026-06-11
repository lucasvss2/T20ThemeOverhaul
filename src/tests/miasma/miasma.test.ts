import { describe, it, expect } from "vitest";
import { isTruqueDescription, hasTruqueSelected, isTruqueImmune } from "@/miasma/index";

const TRUQUE_DESC =
    "muda o alcance para toque, a área para alvo (1 criatura com 0 PV ou menos), a duração para instantânea, " +
    "a resistência para Fortitude anula e adiciona componente material (pó de ônix no valor de T$ 10).";

describe("isTruqueDescription", () => {
    it("reconhece o texto real do Truque", () => {
        expect(isTruqueDescription(TRUQUE_DESC)).toBe(true);
    });
    it("não confunde com outros aprimoramentos", () => {
        expect(isTruqueDescription("aumenta o dano em +1d6.")).toBe(false);
        expect(isTruqueDescription("muda o tipo do dano para trevas.")).toBe(false);
    });
});

describe("hasTruqueSelected", () => {
    it("detecta truque selecionado (qty >= 1)", () => {
        expect(hasTruqueSelected([{ description: TRUQUE_DESC, qty: 1, cost: "" }])).toBe(true);
    });
    it("ignora qty 0 / listas vazias / não-arrays", () => {
        expect(hasTruqueSelected([{ description: TRUQUE_DESC, qty: 0 }])).toBe(false);
        expect(hasTruqueSelected([])).toBe(false);
        expect(hasTruqueSelected(undefined)).toBe(false);
    });
    it("outros aprimoramentos não disparam", () => {
        expect(hasTruqueSelected([
            { description: "aumenta o dano em +1d6.", qty: 2 },
            { description: "muda o tipo do dano para trevas.", qty: 1 },
        ])).toBe(false);
    });
});

describe("isTruqueImmune", () => {
    it("imune enquanto until > worldTime atual", () => {
        expect(isTruqueImmune(1000 + 86400, 1000)).toBe(true);
        expect(isTruqueImmune(1000 + 86400, 1000 + 86400)).toBe(false);   // expirou exato
        expect(isTruqueImmune(500, 1000)).toBe(false);                    // passado
    });
    it("flag ausente/inválida → não imune", () => {
        expect(isTruqueImmune(undefined, 1000)).toBe(false);
        expect(isTruqueImmune(null, 1000)).toBe(false);
        expect(isTruqueImmune("abc", 1000)).toBe(false);
    });
});
