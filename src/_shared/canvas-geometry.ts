/**
 * Shared canvas / token geometry helpers for area-spell features.
 *
 * Extracted verbatim from consagrar.ts, aura-sagrada.ts, egide-sagrada.ts and
 * bola-de-fogo.ts during Phase 1 helper consolidation. The signatures are the
 * supersets used across all call sites: `getTokenPosPx` / `getTokenCenterPx` /
 * `isTokenInsideTemplate` take an optional `overrideXY` (the movement
 * destination from an `updateToken` hook — see the v13 quirk where `doc.x/y`
 * still holds the pre-move position during animation). Callers that don't move
 * the token simply omit it.
 */

/**
 * Token position in PIXELS, with optional override (movement destination).
 *
 * v13 quirk: inside an `updateToken` hook, `doc.x/y` still holds the OLD
 * position during the animation; the destination arrives in `changes.x/y`,
 * which callers forward as `overrideXY`. Outside `updateToken` (canvasReady,
 * createToken, …) `overrideXY` is omitted and `doc.x/y` is already stable.
 */
export function getTokenPosPx(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): { x: number; y: number; widthSq: number; heightSq: number } {
    type TokenDoc = {
        document?: { x?: number; y?: number; width?: number; height?: number };
        x?: number; y?: number;
    };
    const t = token as unknown as TokenDoc;
    const doc = t.document;
    return {
        x:        overrideXY?.x ?? doc?.x ?? t.x ?? 0,
        y:        overrideXY?.y ?? doc?.y ?? t.y ?? 0,
        widthSq:  doc?.width  ?? 1,
        heightSq: doc?.height ?? 1,
    };
}

/** Center of the token in pixels (accounting for the token's width/height). */
export function getTokenCenterPx(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): { x: number; y: number } {
    type CanvasLike = { scene?: { grid?: { size?: number } } };
    const cv       = canvas as unknown as CanvasLike;
    const gridSize = cv.scene?.grid?.size ?? 100;
    const pos      = getTokenPosPx(token, overrideXY);
    return {
        x: pos.x + (pos.widthSq  * gridSize) / 2,
        y: pos.y + (pos.heightSq * gridSize) / 2,
    };
}

/**
 * Tests whether the token's CENTER falls within the template's radius.
 *
 * Everything is converted to GRID SQUARES:
 *   radiusSq    = template.distance(m) / grid.distance(m per square)
 *   templateCSq = template.x(px) / grid.size(px per square)
 *   tokenCSq    = token.x(px) / grid.size + widthSq/2
 *
 * `overrideXY` is the movement destination (changes.x/y from the hook), used to
 * defeat the stale-doc.x/y quirk during animation in v13.
 */
export function isTokenInsideTemplate(
    token: FoundryToken,
    template: { x: number; y: number; distance: number },
    overrideXY?: { x?: number; y?: number },
): boolean {
    type CanvasLike = { scene?: { grid?: { size?: number; distance?: number } } };
    const cv       = canvas as unknown as CanvasLike;
    const gridSize = cv.scene?.grid?.size     ?? 100;
    const gridDist = cv.scene?.grid?.distance ?? 1.5;

    const radiusSq = template.distance / gridDist;
    const tCxSq    = template.x / gridSize;
    const tCySq    = template.y / gridSize;

    const pos = getTokenPosPx(token, overrideXY);
    const cx  = pos.x / gridSize + pos.widthSq  / 2;
    const cy  = pos.y / gridSize + pos.heightSq / 2;
    const dx  = cx - tCxSq;
    const dy  = cy - tCySq;
    return Math.sqrt(dx * dx + dy * dy) <= radiusSq;
}

/**
 * Tokens on the canvas whose center is inside the template (no override —
 * for world sweeps, e.g. when first creating the template).
 */
export function tokensInTemplate(template: {
    x: number; y: number; distance: number;
}): FoundryToken[] {
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv     = canvas as unknown as CanvasLike;
    const tokens = cv.tokens?.placeables ?? [];
    return tokens.filter(t => isTokenInsideTemplate(t, template));
}

/** Token on the scene whose `actor.id` matches the given id (linked or unlinked). */
export function findTokenForActor(actorId: string): FoundryToken | null {
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv = canvas as unknown as CanvasLike;
    for (const t of (cv.tokens?.placeables ?? [])) {
        const aid = (t.actor as unknown as { id?: string } | null)?.id;
        if (aid === actorId) return t;
    }
    return null;
}

/**
 * Token disposition. Covers Foundry v11+ (token.document.disposition) as well as
 * the legacy shape (token.data.disposition). Defaults to NEUTRAL (0).
 */
export function getTokenDisposition(token: FoundryToken): number {
    type TokenLike = {
        document?: { disposition?: number };
        data?:     { disposition?: number };
    };
    const t = token as unknown as TokenLike;
    return t.document?.disposition ?? t.data?.disposition ?? 0;
}

/** Caster + tokens sharing the caster's disposition (aura ally targeting). */
export function isAuraTarget(
    token: FoundryToken,
    casterTokenId: string,
    casterDisposition: number,
): boolean {
    const tokenId = (token as unknown as { id?: string }).id;
    if (tokenId === casterTokenId) return true; // the caster always includes itself
    return getTokenDisposition(token) === casterDisposition;
}
