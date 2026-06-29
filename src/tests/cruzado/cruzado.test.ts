import { describe, it, expect } from "vitest";
import {
    isGiftWeapon, isWeaponEquipped, actorHasPowerNamed, findEquippedGift,
    actorLevel, computeAlmaGuerreiraTempHP, shouldHaveGuerreiroSantificado,
} from "@/cruzado/index";

const MODULE_ID = "t20-theme-overhaul";

type Item = Parameters<typeof isGiftWeapon>[0];
type Actor = Parameters<typeof actorHasPowerNamed>[0];

const gift = (equipado: unknown = 1) =>
    ({ type: "arma", name: "Machado Devotado", system: { equipado }, flags: { [MODULE_ID]: { presenteDosDeuses: true } } }) as Item;

describe("isGiftWeapon", () => {
    it("true só p/ arma com flag presenteDosDeuses", () => {
        expect(isGiftWeapon(gift())).toBe(true);
        expect(isGiftWeapon({ type: "arma", flags: { [MODULE_ID]: { presenteDosDeuses: false } } } as Item)).toBe(false);
        expect(isGiftWeapon({ type: "arma", flags: {} } as Item)).toBe(false);
        expect(isGiftWeapon({ type: "equipamento", flags: { [MODULE_ID]: { presenteDosDeuses: true } } } as Item)).toBe(false);
    });
});

describe("isWeaponEquipped", () => {
    it("legacy number/boolean/string e slot", () => {
        expect(isWeaponEquipped({ system: { equipado: 1 } } as Item)).toBe(true);
        expect(isWeaponEquipped({ system: { equipado: 0 } } as Item)).toBe(false);
        expect(isWeaponEquipped({ system: { equipado: true } } as Item)).toBe(true);
        expect(isWeaponEquipped({ system: { equipado2: { slot: 2 } } } as Item)).toBe(true);
        expect(isWeaponEquipped({ system: { equipado: 0, equipado2: { slot: 0 } } } as Item)).toBe(false);
    });
});

describe("actorHasPowerNamed", () => {
    const actor = (...powers: string[]) =>
        ({ items: powers.map(n => ({ type: "poder", name: n })) }) as Actor;
    it("acha por nome normalizado (acentos/caixa)", () => {
        expect(actorHasPowerNamed(actor("Alma Guerreira"), "alma guerreira")).toBe(true);
        expect(actorHasPowerNamed(actor("Oração Marcial"), "oracao marcial")).toBe(true);
        expect(actorHasPowerNamed(actor("Outro Poder"), "alma guerreira")).toBe(false);
    });
    it("ignora itens não-poder", () => {
        expect(actorHasPowerNamed({ items: [{ type: "arma", name: "Alma Guerreira" }] } as Actor, "alma guerreira")).toBe(false);
    });
});

describe("findEquippedGift", () => {
    it("acha o presente equipado", () => {
        const actor = { items: [gift(1)] } as Actor;
        expect(findEquippedGift(actor)?.name).toBe("Machado Devotado");
    });
    it("null se presente não equipado", () => {
        expect(findEquippedGift({ items: [gift(0)] } as Actor)).toBeNull();
    });
    it("null se não há presente", () => {
        expect(findEquippedGift({ items: [{ type: "arma", flags: {} }] } as Actor)).toBeNull();
    });
});

describe("actorLevel / computeAlmaGuerreiraTempHP", () => {
    const mk = (nivel: number, sab: number) =>
        ({ system: { attributes: { nivel: { value: nivel } }, atributos: { sab: { value: sab } } } }) as Actor;
    it("nível via attributes.nivel.value", () => {
        expect(actorLevel(mk(8, 7))).toBe(8);
    });
    it("PV temp = nível + Sabedoria (Everton: 8+7=15)", () => {
        expect(computeAlmaGuerreiraTempHP(mk(8, 7))).toBe(15);
    });
    it("mínimo 0", () => {
        expect(computeAlmaGuerreiraTempHP(mk(0, 0))).toBe(0);
    });
});

describe("shouldHaveGuerreiroSantificado", () => {
    it("true só com o poder + presente equipado", () => {
        const ok = { items: [{ type: "poder", name: "Guerreiro Santificado" }, gift(1)] } as Actor;
        expect(shouldHaveGuerreiroSantificado(ok)).toBe(true);
    });
    it("false sem o presente equipado", () => {
        const noGift = { items: [{ type: "poder", name: "Guerreiro Santificado" }, gift(0)] } as Actor;
        expect(shouldHaveGuerreiroSantificado(noGift)).toBe(false);
    });
    it("false sem o poder", () => {
        const noPower = { items: [gift(1)] } as Actor;
        expect(shouldHaveGuerreiroSantificado(noPower)).toBe(false);
    });
});
