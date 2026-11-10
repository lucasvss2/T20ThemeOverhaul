import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeNecromancySacrifice, findShadowSpaces, necromancySacrifice } from "@/npc-necromancy";
import { computePostDamageReduction, getPostDamageReactions } from "@/reactions";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
    type Servant = {
        id: string; actorLink: boolean; getFlag(): string;
        actor: { system: { attributes: { pv: { value: number } } } };
        parent: { deleteEmbeddedDocuments(type: string, ids: string[]): Promise<void> };
    };
    const flags: Record<string, unknown> = { necromancyInitiate: true };
    const id = "Scene.arena.Token.mage.Actor.npc";
    const parent = { deleteEmbeddedDocuments: vi.fn(async (_type: string, ids: string[]) => {
        parent.tokens.contents = parent.tokens.contents.filter(t => !ids.includes(t.id));
    }), tokens: { contents: [] as Servant[] } };
    const actor = {
        uuid: id, system: { attributes: { pm: { value: 35 } } },
        getFlag: (_scope: string, key: string) => flags[key],
        setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => { flags[key] = value; }),
        items: { contents: [{ name: "Sacrificar Servo", type: "poder", getFlag: () => ({ action: "sacrifice", reduction: 15 }) }] },
    };
    function servant(tokenId: string, owner: string, hp = 1): Servant {
        return { id: tokenId, actorLink: false, getFlag: () => owner, actor: { system: { attributes: { pv: { value: hp } } } }, parent };
    }
    parent.tokens.contents = [servant("mine", id), servant("other", "Scene.arena.Token.other.Actor.npc"), servant("dead", id, 0)];
    vi.stubGlobal("canvas", { scene: { id: "arena", tokens: parent.tokens } });
    vi.stubGlobal("game", { combat: { id: "combat", round: 1, started: true } });
    return { actor, parent, flags };
}

describe("Necromante Iniciado: servos e reação limitada", () => {
    beforeEach(() => fixture());
    it("usa somente servos vivos do UUID sintético deste necromante", () => {
        const { actor } = fixture();
        expect(necromancySacrifice(actor)).toEqual({ reduction: 15, count: 1 });
        expect(getPostDamageReactions({ actor }).map(r => r.reductionHint)).toEqual(["−15"]);
    });
    it("dois cliques concorrentes consomem um único servo e uma única reação", async () => {
        const { actor, parent } = fixture();
        expect(await Promise.all([consumeNecromancySacrifice(actor), consumeNecromancySacrifice(actor)])).toEqual([15, 0]);
        expect(parent.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(parent.deleteEmbeddedDocuments).toHaveBeenCalledWith("Token", ["mine"]);
        expect(parent.tokens.contents.map(t => t.id)).toEqual(["other", "dead"]);
        expect(necromancySacrifice(actor)).toBeUndefined();
    });
    it("reduz em 15, sem anular integralmente golpes maiores", async () => {
        const { actor } = fixture();
        expect(await computePostDamageReduction("sacrificar servo", 40, actor)).toMatchObject({ final: 25, pmSpent: 0 });
    });
    it("não sacrifica servos se a RD já absorveu todo o dano", async () => {
        const { actor, parent } = fixture();
        expect(await computePostDamageReduction("sacrificar servo", 0, actor)).toMatchObject({ final: 0 });
        expect(parent.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });
    it("restaura a disponibilidade se a remoção do servo falhar", async () => {
        const { actor, parent } = fixture();
        parent.deleteEmbeddedDocuments.mockRejectedValueOnce(new Error("conexão"));
        await expect(consumeNecromancySacrifice(actor)).rejects.toThrow("conexão");
        expect(necromancySacrifice(actor)).toEqual({ reduction: 15, count: 1 });
    });
    it("mantém a reação original do Necromante de ND 7", async () => {
        const { actor } = fixture();
        actor.getFlag = () => undefined;
        expect(await computePostDamageReduction("sacrificar servo", 40, actor)).toMatchObject({ final: 0 });
    });
});

describe("Posicionamento dos servos", () => {
    it("evita o espaço do mestre, outras criaturas e os limites da cena", () => {
        const points = findShadowSpaces({ x: 0, y: 0 }, { width: 400, height: 400, grid: { size: 100, distance: 1.5 } },
            [{ x: 0, y: 0, width: 2, height: 2 }], 4);
        expect(points).toHaveLength(4);
        expect(new Set(points.map(p => p.x + "/" + p.y)).size).toBe(4);
        expect(points.every(p => p.x >= 0 && p.y >= 0 && (p.x >= 200 || p.y >= 200) && p.x < 400 && p.y < 400)).toBe(true);
    });
    it("não inventa posições quando a cena está ocupada", () => {
        expect(findShadowSpaces({ x: 0, y: 0 }, { width: 100, height: 100, grid: { size: 100, distance: 1.5 } },
            [{ x: 0, y: 0, width: 1, height: 1 }], 4)).toEqual([]);
    });
});
