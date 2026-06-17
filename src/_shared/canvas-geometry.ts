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
 *
 * Phase 2: relies on the typed Foundry ambient globals (FoundryToken.document,
 * canvas.scene/tokens) instead of inline `as unknown as` casts.
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
    const doc = token.document;
    return {
        x:        overrideXY?.x ?? doc?.x ?? token.x ?? 0,
        y:        overrideXY?.y ?? doc?.y ?? token.y ?? 0,
        widthSq:  doc?.width  ?? 1,
        heightSq: doc?.height ?? 1,
    };
}

/** Center of the token in pixels (accounting for the token's width/height). */
export function getTokenCenterPx(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): { x: number; y: number } {
    const gridSize = canvas?.scene?.grid?.size ?? 100;
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
    const gridSize = canvas?.scene?.grid?.size     ?? 100;
    const gridDist = canvas?.scene?.grid?.distance ?? 1.5;

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
    const tokens = canvas?.tokens?.placeables ?? [];
    return tokens.filter(t => isTokenInsideTemplate(t, template));
}

// ── Generic area-template containment (cone / circle / line / rect) ──────────
//
// `tokensInTemplate` / `isTokenInsideTemplate` above only model CIRCLES (center
// within radius). Area spells also use cones, lines (ray) and rectangles. The
// engine in `area-spells/area-engine.ts` needs a single containment test that
// switches on the template shape (`MeasuredTemplate.t`). We compute it with
// plain trigonometry instead of relying on `template.object.shape.contains` —
// in v13 (with the T20 custom shape getters) `object.shape` does NOT expose a
// usable `.contains()`, and trig matches the drawn sector closely enough while
// being independent of PIXI/system internals.
//
// Foundry angle convention: `direction` is in DEGREES, 0 = pointing right (+x),
// increasing CLOCKWISE (canvas y grows downward). `Math.atan2(dy, dx)` shares
// this convention, so no axis flip is needed.

export interface AreaTemplateGeom {
    /** "circle" | "cone" | "ray" | "rect" (MeasuredTemplate.t). Defaults to circle. */
    t?: string;
    x: number;
    y: number;
    /** Length / radius, in scene distance units (metres). */
    distance: number;
    /** Aim, in degrees (cone / ray / rect). */
    direction?: number;
    /** Aperture, in degrees (cone). */
    angle?: number;
    /** Thickness, in metres (ray / wall). Defaults to one grid square. */
    width?: number;
}

/** Smallest absolute difference between two angles, in degrees (0–180). */
function angleDeltaDeg(a: number, b: number): number {
    return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/**
 * Whether the token's CENTER falls inside an area template of any shape.
 * `overrideXY` defeats the v13 stale-`doc.x/y` quirk during `updateToken`.
 */
export function isTokenInAreaTemplate(
    token: FoundryToken,
    tpl: AreaTemplateGeom,
    overrideXY?: { x?: number; y?: number },
): boolean {
    const t = (tpl.t ?? "circle").toLowerCase();
    // Circle: reuse the (grid-square) radius test for parity with existing code.
    if (t === "circle" || t === "radius" || t === "sphere" || t === "cylinder") {
        return isTokenInsideTemplate(token, tpl, overrideXY);
    }

    const gridSize = canvas?.scene?.grid?.size     ?? 100;
    const gridDist = canvas?.scene?.grid?.distance ?? 1.5;
    const pxPerM   = gridSize / gridDist;
    const distPx   = tpl.distance * pxPerM;

    const c  = getTokenCenterPx(token, overrideXY);
    const dx = c.x - tpl.x;
    const dy = c.y - tpl.y;
    const dist = Math.hypot(dx, dy);

    if (t === "cone") {
        if (dist > distPx) return false;
        if (dist < 1e-6)   return true; // at the origin
        const pointAng = Math.atan2(dy, dx) * 180 / Math.PI;
        const half     = (tpl.angle ?? 90) / 2;
        return angleDeltaDeg(pointAng, tpl.direction ?? 0) <= half + 1e-3;
    }

    if (t === "ray" || t === "line" || t === "wall") {
        const dir   = (tpl.direction ?? 0) * Math.PI / 180;
        const along = dx * Math.cos(dir) + dy * Math.sin(dir);
        const perp  = -dx * Math.sin(dir) + dy * Math.cos(dir);
        const halfW = ((tpl.width ?? gridDist) * pxPerM) / 2;
        return along >= -1e-6 && along <= distPx && Math.abs(perp) <= halfW;
    }

    if (t === "rect" || t === "cube" || t === "square") {
        // Foundry rect templates span from the origin to (origin + diagonal) of a
        // square `distance` on a side, rotated by `direction`. Approximate with an
        // axis-aligned box of side `distance` whose near corner is the origin,
        // following the dominant quadrant of `direction`.
        const dir = ((tpl.direction ?? 0) % 360 + 360) % 360;
        const signX = (dir > 90 && dir < 270) ? -1 : 1;
        const signY = (dir > 0 && dir < 180)  ? 1  : -1;
        const within = (v: number, s: number) =>
            s >= 0 ? (v >= -1e-6 && v <= distPx) : (v <= 1e-6 && v >= -distPx);
        return within(dx, signX) && within(dy, signY);
    }

    // Unknown shape → fall back to radius.
    return dist <= distPx;
}

/** Tokens on the canvas whose center is inside the (any-shape) area template. */
export function tokensInAreaTemplate(tpl: AreaTemplateGeom): FoundryToken[] {
    return (canvas?.tokens?.placeables ?? []).filter(t => isTokenInAreaTemplate(t, tpl));
}

/** Token on the scene whose `actor.id` matches the given id (linked or unlinked). */
export function findTokenForActor(actorId: string): FoundryToken | null {
    for (const t of (canvas?.tokens?.placeables ?? [])) {
        if (t.actor?.id === actorId) return t;
    }
    return null;
}

/**
 * Token disposition. Covers Foundry v11+ (token.document.disposition) as well as
 * the legacy shape (token.data.disposition). Defaults to NEUTRAL (0).
 */
export function getTokenDisposition(token: FoundryToken): number {
    return token.document?.disposition ?? token.data?.disposition ?? 0;
}

/** Caster + tokens sharing the caster's disposition (aura ally targeting). */
export function isAuraTarget(
    token: FoundryToken,
    casterTokenId: string,
    casterDisposition: number,
): boolean {
    if (token.id === casterTokenId) return true; // the caster always includes itself
    return getTokenDisposition(token) === casterDisposition;
}
