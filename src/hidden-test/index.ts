import { MODULE_ID } from "@/constants";
import { T20Overlay } from "@/overlay/T20Overlay";
import { onSocketReady } from "@/socket";
import { registerSkillAction } from "@/ui/skills-menu";
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

// ── Menu "T20 Overhaul" ──────────────────────────────────────────────────────

function registerMenuAction(): void {
    registerSkillAction({
        id: "hidden-test-request",
        label: "Solicitar Teste Secreto de Perícia",
        icon: "fa-solid fa-dice-d20",
        isVisible: () => !!game.user?.isGM,
        onClick: () => openHiddenTestGMDialog(),
    });
}

// ── Public entry ──────────────────────────────────────────────────────────────

export function setupHiddenTest(): void {
    ensureHiddenTestStyles();
    setupSocket();
    setupChatHook();
    registerMenuAction();
}
