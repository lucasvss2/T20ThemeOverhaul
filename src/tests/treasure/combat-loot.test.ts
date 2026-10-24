import { afterEach, describe, expect, it, vi } from "vitest";
import { collectCombatLoot } from "@/treasure";
import type { LootEntry } from "@/treasure/loot-store";

function enemy(id: string, overrides: Record<string, unknown> = {}) {
    const flags: Record<string, unknown> = {};
    const token = { id, disposition: -1, getFlag: (_m: string, k: string) => flags[k],
        setFlag: vi.fn(async (_m: string, k: string, value: unknown) => { flags[k] = value; }) };
    const actor = { type: "npc", name: id, system: { attributes: { pv: { value: 0 }, nd: "2" }, detalhes: { tesouro: "Padrão" } } };
    return { tokenId: id, token, actor, defeated: true, ...overrides };
}
const combat = (combatants: ReturnType<typeof enemy>[], entries: LootEntry[] = []) => ({
    getFlag: () => entries, combatants: { contents: combatants },
});
afterEach(() => vi.restoreAllMocks());

describe("Loot ao encerrar encontro", () => {
    it("coleta os dois inimigos derrotados mesmo sem saque manual", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const a = enemy("token-a"), b = enemy("token-b");
        // Instâncias diferentes do mesmo NPC precisam gerar dois tesouros.
        b.actor = a.actor;
        const entries = await collectCombatLoot(combat([a, b]));
        expect(entries.map(e => e.tokenId)).toEqual(["token-a", "token-b"]);
        expect(entries[0].totalTibar).toBeGreaterThan(0);
        expect(entries.reduce((sum, e) => sum + e.totalTibar, 0)).toBe(entries[0].totalTibar * 2);
        expect(a.token.setFlag).toHaveBeenCalledTimes(1);
    });
    it("preserva o saque já rolado e inclui apenas o inimigo que faltava", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const existing: LootEntry = { tokenId: "a", name: "a", nd: "2", totalTibar: 123, items: [] };
        const a = enemy("a"), b = enemy("b");
        const entries = await collectCombatLoot(combat([a, a, b], [existing]));
        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual(existing);
        expect(a.token.setFlag).not.toHaveBeenCalled();
        expect(b.token.setFlag).toHaveBeenCalledTimes(1);
    });
    it("não saqueia aliados, vivos, personagens ou tokens já saqueados", async () => {
        const ally = enemy("ally"); ally.token.disposition = 1;
        const alive = enemy("alive"); alive.defeated = false; alive.actor.system.attributes.pv.value = 20;
        const pc = enemy("pc"); pc.actor.type = "character";
        const looted = enemy("looted"); looted.token.getFlag = () => true;
        expect(await collectCombatLoot(combat([ally, alive, pc, looted]))).toEqual([]);
    });
});
