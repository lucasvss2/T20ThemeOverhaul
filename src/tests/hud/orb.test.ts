import { describe, expect, it, vi } from "vitest";

import { adjustPool, computePoolAfterDelta, flashClassFor, parseSignedDelta } from "@/hud/orb";

describe("computePoolAfterDelta", () => {
    it("dano consome temp antes de value", () => {
        const r = computePoolAfterDelta({ value: 20, max: 30, temp: 5 }, -8);
        // 5 de temp absorve 5, restam 3 no value
        expect(r).toEqual({ value: 17, max: 30, temp: 0 });
    });

    it("dano sem temp reduz direto o value", () => {
        const r = computePoolAfterDelta({ value: 10, max: 30, temp: 0 }, -4);
        expect(r).toEqual({ value: 6, max: 30, temp: 0 });
    });

    it("dano nunca deixa value negativo", () => {
        const r = computePoolAfterDelta({ value: 3, max: 30, temp: 0 }, -50);
        expect(r.value).toBe(0);
    });

    it("dano maior que temp+value zera ambos", () => {
        const r = computePoolAfterDelta({ value: 3, max: 30, temp: 2 }, -50);
        expect(r).toEqual({ value: 0, max: 30, temp: 0 });
    });

    it("cura soma no value, nunca passa do max", () => {
        const r = computePoolAfterDelta({ value: 25, max: 30, temp: 0 }, 10);
        expect(r.value).toBe(30);
    });

    it("cura não mexe em temp", () => {
        const r = computePoolAfterDelta({ value: 10, max: 30, temp: 5 }, 5);
        expect(r).toEqual({ value: 15, max: 30, temp: 5 });
    });
});

describe("adjustPool", () => {
    it("chama actor.update com os paths corretos", async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const actor = {
            system: { attributes: { pv: { value: 20, max: 30, temp: 0 } } },
            update,
        } as unknown as FoundryActor;
        await adjustPool(actor, "pv", -5);
        expect(update).toHaveBeenCalledWith({
            "system.attributes.pv.value": 15,
            "system.attributes.pv.temp": 0,
        });
    });

    it("pool ausente no ator é tratado como zerado", async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const actor = { system: { attributes: {} }, update } as unknown as FoundryActor;
        await adjustPool(actor, "pm", 5);
        expect(update).toHaveBeenCalledWith({
            "system.attributes.pm.value": 0,
            "system.attributes.pm.temp": 0,
        });
    });
});

describe("parseSignedDelta", () => {
    it("com sinal + → positivo (cura/recupera)", () => {
        expect(parseSignedDelta("+5")).toBe(5);
        expect(parseSignedDelta("+12")).toBe(12);
    });
    it("com sinal - → negativo (dano/gasto)", () => {
        expect(parseSignedDelta("-3")).toBe(-3);
    });
    it("sem sinal → negativo (dano/gasto — compatível com o comportamento antigo)", () => {
        expect(parseSignedDelta("5")).toBe(-5);
    });
    it("zero, vazio ou não-numérico → null", () => {
        expect(parseSignedDelta("0")).toBeNull();
        expect(parseSignedDelta("")).toBeNull();
        expect(parseSignedDelta("   ")).toBeNull();
        expect(parseSignedDelta("abc")).toBeNull();
    });
});

describe("flashClassFor", () => {
    it("PV perde → vermelho", () => {
        expect(flashClassFor("pv", -5)).toBe("t20-flash-danger");
    });
    it("PM perde → azul", () => {
        expect(flashClassFor("pm", -5)).toBe("t20-flash-info");
    });
    it("PV ganha (cura) → verde", () => {
        expect(flashClassFor("pv", 5)).toBe("t20-flash-success");
    });
    it("PM ganha (recupera) → sem brilho, de propósito", () => {
        expect(flashClassFor("pm", 5)).toBeNull();
    });
});
