import { afterEach, describe, expect, it, vi } from "vitest";

import { hidePortraitHoverPreview, showPortraitHoverPreview } from "@/hud/portrait-hover";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const originalGame = g["game"];
const originalCanvas = g["canvas"];

afterEach(() => {
    g["game"] = originalGame;
    g["canvas"] = originalCanvas;
});

const fakeActor = (id: string): FoundryActor => ({ id, uuid: `Actor.${id}`, name: id, img: "actor.png", ownership: {} }) as unknown as FoundryActor;

function mockGame(moduleActive: boolean) {
    g["game"] = { modules: { get: () => ({ active: moduleActive }) } };
}

describe("showPortraitHoverPreview", () => {
    it("módulo Image Hover ausente/inativo: no-op, não lança", () => {
        mockGame(false);
        g["canvas"] = { hud: { imageHover: { bind: vi.fn(), close: vi.fn() } }, tokens: { controlled: [] } };
        expect(() => showPortraitHoverPreview(fakeActor("a1"))).not.toThrow();
        const hud = (g["canvas"] as { hud: { imageHover: { bind: ReturnType<typeof vi.fn> } } }).hud.imageHover;
        expect(hud.bind).not.toHaveBeenCalled();
    });

    it("ator nulo: no-op", () => {
        mockGame(true);
        g["canvas"] = { hud: { imageHover: { bind: vi.fn(), close: vi.fn() } }, tokens: { controlled: [] } };
        expect(() => showPortraitHoverPreview(null)).not.toThrow();
        const hud = (g["canvas"] as { hud: { imageHover: { bind: ReturnType<typeof vi.fn> } } }).hud.imageHover;
        expect(hud.bind).not.toHaveBeenCalled();
    });

    it("módulo ativo + ator ativo é o token controlado: passa o TOKEN real", () => {
        mockGame(true);
        const actor = fakeActor("a1");
        const controlledToken = { actor, id: "tok1" };
        const bind = vi.fn();
        g["canvas"] = { hud: { imageHover: { bind, close: vi.fn() } }, tokens: { controlled: [controlledToken] } };
        showPortraitHoverPreview(actor);
        expect(bind).toHaveBeenCalledWith(controlledToken);
    });

    it("módulo ativo, sem token controlado (game.user.character): passa um shim com actor/document", () => {
        mockGame(true);
        const actor = fakeActor("a2");
        const bind = vi.fn();
        g["canvas"] = { hud: { imageHover: { bind, close: vi.fn() } }, tokens: { controlled: [] } };
        showPortraitHoverPreview(actor);
        expect(bind).toHaveBeenCalledOnce();
        const shim = bind.mock.calls[0]?.[0] as { actor: FoundryActor; document: { actorLink: boolean; texture: { src: string } } };
        expect(shim.actor).toBe(actor);
        expect(shim.document.actorLink).toBe(true);
        expect(shim.document.texture.src).toBe("actor.png");
    });

    it("hud.bind lançando erro não propaga (cosmético)", () => {
        mockGame(true);
        g["canvas"] = { hud: { imageHover: { bind: () => { throw new Error("boom"); }, close: vi.fn() } }, tokens: { controlled: [] } };
        expect(() => showPortraitHoverPreview(fakeActor("a3"))).not.toThrow();
    });
});

describe("hidePortraitHoverPreview", () => {
    it("módulo ativo: chama close()", () => {
        mockGame(true);
        const close = vi.fn();
        g["canvas"] = { hud: { imageHover: { bind: vi.fn(), close } }, tokens: { controlled: [] } };
        hidePortraitHoverPreview();
        expect(close).toHaveBeenCalledOnce();
    });

    it("módulo inativo: no-op", () => {
        mockGame(false);
        const close = vi.fn();
        g["canvas"] = { hud: { imageHover: { bind: vi.fn(), close } }, tokens: { controlled: [] } };
        hidePortraitHoverPreview();
        expect(close).not.toHaveBeenCalled();
    });
});
