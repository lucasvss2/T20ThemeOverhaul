import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeAssassinar, rogueAttackEffects } from "@/ataque-furtivo";

type Item = Parameters<typeof rogueAttackEffects>[0];
type Effect = Parameters<typeof rogueAttackEffects>[1][number];
function effect(name: string, value = "roll"): Effect {
    return {
        id: name, name, disabled: true,
        flags: { tormenta20: { onuse: true, attack: true, custo: "" } },
        changes: [{ key: "dano", mode: 2, value }],
        clone(data: object) { return Object.assign({}, this, data); },
        async update() { return undefined; },
    };
}
const marker = () => ({ ...effect("Assassinar — alvo"), disabled: false, flags: { "t20-theme-overhaul": { assassinar: {
    casterUuid: "Actor.rogue", targetUuid: "Actor.target", targetTokenUuid: "Scene.s.Token.t", targetName: "Alvo", sceneId: "s", endsRemaining: 1,
} } } });
function item(): Item {
    return { type: "arma", actor: {
        uuid: "Actor.rogue", id: "rogue", effects: { contents: [marker()] },
        items: { contents: [
            { name: "Ladino", type: "classe", system: { niveis: 5 } },
            { name: "Ataque Furtivo", type: "poder", system: { rolls: [{ type: "dano", parts: [["1d6", "dano"]] }] } },
        ] },
    } } as unknown as Item;
}
afterEach(() => vi.unstubAllGlobals());

describe("Ataque Furtivo/Assassinar — efeito opcional de arma", () => {
    it("Conhecimento Anatômico substitui o placeholder por dados escalados de Capanga e Assassinar", () => {
        const weapon = item();
        weapon.actor!.items!.contents[0].name = "Capanga";
        weapon.actor!.items!.contents[1].name = "Ataque Furtivo Brutal";
        const anatomical = effect("Ataque Furtivo — Conhecimento Anatômico", "(nº de dados)d(8 ou 10)");
        expect(rogueAttackEffects(weapon, [anatomical])[0].changes[0].value).toBe("3d10");
        vi.stubGlobal("canvas", { scene: { id: "s" } });
        vi.stubGlobal("game", { ...game, user: { ...game.user, targets: new Set([{ document: { uuid: "Scene.s.Token.t" } }]) } });
        expect(rogueAttackEffects(weapon, [anatomical])[0].changes[0].value).toBe("6d10");
        expect(anatomical.changes[0].value).toBe("(nº de dados)d(8 ou 10)");
    });
    it("Conhecimento Anatômico do Ladino usa d8 e não soma com o furtivo básico ativo", () => {
        const base = { ...effect("Ataque Furtivo"), disabled: false };
        const anatomy = { ...effect("Ataque Furtivo — Conhecimento Anatômico", "6d8"), disabled: false };
        const actual = rogueAttackEffects(item(), [base, anatomy, effect("Frio", "1d6[frio]")]);
        expect(actual.map(e => e.changes[0].value)).toEqual(["3d8", "1d6[frio]"]);
    });
    it("Capanga usa d8, dobra com Assassinar e não acumula com furtivo básico", () => {
        const weapon=item();
        weapon.actor!.items!.contents=[{name:"Capanga",type:"classe",system:{niveis:5}},{name:"Ataque Furtivo Brutal",type:"poder",system:{rolls:[{type:"dano",parts:[["1d8","dano"]]}]}}] as Item[];
        const effects=[effect("Ataque Furtivo"),effect("Ataque Furtivo Brutal"),effect("Frio","1d6[frio]")];
        expect(rogueAttackEffects(weapon,effects).map(e=>e.changes[0].value)).toEqual(["3d8","1d6[frio]"]);
        vi.stubGlobal("canvas",{scene:{id:"s"}});
        vi.stubGlobal("game",{...game,user:{...game.user,targets:new Set([{document:{uuid:"Scene.s.Token.t"}}])}});
        expect(rogueAttackEffects(weapon,effects).map(e=>e.changes[0].value)).toEqual(["6d8","1d6[frio]"]);
    });
    it("usa 3d6 no nível 5, exclui cobrança legada e preserva outros efeitos", () => {
        const sneak = effect("Ataque Furtivo"), old = effect("Assassinar"), cold = effect("Outro bônus", "1d6[frio]");
        const actual = rogueAttackEffects(item(), [sneak, old, cold]);
        expect(actual.map(e => e.name)).toEqual(["Ataque Furtivo", "Outro bônus"]);
        expect(actual[0].changes[0].value).toBe("3d6");
        expect(actual[1]).toBe(cold);
        expect(sneak.changes[0].value).toBe("roll");
    });
    it("dobra só o furtivo e só contra o token analisado", () => {
        const originalGame = game;
        vi.stubGlobal("canvas", { scene: { id: "s" } });
        const targets = new Set([{ document: { uuid: "Scene.s.Token.t" } }]);
        vi.stubGlobal("game", { ...originalGame, user: { ...originalGame.user, targets } });
        const effects = [effect("Ataque Furtivo"), effect("Veneno", "2d12[perda]"), effect("Frio", "1d6[frio]")];
        expect(rogueAttackEffects(item(), effects).map(e => e.changes[0].value)).toEqual(["6d6", "2d12[perda]", "1d6[frio]"]);
        targets.clear(); targets.add({ document: { uuid: "Scene.s.Token.outro" } });
        expect(rogueAttackEffects(item(), effects)[0].changes[0].value).toBe("3d6");
        expect(effects[0].changes[0].value).toBe("roll");
    });
    it("ameaça sem classe Ladino mantém seu número próprio de dados", () => {
        const weapon = item();
        weapon.actor!.items!.contents = [{ name: "Ataque Furtivo", type: "poder", system: { rolls: [{ type: "dano", parts: [["5d6", "dano"]] }] } }] as Item[];
        expect(rogueAttackEffects(weapon, [effect("Ataque Furtivo")])[0].changes[0].value).toBe("5d6");
    });
    it("consome apenas a análise correspondente ao alvo e tolera nova chamada após consumir", async () => {
        const mark = marker();
        const actor = { isOwner: true, effects: { contents: [mark] }, deleteEmbeddedDocuments: vi.fn(async () => { actor.effects.contents = []; }) };
        vi.stubGlobal("fromUuidSync", () => actor);
        const payload = { casterUuid: "Actor.rogue", effectId: mark.id, targetUuid: "Actor.target" };
        await consumeAssassinar(payload, "Actor.outro");
        expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        await consumeAssassinar(payload, "Actor.target");
        expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", [mark.id]);
        await consumeAssassinar(payload, "Actor.target");
        expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    });
    it("ataque sem análise não faz mutações no ator", async () => {
        const resolve = vi.fn(); vi.stubGlobal("fromUuidSync", resolve);
        await consumeAssassinar(undefined, "Actor.target");
        expect(resolve).not.toHaveBeenCalled();
    });
});
