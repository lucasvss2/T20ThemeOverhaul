import { afterEach, describe, expect, it } from "vitest";

import {
    cycleMobileModeSetting, getMobileModeSetting, isMobileModeActive,
    mobileModeIcon, MOBILE_BREAKPOINT_PX,
} from "@/hud/mobile-mode";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const originalGame = g["game"];

afterEach(() => { g["game"] = originalGame; });

function mockSettings(initial: unknown) {
    let value = initial;
    g["game"] = {
        settings: {
            register: () => undefined,
            get: () => value,
            set: (_ns: string, _key: string, v: unknown) => { value = v; return Promise.resolve(); },
        },
    };
}

describe("isMobileModeActive", () => {
    it("modo explícito mobile sempre ativa, qualquer largura", () => {
        expect(isMobileModeActive(1920, "mobile")).toBe(true);
        expect(isMobileModeActive(0, "mobile")).toBe(true);
    });

    it("modo explícito desktop nunca ativa, qualquer largura", () => {
        expect(isMobileModeActive(320, "desktop")).toBe(false);
        expect(isMobileModeActive(0, "desktop")).toBe(false);
    });

    it("modo auto decide pelo breakpoint", () => {
        expect(isMobileModeActive(MOBILE_BREAKPOINT_PX - 1, "auto")).toBe(true);
        expect(isMobileModeActive(MOBILE_BREAKPOINT_PX, "auto")).toBe(false);
        expect(isMobileModeActive(MOBILE_BREAKPOINT_PX + 1, "auto")).toBe(false);
    });
});

describe("getMobileModeSetting", () => {
    it("valor válido é respeitado", () => {
        mockSettings("mobile");
        expect(getMobileModeSetting()).toBe("mobile");
    });

    it("valor inválido/ausente cai em auto", () => {
        mockSettings(undefined);
        expect(getMobileModeSetting()).toBe("auto");
        mockSettings("bogus");
        expect(getMobileModeSetting()).toBe("auto");
    });
});

describe("cycleMobileModeSetting", () => {
    it("avança auto → mobile → desktop → auto", async () => {
        mockSettings("auto");
        expect(await cycleMobileModeSetting()).toBe("mobile");
        expect(await cycleMobileModeSetting()).toBe("desktop");
        expect(await cycleMobileModeSetting()).toBe("auto");
    });
});

describe("mobileModeIcon", () => {
    it("um ícone distinto por modo", () => {
        const icons = new Set([mobileModeIcon("auto"), mobileModeIcon("mobile"), mobileModeIcon("desktop")]);
        expect(icons.size).toBe(3);
    });
});
