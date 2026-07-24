import { afterEach, describe, expect, it, vi } from "vitest";

import { getCombatState, nextTurn, toggleCombatState } from "@/hud/combat-toggle";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const originalGame = g["game"];
const originalGlobalCombat = g["Combat"];

afterEach(() => {
    g["game"] = originalGame;
    g["Combat"] = originalGlobalCombat;
});

function mockGame(opts: { isGM?: boolean; userId?: string; combat?: unknown }) {
    g["game"] = {
        user: { id: opts.userId ?? "u1", isGM: !!opts.isGM },
        combat: opts.combat ?? null,
    };
}

describe("getCombatState", () => {
    it("sem combate ativo: active=false, isMyTurn=false", () => {
        mockGame({ isGM: false, combat: null });
        expect(getCombatState()).toEqual({ active: false, isMyTurn: false, canToggle: false });
    });

    it("combate iniciado (round>0), meu turno", () => {
        mockGame({
            userId: "u1", isGM: false,
            combat: { started: true, combatant: { players: [{ id: "u1" }] } },
        });
        const s = getCombatState();
        expect(s.active).toBe(true);
        expect(s.isMyTurn).toBe(true);
        expect(s.canToggle).toBe(false);
    });

    it("combate iniciado, turno de outro jogador", () => {
        mockGame({
            userId: "u1", isGM: false,
            combat: { started: true, combatant: { players: [{ id: "u2" }] } },
        });
        expect(getCombatState().isMyTurn).toBe(false);
    });

    it("GM controlando o token do combatente ativo: isMyTurn=true mesmo sem estar em `players` (nativo sempre exclui GM)", () => {
        mockGame({
            userId: "gm1", isGM: true,
            combat: { started: true, combatant: { players: [], tokenId: "tok-1" } },
        });
        expect(getCombatState("tok-1").isMyTurn).toBe(true);
    });

    it("GM controlando um token diferente do combatente ativo: isMyTurn=false", () => {
        mockGame({
            userId: "gm1", isGM: true,
            combat: { started: true, combatant: { players: [], tokenId: "tok-1" } },
        });
        expect(getCombatState("tok-2").isMyTurn).toBe(false);
    });

    it("sem token controlado (activeTokenId undefined): não conta como match de token", () => {
        mockGame({
            userId: "gm1", isGM: true,
            combat: { started: true, combatant: { players: [], tokenId: "tok-1" } },
        });
        expect(getCombatState().isMyTurn).toBe(false);
    });

    it("GM sempre pode alternar (canToggle=true), independente do turno", () => {
        mockGame({ isGM: true, combat: null });
        expect(getCombatState().canToggle).toBe(true);
    });

    it("combate existe mas não iniciado (round=0): active=false", () => {
        mockGame({ combat: { started: false, combatant: null } });
        expect(getCombatState().active).toBe(false);
    });
});

describe("toggleCombatState", () => {
    it("não-GM: no-op (não chama nada)", async () => {
        const endCombat = vi.fn();
        mockGame({ isGM: false, combat: { started: true, endCombat } });
        await toggleCombatState();
        expect(endCombat).not.toHaveBeenCalled();
    });

    it("GM com combate iniciado: chama endCombat", async () => {
        const endCombat = vi.fn().mockResolvedValue(undefined);
        mockGame({ isGM: true, combat: { started: true, endCombat } });
        await toggleCombatState();
        expect(endCombat).toHaveBeenCalledOnce();
    });

    it("GM com combate existente não iniciado: chama startCombat", async () => {
        const startCombat = vi.fn().mockResolvedValue(undefined);
        mockGame({ isGM: true, combat: { started: false, startCombat } });
        await toggleCombatState();
        expect(startCombat).toHaveBeenCalledOnce();
    });

    it("GM sem combate: cria, ativa e inicia", async () => {
        const startCombat = vi.fn().mockResolvedValue(undefined);
        const activate = vi.fn();
        const create = vi.fn().mockResolvedValue({ startCombat, activate });
        mockGame({ isGM: true, combat: null });
        g["Combat"] = { create };
        await toggleCombatState();
        expect(create).toHaveBeenCalledOnce();
        expect(activate).toHaveBeenCalledWith({ render: false });
        expect(startCombat).toHaveBeenCalledOnce();
    });
});

describe("nextTurn", () => {
    it("chama combat.nextTurn quando há combate", async () => {
        const nextTurnFn = vi.fn().mockResolvedValue(undefined);
        mockGame({ combat: { nextTurn: nextTurnFn } });
        await nextTurn();
        expect(nextTurnFn).toHaveBeenCalledOnce();
    });

    it("sem combate: não lança erro", async () => {
        mockGame({ combat: null });
        await expect(nextTurn()).resolves.toBeUndefined();
    });
});
