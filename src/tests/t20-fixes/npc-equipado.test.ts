import { describe, it, expect } from "vitest";
import { needsNpcSlotFix, syntheticSlotFor } from "@/t20-fixes/npc-equipado";

const npcArmor = (over: Record<string, unknown> = {}) => ({
    type: "equipamento",
    parent: { type: "npc" },
    system: { equipado: true, equipado2: { slot: 0, type: "body" }, ...over },
});

describe("needsNpcSlotFix", () => {
    it("NPC + equipado:true + slot 0 → precisa do fix", () => {
        expect(needsNpcSlotFix(npcArmor(), true)).toBe(true);
    });
    it("não roda: setting OFF, PC, desequipado, slot já válido, não-equipamento", () => {
        expect(needsNpcSlotFix(npcArmor(), false)).toBe(false);
        expect(needsNpcSlotFix({ ...npcArmor(), parent: { type: "character" } }, true)).toBe(false);
        expect(needsNpcSlotFix(npcArmor({ equipado: false }), true)).toBe(false);
        expect(needsNpcSlotFix(npcArmor({ equipado2: { slot: 1.2, type: "body" } }), true)).toBe(false);
        expect(needsNpcSlotFix({ ...npcArmor(), type: "arma" }, true)).toBe(false);
    });
});

describe("syntheticSlotFor", () => {
    it("body → 1.2; demais → 1.1 (sempre truthy)", () => {
        expect(syntheticSlotFor("body")).toBe(1.2);
        expect(syntheticSlotFor("grip")).toBe(1.1);
        expect(syntheticSlotFor(undefined)).toBe(1.1);
    });
});
