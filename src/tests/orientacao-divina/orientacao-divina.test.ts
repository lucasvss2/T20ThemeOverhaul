import { describe, expect, it } from "vitest";

import {
    attrInScope,
    computeConfig,
    isEligibleSkill,
    isOrientacaoDivina,
    parseTiers,
} from "@/orientacao-divina/index";

describe("isOrientacaoDivina", () => {
    it("detecta o nome REAL do compêndio — só \"Orientação\", sem \"Divina\"", () => {
        expect(isOrientacaoDivina("Orientação")).toBe(true);
        expect(isOrientacaoDivina("orientacao")).toBe(true);
    });
    it("também casa variantes com sufixo (ex.: prefixo/sufixo de categoria)", () => {
        expect(isOrientacaoDivina("Orientação Divina")).toBe(true);
        expect(isOrientacaoDivina("orientacao divina")).toBe(true);
    });
    it("não casa magias/poderes não relacionados", () => {
        expect(isOrientacaoDivina("Bola de Fogo")).toBe(false);
        expect(isOrientacaoDivina(null)).toBe(false);
    });
});

describe("parseTiers", () => {
    it("mapeia por custo (2 → t2; 5 sem keyword → t5Target)", () => {
        expect(parseTiers([{ cost: 2 }])).toEqual({ t2: true, t5Group: false, t5Target: false });
        expect(parseTiers([{ cost: 5 }])).toEqual({ t2: false, t5Group: false, t5Target: true });
    });
    it("distingue os dois custo-5 pela descrição", () => {
        const group = parseTiers([{ cost: 5, description: "escolha entre atributos físicos ou mentais" }]);
        expect(group).toEqual({ t2: false, t5Group: true, t5Target: false });

        const target = parseTiers([{ cost: 5, description: "muda o alvo para criaturas escolhidas" }]);
        expect(target).toEqual({ t2: false, t5Group: false, t5Target: true });
    });
    it("fallback por descrição quando custo ausente", () => {
        expect(parseTiers([{ description: "muda a duração para cena. escolha um atributo" }]).t2).toBe(true);
    });
    it("combina t2 + t5Group + t5Target simultaneamente", () => {
        const t = parseTiers([
            { cost: 2 },
            { cost: 5, description: "atributos físicos ou mentais" },
            { cost: 5, description: "criaturas escolhidas" },
        ]);
        expect(t).toEqual({ t2: true, t5Group: true, t5Target: true });
    });
    it("sem aprimoramentos → todos falsos", () => {
        expect(parseTiers([])).toEqual({ t2: false, t5Group: false, t5Target: false });
        expect(parseTiers(undefined)).toEqual({ t2: false, t5Group: false, t5Target: false });
    });
});

describe("computeConfig", () => {
    it("base: uma vez, 1 rodada, sem escolha de escopo, alvo único", () => {
        const c = computeConfig({ t2: false, t5Group: false, t5Target: false });
        expect(c).toEqual({ mode: "once", duration: "round", needsScopeChoice: false, scopeKind: null, multiTarget: false });
    });
    it("t2 → persistente, cena, escopo único", () => {
        const c = computeConfig({ t2: true, t5Group: false, t5Target: false });
        expect(c).toMatchObject({ mode: "persistent", duration: "scene", needsScopeChoice: true, scopeKind: "single" });
    });
    it("t5Group → persistente, escopo grupo (mesmo sem t2 isolado)", () => {
        const c = computeConfig({ t2: false, t5Group: true, t5Target: false });
        expect(c).toMatchObject({ mode: "persistent", duration: "scene", needsScopeChoice: true, scopeKind: "group" });
    });
    it("t5Target sozinho não muda modo/duração, só o alvo", () => {
        const c = computeConfig({ t2: false, t5Group: false, t5Target: true });
        expect(c).toMatchObject({ mode: "once", duration: "round", multiTarget: true });
    });
});

describe("isEligibleSkill", () => {
    it("modo PERSISTENTE (+2/+5 PM) exclui Fortitude/Reflexos/Vontade — só aqui o texto da magia ressalva isso", () => {
        expect(isEligibleSkill("fort", "persistent")).toBe(false);
        expect(isEligibleSkill("refl", "persistent")).toBe(false);
        expect(isEligibleSkill("vont", "persistent")).toBe(false);
    });
    it("modo BASE (\"once\") NÃO exclui Fort/Refl/Vont — a ressalva só existe no texto dos aprimoramentos", () => {
        expect(isEligibleSkill("fort", "once")).toBe(true);
        expect(isEligibleSkill("refl", "once")).toBe(true);
        expect(isEligibleSkill("vont", "once")).toBe(true);
    });
    it("qualquer outra perícia é elegível em ambos os modos", () => {
        expect(isEligibleSkill("perc", "once")).toBe(true);
        expect(isEligibleSkill("perc", "persistent")).toBe(true);
        expect(isEligibleSkill("atua", "once")).toBe(true);
        expect(isEligibleSkill("inic", "persistent")).toBe(true);
    });
});

describe("attrInScope", () => {
    it("sem escopo (null/vazio) → sempre true", () => {
        expect(attrInScope("for", null)).toBe(true);
        expect(attrInScope("for", undefined)).toBe(true);
        expect(attrInScope("for", [])).toBe(true);
        expect(attrInScope(undefined, null)).toBe(true);
    });
    it("com escopo → precisa estar na lista", () => {
        expect(attrInScope("for", ["for", "des", "con"])).toBe(true);
        expect(attrInScope("int", ["for", "des", "con"])).toBe(false);
        expect(attrInScope(undefined, ["for"])).toBe(false);
    });
});
