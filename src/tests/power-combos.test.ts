import { describe, expect, it, vi } from "vitest";
import { getActivatableItems } from "@/hidden-test/HiddenTestPlayerDialog";
import { itemsForTab } from "@/hud/right-panel";
import { effectivePowerCost, empathyBonus, ingenuityCombo, resolvePowerEffects, visiblePowerItems } from "@/power-combos/format";
import { applyEmpathyBonus, patchPowerEffectCollection, setupPowerCombos } from "@/power-combos/index";
import { hasUsableInitiativeBuff } from "@/iniciativa-buff/index";

function klirenInventor(): FoundryActor {
    const power = (id: string, source: string) => ({
        id, name: `Engenhosidade (${source})`, type: "poder",
        system: { tipo: source === "Kliren" ? "racial" : "ability", subtipo: source, ativacao: { custo: 2 } },
        effects: { contents: [{ id: `${id}effect`, name: "Engenhosidade", disabled: true,
            flags: { tormenta20: { onuse: true, skill: true, custo: "2", items: "" } },
            changes: [{ key: "roll", mode: 2, value: "@int" }],
        }] },
    });
    return {
        type: "character", system: { atributos: { int: { value: 7 } } },
        items: { contents: [power("racial", "Kliren"), power("class", "Inventor")] },
    } as unknown as FoundryActor;
}

describe("Combinação racial/classe — reprodução de Tiago", () => {
    it("oferece uma Engenhosidade, +Int uma vez, por 1 PM no teste de perícia", () => {
        const choices = getActivatableItems(klirenInventor(), "Conhecimento");
        expect(choices).toHaveLength(1);
        expect(choices[0]).toMatchObject({ name: "Engenhosidade", pm: 1, bonusFormula: "+7" });
    });
    it("a aba de poderes do HUD apresenta uma opção para as duas fontes", () => {
        expect(itemsForTab(klirenInventor(), "poderes")).toHaveLength(1);
    });
    it("remover qualquer fonte restaura o custo de 2 PM, sem alterar documentos", () => {
        for (const keep of [0, 1]) {
            const actor = klirenInventor();
            const before = JSON.stringify(actor);
            getActivatableItems(actor, "Conhecimento");
            expect(JSON.stringify(actor)).toBe(before);
            actor.items!.contents = [actor.items!.contents[keep]];
            expect(getActivatableItems(actor, "Conhecimento")[0].pm).toBe(2);
        }
    });
    it("uma cópia repetida da mesma fonte não concede desconto racial", () => {
        const actor = klirenInventor();
        actor.items!.contents = [actor.items!.contents[0], { ...actor.items!.contents[0], id: "copy" }];
        expect(ingenuityCombo(actor)).toBe(false);
        expect(getActivatableItems(actor, "Conhecimento")).toHaveLength(1);
        expect(getActivatableItems(actor, "Conhecimento")[0].pm).toBe(2);
    });
    it("Economia de Habilidade não permite que o custo caia abaixo de 1 PM", () => {
        const actor = klirenInventor();
        actor.items!.contents[0].effects!.contents[0].flags.tormenta20.custo = "1";
        expect(getActivatableItems(actor, "Conhecimento")[0].pm).toBe(1);
    });
    it("preserva Audácia como bônus independente, mesmo que também some um atributo", () => {
        const actor = klirenInventor();
        const independent = structuredClone(actor.items!.contents[0]);
        independent.id = "audacia"; independent.name = "Audácia";
        independent.effects!.contents[0].id = "audaciaeffect";
        independent.effects!.contents[0].name = "Audácia";
        actor.items!.contents.push(independent);
        expect(getActivatableItems(actor, "Conhecimento")).toHaveLength(2);
        expect(itemsForTab(actor, "poderes")).toHaveLength(2);
    });
    it("o filtro usado pelo T20 oferece e aplica a mesma AE por 1 PM, mantendo os IDs", () => {
        const actor = klirenInventor();
        const effects = actor.items!.contents.map(i => ({ ...i.effects!.contents[0], origin: `Actor.test.Item.${i.id}` }));
        const pool = { contents: effects, filter: (predicate: (e: typeof effects[number]) => boolean) => effects.filter(predicate) };
        const nativeActor = { ...actor, effects: pool, system: { pericias: {} } };
        const before = JSON.stringify(effects);
        patchPowerEffectCollection(nativeActor);
        patchPowerEffectCollection(nativeActor);
        const usable = pool.filter(e => !!e.flags.tormenta20.onuse && !!e.flags.tormenta20.skill);
        expect(usable).toHaveLength(1);
        expect(usable[0].id).toBe(effects[0].id);
        expect(usable[0].flags.tormenta20.custo).toBe("1");
        expect(usable[0].flags.tormenta20.attack).toBe(false);
        expect(pool.filter(e => !!e.flags.tormenta20.attack)).toHaveLength(0);
        expect(JSON.stringify(effects)).toBe(before);
        nativeActor.items!.contents.pop();
        expect(pool.filter(e => !!e.flags.tormenta20.skill)).toHaveLength(1);
        expect(pool.filter(e => !!e.flags.tormenta20.skill)[0].flags.tormenta20.custo).toBe("2");
    });
    it("iniciativa reconhece o combo mesmo quando há apenas 1 PM disponível", () => {
        const actor = klirenInventor();
        const effects = actor.items!.contents.map(i => ({ ...i.effects!.contents[0], origin: `Actor.test.Item.${i.id}` }));
        expect(hasUsableInitiativeBuff({ ...actor, effects, system: { attributes: { pm: { value: 1 } } }, rollPericia: async () => undefined })).toBe(true);
    });
});

describe("Empatia Selvagem racial e de classe", () => {
    const power = (id: string, source: string) => ({ id, type: "poder", name: `Empatia Selvagem (${source})`, system: { subtipo: source } });
    it("concede +2 passivo uma única vez, preservando outros bônus de Adestramento", () => {
        const actor = { items: { contents: [power("r", "Dahllan"), power("c", "Druida"), power("h", "Caçador")] },
            system: { pericias: { ades: { outros: 3, bonus: ["1"] } } }, effects: { contents: [], filter: () => [] } };
        applyEmpathyBonus(actor);
        expect(actor.system.pericias.ades.outros).toBe(3);
        expect(actor.system.pericias.ades.bonus).toEqual(["1", "2[Empatia Selvagem combinada]"]);
        applyEmpathyBonus(actor);
        expect(actor.system.pericias.ades.bonus).toHaveLength(2);
        actor.items.contents.splice(1);
        applyEmpathyBonus(actor);
        expect(actor.system.pericias.ades.bonus).toEqual(["1"]);
        actor.items.contents.push(power("c", "Druida"));
        expect(visiblePowerItems(actor, actor.items.contents)).toHaveLength(1);
        expect(effectivePowerCost(actor, actor.items.contents[0], 1)).toBe(0);
    });
    it("a versão racial sozinha e duas versões de classe não ganham +2", () => {
        expect(empathyBonus({ items: { contents: [power("r", "Dahllan")] } })).toBe(0);
        expect(empathyBonus({ items: { contents: [power("c", "Druida"), power("h", "Caçador")] } })).toBe(0);
    });
    it("não oferece o efeito opcional incorreto do compêndio, com ou sem combo", () => {
        const item = { ...power("r", "Dahllan"), effects: { contents: [{ id: "e", name: "Empatia Selvagem", flags: { tormenta20: { onuse: true, skill: true } } }] } };
        const actor = { items: { contents: [item] } };
        expect(resolvePowerEffects(actor, item.effects.contents)).toEqual([]);
    });
});

describe("Aventureiro Ávido melhora Surto Heroico", () => {
    const surto = { id: "s", name: "Surto Heroico", type: "poder", system: { ativacao: { custo: 5 } } };
    const avido = { id: "a", name: "Aventureiro Ávido", type: "poder", system: { ativacao: { custo: 5 } } };
    it("oferece Surto Heroico por 3 PM em qualquer ordem de importação", () => {
        for (const items of [[surto, avido], [avido, surto]]) {
            const actor = { items: { contents: items } };
            expect(visiblePowerItems(actor, items)).toEqual([surto]);
            expect(effectivePowerCost(actor, surto)).toBe(3);
            expect(effectivePowerCost(actor, avido)).toBe(3);
            expect(surto.system.ativacao.custo).toBe(5);
        }
    });
    it("remover o modificador restaura 5 PM e preserva outras reduções", () => {
        expect(effectivePowerCost({ items: { contents: [surto] } }, surto)).toBe(5);
        expect(effectivePowerCost({ items: { contents: [surto, avido] } }, surto, 4)).toBe(2);
        expect(effectivePowerCost({ items: { contents: [avido] } }, avido)).toBe(5);
    });
});

it("carregar a correção não reaplica os bônus de outros poderes nos atores prontos", () => {
    let ready: (() => void) | undefined;
    const ordinary = { items: { contents: [] }, effects: { contents: [], filter: () => [] }, reset: vi.fn(), prepareData: vi.fn() };
    const empathy = { items: { contents: [
        { name: "Empatia Selvagem (Dahllan)", type: "poder", system: { subtipo: "Dahllan" } },
        { name: "Empatia Selvagem (Druida)", type: "poder", system: { subtipo: "Druida" } },
    ] }, effects: { contents: [], filter: () => [] }, reset: vi.fn(), prepareData: vi.fn() };
    vi.stubGlobal("Hooks", { once: (name: string, callback: () => void) => { if (name === "ready") ready = callback; }, on: () => 0 });
    vi.stubGlobal("CONFIG", {
        Actor: { documentClass: { prototype: { applyActiveEffects: () => undefined } } },
        Item: { documentClass: { prototype: { roll: async () => undefined } } },
    });
    vi.stubGlobal("game", { actors: { contents: [ordinary, empathy] } });
    try {
        setupPowerCombos(); ready!();
        expect(ordinary.prepareData).not.toHaveBeenCalled();
        expect(ordinary.reset).not.toHaveBeenCalled();
        expect(empathy.prepareData).not.toHaveBeenCalled();
        expect(empathy.reset).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
});
