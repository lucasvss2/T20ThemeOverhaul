/**
 * Duration manager — shared types.
 *
 * The manager tags every "managed" ActiveEffect with a `dur` flag under the
 * module namespace. The flag records how the effect should expire and the
 * bookkeeping needed to do it deterministically (rounds remaining, the combat
 * it is anchored to, the world-time it began, etc.).
 */

export type DurKind = "rounds" | "scene" | "day" | "sustained" | "indeterminate";

/** Minimal shape of an ActiveEffect.duration we read from. */
export interface EffectDurationLike {
    type?: string | null; // "turns" | "seconds" | "none" | "scene"
    rounds?: number | null;
    seconds?: number | null;
}

/** The flag we write to `flags.<MODULE_ID>.dur` on a managed ActiveEffect. */
export interface DurData {
    managed: true;
    kind: DurKind;
    /** kind=rounds: total rounds the effect should last. */
    rounds?: number;
    /** kind=rounds: rounds left once anchored to a combat (decremented). */
    remaining?: number;
    /** Combat id this effect is anchored to (null/undefined = not counting yet). */
    combatId?: string | null;
    /** kind=day: game.time.worldTime when it began counting (for ≥1 day expiry). */
    startWorldTime?: number;
    /** kind=sustained: who is concentrating (to prompt at encounter end). */
    casterTokenId?: string;
    casterActorId?: string;
    /** Human label for dialogs/notifications. */
    label?: string;
    /** How the effect was applied (for diagnostics). */
    source?: "spell" | "power" | "manual" | "native";
}

export const DUR_FLAG = "dur";

/** Source units of a T20 spell's `system.duracao`. */
export type T20DuracaoUnits =
    | "inst"
    | "round"
    | "turn"
    | "scene"
    | "day"
    | "sust"
    | "perm"
    | "special";
