import { describe, expect, it } from "vitest";

import { colsForWidth } from "@/hud/responsive";

describe("colsForWidth", () => {
    it("larguras muito pequenas caem no mínimo (4 cols)", () => {
        expect(colsForWidth(0)).toBe(4);
        expect(colsForWidth(400)).toBe(4);
    });

    it("respeita os breakpoints intermediários", () => {
        expect(colsForWidth(619)).toBe(4);
        expect(colsForWidth(620)).toBe(5);
        expect(colsForWidth(759)).toBe(5);
        expect(colsForWidth(760)).toBe(6);
        expect(colsForWidth(899)).toBe(6);
        expect(colsForWidth(900)).toBe(7);
    });

    it("larguras grandes usam o maior breakpoint", () => {
        expect(colsForWidth(1040)).toBe(8);
        expect(colsForWidth(5000)).toBe(8);
    });

    it("é monotônica não-decrescente (nunca diminui cols com mais largura)", () => {
        const widths = [0, 100, 620, 700, 760, 900, 1040, 2000];
        let prev = 0;
        for (const w of widths) {
            const c = colsForWidth(w);
            expect(c).toBeGreaterThanOrEqual(prev);
            prev = c;
        }
    });
});
