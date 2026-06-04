/**
 * Minimal Foundry VTT global stubs for the test environment.
 *
 * Some modules register hooks at import time (e.g. src/socket/index.ts calls
 * `Hooks.once("socketlib.ready", …)` at top level). Importing any module that
 * transitively pulls those in would throw `ReferenceError: Hooks is not defined`
 * under vitest's node environment. We provide just enough no-op globals so that
 * importing a module is side-effect-safe; the actual hook callbacks never run in
 * tests. Pure functions under test receive their inputs explicitly and do not
 * rely on these globals.
 */

type AnyGlobal = Record<string, unknown>;
const g = globalThis as unknown as AnyGlobal;

// Hook registry — no-op. Callbacks are never invoked in tests.
g["Hooks"] ??= {
    once: () => 0,
    on: () => 0,
    off: () => undefined,
    callAll: () => true,
};

// Minimal `game` surface touched by module top-level / helper defaults.
g["game"] ??= {
    system: { id: "tormenta20", version: "0.0.0-test" },
    modules: { get: () => undefined },
    actors: { get: () => undefined, contents: [] },
    messages: { get: () => undefined, contents: [] },
    users: { find: () => undefined, get: () => undefined, contents: [] },
    user: { id: "test-user", name: "Test", isGM: false, targets: new Set() },
    i18n: { localize: (k: string) => k, format: (k: string) => k },
    settings: { register: () => undefined, get: () => undefined, set: () => Promise.resolve() },
};

// `socketlib` stays undefined on purpose — the socket bootstrap guards on
// `typeof socketlib === "undefined"`, and the callback never fires in tests.

g["ui"] ??= {
    notifications: { info: () => undefined, warn: () => undefined, error: () => undefined },
};

g["CONFIG"] ??= { statusEffects: [] };

g["canvas"] ??= undefined;
