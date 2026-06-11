import { describe, it, expect } from "vitest";
import { hasCenaImprovement } from "@/velocidade/index";

describe("hasCenaImprovement (+0 PM: duração para cena)", () => {
    it("detecta o aprimoramento selecionado", () => {
        expect(hasCenaImprovement([
            { description: "muda a duração para cena. A ação adicional...", qty: 1, cost: 0 },
        ])).toBe(true);
    });
    it("ignora quando qty 0 ou ausente", () => {
        expect(hasCenaImprovement([
            { description: "muda a duração para cena", qty: 0 },
        ])).toBe(false);
        expect(hasCenaImprovement([])).toBe(false);
        expect(hasCenaImprovement(undefined)).toBe(false);
        expect(hasCenaImprovement(null)).toBe(false);
    });
    it("não confunde com outros aprimoramentos", () => {
        expect(hasCenaImprovement([
            { description: "muda o alvo para criaturas escolhidas no alcance", qty: 1 },
            { description: "muda o alcance para pessoal e o alvo para você", qty: 1 },
        ])).toBe(false);
    });
    it("acento opcional (duracao/duração)", () => {
        expect(hasCenaImprovement([{ description: "muda a duracao para cena", qty: 1 }])).toBe(true);
    });
});
