import { describe, it, expect } from "vitest";
import { classifyDuration, manualChoice, isDerivedConditionOrigin } from "@/duration-manager/classify";
import { hasFiniteBuffDuration } from "@/duration-manager/index";

describe("classifyDuration", () => {
    it("classifies a real round-based effect (Adaga Mental → Atordoado)", () => {
        const r = classifyDuration({
            effDuration: { type: "turns", rounds: 1 },
            durationSceneFlag: false,
            parentUnits: "inst",
        });
        expect(r).toEqual({ kind: "rounds", rounds: 1 });
    });

    it("respects a multi-round effect duration", () => {
        const r = classifyDuration({ effDuration: { type: "turns", rounds: 3 } });
        expect(r).toEqual({ kind: "rounds", rounds: 3 });
    });

    it("treats the rounds:999 scene sentinel as scene, not rounds", () => {
        const r = classifyDuration({
            effDuration: { type: "scene", rounds: 999 },
            durationSceneFlag: true,
            parentUnits: "scene",
        });
        expect(r.kind).toBe("scene");
        expect(r.rounds).toBeUndefined();
    });

    it("uses parent units for a scene-flagged buff whose real duration is day", () => {
        // T20 tags the effect scene by default; parent units says day.
        const r = classifyDuration({
            effDuration: { type: "scene", rounds: 1 },
            durationSceneFlag: true,
            parentUnits: "day",
        });
        expect(r).toEqual({ kind: "day" });
    });

    it("classifies sustained spells", () => {
        const r = classifyDuration({
            effDuration: { type: "scene", rounds: 1 },
            durationSceneFlag: true,
            parentUnits: "sust",
        });
        expect(r).toEqual({ kind: "sustained" });
    });

    it("classifies scene spells", () => {
        const r = classifyDuration({ parentUnits: "scene" });
        expect(r).toEqual({ kind: "scene" });
    });

    it("classifies perm/special as indeterminate", () => {
        expect(classifyDuration({ parentUnits: "perm" })).toEqual({ kind: "indeterminate" });
        expect(classifyDuration({ parentUnits: "special" })).toEqual({ kind: "indeterminate" });
    });

    it("maps parent round/turn units to a rounds duration", () => {
        expect(classifyDuration({ parentUnits: "round", parentValue: 5 })).toEqual({
            kind: "rounds",
            rounds: 5,
        });
        expect(classifyDuration({ parentUnits: "turn" })).toEqual({ kind: "rounds", rounds: 1 });
    });

    it("treats a lingering instantaneous effect as scene", () => {
        expect(classifyDuration({ parentUnits: "inst" })).toEqual({ kind: "scene" });
    });

    it("falls back to scene from the effect-level flag when no parent info", () => {
        expect(classifyDuration({ durationSceneFlag: true })).toEqual({ kind: "scene" });
        expect(classifyDuration({ effDuration: { type: "scene" } })).toEqual({ kind: "scene" });
    });

    it("falls back to indeterminate when nothing is usable", () => {
        expect(classifyDuration({})).toEqual({ kind: "indeterminate" });
        expect(classifyDuration({ effDuration: { type: "none" } })).toEqual({
            kind: "indeterminate",
        });
    });

    it("prefers a real round duration over the parent units", () => {
        const r = classifyDuration({
            effDuration: { type: "turns", rounds: 2 },
            parentUnits: "scene",
        });
        expect(r).toEqual({ kind: "rounds", rounds: 2 });
    });
});

describe("manualChoice", () => {
    it("normalizes a rounds choice to at least 1", () => {
        expect(manualChoice("rounds", 0)).toEqual({ kind: "rounds", rounds: 1 });
        expect(manualChoice("rounds", 4)).toEqual({ kind: "rounds", rounds: 4 });
        expect(manualChoice("rounds")).toEqual({ kind: "rounds", rounds: 1 });
    });

    it("passes through non-round kinds", () => {
        expect(manualChoice("scene")).toEqual({ kind: "scene" });
        expect(manualChoice("day")).toEqual({ kind: "day" });
        expect(manualChoice("indeterminate")).toEqual({ kind: "indeterminate" });
    });
});

describe("hasFiniteBuffDuration", () => {
    it("manages status-less buffs with a real finite spell duration", () => {
        for (const u of ["round", "turn", "scene", "sust", "day", "SCENE", "Day"]) {
            expect(hasFiniteBuffDuration(u)).toBe(true);
        }
    });

    it("does NOT manage passive powers whose duracao defaults to inst", () => {
        // Regression: Insolência/Golpista Divino/Resistência Elemental are
        // passive powers with units "inst" — must never be scene-managed/deleted.
        expect(hasFiniteBuffDuration("inst")).toBe(false);
    });

    it("does NOT manage perm/special/empty/unknown units", () => {
        expect(hasFiniteBuffDuration("perm")).toBe(false);
        expect(hasFiniteBuffDuration("special")).toBe(false);
        expect(hasFiniteBuffDuration("")).toBe(false);
        expect(hasFiniteBuffDuration(null)).toBe(false);
        expect(hasFiniteBuffDuration(undefined)).toBe(false);
    });

    it("manages a genuine turns-based effect duration even without units", () => {
        expect(hasFiniteBuffDuration(null, "turns")).toBe(true);
        expect(hasFiniteBuffDuration("inst", "turns")).toBe(true);
    });

    it("ignores non-turns effect duration types", () => {
        expect(hasFiniteBuffDuration("inst", "none")).toBe(false);
        expect(hasFiniteBuffDuration(undefined, "seconds")).toBe(false);
    });
});

describe("isDerivedConditionOrigin", () => {
    it("detects an effect origin that points to another ActiveEffect", () => {
        // Atordoado → derived Desprevenido whose origin is the Atordoado AE.
        expect(
            isDerivedConditionOrigin(
                "Scene.abc.Token.def.Actor.ghi.ActiveEffect.jkl",
            ),
        ).toBe(true);
    });

    it("is false for a spell/item origin", () => {
        expect(isDerivedConditionOrigin("Actor.abc.Item.def")).toBe(false);
        expect(isDerivedConditionOrigin("Compendium.tormenta20.magias.Item.xyz")).toBe(false);
    });

    it("is false for null/empty origins (manually-toggled primary condition)", () => {
        expect(isDerivedConditionOrigin(null)).toBe(false);
        expect(isDerivedConditionOrigin(undefined)).toBe(false);
        expect(isDerivedConditionOrigin("")).toBe(false);
    });
});
