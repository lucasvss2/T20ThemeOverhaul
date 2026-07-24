import { describe, expect, it } from "vitest";

import { classesForActor } from "@/hud/classes";

function fakeActor(items: Array<{ id: string; name: string; type: string; system?: Record<string, unknown> }>): FoundryActor {
    return {
        id: "a1", uuid: "Actor.a1", name: "Teste", ownership: {},
        items: { contents: items as unknown as FoundryItem[], get: () => null },
    } as unknown as FoundryActor;
}

describe("classesForActor", () => {
    it("retorna nome + nível para cada item type=classe", () => {
        const actor = fakeActor([
            { id: "1", name: "Guerreiro", type: "classe", system: { niveis: 5 } },
            { id: "2", name: "Espada", type: "arma", system: {} },
            { id: "3", name: "Bardo", type: "classe", system: { niveis: 3 } },
        ]);
        expect(classesForActor(actor)).toEqual([
            { name: "Guerreiro", level: 5 },
            { name: "Bardo", level: 3 },
        ]);
    });

    it("trata niveis ausente como 0", () => {
        const actor = fakeActor([{ id: "1", name: "Guerreiro", type: "classe", system: {} }]);
        expect(classesForActor(actor)).toEqual([{ name: "Guerreiro", level: 0 }]);
    });

    it("sem classes retorna array vazio", () => {
        const actor = fakeActor([{ id: "1", name: "Espada", type: "arma", system: {} }]);
        expect(classesForActor(actor)).toEqual([]);
    });

    it("ator nulo retorna array vazio", () => {
        expect(classesForActor(null)).toEqual([]);
    });
});
