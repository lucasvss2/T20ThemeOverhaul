import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_ROWS, getRows, MAX_ROWS, MIN_ROWS, setRows } from "@/hud/state";

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const originalGame = g["game"];

afterEach(() => { g["game"] = originalGame; });

function mockSettings(initial: number) {
    let value: unknown = initial;
    g["game"] = {
        settings: {
            register: () => undefined,
            get: () => value,
            set: (_ns: string, _key: string, v: unknown) => { value = v; return Promise.resolve(); },
        },
    };
}

describe("getRows / setRows", () => {
    it("valor inválido/ausente cai no default", () => {
        mockSettings(undefined as unknown as number);
        expect(getRows()).toBe(DEFAULT_ROWS);
    });

    it("valor fora do range cai no default", () => {
        mockSettings(99);
        expect(getRows()).toBe(DEFAULT_ROWS);
    });

    it("valor válido é respeitado", () => {
        mockSettings(3);
        expect(getRows()).toBe(3);
    });

    it("setRows clampa entre MIN_ROWS e MAX_ROWS", async () => {
        mockSettings(DEFAULT_ROWS);
        await setRows(MAX_ROWS + 5);
        expect(getRows()).toBe(MAX_ROWS);
        await setRows(MIN_ROWS - 5);
        expect(getRows()).toBe(MIN_ROWS);
    });
});
