import { describe, it, expect } from "vitest";
import { isEconomiaPower, computeReducedCusto, isEligibleTarget, economiaDisplayName, powerEffectiveCusto } from "@/economia-habilidade/index";

// Poder com Efeito de Uso (onuse) que cobra PM pelo efeito — ex.: Audácia.
const onusePoder = (name: string, ativCusto: number | null, effCusto: string, id = name) =>
    ({ id, type: "poder", name, system: { ativacao: { custo: ativCusto } }, effects: { contents: [{ id: id + "-e", flags: { tormenta20: { custo: effCusto, onuse: true } } }] } });

const poder = (name: string, custo: number | null = null, id = name) =>
    ({ id, type: "poder", name, system: { ativacao: { custo } } });

describe("isEconomiaPower", () => {
    it("detecta o poder por nome", () => {
        expect(isEconomiaPower(poder("Economia de Habilidade"))).toBe(true);
        expect(isEconomiaPower({ type: "poder", name: "Economia de Habilidade (2)" })).toBe(true);
        expect(isEconomiaPower(poder("Oração Marcial", 5))).toBe(false);
        expect(isEconomiaPower({ type: "magia", name: "Economia de Habilidade" })).toBe(false);
    });
});

describe("economiaDisplayName", () => {
    it("marca a habilidade afetada e continua sendo detectado como o poder", () => {
        const name = economiaDisplayName("Oração Marcial");
        expect(name).toBe("Economia de Habilidade (Oração Marcial)");
        // o item renomeado ainda é reconhecido (detecção por includes)
        expect(isEconomiaPower({ type: "poder", name })).toBe(true);
        // e continua inelegível como alvo (não vincula um Economia a outro)
        expect(isEligibleTarget({ id: "x", type: "poder", name, system: { ativacao: { custo: 3 } } }, new Set())).toBe(false);
    });
});

describe("computeReducedCusto", () => {
    it("reduz 1, nunca abaixo de 1", () => {
        expect(computeReducedCusto(5)).toBe(4);
        expect(computeReducedCusto(2)).toBe(1);
        expect(computeReducedCusto(1)).toBe(1); // não zera
        expect(computeReducedCusto(0)).toBe(1);
    });
});

describe("powerEffectiveCusto", () => {
    it("usa o maior entre ativacao.custo e o custo do Efeito de Uso", () => {
        // Audácia: ativacao já reduzido p/ 1, mas o efeito ainda cobra 2 → efetivo 2.
        expect(powerEffectiveCusto(onusePoder("Audácia", 1, "2"))).toBe(2);
        expect(powerEffectiveCusto(onusePoder("Audácia", 2, "2"))).toBe(2);
        expect(powerEffectiveCusto(poder("Oração Marcial", 5))).toBe(5);
    });
});

describe("isEligibleTarget", () => {
    const none = new Set<string>();
    it("aceita poderes que custam 2+ PM", () => {
        expect(isEligibleTarget(poder("Oração Marcial", 5), none)).toBe(true);
        expect(isEligibleTarget(poder("Presente dos Deuses", 2), none)).toBe(true);
    });
    it("aceita poder cujo custo vem do Efeito de Uso (Audácia), mesmo com ativacao 1", () => {
        expect(isEligibleTarget(onusePoder("Audácia", 1, "2"), none)).toBe(true);
    });
    it("rejeita custo < 2 (reduzir zeraria) e sem custo", () => {
        expect(isEligibleTarget(poder("Armamento Aberrante", 1), none)).toBe(false);
        expect(isEligibleTarget(poder("Passivo", null), none)).toBe(false);
    });
    it("rejeita o próprio Economia de Habilidade e não-poderes", () => {
        expect(isEligibleTarget(poder("Economia de Habilidade", 3), none)).toBe(false);
        expect(isEligibleTarget({ id: "a", type: "arma", name: "Espada", system: { ativacao: { custo: 5 } } }, none)).toBe(false);
    });
    it("rejeita poderes já vinculados por outro Economia", () => {
        expect(isEligibleTarget(poder("Oração Marcial", 5, "orac1"), new Set(["orac1"]))).toBe(false);
    });
});
