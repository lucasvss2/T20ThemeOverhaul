import { describe, it, expect } from "vitest";
import {
    isEstiloDisparoEligible,
    danoRollNeedsPadrao,
    injectEstiloDisparoPadrao,
} from "@/t20-fixes/estilo-disparo-dano";

type RollPart = [string, string?, string?];

// ── isEstiloDisparoEligible ───────────────────────────────────────────────────

describe("isEstiloDisparoEligible", () => {
    const make = (over: Record<string, unknown> = {}) => ({
        type: "arma",
        system: { proposito: "disparo" },
        actor: { flags: { tormenta20: { estiloDisparo: true } } },
        ...over,
    });

    it("is true for a ranged weapon whose owner has the estiloDisparo flag", () => {
        expect(isEstiloDisparoEligible(make())).toBe(true);
    });

    it("is false for non-weapon items", () => {
        expect(isEstiloDisparoEligible(make({ type: "poder" }))).toBe(false);
    });

    it("is false for melee weapons (proposito != disparo)", () => {
        expect(isEstiloDisparoEligible(make({ system: { proposito: "corpo-a-corpo" } }))).toBe(false);
    });

    it("is false for thrown weapons (proposito = arremesso)", () => {
        expect(isEstiloDisparoEligible(make({ system: { proposito: "arremesso" } }))).toBe(false);
    });

    it("is false when the owner lacks the estiloDisparo flag", () => {
        expect(isEstiloDisparoEligible(make({ actor: { flags: { tormenta20: {} } } }))).toBe(false);
    });

    it("is false when there is no actor", () => {
        expect(isEstiloDisparoEligible(make({ actor: null }))).toBe(false);
    });
});

// ── danoRollNeedsPadrao ───────────────────────────────────────────────────────

describe("danoRollNeedsPadrao", () => {
    it("is true for a damage roll that hardcodes an attribute (e.g. @for)", () => {
        expect(danoRollNeedsPadrao({ type: "dano", parts: [["1d12", "perfuracao", ""], ["@for", "", ""]] })).toBe(true);
    });

    it("is true for a damage roll with no attribute part at all", () => {
        expect(danoRollNeedsPadrao({ type: "dano", parts: [["1d8", "corte", ""]] })).toBe(true);
    });

    it("is false for non-damage rolls (attack)", () => {
        expect(danoRollNeedsPadrao({ type: "ataque", parts: [["1d20", "", ""], ["pont", "", ""]] })).toBe(false);
    });

    it("is false when a padrao part already exists (native T20 handles it)", () => {
        expect(danoRollNeedsPadrao({ type: "dano", parts: [["1d8", "corte", ""], ["padrao", "", ""]] })).toBe(false);
    });

    it("is false when a @des part is already present (avoids double Dex)", () => {
        expect(danoRollNeedsPadrao({ type: "dano", parts: [["1d8", "corte", ""], ["@des", "", ""]] })).toBe(false);
    });

    it("is false for healing rolls", () => {
        expect(danoRollNeedsPadrao({ type: "dano", parts: [["2d8", "curapv", ""]] })).toBe(false);
    });

    it("tolerates an undefined parts array", () => {
        expect(danoRollNeedsPadrao({ type: "dano" })).toBe(true);
    });
});

// ── injectEstiloDisparoPadrao ─────────────────────────────────────────────────

describe("injectEstiloDisparoPadrao", () => {
    const eligibleItem = (rolls: Array<{ type?: string; parts?: RollPart[] }>) => ({
        type: "arma",
        system: { proposito: "disparo", rolls },
        actor: { flags: { tormenta20: { estiloDisparo: true } } },
    });

    it("appends a padrao part to an eligible damage roll, then restores on undo", () => {
        const danoParts: RollPart[] = [["1d12", "perfuracao", ""], ["@for", "", ""]];
        const item = eligibleItem([
            { type: "ataque", parts: [["1d20", "", ""], ["pont", "", ""]] },
            { type: "dano", parts: danoParts },
        ]);

        const restore = injectEstiloDisparoPadrao(item);

        const dano = item.system.rolls[1];
        expect(dano.parts).toEqual([["1d12", "perfuracao", ""], ["@for", "", ""], ["padrao", "", ""]]);
        // attack roll untouched
        expect(item.system.rolls[0].parts).toEqual([["1d20", "", ""], ["pont", "", ""]]);

        restore();
        expect(dano.parts).toBe(danoParts); // exact original reference restored
        expect(dano.parts).toEqual([["1d12", "perfuracao", ""], ["@for", "", ""]]);
    });

    it("is a no-op for an ineligible item (melee)", () => {
        const item = {
            type: "arma",
            system: { proposito: "corpo-a-corpo", rolls: [{ type: "dano", parts: [["1d8", "corte", ""]] as RollPart[] }] },
            actor: { flags: { tormenta20: { estiloDisparo: true } } },
        };
        const before = JSON.parse(JSON.stringify(item.system.rolls));
        const restore = injectEstiloDisparoPadrao(item);
        expect(item.system.rolls).toEqual(before);
        restore();
        expect(item.system.rolls).toEqual(before);
    });

    it("is a no-op when the damage roll already has padrao (native path)", () => {
        const item = eligibleItem([{ type: "dano", parts: [["1d8", "corte", ""], ["padrao", "", ""]] }]);
        const before = JSON.parse(JSON.stringify(item.system.rolls));
        injectEstiloDisparoPadrao(item);
        expect(item.system.rolls).toEqual(before);
    });

    it("injects into every eligible damage roll while restoring all of them", () => {
        const item = eligibleItem([
            { type: "dano", parts: [["1d12", "perfuracao", ""], ["@for", "", ""]] },
            { type: "dano", parts: [["1d6", "fogo", ""]] },
        ]);
        injectEstiloDisparoPadrao(item);
        expect(item.system.rolls[0].parts?.at(-1)).toEqual(["padrao", "", ""]);
        expect(item.system.rolls[1].parts?.at(-1)).toEqual(["padrao", "", ""]);
    });
});
