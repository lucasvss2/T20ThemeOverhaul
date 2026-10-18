import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasVenenoAprimorado, improvedPoisonEffects, improvedPoisonRolls, installVenenoAprimorado } from "@/veneno-aprimorado";

const power = { name: "Veneno Aprimorado", type: "poder" };
const actor = (items = [power]) => ({ items: { contents: items } });
const poisonRolls = () => [{ name: "Perda de Pontos de Vida", key: "dano0", type: "dano", parts: [["1d12", "perda", ""]] }];

class Effect {
    id = "poison-effect";
    name = "Natureza Venenosa";
    disabled = true;
    flags = { tormenta20: { onuse: true, attack: true, skill: false, custo: "1" } };
    changes = [{ key: "dano", value: "1d12", mode: 2, priority: 0 }];
    clone(data: { changes: Effect["changes"] }, options: { keepId: boolean }): Effect {
        const clone = Object.assign(new Effect(), structuredClone({ ...this, ...data }));
        if (!options.keepId) clone.id = "different-id";
        return clone;
    }
}

describe("Veneno Aprimorado — elegibilidade", () => {
    it("reconhece o poder, inclusive com prefixo racial e variação de caixa", () => {
        expect(hasVenenoAprimorado(actor())).toBe(true);
        expect(hasVenenoAprimorado(actor([{ ...power, name: "Medusa: VENENO APRIMORADO" }]))).toBe(true);
    });
    it("não ativa só pela raça, por equipamento homônimo ou por outro poder de veneno", () => {
        expect(hasVenenoAprimorado(actor([{ name: "Medusa", type: "race" }]))).toBe(false);
        expect(hasVenenoAprimorado(actor([{ ...power, type: "equipamento" }]))).toBe(false);
        expect(hasVenenoAprimorado(actor([{ ...power, name: "Veneno Aprimorado Superior" }]))).toBe(false);
        expect(hasVenenoAprimorado(null)).toBe(false);
    });
});

describe("Veneno Aprimorado — rolagens", () => {
    it("substitui a perda base, preservando tipo, bônus e dados originais", () => {
        const original = poisonRolls();
        original[0].parts.push(["2", "perda", "bônus"]);
        const improved = improvedPoisonRolls(original);
        expect(improved[0]).toMatchObject({ name: "Perda de Pontos de Vida", key: "dano0", parts: [["2d12", "perda", ""], ["2", "perda", "bônus"]] });
        expect(original[0].parts[0][0]).toBe("1d12");
    });
    it("não modifica dano comum, cura ou fórmulas personalizadas", () => {
        const original = [
            { type: "dano", parts: [["1d12", "perfuracao"]] },
            { type: "dano", parts: [["1d12", "curapv"]] },
            { type: "formula", parts: [["1d12", "perda"]] },
            { type: "dano", parts: [["3d12", "perda"]] },
        ];
        expect(improvedPoisonRolls(original)).toEqual(original);
    });
    it("é idempotente: nunca acrescenta 2d12 por cima do veneno", () => {
        const improved = improvedPoisonRolls(poisonRolls());
        expect(improvedPoisonRolls(improved)).toEqual(improved);
    });
});

describe("Veneno Aprimorado — efeito opcional no ataque", () => {
    it("mantém id, custo de 1 PM, seleção opcional e modo ADD no clone", () => {
        const original = new Effect();
        const [improved] = improvedPoisonEffects([original]);
        expect(improved).not.toBe(original);
        expect(improved).toMatchObject({ id: original.id, disabled: true, flags: original.flags, changes: [{ key: "dano", mode: 2, value: "2d12", priority: 0 }] });
        expect(original.changes[0].value).toBe("1d12");
        expect(improvedPoisonEffects([improved])[0]).toBe(improved);
    });
    it("preserva o flavor de perda se o efeito já estiver configurado assim", () => {
        const effect = new Effect();
        effect.changes[0].value = "1d12[perda]";
        expect(improvedPoisonEffects([effect])[0].changes[0].value).toBe("2d12[perda]");
    });
    it("não altera a resistência a veneno +5 nem efeitos de outras origens", () => {
        const resistance = new Effect();
        resistance.flags.tormenta20.attack = false;
        resistance.flags.tormenta20.skill = true;
        resistance.changes = [{ key: "roll", mode: 2, value: "5", priority: 0 }];
        const otherPoison = Object.assign(new Effect(), { name: "Outro Veneno" });
        const custom = new Effect();
        custom.changes[0].value = "3d12";
        const effects = [resistance, otherPoison, custom];
        expect(improvedPoisonEffects(effects)).toEqual(effects);
        expect(improvedPoisonEffects(effects)[0]).toBe(resistance);
    });
});

function runtime() {
    class Item {
        id = "original-item-id";
        name = "Natureza Venenosa";
        type = "poder";
        actor = actor();
        system = { rolls: poisonRolls() };
        effects = [new Effect()];
        get validOnUseEffects(): Effect[] { return this.effects; }
        clone(_data: object, options: { keepId: boolean }): Item {
            const clone = Object.assign(new Item(), this);
            clone.system = structuredClone(this.system);
            if (!options.keepId) clone.id = "different-item-id";
            return clone;
        }
        updateSource(data: object): void {
            this.system.rolls = (data as { "system.rolls": Item["system"]["rolls"] })["system.rolls"];
        }
        // O uso nativo clona o item de novo antes de configurar ou rolar.
        roll(options: object = {}): { item: Item; options: object } {
            return { item: this.clone({}, { keepId: true }), options };
        }
    }
    return Item;
}

describe("Veneno Aprimorado — integração com ItemT20", () => {
    it("usa 2d12 com e sem diálogo, preservando ator, id e fonte originais", () => {
        const Item = runtime();
        expect(installVenenoAprimorado(Item.prototype)).toBe(true);
        const item = new Item();
        for (const options of [{}, { configureDialog: false }]) {
            const used = item.roll(options);
            expect(used.item.system.rolls[0].parts).toEqual([["2d12", "perda", ""]]);
            expect(used.item.id).toBe(item.id);
            expect(used.item.actor).toBe(item.actor);
            expect(used.options).toBe(options);
        }
        expect(item.system.rolls[0].parts[0][0]).toBe("1d12");
    });
    it("adicionar, duplicar e remover o passivo muda só o próximo uso", () => {
        const Item = runtime();
        installVenenoAprimorado(Item.prototype);
        const item = new Item();
        item.actor.items.contents = [];
        expect(item.roll().item.system.rolls[0].parts[0][0]).toBe("1d12");
        item.actor.items.contents.push(power, power);
        expect(item.roll().item.system.rolls[0].parts[0][0]).toBe("2d12");
        item.actor.items.contents = [];
        expect(item.roll().item.system.rolls[0].parts[0][0]).toBe("1d12");
    });
    it("o ataque clonado recebe o efeito melhorado sem modificar arma ou ator", () => {
        const Item = runtime();
        installVenenoAprimorado(Item.prototype);
        const weapon = Object.assign(new Item(), { type: "arma", name: "Adaga" });
        const used = weapon.roll().item;
        expect(used.validOnUseEffects[0].changes[0].value).toBe("2d12");
        expect(weapon.effects[0].changes[0].value).toBe("1d12");
        weapon.actor.items.contents = [];
        expect(used.validOnUseEffects[0].changes[0].value).toBe("1d12");
    });
    it("não altera outros poderes ou efeitos oferecidos em testes de perícia", () => {
        const Item = runtime();
        installVenenoAprimorado(Item.prototype);
        const other = Object.assign(new Item(), { name: "Outro Poder" });
        expect(other.roll().item.system.rolls[0].parts[0][0]).toBe("1d12");
        expect(other.validOnUseEffects).toBe(other.effects);
    });
    it("instala uma vez e falha com segurança em uma API incompatível", () => {
        const Item = runtime();
        installVenenoAprimorado(Item.prototype);
        const wrapped = Item.prototype.roll;
        installVenenoAprimorado(Item.prototype);
        expect(Item.prototype.roll).toBe(wrapped);
        expect(installVenenoAprimorado({})).toBe(false);
    });
});

it("distribui o passivo racial com pré-requisito Con 1 e sem novo custo ou rolagem", () => {
    const powerData = JSON.parse(readFileSync(new URL("../../../packs-src/poderes/veneno-aprimorado.json", import.meta.url), "utf8"));
    expect(powerData._id).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(powerData._key).toBe(`!items!${powerData._id}`);
    expect(powerData).toMatchObject({ name: "Veneno Aprimorado", type: "poder", effects: [], system: { tipo: "racial", subtipo: "Medusa", ativacao: { execucao: "passive", custo: 0 }, rolls: [] } });
    expect(powerData.system.description.value).toContain("Con 1");
    expect(powerData.system.description.value).toContain("2d12 PV");
});
