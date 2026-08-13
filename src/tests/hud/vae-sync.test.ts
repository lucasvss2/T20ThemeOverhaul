import { describe, expect, it } from "vitest";

import { shouldHideVaeItem } from "@/hud/vae-sync";
import { MODULE_ID } from "@/constants";

function effect(overrides: Record<string, unknown>): FoundryItemEffect {
    return {
        id: overrides["id"] as string ?? "eff1",
        name: overrides["name"] as string ?? "Efeito",
        disabled: false,
        changes: [],
        flags: {},
        ...overrides,
    } as unknown as FoundryItemEffect;
}

describe("shouldHideVaeItem", () => {
    it("null/undefined (uuid não resolvido): mantém visível no VAE", () => {
        expect(shouldHideVaeItem(null)).toBe(false);
        expect(shouldHideVaeItem(undefined)).toBe(false);
    });

    it("condição de status (já mostrada na nossa barra): esconde do VAE", () => {
        expect(shouldHideVaeItem(effect({ statuses: ["enjoado"] }))).toBe(true);
    });

    it("effect tagueado por um subsistema nosso: esconde do VAE", () => {
        expect(shouldHideVaeItem(effect({ flags: { [MODULE_ID]: { auraSagrada: true } } }))).toBe(true);
    });

    it("traço passivo do T20 (não aparece na nossa barra): permanece flutuando no VAE", () => {
        expect(shouldHideVaeItem(effect({ name: "Caminho do Arcanista: Feiticeiro" }))).toBe(false);
    });

    it("desabilitado/suprimido mesmo com status: não esconde (não está na nossa barra também)", () => {
        expect(shouldHideVaeItem(effect({ disabled: true, statuses: ["enjoado"] }))).toBe(false);
        expect(shouldHideVaeItem(effect({ isSuppressed: true, statuses: ["enjoado"] }))).toBe(false);
    });
});
