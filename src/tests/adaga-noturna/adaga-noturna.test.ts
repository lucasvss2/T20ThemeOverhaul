import { describe, expect, it, vi } from "vitest";
import { activateNightDagger, isPiercingWeapon, nightDaggerEffects, nightDaggerRolls } from "@/adaga-noturna";

const weapon = (id = "dagger", damage = "perfuracao") => ({ id, name: id, type: "arma", system: { equipado: true, rolls: [{ type: "dano", parts: [["1d4", damage]] }] } });
function fixture() {
    const effects: any[] = []; // Minimal document seam; the live test exercises native rolls.
    const actor = { system: { attributes: { pm: { value: 5, temp: 0 } } }, effects: { contents: effects },
        spendMana: vi.fn(async () => { actor.system.attributes.pm.value--; }),
        createEmbeddedDocuments: vi.fn(async (_type: string, data: any[]) => { effects.push(...data); return data; }),
        deleteEmbeddedDocuments: vi.fn(async () => undefined) };
    return { actor, effects };
}

describe("Adaga Noturna — regressão de custo, escopo e tipo de dano", () => {
    it("cobra uma vez e produz frio só na arma escolhida, sem mudar a fonte", async () => {
        const { actor, effects } = fixture();
        const dagger = weapon();
        await activateNightDagger(actor, dagger, "power-uuid", "icon.webp");
        expect(actor.spendMana).toHaveBeenCalledTimes(1);
        expect(actor.system.attributes.pm.value).toBe(4);
        const marker = effects[0];
        const first = nightDaggerRolls(dagger, effects);
        const second = nightDaggerRolls(dagger, effects);
        expect(first?.[0].parts).toEqual([["1d4", "perfuracao"], ["1d6", "frio", "Adaga Noturna"]]);
        expect(second).toEqual(first);
        expect(actor.spendMana).toHaveBeenCalledTimes(1);
        const other = weapon("other"), sword = weapon("dagger", "corte");
        expect(nightDaggerRolls(other, effects)).toBe(other.system.rolls);
        expect(nightDaggerRolls(sword, effects)).toBe(sword.system.rolls);
        expect(nightDaggerRolls(dagger, [])).toBe(dagger.system.rolls);
        expect(marker).toMatchObject({ changes: [], flags: { "t20-theme-overhaul": { dur: { managed: true, kind: "scene" } } } });
        expect(dagger.system.rolls[0].parts[0][0]).toBe("1d4");
    });
    it("arma inelegível ou falta de PM não cobra nem cria efeito", async () => {
        const { actor } = fixture();
        expect(await activateNightDagger(actor, weapon("sword", "corte"), "uuid", "icon")).toBe(false);
        actor.system.attributes.pm.value = 0;
        expect(await activateNightDagger(actor, weapon(), "uuid", "icon")).toBe(false);
        expect(actor.spendMana).not.toHaveBeenCalled();
        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
    it("não empilha nem cobra novamente pela mesma arma já encantada", async () => {
        const { actor } = fixture();
        await activateNightDagger(actor, weapon(), "uuid", "icon");
        expect(await activateNightDagger(actor, weapon(), "uuid", "icon")).toBe(false);
        expect(actor.spendMana).toHaveBeenCalledTimes(1);
    });
    it("retira o efeito legado de ataque e preserva outros poderes", () => {
        const legacy = { name: "Adaga Noturna", flags: { tormenta20: { onuse: true, attack: true } } };
        const other = { ...legacy, name: "Natureza Venenosa" };
        expect(nightDaggerEffects([legacy, other])).toEqual([other]);
        expect(nightDaggerEffects([])).toEqual([]);
    });
    it("exige arma empunhada com parcela de perfuração e aceita dano misto", () => {
        expect(isPiercingWeapon(weapon())).toBe(true);
        expect(isPiercingWeapon(weapon("sword", "corte"))).toBe(false);
        expect(isPiercingWeapon({ ...weapon(), system: { ...weapon().system, equipado: false } })).toBe(false);
        const mixed = weapon(); mixed.system.rolls[0].parts.push(["1d4", "corte"]);
        expect(isPiercingWeapon(mixed)).toBe(true);
    });
});
