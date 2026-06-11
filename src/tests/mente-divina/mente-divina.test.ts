import { describe, it, expect } from "vitest";
import { parseMenteDivinaMode, MENTAL_ATTRS } from "@/mente-divina/index";

describe("parseMenteDivinaMode", () => {
    it("base (sem aprimoramentos) → escolha de 1 atributo, +2", () => {
        expect(parseMenteDivinaMode([])).toEqual({ allThree: false, bonus: 2 });
        expect(parseMenteDivinaMode(undefined)).toEqual({ allThree: false, bonus: 2 });
    });

    it("+3 PM: +2 nos três atributos mentais → direto, +2", () => {
        expect(parseMenteDivinaMode([
            { description: "em vez do normal, o alvo recebe +2 nos três atributos mentais. Requer 3º círculo.", qty: 1 },
        ])).toEqual({ allThree: true, bonus: 2 });
    });

    it("+7 PM: +4 no atributo escolhido → escolha, +4", () => {
        expect(parseMenteDivinaMode([
            { description: "em vez do normal, o alvo recebe +4 no atributo escolhido. Requer 4º círculo.", qty: 1 },
        ])).toEqual({ allThree: false, bonus: 4 });
    });

    it("+12 PM: +4 nos três atributos mentais → direto, +4", () => {
        expect(parseMenteDivinaMode([
            { description: "em vez do normal, o alvo recebe +4 nos três atributos mentais. Requer 5º círculo.", qty: 1 },
        ])).toEqual({ allThree: true, bonus: 4 });
    });

    it("aprimoramento de alcance não muda o modo", () => {
        expect(parseMenteDivinaMode([
            { description: "muda o alcance para curto e o alvo para criaturas escolhidas.", qty: 1 },
        ])).toEqual({ allThree: false, bonus: 2 });
    });

    it("qty 0 = não selecionado", () => {
        expect(parseMenteDivinaMode([
            { description: "+4 nos três atributos mentais", qty: 0 },
        ])).toEqual({ allThree: false, bonus: 2 });
    });
});

describe("MENTAL_ATTRS", () => {
    it("são int/sab/car", () => {
        expect(MENTAL_ATTRS.map((a) => a.key)).toEqual(["int", "sab", "car"]);
    });
});
