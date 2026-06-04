import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    getTokenPosPx,
    getTokenCenterPx,
    isTokenInsideTemplate,
    tokensInTemplate,
    findTokenForActor,
    getTokenDisposition,
    isAuraTarget,
} from "@/_shared/canvas-geometry";

const g = globalThis as unknown as Record<string, unknown>;
const savedCanvas = g["canvas"];

// Default scene: 100px grid squares, 1.5 m per square (standard T20).
function setCanvas(opts: { placeables?: unknown[]; gridSize?: number; gridDist?: number } = {}) {
    g["canvas"] = {
        scene: { grid: { size: opts.gridSize ?? 100, distance: opts.gridDist ?? 1.5 } },
        tokens: { placeables: opts.placeables ?? [] },
    };
}

beforeEach(() => setCanvas());
afterEach(() => { g["canvas"] = savedCanvas; });

// Token factory: position in px, size in squares, plus disposition / actor id.
type TokOpts = { x?: number; y?: number; w?: number; h?: number; disposition?: number; actorId?: string; id?: string };
const tok = (o: TokOpts = {}) =>
    ({
        id: o.id ?? "tk",
        document: { x: o.x ?? 0, y: o.y ?? 0, width: o.w ?? 1, height: o.h ?? 1, disposition: o.disposition },
        actor: o.actorId ? { id: o.actorId } : null,
    } as unknown as FoundryToken);

// ── getTokenPosPx ──────────────────────────────────────────────────────────────

describe("getTokenPosPx", () => {
    it("reads x/y/width/height from token.document", () => {
        expect(getTokenPosPx(tok({ x: 200, y: 300, w: 2, h: 3 })))
            .toEqual({ x: 200, y: 300, widthSq: 2, heightSq: 3 });
    });

    it("defaults size to 1x1 squares when absent", () => {
        const t = { document: { x: 100, y: 100 } } as unknown as FoundryToken;
        expect(getTokenPosPx(t)).toEqual({ x: 100, y: 100, widthSq: 1, heightSq: 1 });
    });

    it("applies overrideXY (movement destination) over doc.x/y", () => {
        const pos = getTokenPosPx(tok({ x: 0, y: 0 }), { x: 555, y: 666 });
        expect(pos).toMatchObject({ x: 555, y: 666 });
    });

    it("applies a partial overrideXY (only x)", () => {
        const pos = getTokenPosPx(tok({ x: 10, y: 20 }), { x: 99 });
        expect(pos).toMatchObject({ x: 99, y: 20 });
    });
});

// ── getTokenCenterPx ─────────────────────────────────────────────────────────

describe("getTokenCenterPx", () => {
    it("centers a 1x1 token (grid 100) at +50/+50", () => {
        expect(getTokenCenterPx(tok({ x: 0, y: 0 }))).toEqual({ x: 50, y: 50 });
    });

    it("centers a 2x2 token at +100/+100", () => {
        expect(getTokenCenterPx(tok({ x: 0, y: 0, w: 2, h: 2 }))).toEqual({ x: 100, y: 100 });
    });

    it("uses overrideXY as the corner", () => {
        expect(getTokenCenterPx(tok({ x: 0, y: 0 }), { x: 200, y: 200 })).toEqual({ x: 250, y: 250 });
    });
});

// ── isTokenInsideTemplate ────────────────────────────────────────────────────

describe("isTokenInsideTemplate", () => {
    // grid 100px / 1.5m: radiusSq = distance / 1.5. A 9m template → 6 squares radius.
    const template = { x: 450, y: 450, distance: 9 }; // center at square (4.5, 4.5)

    it("includes a token whose center coincides with the template center", () => {
        // 1x1 token at (400,400) → center square (4.5, 4.5) == template center
        expect(isTokenInsideTemplate(tok({ x: 400, y: 400 }), template)).toBe(true);
    });

    it("includes a token at the radius boundary (<=)", () => {
        // 6 squares away → exactly on the boundary. Token center square must be (4.5±6).
        // place center at square (10.5, 4.5): corner x = (10.5-0.5)*100 = 1000
        expect(isTokenInsideTemplate(tok({ x: 1000, y: 400 }), template)).toBe(true);
    });

    it("excludes a token just outside the radius", () => {
        // center square (11.5, 4.5) → 7 squares away > 6
        expect(isTokenInsideTemplate(tok({ x: 1100, y: 400 }), template)).toBe(false);
    });

    it("honours overrideXY (moving a token into the area)", () => {
        const far = tok({ x: 5000, y: 5000 });
        expect(isTokenInsideTemplate(far, template)).toBe(false);
        expect(isTokenInsideTemplate(far, template, { x: 400, y: 400 })).toBe(true);
    });
});

// ── tokensInTemplate ─────────────────────────────────────────────────────────

describe("tokensInTemplate", () => {
    it("returns only tokens whose center falls inside", () => {
        const inside = tok({ id: "in", x: 400, y: 400 });
        const outside = tok({ id: "out", x: 5000, y: 5000 });
        setCanvas({ placeables: [inside, outside] });
        const result = tokensInTemplate({ x: 450, y: 450, distance: 9 });
        expect(result).toHaveLength(1);
        expect((result[0] as unknown as { id: string }).id).toBe("in");
    });

    it("returns [] when the canvas has no tokens", () => {
        setCanvas({ placeables: [] });
        expect(tokensInTemplate({ x: 0, y: 0, distance: 9 })).toEqual([]);
    });
});

// ── findTokenForActor ────────────────────────────────────────────────────────

describe("findTokenForActor", () => {
    it("finds the token whose actor.id matches", () => {
        const a = tok({ id: "ta", actorId: "actor-1" });
        const b = tok({ id: "tb", actorId: "actor-2" });
        setCanvas({ placeables: [a, b] });
        expect((findTokenForActor("actor-2") as unknown as { id: string })?.id).toBe("tb");
    });

    it("returns null when no token matches", () => {
        setCanvas({ placeables: [tok({ actorId: "actor-1" })] });
        expect(findTokenForActor("nope")).toBeNull();
    });

    it("ignores tokens without an actor", () => {
        setCanvas({ placeables: [tok({ id: "no-actor" })] });
        expect(findTokenForActor("actor-1")).toBeNull();
    });
});

// ── getTokenDisposition ──────────────────────────────────────────────────────

describe("getTokenDisposition", () => {
    it("reads token.document.disposition", () => {
        expect(getTokenDisposition(tok({ disposition: 1 }))).toBe(1);
    });

    it("falls back to legacy token.data.disposition", () => {
        const t = { data: { disposition: -1 } } as unknown as FoundryToken;
        expect(getTokenDisposition(t)).toBe(-1);
    });

    it("defaults to 0 (neutral) when absent", () => {
        const t = { document: {} } as unknown as FoundryToken;
        expect(getTokenDisposition(t)).toBe(0);
    });
});

// ── isAuraTarget ─────────────────────────────────────────────────────────────

describe("isAuraTarget", () => {
    it("always includes the caster's own token by id", () => {
        // hostile disposition, but it's the caster → still a target
        expect(isAuraTarget(tok({ id: "caster", disposition: -1 }), "caster", 1)).toBe(true);
    });

    it("includes allies sharing the caster's disposition", () => {
        expect(isAuraTarget(tok({ id: "ally", disposition: 1 }), "caster", 1)).toBe(true);
    });

    it("excludes tokens with a different disposition", () => {
        expect(isAuraTarget(tok({ id: "foe", disposition: -1 }), "caster", 1)).toBe(false);
    });
});
