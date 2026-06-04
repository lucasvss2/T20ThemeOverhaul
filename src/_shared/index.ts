/**
 * Shared helpers barrel.
 *
 * Cross-feature utilities consolidated from the per-file duplicates that grew
 * across the area-spell modules (Phase 1). Import from "@/_shared".
 */
export { isActiveGM } from "./gm";
export { escHtml } from "./html";
export { extractBaseEffectData } from "./messages";
export {
    getTokenPosPx,
    getTokenCenterPx,
    isTokenInsideTemplate,
    tokensInTemplate,
    findTokenForActor,
    getTokenDisposition,
    isAuraTarget,
} from "./canvas-geometry";
