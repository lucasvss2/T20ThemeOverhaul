import { describe, expect, it } from "vitest";
import { injectMixedLossBonuses, installVenenoAprimorado } from "@/veneno-aprimorado";
import { nightDaggerRolls } from "@/adaga-noturna";
import { injectAcuidadeDano } from "@/t20-fixes/acuidade-arma";

function fixture() {
    return {
        id: "dagger", type: "arma",
        system: { equipado: true, empunhadura: "leve", proposito: "corpo-a-corpo", rolls: [
            { type: "ataque", parts: [["1d20", ""], ["luta", "for"]] },
            { type: "dano", parts: [["1d4", "perfuracao"], ["padrao", ""], ["2d12", "perda"]] },
        ] },
        actor: { flags: { tormenta20: { acuidade: true } }, system: {
            atributos: { for: { value: 1 }, des: { value: 4 } },
            modificadores: { dano: { geral: ["2"], cac: ["1"], ad: ["9"] } },
        } },
    };
}

describe("Arma com Acuidade, Adaga Noturna e perda de PV", () => {
    it("preserva atributo, frio e bônus fixos uma vez em usos consecutivos", () => {
        const source = fixture();
        const original = structuredClone(source.system.rolls);
        for (let attack = 0; attack < 3; attack++) {
            const item = fixture();
            item.system.rolls = nightDaggerRolls({ id: item.id, type: item.type, system: item.system }, [{ flags: { "t20-theme-overhaul": { adagaNoturnaWeaponId: "dagger" } } }]) as typeof item.system.rolls;
            const before = structuredClone(item.system.rolls);
            const restoreBonus = injectMixedLossBonuses(item);
            const restoreAttribute = injectAcuidadeDano(item as unknown as Parameters<typeof injectAcuidadeDano>[0]);
            expect(item.system.rolls[1].parts).toEqual([
                ["1d4", "perfuracao"], ["@des", "", undefined], ["2d12", "perda"],
                ["1d6", "frio", "Adaga Noturna"], ["@dano", "perfuracao", ""], ["@danoCAC", "perfuracao", ""],
            ]);
            restoreAttribute(); restoreBonus();
            expect(item.system.rolls).toEqual(before);
        }
        expect(source.system.rolls).toEqual(original);
    });
    it("não duplica os bônus nos ataques comuns nem os acrescenta à perda pura", () => {
        for (const parts of [[["1d4", "perfuracao"]], [["2d12", "perda"]]]) {
            const item = fixture(); item.system.rolls[1].parts = parts;
            const before = structuredClone(item.system.rolls);
            injectMixedLossBonuses(item)();
            expect(item.system.rolls).toEqual(before);
        }
    });
    it("respeita a perícia da arma: Pontaria recebe bônus à distância", () => {
        const item = fixture(); item.system.rolls[0].parts[1][0] = "pont";
        const restore = injectMixedLossBonuses(item);
        expect(item.system.rolls[1].parts.slice(-2)).toEqual([["@dano", "perfuracao", ""], ["@danoAD", "perfuracao", ""]]);
        restore();
    });
    it("o wrapper restaura a fonte depois da rolagem, inclusive se ela falhar", async () => {
        class Item {
            type = "arma";
            system = fixture().system;
            actor = fixture().actor;
            get validOnUseEffects() { return []; }
            roll() { return undefined; }
            async rollDamage(fail = false) {
                const parts = structuredClone(this.system.rolls[1].parts);
                if (fail) throw new Error("rolagem interrompida");
                return parts;
            }
        }
        installVenenoAprimorado(Item.prototype);
        const item = new Item(), original = structuredClone(item.system.rolls);
        expect((await item.rollDamage()).slice(-2)).toEqual([["@dano", "perfuracao", ""], ["@danoCAC", "perfuracao", ""]]);
        expect(item.system.rolls).toEqual(original);
        await expect(item.rollDamage(true)).rejects.toThrow("rolagem interrompida");
        expect(item.system.rolls).toEqual(original);
    });
});
