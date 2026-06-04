/**
 * Integration layer: T20 roll interception and BG3 cinematic overlay.
 *
 * Flow:
 *   createChatMessage → parse T20 flavor → show overlay immediately
 *   Overlay auto-dismisses after 3 s or on click, whichever comes first.
 */

import { parseT20 } from "@/parser/t20";
import { MODULE_ID, SYSTEM_ID } from "@/constants";
import { log } from "@/utils/logging";

import { BG3Overlay, type GridRollEntry } from "@/overlay/BG3Overlay";

// Tempo (ms) entre rolagens de iniciativa pra considerar como um lote — basta
// para "Rolar para Todos / PNJs" coalescer todas as mensagens num único grid.
const INITIATIVE_BATCH_MS = 1000;
const INITIATIVE_CATEGORY = "Iniciativa";

// ── Initiative batching ──────────────────────────────────────────────────────

const _initBatch: GridRollEntry[] = [];
let _initFlushTimer: ReturnType<typeof setTimeout> | null = null;

function batchInitiative(entry: GridRollEntry): void {
    _initBatch.push(entry);
    if (_initFlushTimer) clearTimeout(_initFlushTimer);
    _initFlushTimer = setTimeout(flushInitiativeBatch, INITIATIVE_BATCH_MS);
}

function flushInitiativeBatch(): void {
    _initFlushTimer = null;
    if (_initBatch.length === 0) return;
    const batch = _initBatch.splice(0);
    if (batch.length === 1) {
        const [{ meta, roll }] = batch;
        BG3Overlay.show(meta, roll);
    } else {
        BG3Overlay.showGrid(batch, INITIATIVE_CATEGORY);
    }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function setupIntegration(): void {
    installOverlayHook();
}

// ── Core overlay hook ─────────────────────────────────────────────────────────

function installOverlayHook(): void {
    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;

        if (game.system.id !== SYSTEM_ID) return;

        // Hidden test messages are handled by hidden-test/index.ts
        if (message.getFlag(MODULE_ID, "hiddenTest")) return;

        const rolls = getRolls(message);
        if (!rolls.length) {
            log("Sem rolagens na mensagem — ignorada.");
            return;
        }

        const flavor = resolveFlavorText(message);
        log(`Rolagem detectada — flavor: "${flavor}", total: ${String(rolls[0]?.total)}`);

        const rollMeta = parseT20({ flavor });
        if (!rollMeta) {
            log(`Tipo não reconhecido para: "${flavor.slice(0, 80)}"`);
            return;
        }

        const roll = rolls[0];
        if (!roll) return;

        // Iniciativa: agrupa rolagens próximas (Rolar para Todos / PNJs) num grid.
        // O próprio debounce do INITIATIVE_BATCH_MS dá tempo da animação DSN rodar.
        if (rollMeta.category === INITIATIVE_CATEGORY) {
            const name = message.speaker?.alias ?? "Combatente";
            batchInitiative({ meta: rollMeta, roll, name });
            return;
        }

        setTimeout(() => BG3Overlay.show(rollMeta, roll), 1000);
    });

    log("Overlay cinemático T20 instalado.");
}

// ── Roll extraction ───────────────────────────────────────────────────────────

/**
 * Extract Roll objects from a ChatMessage.
 * In Foundry v13, message.rolls already contains deserialized Roll instances.
 */
function getRolls(message: ChatMessage): Roll[] {
    return message.rolls ?? [];
}

// ── Flavor text resolution ────────────────────────────────────────────────────

/**
 * Resolve the roll label for a ChatMessage.
 *
 * t20 creates messages with flavor='' and embeds the item/skill name
 * inside the content HTML (typically in <h3 class="item-name">).
 * We try multiple sources in order.
 */
export function resolveFlavorText(message: ChatMessage): string {
    // 1. Direct flavor property
    const direct = message.flavor?.trim();
    if (direct) return direct;

    const content = message.content ?? "";

    // 2. data-* attribute with the item or ability name
    const dataNameMatch = content.match(/data-(?:item-name|ability-name|pericia|name)="([^"]+)"/i);
    if (dataNameMatch?.[1]) return decodeHtmlEntities(dataNameMatch[1]);

    // 3. Heading elements (h1–h6), stripping inner tags, skipping pure-numeric text
    const headingRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(content)) !== null) {
        const text = m[1].replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
        if (text && !/^\d+$/.test(text)) return text;
    }

    // 4. Elements with class names indicating a label / title
    const labelRe = /class="[^"]*\b(?:item-name|card-title|ability-name|roll-label|skill-name|pericia-name)\b[^"]*"[^>]*>([\s\S]*?)</gi;
    while ((m = labelRe.exec(content)) !== null) {
        const text = m[1].replace(/<[^>]*>/g, "").trim();
        if (text && !/^\d+$/.test(text)) return text;
    }

    // 5. First meaningful plain-text line from the content
    const lines = content
        .replace(/<[^>]*>/g, "\n")
        .split("\n")
        .map((l) => l.replace(/&[a-z]+;/gi, " ").trim())
        .filter((l) => l.length > 1 && !/^\d+$/.test(l));
    if (lines[0]) return lines[0].slice(0, 200);

    return "";
}

function decodeHtmlEntities(s: string): string {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
