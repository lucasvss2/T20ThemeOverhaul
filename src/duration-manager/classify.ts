/**
 * Duration manager — pure classification logic.
 *
 * Decides the {@link DurKind} of an applied ActiveEffect from its own duration
 * data plus (when known) the source spell's `system.duracao.units`.
 *
 * Findings from the T20 `magias` compendium that drive these rules:
 *  - Round-based conditions encode `duration.type === "turns"` + a small
 *    `rounds` count (e.g. `Adaga Mental (Atordoado)` → rounds:1).
 *  - T20 tags ~140/171 applied effects as `type:"scene"` / `durationScene:true`
 *    by default — regardless of the spell's REAL duration. So scene-flagged
 *    effects must be disambiguated by the parent spell's `duracao.units`
 *    (scene vs day vs sustained vs permanent).
 *  - Scene effects sometimes carry a `rounds:999` sentinel — never treat that
 *    as a real round count.
 */

import type { DurKind, EffectDurationLike } from "./types";

/** A round count this large is the T20 "scene" sentinel, not a real duration. */
const SCENE_ROUNDS_SENTINEL = 100;

export interface ClassifyInput {
    /** The effect's own `duration` object. */
    effDuration?: EffectDurationLike | null;
    /** `flags.tormenta20.durationScene` on the effect. */
    durationSceneFlag?: boolean;
    /** Source spell `system.duracao.units` (authoritative for scene/day/sust). */
    parentUnits?: string | null;
    /** Source spell `system.duracao.value` (round/turn counts). */
    parentValue?: number | null;
}

export interface ClassifyResult {
    kind: DurKind;
    /** Present when kind === "rounds". */
    rounds?: number;
}

/**
 * Classify an effect's duration. Order of precedence:
 *  1. A genuine round-based effect duration (`type:"turns"`, small `rounds`).
 *  2. The parent spell's `duracao.units` (most authoritative for the rest).
 *  3. The effect-level scene flag / `type:"scene"`.
 *  4. Fallback to indeterminate (manual removal only).
 */
export function classifyDuration(input: ClassifyInput): ClassifyResult {
    const d = input.effDuration;

    // 1) Real round-based duration on the effect itself.
    if (
        d &&
        d.type === "turns" &&
        typeof d.rounds === "number" &&
        d.rounds > 0 &&
        d.rounds < SCENE_ROUNDS_SENTINEL
    ) {
        return { kind: "rounds", rounds: d.rounds };
    }

    // 2) Parent spell units — authoritative when present.
    const u = (input.parentUnits ?? "").toLowerCase();
    switch (u) {
        case "round":
        case "turn":
            return { kind: "rounds", rounds: Math.max(1, input.parentValue ?? 1) };
        case "scene":
            return { kind: "scene" };
        case "sust":
            return { kind: "sustained" };
        case "day":
            return { kind: "day" };
        case "perm":
        case "special":
            return { kind: "indeterminate" };
        case "inst":
            // Instantaneous spell that nonetheless left a lingering effect —
            // T20 tags these scene; treat as scene so they clear at scene end.
            return { kind: "scene" };
    }

    // 3) Effect-level scene marker (no parent info available).
    if (input.durationSceneFlag || d?.type === "scene") return { kind: "scene" };

    // 4) Nothing usable → manual removal only.
    return { kind: "indeterminate" };
}

/**
 * Map a manual HUD duration choice to a {@link ClassifyResult}. Kept here so the
 * dialog and the manager agree on the shape.
 */
export function manualChoice(kind: DurKind, rounds?: number): ClassifyResult {
    if (kind === "rounds") return { kind: "rounds", rounds: Math.max(1, rounds ?? 1) };
    return { kind };
}

/**
 * True when an effect `origin` points to another ActiveEffect — i.e. it is a
 * DERIVED/linked condition that T20 auto-applies (and auto-removes) alongside a
 * parent condition. Example: applying Atordoado also applies Desprevenido whose
 * origin is the Atordoado effect. The manager must NOT manage or prompt for
 * these — they cascade with their parent.
 */
export function isDerivedConditionOrigin(origin: string | null | undefined): boolean {
    return !!origin && /\.ActiveEffect\./.test(origin);
}
