import { describe, it, expect } from "vitest";
import { extractBaseEffectData } from "@/_shared/messages";

const msg = (flags: unknown) => ({ flags } as unknown as ChatMessage);

describe("extractBaseEffectData", () => {
    it("returns the first AEData from flags.tormenta20.effects[0][0]", () => {
        const ae = { name: "Aura Sagrada", changes: [{ key: "x", value: "9", mode: 2 }] };
        expect(extractBaseEffectData(msg({ tormenta20: { effects: [[ae]] } }))).toBe(ae);
    });

    it("returns null when there are no effects", () => {
        expect(extractBaseEffectData(msg({ tormenta20: {} }))).toBeNull();
    });

    it("returns null when the effects array is empty", () => {
        expect(extractBaseEffectData(msg({ tormenta20: { effects: [] } }))).toBeNull();
    });

    it("returns null when the inner group is empty", () => {
        expect(extractBaseEffectData(msg({ tormenta20: { effects: [[]] } }))).toBeNull();
    });

    it("returns null when the tormenta20 flag is absent", () => {
        expect(extractBaseEffectData(msg({}))).toBeNull();
    });

    it("returns only the FIRST effect of the first group", () => {
        const first = { name: "first" };
        const second = { name: "second" };
        expect(extractBaseEffectData(msg({ tormenta20: { effects: [[first, second]] } }))).toBe(first);
    });
});
