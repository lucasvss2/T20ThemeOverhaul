import { afterEach, describe, expect, it, vi } from "vitest";
import { capangaProficiencyUpdate, grantCapangaProficiencies } from "@/capanga/proficiencies";
import { setupCapanga } from "@/capanga";

const actor = (weapons: string[] = [], armor: string[] = []) => ({
    isOwner: true,
    items: { contents: [{ type: "classe", name: "Capanga" }] },
    system: { tracos: { profArmas: { value: weapons }, profArmaduras: { value: armor } } },
    update: vi.fn(async function (this: ReturnType<typeof actor>, data: Record<string, string[]>) {
        if (data["system.tracos.profArmas.value"]) this.system.tracos.profArmas.value = data["system.tracos.profArmas.value"];
        if (data["system.tracos.profArmaduras.value"]) this.system.tracos.profArmaduras.value = data["system.tracos.profArmaduras.value"];
    }),
});
afterEach(() => vi.restoreAllMocks());

describe("Capanga — proficiências ao adicionar", () => {
    it("acrescenta simples/leves preservando proficiências de outras fontes", () => {
        expect(capangaProficiencyUpdate(actor(["marcial", "exotica"], ["pes", "esc"]))).toEqual({
            "system.tracos.profArmas.value": ["marcial", "exotica", "simples"],
            "system.tracos.profArmaduras.value": ["pes", "esc", "lev"],
        });
    });
    it("não concede por adicionar outra classe ou um poder chamado Capanga", () => {
        const a = actor();
        a.items.contents = [{ type: "classe", name: "Ladino" }, { type: "poder", name: "Capanga" }];
        expect(capangaProficiencyUpdate(a)).toEqual({});
    });
    it("eventos concorrentes são idempotentes e não duplicam as listas", async () => {
        const a = actor();
        await Promise.all([grantCapangaProficiencies(a), grantCapangaProficiencies(a)]);
        expect(a.update).toHaveBeenCalledTimes(1);
        expect(capangaProficiencyUpdate(a)).toEqual({});
    });
    it("o hook concede no cliente autor e não repete a mutação em outro cliente", async () => {
        const hooks = vi.spyOn(Hooks, "on");
        setupCapanga();
        const callback = hooks.mock.calls.find(([name]) => name === "createItem")![1];
        const a = actor();
        callback({ type: "classe", name: "Capanga", actor: a }, {}, "outro-cliente");
        await Promise.resolve();
        expect(a.update).not.toHaveBeenCalled();
        callback({ type: "classe", name: "Capanga", actor: a }, {}, game.user!.id);
        await vi.waitFor(() => expect(a.update).toHaveBeenCalledTimes(1));
    });
    it("atores importados com a classe também recebem as proficiências", async () => {
        const hooks = vi.spyOn(Hooks, "on");
        setupCapanga();
        const callback = hooks.mock.calls.find(([name]) => name === "createActor")![1];
        const a = actor(["simples"], []);
        callback(a, {}, game.user!.id);
        await vi.waitFor(() => expect(a.update).toHaveBeenCalledWith({ "system.tracos.profArmaduras.value": ["lev"] }));
    });
});
