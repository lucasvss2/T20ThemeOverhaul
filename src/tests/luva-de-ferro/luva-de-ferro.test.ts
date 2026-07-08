import { describe, it, expect } from "vitest";
import {
    hasLuvaDeFerro,
    isPersonalArcaneSpell,
    isDefenseOrResistChange,
    boostDefenseResistGroups,
} from "@/luva-de-ferro/index";

const luva = (over: Record<string, unknown> = {}) =>
    ({ type: "equipamento", name: "Luva de Ferro", system: { equipado: true, ...over } });
const actorWith = (items: unknown[]) => ({ items: { contents: items } }) as never;

describe("hasLuvaDeFerro", () => {
    it("acha a luva equipada (boolean OU slot)", () => {
        expect(hasLuvaDeFerro(actorWith([luva()]))).toBe(true);
        expect(hasLuvaDeFerro(actorWith([luva({ equipado: false, equipado2: { slot: 1.2 } })]))).toBe(true);
        expect(hasLuvaDeFerro(actorWith([{ type: "equipamento", name: "Luva de Ferro Vigilante", system: { equipado: true } }]))).toBe(true);
    });
    it("false: desequipada, outro nome, sem ator", () => {
        expect(hasLuvaDeFerro(actorWith([luva({ equipado: false, equipado2: { slot: 0 } })]))).toBe(false);
        expect(hasLuvaDeFerro(actorWith([{ type: "equipamento", name: "Manopla", system: { equipado: true } }]))).toBe(false);
        expect(hasLuvaDeFerro(null)).toBe(false);
    });
});

describe("isPersonalArcaneSpell", () => {
    it("arcana + alcance self/pessoal", () => {
        expect(isPersonalArcaneSpell({ tipo: "arc", alcance: "self" })).toBe(true);
        expect(isPersonalArcaneSpell({ tipo: "arc", alcance: "Pessoal" })).toBe(true);
    });
    it("false: divina, alcance curto, sem dados", () => {
        expect(isPersonalArcaneSpell({ tipo: "div", alcance: "self" })).toBe(false);
        expect(isPersonalArcaneSpell({ tipo: "arc", alcance: "short" })).toBe(false);
        expect(isPersonalArcaneSpell(null)).toBe(false);
    });
});

describe("isDefenseOrResistChange", () => {
    it("bônus de Defesa (exceto pda) e resistência contam", () => {
        expect(isDefenseOrResistChange({ key: "system.attributes.defesa.bonus", mode: 2, value: "2" })).toBe(true);
        expect(isDefenseOrResistChange({ key: "system.modificadores.pericias.resistencia", mode: 2, value: "1" })).toBe(true);
        expect(isDefenseOrResistChange({ key: "system.pericias.vont.outros", mode: 2, value: "2" })).toBe(true);
    });
    it("não conta: pda, modo não-ADD, valor ≤ 0, outras keys", () => {
        expect(isDefenseOrResistChange({ key: "system.attributes.defesa.pda", mode: 2, value: "1" })).toBe(false);
        expect(isDefenseOrResistChange({ key: "system.attributes.defesa.bonus", mode: 5, value: "2" })).toBe(false);
        expect(isDefenseOrResistChange({ key: "system.attributes.defesa.bonus", mode: 2, value: "-2" })).toBe(false);
        expect(isDefenseOrResistChange({ key: "system.modificadores.dano.geral", mode: 2, value: "2" })).toBe(false);
    });
});

describe("boostDefenseResistGroups", () => {
    it("soma +1 nas changes elegíveis (Armadura Arcana +2 Defesa → +3), sem mutar a entrada", () => {
        const groups = [[{ name: "Armadura Arcana", changes: [
            { key: "system.attributes.defesa.bonus", mode: 2, value: "2" },
            { key: "system.modificadores.dano.geral", mode: 2, value: "2" },
        ] }]];
        const { groups: out, boosted } = boostDefenseResistGroups(groups);
        expect(boosted).toBe(true);
        expect(out[0][0].changes?.[0].value).toBe("3");  // defesa boostada
        expect(out[0][0].changes?.[1].value).toBe("2");  // dano intacto
        expect(groups[0][0].changes?.[0].value).toBe("2"); // entrada não mutada
    });
    it("sem changes elegíveis → boosted false e grupos originais", () => {
        const groups = [[{ changes: [{ key: "system.modificadores.pericias.geral", mode: 2, value: "2" }] }]];
        const { groups: out, boosted } = boostDefenseResistGroups(groups);
        expect(boosted).toBe(false);
        expect(out).toBe(groups);
    });
});
