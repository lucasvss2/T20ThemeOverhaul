import { describe, it, expect } from "vitest";
import { resolveRoll2d20 } from "@/hidden-test/HiddenTestPlayerDialog";

describe("resolveRoll2d20", () => {
    it("Normal → 1d20", () => {
        expect(resolveRoll2d20("normal", false)).toBe("1d20");
    });
    it("Melhor de 2d20 → 2d20kh1", () => {
        expect(resolveRoll2d20("melhor", false)).toBe("2d20kh1");
    });
    it("Pior de 2d20 → 2d20kl1", () => {
        expect(resolveRoll2d20("pior", false)).toBe("2d20kl1");
    });
    it("vantagem de poder (kh) força 2d20kh1 mesmo em Normal", () => {
        expect(resolveRoll2d20("normal", true)).toBe("2d20kh1");
    });
    it("vantagem de poder + Pior se anulam → 1d20", () => {
        expect(resolveRoll2d20("pior", true)).toBe("1d20");
    });
    it("vantagem de poder + Melhor continua vantagem", () => {
        expect(resolveRoll2d20("melhor", true)).toBe("2d20kh1");
    });
});
