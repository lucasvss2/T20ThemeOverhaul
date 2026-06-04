/**
 * Aura Sagrada — shared constants, the `AuraTpl` shape and the template lookup.
 *
 * Split out of aura-sagrada.ts (Phase 4) so the cura/ardente tick and the
 * antimagia/invencibilidade API sub-modules can depend on these WITHOUT
 * importing back through the main module (which would create an import cycle).
 */
import { MODULE_ID } from "@/constants";

// Returned by normalizeCondName("Aura Sagrada") — lowercase + accent strip,
// NO space→hyphen substitution. The space is essential for cast detection.
export const SPELL_NAME_NORMALIZED         = "aura sagrada";
export const SPELL_KEY                     = "aura-sagrada";              // internal id (flag/template)
export const FLAG_SPELL                    = "spell";                    // template flag: identifies the aura
export const FLAG_ORIGIN                   = "auraSagradaTemplateOrigin"; // AE flag: links AE to template
export const FLAG_CASTER                   = "casterTokenId";            // template flag: emitting token
export const FLAG_CASTER_AID               = "casterActorId";            // template flag: caster actor
export const POWERFUL_AURA_NORMALIZED      = "aura poderosa";            // → radius 30 m
export const HEALING_AURA_NORMALIZED       = "aura de cura";             // heal per turn
export const BURNING_AURA_NORMALIZED       = "aura ardente";             // light damage per turn
export const ANTIMAGIC_AURA_NORMALIZED     = "aura antimagia";           // resistance re-roll
export const INVINCIBILITY_AURA_NORMALIZED = "aura de invencibilidade";  // ignore first hit of the scene
export const FLAG_INVENC_USED_SCENE        = "auraInvencibilidadeUsedSceneId"; // actor flag

export const RAIO_PADRAO_M   = 9;
export const RAIO_PODEROSA_M = 30;

export type AuraTpl = {
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
};

/** All active Aura Sagrada (ghost) templates in the current scene. */
export function getAuraTemplates(): AuraTpl[] {
    const list = canvas?.scene?.templates?.contents ?? [];
    return list.filter(t => t.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY);
}
