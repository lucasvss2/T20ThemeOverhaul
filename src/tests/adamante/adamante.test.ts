import { describe, it, expect } from "vitest";
import {
    buildWeaponAdamante, buildArmorAdamante, buildEsotericAdamante,
    injectAdamanteUpgrades, ADAMANTE_KEY,
} from "@/adamante/index";
import {
    collectActiveOnes, computeRerollDelta, isEsotericoEquipped, findAdamanteEsoteric,
} from "@/adamante/esoteric";

describe("buildWeaponAdamante", () => {
    it("aumenta o dano em um passo via change 'passos' (mode CUSTOM)", () => {
        const t = buildWeaponAdamante();
        expect(t.changes).toEqual([{ key: "passos", value: "1", mode: 0, priority: 0 }]);
        expect(t.flags.tormenta20).toMatchObject({ onuse: true, upgrade: ADAMANTE_KEY });
        expect(t.transfer).toBe(false);
    });
});

describe("buildArmorAdamante", () => {
    it("fornece RD via tracos.resistencias.dano.bonus (mode ADD), transferível", () => {
        const t = buildArmorAdamante(5);
        expect(t.changes).toEqual([
            { key: "system.tracos.resistencias.dano.bonus", value: "5", mode: 2, priority: 0 },
        ]);
        expect(t.transfer).toBe(true);
        expect(t.flags.tormenta20).toMatchObject({ onuse: false, upgrade: ADAMANTE_KEY });
    });
    it("RD 2 para leve/escudo", () => {
        expect(buildArmorAdamante(2).changes[0].value).toBe("2");
    });
});

describe("buildEsotericAdamante", () => {
    it("é um marcador (sem changes) com flag spell", () => {
        const t = buildEsotericAdamante();
        expect(t.changes).toEqual([]);
        expect(t.flags.tormenta20).toMatchObject({ upgrade: ADAMANTE_KEY, spell: true });
    });
});

describe("injectAdamanteUpgrades", () => {
    it("injeta em weapon, armor (leve/pesada/escudo) e esoteric com status DONE", () => {
        const upgrades = {
            weapon: { status: {} as Record<string, string> },
            armor: {
                status: {} as Record<string, string>,
                general: {}, leve: {}, pesada: {}, escudo: {},
            },
            esoteric: { status: {} as Record<string, string> },
        };
        const n = injectAdamanteUpgrades(upgrades);
        expect(n).toBe(5); // weapon + leve + escudo + pesada + esoteric

        expect((upgrades.weapon as Record<string, unknown>)[ADAMANTE_KEY]).toBeTruthy();
        expect((upgrades.armor.leve as Record<string, unknown>)[ADAMANTE_KEY]).toBeTruthy();
        expect((upgrades.armor.escudo as Record<string, unknown>)[ADAMANTE_KEY]).toBeTruthy();
        expect((upgrades.armor.pesada as Record<string, unknown>)[ADAMANTE_KEY]).toBeTruthy();
        expect((upgrades.esoteric as Record<string, unknown>)[ADAMANTE_KEY]).toBeTruthy();

        // RD por tipo
        const leve = (upgrades.armor.leve as Record<string, { changes: { value: string }[] }>)[ADAMANTE_KEY];
        const pesada = (upgrades.armor.pesada as Record<string, { changes: { value: string }[] }>)[ADAMANTE_KEY];
        expect(leve.changes[0].value).toBe("2");
        expect(pesada.changes[0].value).toBe("5");

        expect(upgrades.weapon.status[ADAMANTE_KEY]).toBe("DONE");
        expect(upgrades.armor.status[ADAMANTE_KEY]).toBe("DONE");
        expect(upgrades.esoteric.status[ADAMANTE_KEY]).toBe("DONE");
    });

    it("cria o objeto status quando ausente e é seguro com config vazio", () => {
        expect(injectAdamanteUpgrades(undefined)).toBe(0);
        const upgrades = { weapon: {} as Record<string, unknown> };
        expect(injectAdamanteUpgrades(upgrades)).toBe(1);
        expect((upgrades.weapon as { status: Record<string, string> }).status[ADAMANTE_KEY]).toBe("DONE");
    });
});

describe("collectActiveOnes", () => {
    const roll = (dice: unknown) => ({ dice }) as Parameters<typeof collectActiveOnes>[0];
    it("coleta as faces de cada dado ativo que rolou 1", () => {
        expect(collectActiveOnes(roll([
            { faces: 6, results: [{ result: 1, active: true }, { result: 4, active: true }] },
            { faces: 8, results: [{ result: 1, active: true }] },
        ]))).toEqual([6, 8]);
    });
    it("ignora dados inativos (descartados por kh/kl)", () => {
        expect(collectActiveOnes(roll([
            { faces: 6, results: [{ result: 1, active: false }, { result: 1, active: true }] },
        ]))).toEqual([6]);
    });
    it("retorna vazio quando não há 1s", () => {
        expect(collectActiveOnes(roll([{ faces: 6, results: [{ result: 3 }, { result: 6 }] }]))).toEqual([]);
    });
    it("trata roll nulo", () => {
        expect(collectActiveOnes(null)).toEqual([]);
    });
});

describe("computeRerollDelta", () => {
    it("soma (novo - 1) de cada dado rerolado", () => {
        expect(computeRerollDelta([4, 6])).toBe(3 + 5); // 8
    });
    it("é 0 quando todos os rerolls caem em 1 de novo", () => {
        expect(computeRerollDelta([1, 1])).toBe(0);
    });
    it("nunca negativo", () => {
        expect(computeRerollDelta([0])).toBe(0);
    });
});

describe("isEsotericoEquipped", () => {
    it("legacy boolean / number / slot", () => {
        expect(isEsotericoEquipped({ system: { equipado: true } })).toBe(true);
        expect(isEsotericoEquipped({ system: { equipado: 1 } })).toBe(true);
        expect(isEsotericoEquipped({ system: { equipado2: { slot: 3 } } })).toBe(true);
        expect(isEsotericoEquipped({ system: { equipado: false } })).toBe(false);
        expect(isEsotericoEquipped({ system: { equipado: 0, equipado2: { slot: 0 } } })).toBe(false);
    });
});

describe("findAdamanteEsoteric", () => {
    const esoteric = (material: string, equipado = true) =>
        ({ type: "equipamento", name: "Cajado", system: { tipo: "esoterico", equipado, upgrades: { material } } });

    it("acha esotérico equipado com material adamante", () => {
        const actor = { items: [esoteric(ADAMANTE_KEY)] };
        expect(findAdamanteEsoteric(actor)?.name).toBe("Cajado");
    });
    it("ignora esotérico não equipado", () => {
        const actor = { items: [esoteric(ADAMANTE_KEY, false)] };
        expect(findAdamanteEsoteric(actor)).toBeNull();
    });
    it("ignora material diferente", () => {
        const actor = { items: [esoteric("mithril")] };
        expect(findAdamanteEsoteric(actor)).toBeNull();
    });
    it("ignora itens que não são esotérico", () => {
        const actor = { items: [{ type: "arma", system: { upgrades: { material: ADAMANTE_KEY } } }] };
        expect(findAdamanteEsoteric(actor)).toBeNull();
    });
});
