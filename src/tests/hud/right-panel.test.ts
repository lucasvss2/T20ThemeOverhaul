import { describe, expect, it } from "vitest";

import { itemsForTab, slotsForTab } from "@/hud/right-panel";

function fakeActor(items: Array<{ id: string; name: string; type: string; img?: string }>): FoundryActor {
    return {
        id: "a1", uuid: "Actor.a1", name: "Teste", ownership: {},
        items: { contents: items as unknown as FoundryItem[], get: (id: string) => items.find(i => i.id === id) as unknown as FoundryItem ?? null },
    } as unknown as FoundryActor;
}

describe("itemsForTab", () => {
    const actor = fakeActor([
        { id: "1", name: "Espada", type: "arma" },
        { id: "2", name: "Armadura", type: "equipamento" },
        { id: "3", name: "Poção", type: "consumivel" },
        { id: "4", name: "Ouro", type: "tesouro" },
        { id: "5", name: "Golpe Certeiro", type: "poder" },
        { id: "6", name: "Bola de Fogo", type: "magia" },
        { id: "7", name: "Classe Guerreiro", type: "classe" },
    ]);

    it("inventário filtra arma/equipamento/consumivel/tesouro", () => {
        const names = itemsForTab(actor, "inventario").map(i => i.name);
        expect(names).toEqual(["Espada", "Armadura", "Poção", "Ouro"]);
    });

    it("poderes filtra type=poder", () => {
        expect(itemsForTab(actor, "poderes").map(i => i.name)).toEqual(["Golpe Certeiro"]);
    });

    it("magias filtra type=magia", () => {
        expect(itemsForTab(actor, "magias").map(i => i.name)).toEqual(["Bola de Fogo"]);
    });

    it("tipos não mapeados (ex.: classe) não aparecem em nenhuma aba", () => {
        const all = [...itemsForTab(actor, "inventario"), ...itemsForTab(actor, "poderes"), ...itemsForTab(actor, "magias")];
        expect(all.some(i => i.name === "Classe Guerreiro")).toBe(false);
    });
});

describe("slotsForTab", () => {
    it("converte itens em slots com fallback de ícone", () => {
        const actor = fakeActor([{ id: "1", name: "Espada", type: "arma", img: "espada.png" }, { id: "2", name: "Adaga", type: "arma" }]);
        const slots = slotsForTab(actor, "inventario");
        expect(slots[0]).toEqual({ key: "1", label: "Espada", iconUrl: "espada.png" });
        expect(slots[1].iconUrl).toBe("icons/svg/item-bag.svg");
    });
});
