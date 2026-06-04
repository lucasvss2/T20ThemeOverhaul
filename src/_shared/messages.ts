/**
 * Shared chat-message helpers for area-spell features.
 *
 * Extracted verbatim from aura-sagrada.ts / egide-sagrada.ts during Phase 1
 * helper consolidation.
 */

/**
 * Extracts the first AEData (changes/duration/etc) from
 * `flags.tormenta20.effects` — this is the effect T20 already computed at cast
 * time (e.g. the +CHA-to-resistances effect, with the CASTER's CHA baked in as
 * a numeric string like "9"). Returns null when absent.
 */
export function extractBaseEffectData(message: ChatMessage): Record<string, unknown> | null {
    type EffectsShape = Array<Array<Record<string, unknown>>>;
    const t20 = (message.flags as Record<string, unknown> | undefined)?.tormenta20 as
        | { effects?: EffectsShape } | undefined;
    const first = t20?.effects?.[0]?.[0];
    return (first as Record<string, unknown> | undefined) ?? null;
}
