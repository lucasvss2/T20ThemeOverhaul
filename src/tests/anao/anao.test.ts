import { describe, expect, it } from "vitest";
import { applyDuroComoAco, dwarfArmorEffectChanges, dwarfAttackBonus, prepareDwarfActor, prepareDwarfWeapon, type DwarfActor, type DwarfItem } from "@/anao/format";
import { isWeaponProficient } from "@/t20-fixes/proficiencia";
import { danoRollNeedsPadrao } from "@/t20-fixes/estilo-disparo-dano";
const power = (name: string): DwarfItem => ({ type: "poder", name });
function actor(...names: string[]): DwarfActor {
    return { type: "character", items: { contents: names.map(power) }, system: {
        atributos: { sab: { value: 5 }, des: { value: 2 }, con: { value: 6 } },
        attributes: { nivel: { value: 11 }, defesa: { value: 24, atributo: "des", bonus: ["1"] }, pv: { bonus: { total: ["3"] } } },
        tracos: { ic: { value: new Set() }, profArmas: { value: ["simples"] } },
    } };
}
function weapon(a: DwarfActor, name = "Pistola", proficiencia = "fogo"): DwarfItem {
    return { id: "weapon", type: "arma", name, actor: a, system: { proficiencia, rolls: [
        { type: "ataque", parts: [["1d20"], ["pont", ""]] }, { type: "dano", parts: [["2d6", "perfuracao"], ["padrao", ""]] },
    ] } };
}
describe("Anão — poderes raciais", () => {
    it("Duro como Pedra deriva uma única parcela e a remove junto com o poder", () => {
        const a=actor("Duro como Pedra");prepareDwarfActor(a,false);prepareDwarfActor(a,false);
        expect(a.system!.attributes!.pv!.bonus.total).toEqual(["3","13[Duro como Pedra]"]);
        a.items!.contents=[];prepareDwarfActor(a,false);
        expect(a.system!.attributes!.pv!.bonus.total).toEqual(["3"]);
    });
    it("Conforto do Aço fornece +2 apenas com armadura pesada equipada", () => {
        const a = actor("Conforto do Aço");
        const armor: DwarfItem = { type: "equipamento", system: { tipo: "pesada", equipado: true, equipado2: { slot: 1.2 } } };
        a.items!.contents.push(armor);
        prepareDwarfActor(a, true); prepareDwarfActor(a, true);
        expect(a.system!.attributes!.defesa!.bonus).toEqual(["1", "2[Conforto do Aço]"]);
        armor.system!.tipo = "leve"; prepareDwarfActor(a, true);
        expect(a.system!.attributes!.defesa!.bonus).toEqual(["1"]);
        armor.system!.tipo = "pesada"; armor.system!.equipado2!.slot = 0; prepareDwarfActor(a, true);
        expect(a.system!.attributes!.defesa!.bonus).toEqual(["1"]);
    });
    it("Conforto reconhece Armadura de Pedra legada como pesada sem mudar seu tipo de deslocamento", () => {
        const a = actor("Conforto do Aço");
        const armor: DwarfItem = { id: "stone", name: "Armadura de Pedra Reforçado", type: "equipamento", system: { tipo: "leve", equipado: true, equipado2: { slot: 1.2 } } };
        a.items!.contents.push(armor);
        prepareDwarfActor(a, true);
        expect(a.system!.attributes!.defesa!.bonus).toEqual(["1", "2[Conforto do Aço]"]);
        expect(armor.system!.tipo).toBe("leve");
    });
    it("Conforto anula pda de Reforçada da armadura, preservando +1 Defesa e o documento original", () => {
        const a = actor("Conforto do Aço");
        a.items!.contents.push({ id: "stone", name: "Armadura de Pedra Reforçado", type: "equipamento", system: { tipo: "leve" } });
        const effect = { origin: "Actor.original.Item.stone", changes: [
            { key: "system.attributes.defesa.bonus", mode: 2, value: "1" },
            { key: "system.attributes.defesa.pda", mode: 2, value: "1" },
        ] };
        expect(dwarfArmorEffectChanges(a, effect)).toEqual([effect.changes[0]]);
        expect(effect.changes).toHaveLength(2);
        a.items!.contents[0].name = "Outro Poder";
        expect(dwarfArmorEffectChanges(a, effect)).toBe(effect.changes);
    });
    it("Conforto preserva Reforçada do escudo e penalidades sem origem na armadura", () => {
        const a = actor("Conforto do Aço");
        a.items!.contents.push({ id: "shield", type: "equipamento", system: { tipo: "escudo" } });
        const changes = [{ key: "system.attributes.defesa.pda", mode: 2, value: "1" }];
        for (const origin of ["Actor.original.Item.shield", "Actor.other.Item.unknown", undefined]) {
            expect(dwarfArmorEffectChanges(a, { origin, changes })).toBe(changes);
        }
    });
    it("Conforto reconhece efeitos transferidos de armadura pelo parent", () => {
        const a = actor("Conforto do Aço");
        const parent: DwarfItem = { type: "equipamento", system: { tipo: "pesada" } };
        expect(dwarfArmorEffectChanges(a, { parent, changes: [{ key: "system.attributes.defesa.pda", mode: 2, value: "1" }] })).toEqual([]);
    });
    it("Coração de Pedra fornece PV por nível e imunidade, sem acumular a parcela derivada", () => {
        const a = actor("Coração de Pedra (Anão)"); prepareDwarfActor(a, false); prepareDwarfActor(a, false);
        expect(a.system!.attributes!.pv!.bonus.total).toEqual(["3", "11[Coração de Pedra]"]);
        expect(a.system!.tracos!.ic!.value.has("petrificado")).toBe(true);
    });
    it("Duro como Aço troca a parcela admitida de Destreza por Constituição", () => {
        const a = actor("Duro como Aço");
        a.items!.contents.push({ type: "equipamento", system: { tipo: "pesada", equipado: true, armadura: { penalidade: -5, maxAtr: 2 } } });
        applyDuroComoAco(a, false);
        expect(a.system!.attributes!.defesa).toMatchObject({ value: 28, atributo: "con" });
    });
    it("Duro como Aço respeita o pré-requisito e não age com armadura leve", () => {
        const a = actor("Duro como Aço"); a.system!.attributes!.nivel!.value = 10;
        a.items!.contents.push({ type: "equipamento", system: { tipo: "pesada", equipado: true, armadura: { penalidade: -5 } } });
        applyDuroComoAco(a, false); expect(a.system!.attributes!.defesa!.value).toBe(24);
        a.system!.attributes!.nivel!.value = 11; a.items!.contents[1].system!.tipo = "leve";
        applyDuroComoAco(a, false); expect(a.system!.attributes!.defesa!.value).toBe(24);
    });
    it("Atração pela Pólvora não beneficia espadas e soma com Arma Amada apenas na escolhida", () => {
        const a = actor("Atração pela Pólvora (Anão)", "Arma Amada (Anão)");
        a.items!.contents[1].flags = { "t20-theme-overhaul": { armaAmadaId: "weapon" } };
        const gun = weapon(a); prepareDwarfWeapon(gun); prepareDwarfWeapon(gun);
        expect(dwarfAttackBonus(a, gun)).toBe(1);
        expect(gun.system!.rolls![1].parts.filter(p => p[2] === "anao:dano")).toEqual([["4", "perfuracao", "anao:dano"]]);
        const sword = weapon(a, "Espada longa", "marcial"); sword.id = "other"; prepareDwarfWeapon(sword);
        expect(dwarfAttackBonus(a, sword)).toBe(0);
        expect(sword.system!.rolls![1].parts.some(p => p[2]?.startsWith("anao:"))).toBe(false);
    });
    it("Arma Amada reconhece o clone usado na rolagem e não bonifica um poder sem vínculo",()=>{
        const a=actor("Arma Amada"), gun=weapon(a);gun.id=undefined;gun._t20DwarfSourceId="weapon";
        prepareDwarfWeapon(gun);expect(gun.system!.rolls![1].parts.some(p=>p[2]==="anao:dano")).toBe(false);
        a.items!.contents[0].flags={"t20-theme-overhaul":{armaAmadaId:"weapon"}};
        prepareDwarfWeapon(gun);expect(gun.system!.rolls![1].parts.filter(p=>p[2]==="anao:dano")).toEqual([["2","perfuracao","anao:dano"]]);
    });
    it("Arma Amada mantém o vínculo com o presente mesmo que ele seja invocado com novo ID",()=>{
        const a=actor("Arma Amada"), gun=weapon(a);a.items!.contents[0].flags={"t20-theme-overhaul":{armaAmadaId:"gift:divino"}};
        gun.flags={"t20-theme-overhaul":{presenteTemporario:{powerId:"divino"}}};
        for(const id of ["invocacao1","invocacao2"]){gun.id=id;prepareDwarfWeapon(gun);expect(gun.system!.rolls![1].parts.filter(p=>p[2]==="anao:dano")).toHaveLength(1)}
    });
    it("bombas recebem +1 por dado, sem multiplicar novamente ao preparar", () => {
        const a = actor("Atração pela Pólvora"), bomb = weapon(a, "Bomba"); bomb.type = "consumivel";
        bomb.system!.rolls = [{ type: "dano", parts: [["6d6 + 2", "fogo"]] }];
        prepareDwarfWeapon(bomb); prepareDwarfWeapon(bomb);
        expect(bomb.system!.rolls[0].parts).toEqual([["6d6 + 2", "fogo"], ["6", "fogo", "anao:polvora"]]);
        bomb.name = "Bomba de ácido"; prepareDwarfWeapon(bomb);
        expect(bomb.system!.rolls[0].parts).toHaveLength(1);
    });
    it("Ayrelynn concede proficiência e usa Sabedoria uma vez com Estilo de Disparo", () => {
        const a = actor("Tradição de Ayrelynn", "Estilo de Disparo"), gun = weapon(a);
        prepareDwarfActor(a, false); prepareDwarfWeapon(gun); prepareDwarfWeapon(gun);
        expect(a.system!.tracos!.profArmas!.value).toContain("fogo");
        expect(gun.system!.rolls![0].parts[1][1]).toBe("sab");
        expect(gun.system!.rolls![1].parts).toEqual([["2d6", "perfuracao"], ["@sab", "", "anao:ayrelynn"]]);
        expect(danoRollNeedsPadrao(gun.system!.rolls![1] as Parameters<typeof danoRollNeedsPadrao>[0])).toBe(false);
    });
    it("Heredrimm dá +2 e proficiência só às famílias tradicionais, inclusive a Tradição legada", () => {
        const a = actor("Tradição"); a.items!.contents[0].system = { subtipo: "Anão" };
        const axe = weapon(a, "Machado de guerra", "exotica"), sword = weapon(a, "Espada longa", "exotica");
        expect(dwarfAttackBonus(a, axe)).toBe(2); expect(dwarfAttackBonus(a, sword)).toBe(0);
        expect(isWeaponProficient(a as Parameters<typeof isWeaponProficient>[0], axe)).toBe(true);
        expect(isWeaponProficient(a as Parameters<typeof isWeaponProficient>[0], sword)).toBe(false);
    });
});
