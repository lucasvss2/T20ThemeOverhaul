import { describe, it, expect } from "vitest";
import { canSeeRollResult } from "@/integration/index";

const GM = "gm-user";
const GM2 = "gm2-user";
const PLAYER = "player-user";

describe("canSeeRollResult", () => {
    it("rolagem pública → todos veem", () => {
        const info = { whisper: [], blind: false, authorId: GM };
        expect(canSeeRollResult(info, GM)).toBe(true);
        expect(canSeeRollResult(info, PLAYER)).toBe(true);
    });

    it("rolagem secreta (blind) do GM → players NÃO veem", () => {
        const info = { whisper: [GM, GM2], blind: true, authorId: GM };
        expect(canSeeRollResult(info, PLAYER)).toBe(false);
    });

    it("rolagem secreta (blind) → GMs do whisper veem", () => {
        const info = { whisper: [GM, GM2], blind: true, authorId: GM };
        expect(canSeeRollResult(info, GM)).toBe(true);
        expect(canSeeRollResult(info, GM2)).toBe(true);
    });

    it("blind rolada por PLAYER → nem o autor vê (semântica do Foundry)", () => {
        const info = { whisper: [GM], blind: true, authorId: PLAYER };
        expect(canSeeRollResult(info, PLAYER)).toBe(false);
        expect(canSeeRollResult(info, GM)).toBe(true);
    });

    it("whisper/GM-only (não-blind) → destinatários + autor veem", () => {
        const info = { whisper: [GM], blind: false, authorId: PLAYER };
        expect(canSeeRollResult(info, GM)).toBe(true);
        expect(canSeeRollResult(info, PLAYER)).toBe(true);   // autor vê o próprio
        expect(canSeeRollResult(info, "other")).toBe(false);
    });

    it("self-roll → só o autor", () => {
        const info = { whisper: [PLAYER], blind: false, authorId: PLAYER };
        expect(canSeeRollResult(info, PLAYER)).toBe(true);
        expect(canSeeRollResult(info, GM)).toBe(false);
    });
});
