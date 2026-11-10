import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeNecromancySacrifice, necromancySacrifice, shadowData } from "@/npc-necromancy";
import { validateShadowPosition } from "@/npc-necromancy/placement";
import { buildShadowTemplate, SHADOW_IMAGE } from "@/npc-necromancy/servant";
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
    const origin = { x: 1000, y: 1000, width: 1, height: 1 };
    const bounds = { x: 500, y: 500, width: 2000, height: 2000 };
    const valid = (point: { x: number; y: number }, occupied = [origin], selected: Array<{ x: number; y: number }> = [], measured?: number) =>
        validateShadowPosition(point, origin, bounds, 100, 1.5, occupied, selected, measured);
    it("aceita o alcance curto inclusive no limite", () => {
        expect(valid({ x: 1600, y: 1000 })).toBe(true);
        expect(valid({ x: 1700, y: 1000 })).toBe(false);
    });
    it("respeita a origem real da cena e as bordas do token inteiro", () => {
        expect(valid({ x: 400, y: 1000 })).toBe(false);
        expect(valid({ x: 2450, y: 1000 }, [], [], 1.5)).toBe(false);
    });
    it("recusa o mestre, criaturas maiores e posições já escolhidas", () => {
        expect(valid({ x: 1000, y: 1000 })).toBe(false);
        expect(valid({ x: 1200, y: 1100 }, [{ x: 1100, y: 1000, width: 2, height: 2 }])).toBe(false);
        expect(valid({ x: 1100, y: 1000 }, [origin], [{ x: 1100, y: 1000 }])).toBe(false);
        expect(valid({ x: 1100, y: 1000 })).toBe(true);
    });
    it("usa a medida da grade quando o Foundry a fornece", () => {
        expect(valid({ x: 1500, y: 1500 }, [], [], 9)).toBe(true);
        expect(valid({ x: 1500, y: 1500 }, [], [], 10.5)).toBe(false);
    });
    it("recusa coordenadas inválidas", () => {
        expect(valid({ x: NaN, y: 1000 })).toBe(false);
        expect(valid({ x: 1000, y: Infinity })).toBe(false);
    });
});

describe("Ficha reutilizável do Servo de Sombra", () => {
    it("empacota atributos, imunidades, deslocamento, dano e arte do poder", () => {
        const doc = buildShadowTemplate();
        expect(doc.img).toBe(SHADOW_IMAGE);
        expect(doc.prototypeToken).toMatchObject({ width: 1, height: 1, actorLink: false, texture: { src: SHADOW_IMAGE } });
        expect(doc.system.attributes.pv).toMatchObject({ value: 1, max: 1 });
        expect(doc.system.attributes.defesa.base + doc.system.atributos.des.value + doc.system.attributes.defesa.outros).toBe(22);
        expect(doc.system.attributes.movement.walk.base).toBe(9);
        expect(Object.values(doc.system.atributos).map(a => a.value)).toEqual([3, 3, 0, 0, 0, 0]);
        expect(doc.items[0]?.system.rolls[0]?.parts[0]).toEqual(["1d8", "trevas", ""]);
        expect(doc.system.tracos.resistencias.frio.imunidade).toBe(true);
        expect(Object.values(doc.system.tracos.resistencias).every(r => Array.isArray(r.bonus))).toBe(true);
    });
    it("vincula somente as cópias conjuradas ao mestre exato", () => {
        const { actor } = fixture();
        const doc = shadowData(actor as never, 22, "1d8");
        expect(doc).not.toHaveProperty("_id");
        expect(doc).not.toHaveProperty("folder");
        expect(doc.flags).toEqual({ "t20-theme-overhaul": { necromancyHelper: true, necromancyShadowOf: actor.uuid } });
        expect(buildShadowTemplate().flags["t20-theme-overhaul"]).toEqual({ necromancyTemplate: true });
    });
});
