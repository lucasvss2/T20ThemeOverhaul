import { afterEach, describe, expect, it } from "vitest";

import {
    _clearAdvantageSourcesForTests,
    combineAdvantage,
    registerAdvantageSource,
    resolveRollKeep,
} from "@/_shared/advantage";

afterEach(() => {
    _clearAdvantageSourcesForTests();
});

describe("combineAdvantage", () => {
    it("só vantagem → khd20", () => {
        expect(combineAdvantage(true, false)).toBe("khd20");
    });
    it("só desvantagem → kld20", () => {
        expect(combineAdvantage(false, true)).toBe("kld20");
    });
    it("vantagem + desvantagem se cancelam → normal", () => {
        expect(combineAdvantage(true, true)).toBeUndefined();
    });
    it("nenhum → normal", () => {
        expect(combineAdvantage(false, false)).toBeUndefined();
    });
});

describe("resolveRollKeep", () => {
    it("sem ator → undefined", () => {
        expect(resolveRollKeep({ actor: null, kind: "attack" })).toBeUndefined();
    });

    it("agrega vantagem de UMA fonte registrada", () => {
        registerAdvantageSource({
            id: "src-a",
            hasAdvantage: (q) => q.kind === "attack",
            hasDisadvantage: () => false,
        });
        expect(resolveRollKeep({ actor: { id: "a1" }, kind: "attack" })).toBe("khd20");
    });

    it("cancela quando fontes DIFERENTES concedem vantagem e desvantagem pro mesmo teste", () => {
        registerAdvantageSource({ id: "adv-source", hasAdvantage: (q) => q.kind === "pericia", hasDisadvantage: () => false });
        registerAdvantageSource({ id: "dis-source", hasAdvantage: () => false, hasDisadvantage: (q) => q.kind === "pericia" });
        expect(resolveRollKeep({ actor: { id: "a1" }, kind: "pericia", skillKey: "furt" })).toBeUndefined();
    });

    it("não empilha: 2 fontes de vantagem continuam sendo só uma vantagem (khd20)", () => {
        registerAdvantageSource({ id: "adv-1", hasAdvantage: (q) => q.kind === "attack", hasDisadvantage: () => false });
        registerAdvantageSource({ id: "adv-2", hasAdvantage: (q) => q.kind === "attack", hasDisadvantage: () => false });
        expect(resolveRollKeep({ actor: { id: "a1" }, kind: "attack" })).toBe("khd20");
    });

    it("respeita o `kind`/`skillKey` da query — fonte não aplicável não interfere", () => {
        registerAdvantageSource({ id: "attack-only", hasAdvantage: (q) => q.kind === "attack", hasDisadvantage: () => false });
        expect(resolveRollKeep({ actor: { id: "a1" }, kind: "pericia", skillKey: "furt" })).toBeUndefined();
    });

    it("uma fonte que lança erro não quebra a agregação das outras", () => {
        registerAdvantageSource({
            id: "buggy",
            hasAdvantage: () => { throw new Error("boom"); },
            hasDisadvantage: () => { throw new Error("boom"); },
        });
        registerAdvantageSource({ id: "good", hasAdvantage: (q) => q.kind === "attack", hasDisadvantage: () => false });
        expect(resolveRollKeep({ actor: { id: "a1" }, kind: "attack" })).toBe("khd20");
    });

    it("registrar de novo com o mesmo id substitui (idempotente)", () => {
        registerAdvantageSource({ id: "dup", hasAdvantage: () => true, hasDisadvantage: () => false });
        registerAdvantageSource({ id: "dup", hasAdvantage: () => false, hasDisadvantage: () => false });
        expect(resolveRollKeep({ actor: { id: "a1" }, kind: "attack" })).toBeUndefined();
    });
});
