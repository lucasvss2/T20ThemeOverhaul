/**
 * T20-style restyling for Tormenta20 chat roll cards.
 * Injects CSS and fixes missing attribute labels via renderChatMessage hook.
 */

import { MODULE_ID } from "@/constants";
import { parseT20 } from "@/parser/t20";
import { resolveFlavorText } from "@/integration/index";
import { log } from "@/utils/logging";
import CHAT_STYLES from "./chat.css?inline";

const CHAT_STYLES_ID = "t20-chat-styles";

// ── T20 attribute key → display label ────────────────────────────────────────

const ATTR_LABELS: Record<string, string> = {
    for: "Força",
    des: "Destreza",
    con: "Constituição",
    int: "Inteligência",
    sab: "Sabedoria",
    car: "Carisma",
};

// ── CSS ───────────────────────────────────────────────────────────────────────



// ── Condition-card theme (JS override) ───────────────────────────────────────

/**
 * T20 calls `game.tormenta20.macros.msgFromJournal()` whenever a condition is
 * applied.  It creates a ChatMessage whose content is:
 *   <div style="position:relative; background: #ddd9d5; margin-left:-7px; ...">
 *     [journal page HTML]
 *   </div>
 *
 * CSS attribute selectors are unreliable here because DOMPurify may normalise
 * the colour string (`#ddd9d5` → `rgb(221,217,213)`).  We instead detect the
 * card in the `renderChatMessage` hook and override the inline style directly
 * via `element.style.setProperty(…, 'important')`, which is the only reliable
 * way to beat an inline style in JavaScript.
 */
function applyConditionCardTheme(message: ChatMessage, root: HTMLElement): void {
    // Skip T20 spell/item cards — they have their own theme
    const t20Flags = message.flags?.["tormenta20"] as Record<string, unknown> | undefined;
    if (t20Flags?.["itemData"]) return;

    // Skip resistance roll messages — already themed via t20-resistance-roll
    if (message.getFlag(MODULE_ID, "resistanceRoll")) return;

    const msgContent = root.querySelector(".message-content");
    if (!msgContent) return;

    // Skip messages that already have a styled T20 card, a dice roll, or our
    // hidden-test card — they are not condition notification cards
    if (msgContent.querySelector(".tormenta20.chat-card, .dice-roll, .aeris-hidden-test-card")) return;

    // ── Detection ─────────────────────────────────────────────────────────────
    // A T20 condition journal card has at least one of:
    //   • <label class="titulo">  — condition name heading (TYPE 1 cards)
    //   • <div style="position:absolute; …">  — decorative red corner triangle
    //                                            (present in every card)
    // We detect against msgContent so that messages with deep nesting still match.
    const hasT20Title  = !!msgContent.querySelector("label.titulo");
    const hasT20Corner = !!msgContent.querySelector("div[style*='absolute']");
    if (!hasT20Title && !hasT20Corner) return;

    // The outer wrapper for the dark-theme background is the first direct child
    // <div> of .message-content.  If that doesn't exist, we still apply
    // colour overrides to msgContent's descendants so the text is readable.
    const wrapper = msgContent.querySelector<HTMLElement>(":scope > div");
    if (wrapper) {
        wrapper.style.setProperty("background",    "radial-gradient(ellipse at top, #1c1209 0%, #090604 100%)", "important");
        wrapper.style.setProperty("border",        "1px solid rgba(106, 78, 24, 0.45)", "important");
        wrapper.style.setProperty("border-radius", "4px",                               "important");
        wrapper.style.setProperty("box-shadow",    "0 0 0 1px #2a1e08, 0 4px 18px rgba(0,0,0,0.75)", "important");
        wrapper.style.setProperty("color",         "#7a6e5a",                           "important");
        wrapper.style.setProperty("padding",       "8px 12px",                          "important");
        wrapper.classList.add("t20-condition-card");
    }
    root.classList.add("t20-condition-message");

    // ── Force-override colours on every text descendant ──────────────────────
    // We scope to msgContent (not wrapper) — this guarantees the overrides hit
    // every element, even when the wrapper detection grabs the wrong inner div.
    //
    // T20 condition cards use:
    //   <label class="titulo">  ← condition name      → keep T20 red  (#b02b2e)
    //   <label> (no class)      ← subtitle            → gold          (#c8a96e)
    //   <p>, <li>               ← body text           → muted brown   (#7a6e5a)

    // Title — force T20 red (iconic + good contrast on dark)
    msgContent.querySelectorAll<HTMLElement>("label.titulo").forEach(el => {
        el.style.setProperty("color",      "#b02b2e", "important");
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("text-shadow", "0 0 8px rgba(176,43,46,0.35)", "important");
    });
    // Subtitle (plain <label>) — gold
    msgContent.querySelectorAll<HTMLElement>("label:not(.titulo)").forEach(el => {
        el.style.setProperty("color",      "#c8a96e", "important");
        el.style.setProperty("background", "transparent", "important");
    });
    // Body text & list items — muted brown
    msgContent.querySelectorAll<HTMLElement>("p, li, span:not(.content-link)").forEach(el => {
        el.style.setProperty("color", "#7a6e5a", "important");
    });
    // Headings (fallback for non-T20-styled cards) — gold
    msgContent.querySelectorAll<HTMLElement>("h1, h2, h3, h4").forEach(el => {
        el.style.setProperty("color",       "#c8a96e", "important");
        el.style.setProperty("border",      "none",    "important");
        el.style.setProperty("background",  "transparent", "important");
        el.style.setProperty("text-shadow", "none",    "important");
    });
    // Bold / strong accents — gold
    msgContent.querySelectorAll<HTMLElement>("b, strong").forEach(el => {
        el.style.setProperty("color", "#c8a96e", "important");
    });
    // Italic emphasis — keep body colour
    msgContent.querySelectorAll<HTMLElement>("em, i").forEach(el => {
        el.style.setProperty("color", "#7a6e5a", "important");
    });
    // Inline links (journal content-link buttons) — gold
    msgContent.querySelectorAll<HTMLElement>("a, .content-link").forEach(el => {
        el.style.setProperty("color",           "#c8a96e", "important");
        el.style.setProperty("background",      "rgba(200,169,110,0.12)", "important");
        el.style.setProperty("border",          "1px solid rgba(200,169,110,0.4)", "important");
        el.style.setProperty("border-radius",   "3px",     "important");
        el.style.setProperty("padding",         "1px 5px", "important");
        el.style.setProperty("text-decoration", "none",    "important");
    });
    msgContent.querySelectorAll<HTMLElement>("hr").forEach(el => {
        el.style.setProperty("border",     "none",                              "important");
        el.style.setProperty("border-top", "1px solid rgba(106, 78, 24, 0.4)", "important");
        el.style.setProperty("margin",     "4px 0",                            "important");
    });
    // T20's internal 5px horizontal separator — make transparent
    msgContent.querySelectorAll<HTMLElement>("div[style*='height: 5px'], div[style*='height:5px']").forEach(el => {
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("border",     "none",        "important");
        el.style.setProperty("box-shadow", "none",        "important");
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureChatStyles(): void {
    if (!document.getElementById(CHAT_STYLES_ID)) {
        const el = document.createElement("style");
        el.id = CHAT_STYLES_ID;
        el.textContent = CHAT_STYLES;
        document.head.appendChild(el);
    }
}

type RollTermExt = {
    constructor?: { name?: string };
    number?: number;
};

function inferAttrLabel(message: ChatMessage, card: HTMLElement): string {
    // Only applies when there is no linked item (pure attribute test)
    if (card.dataset["itemId"]) return "";

    const roll = message.rolls?.[0] as (Roll & { terms?: RollTermExt[] }) | undefined;
    if (!roll) return "";

    // Extract the first numeric bonus after the d20
    let foundDie = false;
    let attrBonus: number | null = null;
    for (const term of roll.terms ?? []) {
        if (term.constructor?.name === "Die") { foundDie = true; continue; }
        if (foundDie && term.constructor?.name === "NumericTerm" && term.number !== undefined) {
            attrBonus = term.number;
            break;
        }
    }
    if (attrBonus === null) return "";

    // Match bonus against actor's atributos
    const actorId = message.speaker?.actor;
    if (!actorId) return "";
    const actor = game.actors?.get(actorId);
    const atributos = (actor?.system?.["atributos"]) as Record<string, { value?: number }> | undefined;
    if (!atributos) return "";

    const matches = Object.entries(atributos).filter(
        ([key, attr]) => (attr as { value?: number }).value === attrBonus && key in ATTR_LABELS
    );

    // Only resolve when unambiguous
    if (matches.length === 1) return ATTR_LABELS[matches[0]![0]] ?? "";
    if (matches.length > 1) return "Teste de Atributo";
    return "";
}

function fixEmptyItemName(message: ChatMessage, root: HTMLElement): void {
    const card = root.querySelector<HTMLElement>(".tormenta20.chat-card.item-card");
    if (!card) return;
    const nameDiv = card.querySelector<HTMLElement>(".item-name div");
    if (!nameDiv || nameDiv.textContent?.trim()) return;

    // Try flavor → parseT20 first
    const flavor = resolveFlavorText(message);
    if (flavor) {
        const meta = parseT20({ flavor });
        if (meta) {
            nameDiv.textContent = meta.subcategory
                ? `${meta.category} — ${meta.subcategory}`
                : meta.category;
            return;
        }
    }

    // Infer attribute from actor data (only for no-item rolls)
    const label = inferAttrLabel(message, card);
    if (label) nameDiv.textContent = label;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function setupChatStyling(): void {
    ensureChatStyles();

    Hooks.on("renderChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;
        const htmlArg = args[1] as unknown;
        let root: HTMLElement | undefined;
        if (htmlArg instanceof HTMLElement) {
            root = htmlArg;
        } else if (Array.isArray(htmlArg)) {
            root = htmlArg[0] as HTMLElement | undefined;
        } else if (htmlArg && typeof htmlArg === "object") {
            root = (htmlArg as Record<string, unknown>)[0] as HTMLElement | undefined;
        }
        if (!root) return;

        // Resistance roll messages — add class for CSS theming
        if (message.getFlag(MODULE_ID, "resistanceRoll")) {
            root.classList.add("t20-resistance-roll");
        }

        // T20 condition notification cards — override inline style via JS
        applyConditionCardTheme(message, root);

        fixEmptyItemName(message, root);
    });

    log("Chat card styling ativo.");
}
