import { describe, expect, it } from "vitest";

import { buildCargaVM } from "@/hud/capacity";

function actorWithCarga(carga: Record<string, unknown> | undefined): FoundryActor {
    return { system: { attributes: { carga } } } as unknown as FoundryActor;
}

describe("buildCargaVM", () => {
    it("sem carga.max → null (ator sem capacidade rastreada)", () => {
        expect(buildCargaVM(actorWithCarga(undefined))).toBeNull();
        expect(buildCargaVM(actorWithCarga({ max: 0, value: 5 }))).toBeNull();
    });

    it("com carga.max → retorna os campos derivados", () => {
        const vm = buildCargaVM(actorWithCarga({ value: 16.5, limit: 15, max: 30, pct: 55, encumbered: true }));
        expect(vm).toEqual({ value: 16.5, limit: 15, max: 30, pct: 55, encumbered: true });
    });

    it("campos ausentes viram 0/false", () => {
        const vm = buildCargaVM(actorWithCarga({ max: 30 }));
        expect(vm).toEqual({ value: 0, limit: 0, max: 30, pct: 0, encumbered: false });
    });
});
