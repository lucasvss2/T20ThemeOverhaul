import { describe, expect, it } from "vitest";
import { guardBonus, guardConfiguration, hasGuard, isMeleeGuardWeapon, prepareGuardDefense, type GuardActor, type GuardItem } from "@/guarda/format";
import { registerGuardUpgrade } from "@/guarda/index";
import { validateGiftPlan, type GiftPlan } from "@/cruzado/gift-format";

const weapon = (purpose = "corpo-a-corpo"): GuardItem => ({ name: "Espada", type: "arma", system: {
    proposito: purpose, upgrades: { melhoria1: "guard" }, enableAutoUpgrades: true,
    equipado: true, equipado2: { slot: 1.1 }, rolls: [{ type: "ataque", parts: [["1d20"], ["luta", ""]] }],
} });
const actor = (...items: GuardItem[]): GuardActor => ({ type: "character", items: { contents: items }, system: { attributes: { defesa: { bonus: ["2[Outro bônus]"] } } } });
describe("Guarda — melhoria de arma", () => {
    it.each(["Lança", "Tridente", "Lança (Presente dos Deuses)"])("aceita %s do catálogo legado mesmo cadastrada como arremesso", name => {
        const item = { ...weapon("arremesso"), name };
        expect(isMeleeGuardWeapon(item)).toBe(true);
        const plan: GiftPlan = { weapon: { ...item, system: { ...item.system, preco: 2 } }, improvements: ["guard", "harmonized"], enchantments: [], milestone: 5 };
        expect(validateGiftPlan(plan, 6, ["guard", "harmonized"], [])).toBeNull();
    });
    it("registra nome, descrição e template sem efeitos de ataque ou dano", () => {
        const config = { weaponUpgrades: {}, weaponUpgradesTooltips: {}, upgrades: { weapon: { status: {} } } };
        registerGuardUpgrade(config); registerGuardUpgrade(config);
        expect(config.weaponUpgrades).toMatchObject({ guard: "Guarda" });
        expect(config.upgrades.weapon).toMatchObject({ guard: { changes: [], transfer: false, flags: { tormenta20: { onuse: false } } }, status: { guard: "DONE" } });
    });
    it("aceita corpo a corpo e armas de uso misto; rejeita armas de disparo e arremesso exclusivo", () => {
        expect(isMeleeGuardWeapon(weapon())).toBe(true);
        expect(isMeleeGuardWeapon(weapon("corpo-a-corpo-arremesso"))).toBe(true);
        for (const purpose of ["disparo", "arremesso"]) expect(hasGuard(weapon(purpose))).toBe(false);
        expect(isMeleeGuardWeapon({ type: "equipamento", name: "Manopla" })).toBe(true);
    });
    it("fornece uma única parcela de Defesa, preserva outras fontes e a remove ao desequipar", () => {
        const w = weapon(), a = actor(w, weapon());
        prepareGuardDefense(a, true); prepareGuardDefense(a, true);
        expect(a.system!.attributes!.defesa!.bonus).toEqual(["2[Outro bônus]", "1[Guarda]"]);
        a.items!.contents.forEach(i => { i.system!.equipado2!.slot = 0; });
        prepareGuardDefense(a, true);
        expect(a.system!.attributes!.defesa!.bonus).toEqual(["2[Outro bônus]"]);
    });
    it("respeita automação, seleção e ambos os modos de equipamento, inclusive ameaças", () => {
        const w = weapon(), a = actor(w); w.system!.equipado2!.slot = 0;
        expect(guardBonus(a, true)).toBe(0); expect(guardBonus(a, false)).toBe(1);
        a.type = "npc"; expect(guardBonus(a, true)).toBe(1);
        w.system!.enableAutoUpgrades = false; expect(guardBonus(a, false)).toBe(0);
        w.system!.enableAutoUpgrades = true; w.system!.upgrades = { material: "guard" };
        expect(guardBonus(a, false)).toBe(0);
    });
    it("não soma em ataques comuns, dano, perícias diversas ou ao cancelar o diálogo", () => {
        const config = { bonus: "3" };
        expect(guardConfiguration(weapon(), config, 1)).toBe(config);
        expect(guardConfiguration(weapon(), null, 1)).toBeNull();
        expect(guardConfiguration({ type: "pericia", name: "Reflexos" }, { t20GuardResistance: true }, 1)).not.toHaveProperty("bonus");
        expect(guardConfiguration(weapon(), { t20GuardResistance: true }, 0)).not.toHaveProperty("bonus");
    });
    it("soma somente +1 no teste defensivo e preserva bônus de outros sistemas", () => {
        const config = { t20GuardResistance: true, bonus: "2 + 5", t20Flanking: true };
        expect(guardConfiguration(weapon(), config, 1)).toMatchObject({ bonus: "(2 + 5) + 1", t20Flanking: true });
        expect(config.bonus).toBe("2 + 5");
        expect(guardConfiguration({ type: "pericia", name: "Luta", parts: ["1d20", "5"] }, { t20GuardResistance: true }, 1)).toHaveProperty("parts", ["1d20", "5", "1"]);
    });
    it("acrescenta o bônus à fórmula de Luta já montada pelo diálogo, sem reaplicar o bônus manual", () => {
        const skill = { type: "pericia", name: "Luta", parts: ["1d20", "5", "2"] };
        const result = guardConfiguration(skill, { t20GuardResistance: true, bonus: "2" }, 1);
        expect(result!.parts).toEqual(["1d20", "5", "2", "1"]);
        expect(skill.parts).toEqual(["1d20", "5", "2"]);
    });
    it("valida a restrição também no Presente dos Deuses", () => {
        const plan: GiftPlan = { weapon: { ...weapon("disparo"), system: { ...weapon("disparo").system, preco: 100 } }, improvements: ["guard"], enchantments: [], milestone: 1 };
        expect(validateGiftPlan(plan, 1, ["guard"], [])).toMatch(/corpo a corpo/);
        (plan.weapon.system as { proposito: string }).proposito = "corpo-a-corpo";
        expect(validateGiftPlan(plan, 1, ["guard"], [])).toBeNull();
    });
});
