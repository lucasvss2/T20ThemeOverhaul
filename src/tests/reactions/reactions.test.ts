import { describe, it, expect } from "vitest";
import {
    DEFENSE_REACTIONS,
    normalizeName,
    canBlock,
    reactionAvailable,
    getBlockingDefenseReactions,
} from "@/reactions";

describe("DEFENSE_REACTIONS registry", () => {
    it("contém as 3 magias confirmadas com custos corretos", () => {
        expect(DEFENSE_REACTIONS["armadura arcana"]).toMatchObject({ bonus: 5, pm: 2 });
        expect(DEFENSE_REACTIONS["escudo da fe"]).toMatchObject({ bonus: 2, pm: 1 });
        expect(DEFENSE_REACTIONS["salto dimensional"]).toMatchObject({ bonus: 5, pm: 5, reflex: 5, moveM: 1.5 });
    });
    it("chaves são normalizadas (sem acento)", () => {
        expect(normalizeName("Escudo da Fé")).toBe("escudo da fe");
        expect(normalizeName("Salto Dimensional")).toBe("salto dimensional");
    });
});

describe("canBlock", () => {
    it("bloqueia quando o ataque acerta mas o bônus o transforma em erro", () => {
        // ataque 24, Defesa 20, +5 → 25 > 24 → bloqueia (exemplo do usuário)
        expect(canBlock(24, 20, 5)).toBe(true);
    });
    it("não bloqueia se o bônus é insuficiente", () => {
        expect(canBlock(30, 20, 5)).toBe(false); // 25 ainda < 30
        expect(canBlock(25, 20, 5)).toBe(false); // exatamente igual = ainda acerta
    });
    it("não oferece se o ataque já erraria (não acerta a Defesa base)", () => {
        expect(canBlock(19, 20, 5)).toBe(false);
    });
    it("+2 (Escudo da Fé) bloqueia margem de 2", () => {
        expect(canBlock(21, 20, 2)).toBe(true);
        expect(canBlock(22, 20, 2)).toBe(false);
    });
});

describe("reactionAvailable", () => {
    it("fora de combate (sem round): sempre disponível", () => {
        expect(reactionAvailable("qualquer", null)).toBe(true);
    });
    it("disponível se ainda não usou nesta rodada", () => {
        expect(reactionAvailable("c1:2", "c1:3")).toBe(true);
        expect(reactionAvailable(undefined, "c1:3")).toBe(true);
    });
    it("indisponível se já reagiu nesta rodada", () => {
        expect(reactionAvailable("c1:3", "c1:3")).toBe(false);
    });
});

describe("getBlockingDefenseReactions", () => {
    const makeActor = (opts: { pm: number; spells: string[]; usedRound?: unknown }) => ({
        system: { attributes: { pm: { value: opts.pm } } },
        items: opts.spells.map((name, i) => ({ type: "magia", name, id: `i${i}` })),
        getFlag: (_s: string, _k: string) => opts.usedRound,
    });

    it("oferece a reação que conhece, pode pagar e que bloqueia", () => {
        const actor = makeActor({ pm: 10, spells: ["Armadura Arcana"] });
        const out = getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" });
        expect(out.map((r) => r.key)).toEqual(["armadura arcana"]);
        expect(out[0]).toMatchObject({ bonus: 5, pm: 2, label: "Armadura Arcana" });
    });

    it("não oferece se PM insuficiente", () => {
        const actor = makeActor({ pm: 1, spells: ["Armadura Arcana"] }); // custa 2
        expect(getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("não oferece se o bônus não bloqueia (ataque muito alto)", () => {
        const actor = makeActor({ pm: 10, spells: ["Escudo da Fé"] }); // +2
        expect(getBlockingDefenseReactions({ actor, attackTotal: 30, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("não oferece se já reagiu nesta rodada", () => {
        const actor = makeActor({ pm: 10, spells: ["Armadura Arcana"], usedRound: "c1:1" });
        expect(getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("ignora magias que não estão no registro", () => {
        const actor = makeActor({ pm: 10, spells: ["Bola de Fogo", "Curar Ferimentos"] });
        expect(getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("ordena pela mais barata e dedup por magia", () => {
        const actor = makeActor({ pm: 10, spells: ["Armadura Arcana", "Escudo da Fé", "Armadura Arcana"] });
        const out = getBlockingDefenseReactions({ actor, attackTotal: 21, defesa: 20, currentRoundKey: "c1:1" });
        // ataque 21 vs 20: Escudo (+2→22) bloqueia, Armadura (+5→25) bloqueia. Mais barata primeiro = Escudo (1 PM)
        expect(out.map((r) => r.key)).toEqual(["escudo da fe", "armadura arcana"]);
    });
});
