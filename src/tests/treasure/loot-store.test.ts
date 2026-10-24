import { describe, expect, it } from "vitest";

import { getLootLog, getPresentPlayers, recordLoot, runLootActionOnce, type LootEntry } from "@/treasure/loot-store";

type Combat = Parameters<typeof recordLoot>[0];

function fakeCombat(): Combat {
    const store: Record<string, unknown> = {};
    return {
        getFlag: (_m: string, k: string) => store[k],
        setFlag: async (_m: string, k: string, v: unknown) => { store[k] = v; },
        unsetFlag: async (_m: string, k: string) => { delete store[k]; },
        started: true,
    } as unknown as Combat;
}

const entry = (tokenId: string, tibar: number): LootEntry => ({ tokenId, name: tokenId, nd: "1", totalTibar: tibar, items: [] });

describe("recordLoot / getLootLog", () => {
    it("overlays repetidos não distribuem dinheiro nem itens duas vezes", async () => {
        let coins = 0, items = 0;
        const coinsAction = async () => { await Promise.resolve(); coins += 250; };
        const itemsAction = async () => { items += 1; };
        await Promise.all([runLootActionOnce("repeat-test:coins", coinsAction), runLootActionOnce("repeat-test:coins", coinsAction)]);
        await runLootActionOnce("repeat-test:coins", coinsAction);
        await Promise.all([runLootActionOnce("repeat-test:items", itemsAction), runLootActionOnce("repeat-test:items", itemsAction)]);
        expect(coins).toBe(250);
        expect(items).toBe(1);
    });
    it("acumula e deduplica por tokenId", async () => {
        const c = fakeCombat();
        await recordLoot(c, entry("a", 10));
        await recordLoot(c, entry("b", 20));
        await recordLoot(c, entry("a", 99)); // duplicado → ignorado
        const log = getLootLog(c);
        expect(log.map(e => e.tokenId)).toEqual(["a", "b"]);
        expect(log.reduce((s, e) => s + e.totalTibar, 0)).toBe(30);
    });
    it("não altera a flag antes de salvar e serializa saques simultâneos", async () => {
        let saved: LootEntry[] = [entry("old", 5)];
        const c: Combat = {
            getFlag: () => saved,
            setFlag: async (_m, _k, value) => {
                // Foundry calcula o diff contra a flag atual. Alterá-la antes de
                // setFlag faz o update desaparecer para os outros clientes.
                expect(value).not.toBe(saved);
                await new Promise(resolve => setTimeout(resolve, 5));
                saved = structuredClone(value as LootEntry[]);
            },
        };
        await Promise.all([recordLoot(c, entry("a", 10)), recordLoot(c, entry("b", 20)), recordLoot(c, entry("a", 99))]);
        expect(saved.map(e => e.tokenId)).toEqual(["old", "a", "b"]);
        expect(saved.reduce((sum, e) => sum + e.totalTibar, 0)).toBe(35);
    });
});

describe("getPresentPlayers", () => {
    it("só personagens com dono jogador, dedup por ator", () => {
        const combatants = { contents: [
            { actor: { id: "p1", type: "character", hasPlayerOwner: true, name: "Alice" }, tokenId: "t1" },
            { actor: { id: "n1", type: "npc", hasPlayerOwner: false, name: "Goblin" }, tokenId: "t2" },
            { actor: { id: "p2", type: "character", hasPlayerOwner: true, name: "Bob" }, tokenId: "t3" },
            { actor: { id: "p1", type: "character", hasPlayerOwner: true, name: "Alice" }, tokenId: "t4" },
        ] };
        const c = { combatants } as unknown as Parameters<typeof getPresentPlayers>[0];
        expect(getPresentPlayers(c).map(p => p.name)).toEqual(["Alice", "Bob"]);
    });
    it("combate vazio/nulo → []", () => {
        expect(getPresentPlayers(null)).toEqual([]);
    });
});
