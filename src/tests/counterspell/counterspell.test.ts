import { describe, it, expect } from "vitest";
import {
    hasCounterspellPower,
    counterspellSucceeds,
    superiorTempPm,
} from "@/counterspell";

describe("hasCounterspellPower", () => {
    it("detecta Contramágica Aprimorada (com/sem acento e prefixos)", () => {
        expect(hasCounterspellPower(["Contramágica Aprimorada"])).toBe(true);
        expect(hasCounterspellPower(["Bênção: Contramágica Aprimorada"])).toBe(true);
        expect(hasCounterspellPower(["contramagica aprimorada"])).toBe(true);
    });
    it("não confunde com outros poderes de Contramágica passivos", () => {
        expect(hasCounterspellPower(["Contramágica Elemental"])).toBe(false);
        expect(hasCounterspellPower(["Contramágica Superior"])).toBe(false);
        expect(hasCounterspellPower(["Dissipar Magia"])).toBe(false);
    });
    it("lista vazia / sem o poder", () => {
        expect(hasCounterspellPower([])).toBe(false);
        expect(hasCounterspellPower(["Bola de Fogo", "Curar Ferimentos"])).toBe(false);
    });
});

describe("counterspellSucceeds", () => {
    it("anula quando o teste de Misticismo ≥ CD", () => {
        expect(counterspellSucceeds(25, 20)).toBe(true);
        expect(counterspellSucceeds(20, 20)).toBe(true);
    });
    it("falha quando o teste < CD", () => {
        expect(counterspellSucceeds(19, 20)).toBe(false);
    });
    it("CD inválida (0) nunca anula", () => {
        expect(counterspellSucceeds(30, 0)).toBe(false);
    });
});

describe("superiorTempPm", () => {
    it("ganha PM = círculo, limitado pelo PM gasto", () => {
        expect(superiorTempPm(2, 3)).toBe(2); // círculo 2 < gasto 3 → 2
        expect(superiorTempPm(5, 3)).toBe(3); // círculo 5 > gasto 3 → cap 3
    });
    it("círculo 0 ou negativo → 0", () => {
        expect(superiorTempPm(0, 3)).toBe(0);
        expect(superiorTempPm(-1, 3)).toBe(0);
    });
});
