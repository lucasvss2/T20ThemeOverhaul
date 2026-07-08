import { describe, it, expect } from "vitest";
import { ajustadaPenalty, hasAjustadaSelected, needsAjustadaFix } from "@/t20-fixes/ajustada-upgrade";
import { buildPoderosoTemplate, hasPoderosoSelected, PODEROSO_KEY } from "@/t20-fixes/poderoso-upgrade";

const PDA = "system.attributes.defesa.pda";

describe("ajustadaPenalty", () => {
    it("reduz a penalidade em 1 (−1→0, −2→−1)", () => {
        expect(ajustadaPenalty(-1)).toBe(0);
        expect(ajustadaPenalty(-2)).toBe(-1);
        expect(ajustadaPenalty(-5)).toBe(-4);
    });
    it("nunca acima de 0 (0→0; valores estranhos clampados)", () => {
        expect(ajustadaPenalty(0)).toBe(0);
        expect(ajustadaPenalty(3)).toBe(0);
        expect(ajustadaPenalty(NaN)).toBe(0);
    });
});

describe("hasAjustadaSelected", () => {
    it("acha adjusted em qualquer slot de melhoria", () => {
        expect(hasAjustadaSelected({ melhoria1: "adjusted" })).toBe(true);
        expect(hasAjustadaSelected({ melhoria1: "", melhoria3: "adjusted" })).toBe(true);
    });
    it("false sem adjusted / em outros slots", () => {
        expect(hasAjustadaSelected({ melhoria1: "reinforced", material: "adjusted" })).toBe(false);
        expect(hasAjustadaSelected(undefined)).toBe(false);
    });
});

describe("needsAjustadaFix", () => {
    it("detecta AEs com change de pda (nativo velho E par intermediário)", () => {
        expect(needsAjustadaFix([{ key: PDA }])).toBe(true);
        expect(needsAjustadaFix([{ key: PDA }, { key: PDA }])).toBe(true);
    });
    it("marcador (changes vazias) não precisa de fix", () => {
        expect(needsAjustadaFix([])).toBe(false);
        expect(needsAjustadaFix(undefined)).toBe(false);
        expect(needsAjustadaFix([{ key: "system.attributes.cd" }])).toBe(false);
    });
});

describe("buildPoderosoTemplate", () => {
    it("+1 em system.attributes.cd (mode ADD), transferível, flag upgrade=powerful", () => {
        const t = buildPoderosoTemplate();
        expect(t.changes).toEqual([
            { key: "system.attributes.cd", value: "1", mode: 2, priority: 0 },
        ]);
        expect(t.transfer).toBe(true);
        expect(t.flags.tormenta20).toMatchObject({ upgrade: PODEROSO_KEY, onuse: false });
    });
});

describe("hasPoderosoSelected", () => {
    it("acha powerful em qualquer slot de melhoria", () => {
        expect(hasPoderosoSelected({ melhoria1: "powerful" })).toBe(true);
        expect(hasPoderosoSelected({ melhoria1: "", melhoria4: "powerful" })).toBe(true);
    });
    it("false sem powerful ou sem upgrades", () => {
        expect(hasPoderosoSelected({ melhoria1: "energetic", material: "adamant" })).toBe(false);
        expect(hasPoderosoSelected(undefined)).toBe(false);
    });
    it("NÃO casa powerful no slot de material/encanto (só melhorias)", () => {
        expect(hasPoderosoSelected({ material: "powerful", encanto1: "powerful" })).toBe(false);
    });
});
