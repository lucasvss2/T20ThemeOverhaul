import { describe, it, expect } from "vitest";
import { maxPoderesConcedidos, getDivindadeFlag } from "@/divindades/index";

describe("maxPoderesConcedidos", () => {
    it("1 por padrão; 2 com Devoto Fiel", () => {
        expect(maxPoderesConcedidos(false)).toBe(1);
        expect(maxPoderesConcedidos(true)).toBe(2);
    });
});

describe("getDivindadeFlag", () => {
    it("lê a flag do item (via flags diretas)", () => {
        const item = { flags: { "t20-theme-overhaul": { divindade: { nome: "Khalmyr", poderes: ["Coragem Total"], automacao: null } } } };
        const f = getDivindadeFlag(item as never);
        expect(f?.nome).toBe("Khalmyr");
        expect(f?.poderes).toEqual(["Coragem Total"]);
    });
    it("null para itens sem a flag ou malformados", () => {
        expect(getDivindadeFlag({ flags: {} } as never)).toBeNull();
        expect(getDivindadeFlag({ flags: { "t20-theme-overhaul": { divindade: { nome: 1 } } } } as never)).toBeNull();
        expect(getDivindadeFlag(null)).toBeNull();
    });
});
