import { afterEach, describe, expect, it } from "vitest";

import { getActiveActor } from "@/hud/active-actor";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const originalCanvas = g["canvas"];
const originalGame = g["game"];

afterEach(() => {
    g["canvas"] = originalCanvas;
    g["game"] = originalGame;
});

const fakeActor = (name: string): FoundryActor => ({ id: name, uuid: `Actor.${name}`, name, ownership: {} }) as unknown as FoundryActor;

describe("getActiveActor", () => {
    it("token controlado tem prioridade sobre game.user.character", () => {
        g["canvas"] = { tokens: { controlled: [{ actor: fakeActor("token-actor") }] } };
        g["game"] = { user: { character: fakeActor("char-actor") } };
        expect(getActiveActor()?.id).toBe("token-actor");
    });

    it("sem token controlado, cai pro game.user.character", () => {
        g["canvas"] = { tokens: { controlled: [] } };
        g["game"] = { user: { character: fakeActor("char-actor") } };
        expect(getActiveActor()?.id).toBe("char-actor");
    });

    it("sem token e sem character → null", () => {
        g["canvas"] = { tokens: { controlled: [] } };
        g["game"] = { user: { character: null } };
        expect(getActiveActor()).toBeNull();
    });

    it("canvas indefinido não lança erro", () => {
        g["canvas"] = undefined;
        g["game"] = { user: { character: fakeActor("char-actor") } };
        expect(getActiveActor()?.id).toBe("char-actor");
    });

    it("token controlado sem ator (unlinked pending) cai pro character", () => {
        g["canvas"] = { tokens: { controlled: [{ actor: null }] } };
        g["game"] = { user: { character: fakeActor("char-actor") } };
        expect(getActiveActor()?.id).toBe("char-actor");
    });
});
