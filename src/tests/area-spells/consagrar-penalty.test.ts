import { describe, it, expect } from "vitest";
import { computeUndeadPenaltyFromMessage, isUndead } from "@/area-spells/consagrar";

// ── computeUndeadPenaltyFromMessage ───────────────────────────────────────────

type OnUse = { cost?: number; description?: string; qty?: number };
const penaltyMsg = (onUseEffects: OnUse[] | undefined) =>
    ({ flags: { tormenta20: { onUseEffects } } } as unknown as ChatMessage);

const DESC_1PM = "Além do normal, mortos-vivos na área sofrem –2 em testes e Defesa";
const DESC_2PM = "Aumenta as penalidades para mortos-vivos em –1";

describe("computeUndeadPenaltyFromMessage", () => {
    it("returns 0 when onUseEffects is missing or not an array", () => {
        expect(computeUndeadPenaltyFromMessage(penaltyMsg(undefined))).toBe(0);
        expect(computeUndeadPenaltyFromMessage({ flags: {} } as unknown as ChatMessage)).toBe(0);
    });

    it("returns 0 when the base 1PM aprimoramento was NOT selected", () => {
        // Even if the 2PM "increase penalties" entry is present, no base = no penalty.
        expect(computeUndeadPenaltyFromMessage(penaltyMsg([{ description: DESC_2PM, qty: 1 }]))).toBe(0);
    });

    it("returns 2 for the base 1PM aprimoramento alone", () => {
        expect(computeUndeadPenaltyFromMessage(penaltyMsg([{ description: DESC_1PM, qty: 1 }]))).toBe(2);
    });

    it("adds -1 per 2PM level on top of the base", () => {
        expect(computeUndeadPenaltyFromMessage(penaltyMsg([
            { description: DESC_1PM, qty: 1 },
            { description: DESC_2PM, qty: 1 },
        ]))).toBe(3);
    });

    it("scales the 2PM contribution by qty", () => {
        expect(computeUndeadPenaltyFromMessage(penaltyMsg([
            { description: DESC_1PM, qty: 1 },
            { description: DESC_2PM, qty: 3 },
        ]))).toBe(5);
    });

    it("ignores entries with qty < 1", () => {
        expect(computeUndeadPenaltyFromMessage(penaltyMsg([{ description: DESC_1PM, qty: 0 }]))).toBe(0);
    });

    it("matches the 1PM text regardless of word order between -2, testes and defesa", () => {
        const reordered = "mortos-vivos sofrem –2 penalidade em testes de perícia e na Defesa";
        expect(computeUndeadPenaltyFromMessage(penaltyMsg([{ description: reordered, qty: 1 }]))).toBe(2);
    });
});

// ── isUndead ──────────────────────────────────────────────────────────────────

const npc = (detalhes: { raca?: string; tipo?: string }) =>
    ({ system: { detalhes }, items: { contents: [] } } as unknown as FoundryActor);

const pcWithRace = (raceName: string) =>
    ({ system: {}, items: { contents: [{ type: "race", name: raceName }] } } as unknown as FoundryActor);

describe("isUndead", () => {
    it("detects an NPC by detalhes.raca = 'Morto-vivo'", () => {
        expect(isUndead(npc({ raca: "Morto-vivo" }))).toBe(true);
    });

    it("detects an NPC by detalhes.tipo = 'mor' even when raca is empty (e.g. Lich)", () => {
        expect(isUndead(npc({ raca: "", tipo: "mor" }))).toBe(true);
    });

    it("normalizes accents/case in raca", () => {
        expect(isUndead(npc({ raca: "MORTO-VIVO" }))).toBe(true);
    });

    it("returns false for a living NPC (e.g. Animal)", () => {
        expect(isUndead(npc({ raca: "Capivara", tipo: "ani" }))).toBe(false);
    });

    it("detects a PC with an Osteon race item", () => {
        expect(isUndead(pcWithRace("Osteon"))).toBe(true);
    });

    it("detects a PC with a Soterrado race item", () => {
        expect(isUndead(pcWithRace("Soterrado"))).toBe(true);
    });

    it("returns false for a PC with a living race item", () => {
        expect(isUndead(pcWithRace("Humano"))).toBe(false);
    });
});
