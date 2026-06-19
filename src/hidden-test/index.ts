import { MODULE_ID } from "@/constants";
import { T20Overlay } from "@/overlay/T20Overlay";
import { onSocketReady } from "@/socket";
import { openHiddenTestGMDialog } from "./HiddenTestGMDialog";
import { openHiddenTestPlayerDialog } from "./HiddenTestPlayerDialog";
import type { HiddenTestFlag, HiddenTestRequest } from "./types";
import HIDDEN_TEST_STYLES from "./hidden-test.css?inline";

/** Name used to register the player-side dialog handler on socketlib. */
export const SOCKET_HIDDEN_TEST_REQUEST = "hidden-test/request";

// ── CSS ───────────────────────────────────────────────────────────────────────

const HIDDEN_TEST_STYLES_ID = "t20-hidden-test-styles";

function ensureHiddenTestStyles(): void {
    if (!document.getElementById(HIDDEN_TEST_STYLES_ID)) {
        const el = document.createElement("style");
        el.id = HIDDEN_TEST_STYLES_ID;
        el.textContent = HIDDEN_TEST_STYLES;
        document.head.appendChild(el);
    }
}

// ── Socket handler ────────────────────────────────────────────────────────────

function setupSocket(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_HIDDEN_TEST_REQUEST, (...args: unknown[]) => {
            const req = args[0] as HiddenTestRequest;
            // socketlib's executeAsUser already targets a single user — no
            // need to filter by targetUserId here. Keep the field on the
            // payload for chat/debug context.
            openHiddenTestPlayerDialog(req);
        });
    });
}

// ── createChatMessage hook: show overlay for hidden tests ─────────────────────

function setupChatHook(): void {
    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;

        const flag = message.getFlag(MODULE_ID, "hiddenTest") as HiddenTestFlag | undefined;
        if (!flag) return;

        // In Foundry v13, message.rolls contains deserialized Roll instances.
        const rolls = message.rolls as Roll[] | undefined;
        if (!rolls?.length) return;

        const roll = rolls[0];

        const meta = { category: `Teste de ${flag.skillLabel}` };
        setTimeout(() => T20Overlay.show(meta, roll, flag.outcome), 1000);
    });
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function injectToolbarButton(): void {
    if (!game.user?.isGM) return;
    if (document.getElementById("t20-hidden-test-btn")) return;

    // Foundry v13: <aside id="scene-controls"> > <menu id="scene-controls-layers"> > <li> > <button>
    const menu =
        document.querySelector("menu#scene-controls-layers") ??
        document.querySelector("aside#scene-controls menu") ??
        document.querySelector("#ui-left menu");

    if (!menu) return;

    const btn = document.createElement("button");
    btn.id = "t20-hidden-test-btn";
    btn.type = "button";
    btn.className = "control ui-control layer icon fa-solid fa-dice-d20";
    btn.setAttribute("data-tooltip", "Solicitar Teste Secreto de Perícia");
    btn.setAttribute("aria-label", "Solicitar Teste Secreto de Perícia");
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openHiddenTestGMDialog();
    });

    const li = document.createElement("li");
    li.appendChild(btn);
    menu.appendChild(li);
}

function setupToolbarButton(): void {
    Hooks.on("renderSceneControls", () => injectToolbarButton());
    // Also try immediately in case the hook already fired
    Hooks.once("ready", () => injectToolbarButton());
}

// ── Public entry ──────────────────────────────────────────────────────────────

export function setupHiddenTest(): void {
    ensureHiddenTestStyles();
    setupSocket();
    setupChatHook();
    setupToolbarButton();
}
