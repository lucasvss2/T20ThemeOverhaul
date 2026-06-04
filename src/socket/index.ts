/**
 * Central socketlib bootstrap for the module.
 *
 * socketlib is a hard dependency declared in module.json. It fires the
 * `socketlib.ready` hook **during its own `init` listener** — which means
 * any other module that tries to register a `socketlib.ready` listener
 * *inside* its own `init` hook is too late: depending on module load
 * order, socketlib's init can run first, fire the hook, and our `once`
 * listener registered moments later never gets called.
 *
 * Fix: register the listener at TOP-LEVEL module load time (this file's
 * side effect), which is guaranteed to happen before any Foundry `init`
 * listener runs.
 *
 * Subsystems should NEVER access `game.socket` directly. They:
 *
 * ```
 * onSocketReady((socket) => {
 *     socket.register("openDamagePrompt", openDamagePrompt);
 * });
 *
 * // To invoke remotely:
 * await getSocket()?.executeAsUser("openDamagePrompt", targetUserId, payload);
 * ```
 *
 * `getSocket()` returns `null` until `socketlib.ready` has fired. After
 * the hook fires, all queued `onSocketReady` callbacks run synchronously.
 */

import { MODULE_ID } from "@/constants";
import { log, warn, error } from "@/utils/logging";


let socket: SocketlibSocket | null = null;
const pending: Array<(s: SocketlibSocket) => void> = [];

/** Run `fn` once socketlib is ready and our module is registered. */
export function onSocketReady(fn: (socket: SocketlibSocket) => void): void {
    if (socket) {
        fn(socket);
        return;
    }
    pending.push(fn);
}

/** Returns the live socket or `null` if socketlib has not finished booting. */
export function getSocket(): SocketlibSocket | null {
    return socket;
}

// ── Top-level side effect: register listener at module load time ─────────────
// MUST be top-level (not inside Hooks.once("init")). socketlib fires the
// `socketlib.ready` hook from its own `init` listener; if module load order
// puts socketlib's init before ours, registering the listener inside our own
// `init` would be too late.

Hooks.once("socketlib.ready", () => {
    if (typeof socketlib === "undefined") {
        warn("socketlib hook fired but global is undefined — abortando.");
        return;
    }
    socket = socketlib.registerModule(MODULE_ID);
    log(`socketlib registrado (${pending.length} handler set(s) pendente(s)).`);
    for (const fn of pending) {
        try { fn(socket); } catch (err) {
            error(`erro registrando handler de socket:`, err);
        }
    }
    pending.length = 0;
});
