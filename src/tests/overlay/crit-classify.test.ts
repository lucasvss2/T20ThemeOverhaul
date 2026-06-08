import { describe, it, expect } from "vitest";
import { classifyD20 } from "@/overlay/BG3Overlay";

describe("classifyD20", () => {
    it("20 natural sempre é crítico natural", () => {
        expect(classifyD20(20)).toBe("crit-nat");
        expect(classifyD20(20, 19)).toBe("crit-nat");
        expect(classifyD20(20, 18)).toBe("crit-nat");
    });

    it("1 natural sempre é falha crítica", () => {
        expect(classifyD20(1)).toBe("fumble");
        expect(classifyD20(1, 18)).toBe("fumble");
    });

    it("sem margem ampliada (threshold 20): 19 não é crítico", () => {
        expect(classifyD20(19)).toBe("");
        expect(classifyD20(19, 20)).toBe("");
        expect(classifyD20(2)).toBe("");
    });

    it("com Precisa (threshold 19): 19 é crítico por margem", () => {
        expect(classifyD20(19, 19)).toBe("crit-margin");
        expect(classifyD20(18, 19)).toBe("");
    });

    it("com margem 18: 18 e 19 são crítico por margem, 17 não", () => {
        expect(classifyD20(18, 18)).toBe("crit-margin");
        expect(classifyD20(19, 18)).toBe("crit-margin");
        expect(classifyD20(17, 18)).toBe("");
    });

    it("20 natural é classificado como crit-nat (não crit-margin) mesmo com margem baixa", () => {
        expect(classifyD20(20, 18)).toBe("crit-nat");
    });

    it("null/sem d20 → vazio", () => {
        expect(classifyD20(null)).toBe("");
        expect(classifyD20(null, 18)).toBe("");
    });
});
