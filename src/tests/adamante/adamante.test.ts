import { describe, it, expect } from "vitest";
import {
    buildWeaponAdamante, buildArmorAdamante, buildEsotericAdamante,
    injectAdamanteUpgrades, ADAMANTE_KEY,
    stepDie, isAdamanteWeapon, injectAdamanteWeaponStep,
} from "@/adamante/index";
import {
    collectActiveOnes, computeRerollDelta, isEsotericoEquipped, findAdamanteEsoteric,
} from "@/adamante/esoteric";

describe("buildWeaponAdamante", () => {
    it("é um marcador (sem changes) — o passo é feito pelo patch de rollDamage", () => {
        const t = buildWeaponAdamante();
        expect(t.changes).toEqual([]);
        expect(t.flags.tormenta20).toMatchObject({ upgrade: ADAMANTE_KEY });
        expect(t.transfer).toBe(false);
    });
});

const PASSOS = [
    ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "1d12", "3d6", "4d6", "4d8", "4d10", "4d12"],
    ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "3d8", "4d8", "4d10", "4d12"],
    ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "2d10", "3d10", "4d10", "4d12"],
];

describe("stepDie", () => {
    it("sobe um passo (1d8→1d10)", () => {
        expect(stepDie("1d8", PASSOS)).toBe("1d10");
    });
    it("preserva sufixo de tipo/bônus", () => {
        expect(stepDie("1d8[corte]", PASSOS)).toBe("1d10[corte]");
        expect(stepDie("2d6+3", PASSOS)).toBe("2d8+3");
    });
    it("satura no topo da linha", () => {
        expect(stepDie("4d12", PASSOS)).toBe("4d12");
    });
    it("no-op se não começar com NdF ou dado fora da tabela", () => {
        expect(stepDie("@for", PASSOS)).toBe("@for");
        expect(stepDie("1d7", PASSOS)).toBe("1d7");
    });
});

describe("isAdamanteWeapon", () => {
    it("true só p/ arma com material adamant", () => {
        expect(isAdamanteWeapon({ type: "arma", system: { upgrades: { material: ADAMANTE_KEY } } })).toBe(true);
        expect(isAdamanteWeapon({ type: "arma", system: { upgrades: { material: "mithril" } } })).toBe(false);
        expect(isAdamanteWeapon({ type: "equipamento", system: { upgrades: { material: ADAMANTE_KEY } } })).toBe(false);
    });
});

describe("injectAdamanteWeaponStep (in-place + restore)", () => {
    type StepItem = Parameters<typeof injectAdamanteWeaponStep>[0];
    const mk = (material: string, die = "1d8") => ({
        type: "arma",
        system: { upgrades: { material }, rolls: [
            { type: "ataque", parts: [["1d20", "", ""], ["luta", "", ""]] },
            { type: "dano", parts: [[die, "corte", ""], ["@for", "", ""]] },
        ] },
    } as StepItem);
    const danoDie = (it: StepItem) => it.system?.rolls?.[1]?.parts?.[0]?.[0];

    it("sobe o dado da arma Adamante e restaura", () => {
        const it = mk(ADAMANTE_KEY);
        const restore = injectAdamanteWeaponStep(it, PASSOS);
        expect(danoDie(it)).toBe("1d10");
        restore();
        expect(danoDie(it)).toBe("1d8");
    });
    it("no-op p/ arma sem Adamante", () => {
        const it = mk("mithril");
        injectAdamanteWeaponStep(it, PASSOS);
        expect(danoDie(it)).toBe("1d8");
    });
    it("só mexe na part do dado, não no @for", () => {
        const it = mk(ADAMANTE_KEY);
        injectAdamanteWeaponStep(it, PASSOS);
        expect(it.system?.rolls?.[1]?.parts?.[1]?.[0]).toBe("@for");
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
