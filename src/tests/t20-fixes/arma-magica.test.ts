import { describe, it, expect } from "vitest";
import {
    sanitizeBuffEffectGroups,
    isArmaMagicaSpell,
    buildAtributoAtqEffect,
    type BuffEffectData,
} from "@/t20-fixes/arma-magica";

function armaMagicaGroups(): BuffEffectData[][] {
    return [[{
        name: "Arma Mágica",
        changes: [
            { key: "ataque", value: "1", mode: 2 },
            { key: "dano&magico", value: "1", mode: 2 },
            { key: "?.items.arma", value: "items.name", mode: 0 },
        ],
    }]];
}

describe("isArmaMagicaSpell", () => {
    it("casa o nome com/sem acento", () => {
        expect(isArmaMagicaSpell("Arma Mágica")).toBe(true);
        expect(isArmaMagicaSpell("arma magica")).toBe(true);
        expect(isArmaMagicaSpell("Armadura Arcana")).toBe(false);
    });
});

describe("sanitizeBuffEffectGroups", () => {
    it("dropa keys '?'* e reescreve dano&magico → dano (Arma Mágica)", () => {
        const groups = armaMagicaGroups();
        const changed = sanitizeBuffEffectGroups("Arma Mágica", groups);
        expect(changed).toBe(true);
        expect(groups[0]![0]!.changes).toEqual([
            { key: "ataque", value: "1", mode: 2 },
            { key: "dano", value: "1", mode: 2 },
        ]);
    });
    it("guard geral: dropa '?'* mesmo em outra magia, sem tocar no resto", () => {
        const groups: BuffEffectData[][] = [[{
            name: "Outra",
            changes: [
                { key: "?.x", value: "1", mode: 0 },
                { key: "dano&magico", value: "1", mode: 2 },
            ],
        }]];
        const changed = sanitizeBuffEffectGroups("Outra Magia", groups);
        expect(changed).toBe(true);
        // dano&magico só é reescrita para Arma Mágica
        expect(groups[0]![0]!.changes).toEqual([{ key: "dano&magico", value: "1", mode: 2 }]);
    });
    it("no-op em grupos limpos", () => {
        const groups: BuffEffectData[][] = [[{ name: "Buff", changes: [{ key: "ataque", value: "1", mode: 2 }] }]];
        expect(sanitizeBuffEffectGroups("Buff", groups)).toBe(false);
    });
});

describe("buildAtributoAtqEffect", () => {
    it("effect onuse attack com atributoAtq OVERRIDE", () => {
        const eff = buildAtributoAtqEffect("car", "Carisma");
        expect(eff.changes).toEqual([{ key: "atributoAtq", value: "car", mode: 5, priority: 20 }]);
        const t20 = eff.flags?.["tormenta20"] as Record<string, unknown>;
        expect(t20["onuse"]).toBe(true);
        expect(t20["attack"]).toBe(true);
        expect(eff.disabled).toBe(true);
        expect(eff.name).toContain("Carisma");
    });
});
