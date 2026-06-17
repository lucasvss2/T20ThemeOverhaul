import { describe, it, expect } from "vitest";
import { isTokenInAreaTemplate, type AreaTemplateGeom } from "@/_shared/canvas-geometry";

// In the test env there is no `canvas`, so the geometry helpers fall back to
// gridSize=100 px/square and gridDistance=1.5 m/square (pxPerM = 66.67).
// A token is modelled by its document position; getTokenCenterPx adds half a
// grid square (50px) to the doc x/y to get the centre.
function tokenAtCenter(cx: number, cy: number): FoundryToken {
    return { document: { x: cx - 50, y: cy - 50, width: 1, height: 1 } } as unknown as FoundryToken;
}

const PX_PER_M = 100 / 1.5; // 66.67
const M = (m: number) => m * PX_PER_M;

describe("isTokenInAreaTemplate — cone", () => {
    // Cone of 6m, origin (0,0), aiming east (direction 0), aperture 90° (±45°).
    const cone: AreaTemplateGeom = { t: "cone", x: 0, y: 0, distance: 6, direction: 0, angle: 90 };

    it("includes a token straight ahead within range", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(3), 0), cone)).toBe(true);
    });

    it("includes a token within the aperture (ahead + slightly off-axis)", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(3), M(2)), cone)).toBe(true);
    });

    it("excludes a token perpendicular to the aim (90° off-axis)", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(0, M(3)), cone)).toBe(false);
    });

    it("excludes a token behind the caster", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(-3), 0), cone)).toBe(false);
    });

    it("excludes a token beyond the cone's length", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(7), 0), cone)).toBe(false);
    });

    it("respects the aim direction (cone pointing south)", () => {
        const south: AreaTemplateGeom = { t: "cone", x: 0, y: 0, distance: 6, direction: 90, angle: 90 };
        expect(isTokenInAreaTemplate(tokenAtCenter(0, M(3)), south)).toBe(true);   // straight south
        expect(isTokenInAreaTemplate(tokenAtCenter(M(2), M(2)), south)).toBe(true); // 45° edge (southeast)
        expect(isTokenInAreaTemplate(tokenAtCenter(M(3), 0), south)).toBe(false);  // due east — outside
        expect(isTokenInAreaTemplate(tokenAtCenter(0, M(-3)), south)).toBe(false); // due north — behind
    });
});

describe("isTokenInAreaTemplate — ray (line)", () => {
    // 9m line east, default width = one grid square (1.5m → ±0.75m).
    const ray: AreaTemplateGeom = { t: "ray", x: 0, y: 0, distance: 9, direction: 0 };

    it("includes a token along the line", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(5), 0), ray)).toBe(true);
    });

    it("excludes a token off to the side beyond the width", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(5), M(2)), ray)).toBe(false);
    });

    it("excludes a token past the end of the line", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(10), 0), ray)).toBe(false);
    });
});

describe("isTokenInAreaTemplate — circle falls back to radius test", () => {
    const circle: AreaTemplateGeom = { t: "circle", x: 0, y: 0, distance: 3 };

    it("includes a token within the radius", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(2), 0), circle)).toBe(true);
    });

    it("excludes a token outside the radius", () => {
        expect(isTokenInAreaTemplate(tokenAtCenter(M(5), 0), circle)).toBe(false);
    });
});
