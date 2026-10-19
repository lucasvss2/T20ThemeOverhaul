import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { capangaEffects, incompatibleClass, rapidoBonus } from "@/capanga";
import { capangaLevel, rogueLevel, scaleSneakRolls, sneakDice, sneakLevel } from "@/ataque-furtivo/format";

const actor = (level: number) => ({ id: "capanga", uuid: "Actor.capanga", items: { contents: [{ name: "Capanga", type: "classe", system: { niveis: level } }, { name: "Guerreiro", type: "classe", system: { niveis: 10 } }] }, effects: { contents: [] } });
type Item = Parameters<typeof capangaEffects>[0];
type Effect = Parameters<typeof capangaEffects>[1][number];
const effect = (name: string, key = "roll"): Effect => ({ id:name,name,changes:[{key,mode:2,value:"2"}],clone(data){return {...this,...data};} });
const item = (level: number, type="arma", name="Adaga") => ({ type, name, actor:actor(level) }) as unknown as Item;

describe("Capanga — variante de ladino", () => {
    it.each(Array.from({length:20},(_,i)=>[i+1,Math.ceil((i+1)/2)]))("nível %i tem %id8 sem contar Guerreiro", (level,dice) => {
        expect(capangaLevel(actor(level))).toBe(level);
        expect(rogueLevel(actor(level))).toBe(level); // Pré-requisito de Assassinar.
        expect(sneakDice(capangaLevel(actor(level)))).toBe(dice);
        expect(scaleSneakRolls([{type:"dano",parts:[["1d8","dano",""]]}],level,8)[0].parts?.[0][0]).toBe(`${dice}d8`);
    });
    it("impede Ladino/Capanga juntos sem impedir outras multiclasses", () => {
        expect(incompatibleClass(actor(5),"Ladino")).toBe(true);
        expect(incompatibleClass({items:{contents:[{name:"Ladino",type:"classe"}]}},"Capanga")).toBe(true);
        expect(incompatibleClass(actor(5),"Guerreiro")).toBe(false);
        expect(sneakLevel({items:{contents:[{name:"Ladino",type:"classe",system:{niveis:10}}]}},"Ataque Furtivo Brutal")).toBe(0);
    });
    it.each([[2,0],[3,2],[6,2],[7,4],[14,4],[15,6],[20,6]])("Rápido e Rasteiro no nível %i vale +%i", (level,bonus) => {
        expect(rapidoBonus(level)).toBe(bonus);
    });
    it("limita dano à primeira rodada e escala sem modificar o efeito armazenado", () => {
        const rapid=effect("Rápido e Rasteiro","dano");
        expect(capangaEffects(item(15),[rapid],1)[0].changes[0].value).toBe("6");
        expect(capangaEffects(item(15),[rapid],2)).toEqual([]);
        expect(capangaEffects(item(15),[rapid],1,false)).toEqual([]);
        expect(capangaEffects(item(15),[rapid])).toEqual([]);
        expect(rapid.changes[0].value).toBe("2");
    });
    it("Iniciativa funciona antes do combate e não vaza para outras perícias", () => {
        const rapid=effect("Rápido e Rasteiro — Iniciativa");
        expect(capangaEffects(item(7,"pericia","Iniciativa"),[rapid])[0].changes[0].value).toBe("4");
        expect(capangaEffects(item(7,"pericia","Furtividade"),[rapid])).toEqual([]);
        expect(capangaEffects(item(7,"pericia","Iniciativa"),[rapid],2)).toEqual([]);
    });
    it("Cara Feia só é oferecida nas resistências e Flanquear/Debulhar respeitam níveis", () => {
        const face=effect("Cara Feia");
        expect(capangaEffects(item(4,"pericia","Vontade"),[face])).toHaveLength(1);
        expect(capangaEffects(item(4,"pericia","Atuação"),[face])).toEqual([]);
        expect(capangaEffects(item(3,"pericia","Vontade"),[face])).toEqual([]);
        expect(capangaEffects(item(5),[effect("Flanquear Aprimorado")])).toEqual([]);
        expect(capangaEffects(item(6),[effect("Flanquear Aprimorado")])).toHaveLength(1);
        expect(capangaEffects(item(19),[effect("Debulhar Inimigos")])).toEqual([]);
        expect(capangaEffects(item(20),[effect("Debulhar Inimigos")])).toHaveLength(1);
    });
});

describe("Compêndio Capanga", () => {
    const docs=readdirSync("packs-src/capanga").filter(f=>f.endsWith(".json")).map(f=>JSON.parse(readFileSync(`packs-src/capanga/${f}`,"utf8")));
    it("traz uma classe e nove poderes normais com ícones próprios e links válidos", () => {
        expect(docs.filter(d=>d.type==="classe")).toHaveLength(1);
        expect(docs.filter(d=>d.type==="poder")).toHaveLength(9);
        expect(new Set(docs.map(d=>d.img)).size).toBe(10);
        for(const doc of docs){
            expect(doc._id).toHaveLength(16);
            expect(doc._key).toBe(`!items!${doc._id}`);
            expect(existsSync(doc.img.replace("modules/t20-theme-overhaul/","public/"))).toBe(true);
        }
        const cls=docs.find(d=>d.type==="classe");
        for(const match of cls.system.description.value.matchAll(/capanga.Item.([^\]]+)/g)) expect(docs.some(d=>d._id===match[1])).toBe(true);
        expect(cls.system.pvPorNivel).toBe(3);
        expect(cls.system.pmPorNivel).toBe(4);
        expect(cls.system.pericias.numero).toBe(6);
    });
    it("não cobra Debulhar duas vezes e não embute outra cópia do dano furtivo", () => {
        const power=docs.find(d=>d.name==="Debulhar Inimigos");
        expect(power.system.ativacao.custo).toBe(0);
        expect(power.effects[0].flags.tormenta20.custo).toBe("5");
        expect(power.effects[0].changes).toEqual([]);
    });
});
