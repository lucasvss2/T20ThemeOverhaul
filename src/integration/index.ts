/**
 * Integration layer: T20 roll interception and T20 cinematic overlay.
 *
 * Flow:
 *   createChatMessage → parse T20 flavor → show overlay immediately
 *   Overlay auto-dismisses after 3 s or on click, whichever comes first.
 */

import { parseT20 } from "@/parser/t20";
import { MODULE_ID, SYSTEM_ID } from "@/constants";
import { log } from "@/utils/logging";
import { computeEffectiveCriticoM } from "@/grito-kiai/index";

import { T20Overlay, type GridRollEntry } from "@/overlay/T20Overlay";

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
        T20Overlay.show(meta, roll);
    } else {
        T20Overlay.showGrid(batch, INITIATIVE_CATEGORY);
    }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function setupIntegration(): void {
    installOverlayHook();
}

// ── Visibilidade de rolagens secretas ─────────────────────────────────────────

export interface RollVisibilityInfo {
    /** IDs de usuários do whisper (vazio = mensagem pública). */
    whisper: string[];
    /** Rolagem blind (secreta): nem o autor vê o resultado. */
    blind: boolean;
    /** ID do autor da mensagem. */
    authorId: string;
}

/**
 * Pode `myId` ver o RESULTADO desta rolagem?
 *  - pública (sem whisper)   → todos
 *  - blind (secreta)         → apenas destinatários do whisper (GMs); o autor
 *                              NÃO vê (semântica do blind roll do Foundry)
 *  - whisper/self (privada)  → destinatários + o próprio autor
 * Pura → testável. Antes deste gate, o overlay vazava o resultado de testes
 * secretos da ameaça para todos os players.
 */
export function canSeeRollResult(info: RollVisibilityInfo, myId: string): boolean {
    if (!info.whisper.length && !info.blind) return true;
    if (info.blind) return info.whisper.includes(myId);
    return info.whisper.includes(myId) || info.authorId === myId;
}

function messageVisibilityInfo(message: ChatMessage): RollVisibilityInfo {
    const m = message as unknown as {
        whisper?: string[]; blind?: boolean;
        author?: { id?: string }; user?: string | { id?: string };
    };
    const authorId = m.author?.id ?? (typeof m.user === "string" ? m.user : m.user?.id) ?? "";
    return {
        whisper: Array.isArray(m.whisper) ? m.whisper : [],
        blind: m.blind === true,
        authorId,
    };
}

// ── Core overlay hook ─────────────────────────────────────────────────────────

function installOverlayHook(): void {
    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;

        if (game.system.id !== SYSTEM_ID) return;

        // Hidden test messages are handled by hidden-test/index.ts
        if (message.getFlag(MODULE_ID, "hiddenTest")) return;

        // Rolagens secretas/sussurradas: só mostra o overlay pra quem pode ver
        // o resultado (destinatários do whisper; autor em rolls privados).
        if (!canSeeRollResult(messageVisibilityInfo(message), game.user?.id ?? "")) {
            log("Rolagem secreta/sussurrada — overlay suprimido para este usuário.");
            return;
        }

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

        // Ataques: detecta crítico pela MARGEM efetiva (Precisa etc. baixam a
        // margem para 19/18/…), diferenciando 20 natural × margem ampliada.
        const isAttack = rollMeta.category === "Ataque" || rollMeta.category === "Ataque Mágico";
        const opts = isAttack
            ? { isAttack: true, critThreshold: attackCritThreshold(message) }
            : undefined;

        setTimeout(() => T20Overlay.show(rollMeta, roll, undefined, opts), 1000);
    });

    log("Overlay cinemático T20 instalado.");
}

// ── Margem de crítico efetiva de um ataque ────────────────────────────────────

/**
 * Margem de ameaça efetiva da mensagem de ataque. Usa a flag `critThreshold`
 * (setada pelo reroll, que já conhece o criticoM efetivo); senão calcula via
 * computeEffectiveCriticoM a partir da arma + AEs (inclui Precisa, Manopla, …).
 */
function attackCritThreshold(message: ChatMessage): number {
    const flagged = message.getFlag?.(MODULE_ID, "critThreshold") as number | undefined;
    if (typeof flagged === "number" && flagged > 0) return flagged;
    const { actor, weapon } = resolveAttacker(message);
    return computeEffectiveCriticoM(message, actor, weapon);
}

function resolveAttacker(message: ChatMessage): { actor: FoundryActor | null; weapon: FoundryItem | null } {
    const spk = message.speaker as { token?: string; actor?: string } | undefined;
    type Lyr = { get(id: string): { actor: FoundryActor | null } | undefined };
    const tokenLyr = (canvas as unknown as { tokens?: Lyr }).tokens;
    const actor = (spk?.token ? tokenLyr?.get(spk.token)?.actor ?? null : null)
        ?? (spk?.actor ? game.actors?.get(spk.actor) ?? null : null);
    const itemId = (message.content as string | undefined)?.match(/data-item-id="([^"]+)"/)?.[1];
    const weapon = (itemId && actor) ? actor.items?.get(itemId) ?? null : null;
    return { actor, weapon };
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
