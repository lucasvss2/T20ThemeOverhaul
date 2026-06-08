/**
 * Sheet-change log (GM audit trail).
 *
 * Records every meaningful change to a player character's sheet — PV/PM,
 * dinheiro, munição/consumíveis, atributos, perícias, nível, itens e condições
 * — into a persistent, GM-only Journal Entry (one page per personagem, mais
 * recente no topo). Tenta nomear a ORIGEM da mudança (dano de X, cura de Y, …)
 * via a dica passada por outros subsistemas em `options[MODULE_ID].origin`;
 * caso contrário registra "alteração manual" + qual usuário fez a mudança.
 *
 * Decisões de design (confirmadas com o usuário):
 *  - Superfície: Journal Entry persistente.
 *  - Escopo: tudo na ficha (diff do objeto `changes` do hook → sem ruído de
 *    dados derivados, que não passam pelo update).
 *  - Atribuição: usuário sempre + origem quando detectável.
 *
 * Apenas o GM ativo (menor userId entre GMs ativos) escreve no journal —
 * evita escritas duplicadas em mundos multi-GM. As escritas são serializadas
 * por personagem para evitar corridas em combate.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import {
    diffChanges,
    flattenLeaves,
    getByPath,
    originPhrase,
    type ChangeEntry,
    type OriginHint,
} from "./format";

const JOURNAL_NAME = "📜 Log de Alterações — Fichas";
const SNAP_KEY = `${MODULE_ID}.sheetLogSnapshot`;
const SETTING_ENABLED = "sheetLog.enabled";
const SETTING_NPCS = "sheetLog.includeNpcs";
const MAX_ENTRIES = 500;

// ── Stored record shape (persisted in the page flag) ───────────────────────────

interface LogRecord {
    ts: number;        // Date.now()
    user: string;      // who triggered the change
    origin: string;    // origin phrase ("dano de X", "alteração manual", …)
    label: string;     // field label ("PV")
    detail: string;    // "25 → 20 (-5)"
    delta: number | null;
}

// ── Settings & gating ───────────────────────────────────────────────────────

function isLogEnabled(): boolean {
    try {
        return game.settings.get(MODULE_ID, SETTING_ENABLED) !== false;
    } catch {
        return true;
    }
}

function includeNpcs(): boolean {
    try {
        return game.settings.get(MODULE_ID, SETTING_NPCS) === true;
    } catch {
        return false;
    }
}

function isLoggableActor(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    if (actor.type === "character") return true;
    if (actor.type === "npc") return includeNpcs();
    return false;
}

/** Only the lowest-id active GM writes to the journal. */
function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter((u) => u.isGM && u.active)
        .map((u) => u.id)
        .sort();
    return activeGMs[0] === myId;
}

function userName(userId: string | undefined): string {
    return (userId ? game.users?.get(userId)?.name : undefined) ?? "Desconhecido";
}

function readOrigin(options: Record<string, unknown> | undefined): OriginHint | undefined {
    const bag = options?.[MODULE_ID] as { origin?: OriginHint } | undefined;
    return bag?.origin;
}

// ── Journal I/O (memoized + serialized) ────────────────────────────────────────

let _journalPromise: Promise<JournalEntry | null> | null = null;

async function getLogJournal(): Promise<JournalEntry | null> {
    if (_journalPromise) {
        const memo = await _journalPromise;
        // Re-validate: GM may have deleted the journal mid-session.
        if (memo && game.journal?.get(memo.id)) return memo;
        _journalPromise = null;
    }
    _journalPromise = (async () => {
        const existing = game.journal?.getName(JOURNAL_NAME) ?? null;
        if (existing) return existing;
        try {
            const created = await JournalEntry.create({
                name: JOURNAL_NAME,
                // default 0 = NONE → only GMs (who always have OWNER) see it.
                ownership: { default: 0 },
                flags: { [MODULE_ID]: { sheetLog: true } },
            });
            return created ?? null;
        } catch (e) {
            warn(`sheet-log: falha ao criar journal — ${String(e)}`);
            return null;
        }
    })();
    return _journalPromise;
}

/** Find (by actorId flag) or create the per-personagem page. */
async function getActorPage(journal: JournalEntry, actor: FoundryActor): Promise<JournalEntryPage | null> {
    const pages = journal.pages?.contents ?? [];
    const found = pages.find(
        (p) => (p.flags?.[MODULE_ID] as { actorId?: string } | undefined)?.actorId === actor.id,
    );
    if (found) return found;
    try {
        const created = await journal.createEmbeddedDocuments("JournalEntryPage", [
            {
                name: actor.name,
                type: "text",
                title: { show: true, level: 1 },
                text: { content: "", format: 1 },
                flags: { [MODULE_ID]: { actorId: actor.id, entries: [] } },
            },
        ]);
        return (created?.[0] as JournalEntryPage | undefined) ?? null;
    } catch (e) {
        warn(`sheet-log: falha ao criar página para ${actor.name} — ${String(e)}`);
        return null;
    }
}

// Per-actor write queue → serialize appends (combat fires updates rapidly).
const _queues = new Map<string, Promise<void>>();

function enqueueAppend(actor: FoundryActor, records: LogRecord[]): void {
    const prev = _queues.get(actor.id) ?? Promise.resolve();
    const next = prev.then(() => appendRecords(actor, records)).catch((e) => {
        warn(`sheet-log: append falhou — ${String(e)}`);
    });
    _queues.set(actor.id, next);
}

async function appendRecords(actor: FoundryActor, records: LogRecord[]): Promise<void> {
    const journal = await getLogJournal();
    if (!journal) return;
    const page = await getActorPage(journal, actor);
    if (!page) return;

    const existing = ((page.flags?.[MODULE_ID] as { entries?: LogRecord[] } | undefined)?.entries) ?? [];
    const merged = [...records, ...existing].slice(0, MAX_ENTRIES);

    await page.update({
        name: actor.name, // keep page title fresh on rename
        [`flags.${MODULE_ID}.entries`]: merged,
        "text.content": renderEntries(merged),
    });
}

// ── Rendering ───────────────────────────────────────────────────────────────

const GOLD = "#c8a96e";
const RED = "#cc4444";
const GREEN = "#6ecf7a";
const MUTED = "#9a8e7a";

function esc(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderRow(r: LogRecord): string {
    const d = new Date(r.ts);
    const time = d.toLocaleString();
    const deltaColor = r.delta == null ? GOLD : r.delta < 0 ? RED : GREEN;
    return (
        `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 6px;border-bottom:1px solid rgba(200,169,110,0.12);">` +
        `<span style="color:${MUTED};font-size:0.78em;white-space:nowrap;min-width:130px;">${esc(time)}</span>` +
        `<span style="flex:1;"><strong style="color:${deltaColor};">${esc(r.label)}</strong> ` +
        `<span style="color:#e8e0d0;">${esc(r.detail)}</span> ` +
        `<span style="color:${MUTED};font-style:italic;">— ${esc(r.origin)} · ${esc(r.user)}</span></span>` +
        `</div>`
    );
}

function renderEntries(records: LogRecord[]): string {
    const rows = records.map(renderRow).join("");
    const header =
        `<div style="color:${GOLD};font-weight:700;letter-spacing:0.04em;margin-bottom:6px;">` +
        `Histórico de alterações (mais recente no topo · ${records.length} registro(s))</div>`;
    return `<div style="font-family:'Signika',sans-serif;">${header}${rows}</div>`;
}

// ── Record building ───────────────────────────────────────────────────────────

function toRecords(entries: ChangeEntry[], user: string, origin: OriginHint | undefined): LogRecord[] {
    const ts = Date.now();
    const phrase = originPhrase(origin);
    return entries.map((e) => ({
        ts, user, origin: phrase, label: e.label, detail: e.detail, delta: e.delta,
    }));
}

function logEntries(actor: FoundryActor, entries: ChangeEntry[], user: string, origin?: OriginHint): void {
    if (!entries.length) return;
    enqueueAppend(actor, toRecords(entries, user, origin));
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function setupSheetLog(): void {
    registerSettings();

    // 1. Snapshot old values BEFORE the write (same options obj reaches updateActor).
    Hooks.on("preUpdateActor", (...args: unknown[]) => {
        if (!isLogEnabled()) return;
        const actor = args[0] as FoundryActor;
        const changes = args[1] as Record<string, unknown>;
        const options = args[2] as Record<string, unknown>;
        if (!isLoggableActor(actor)) return;
        const flat = flattenLeaves(changes);
        const snap: Record<string, unknown> = {};
        for (const path of Object.keys(flat)) snap[path] = getByPath(actor, path);
        options[SNAP_KEY] = snap;
    });

    // 2. After the write → diff & append (only the active GM writes).
    Hooks.on("updateActor", (...args: unknown[]) => {
        if (!isLogEnabled() || !isActiveGM()) return;
        const actor = args[0] as FoundryActor;
        const changes = args[1] as Record<string, unknown>;
        const options = args[2] as Record<string, unknown>;
        const userId = args[3] as string | undefined;
        if (!isLoggableActor(actor)) return;
        const snap = (options[SNAP_KEY] as Record<string, unknown> | undefined) ?? {};
        const entries = diffChanges(changes, snap);
        logEntries(actor, entries, userName(userId), readOrigin(options));
    });

    // 3. Itens adicionados / removidos.
    Hooks.on("createItem", (...args: unknown[]) => {
        if (!isLogEnabled() || !isActiveGM()) return;
        const item = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        const actor = item.parent ?? item.actor ?? null;
        if (!isLoggableActor(actor) || !actor) return;
        logEntries(actor, [{
            path: "item", label: "Item adicionado",
            detail: `${item.name}${item.type ? ` (${item.type})` : ""}`, delta: null,
        }], userName(userId));
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        if (!isLogEnabled() || !isActiveGM()) return;
        const item = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        const actor = item.parent ?? item.actor ?? null;
        if (!isLoggableActor(actor) || !actor) return;
        logEntries(actor, [{
            path: "item", label: "Item removido",
            detail: `${item.name}${item.type ? ` (${item.type})` : ""}`, delta: null,
        }], userName(userId));
    });

    // 4. Munição / consumíveis — variação de quantidade.
    Hooks.on("preUpdateItem", (...args: unknown[]) => {
        if (!isLogEnabled()) return;
        const item = args[0] as FoundryItem;
        const changes = args[1] as Record<string, unknown>;
        const options = args[2] as Record<string, unknown>;
        const qty = getByPath(changes, "system.quantidade");
        if (qty === undefined) return;
        options[SNAP_KEY] = { quantidade: (item.system as Record<string, unknown>)?.["quantidade"] };
    });

    Hooks.on("updateItem", (...args: unknown[]) => {
        if (!isLogEnabled() || !isActiveGM()) return;
        const item = args[0] as FoundryItem;
        const changes = args[1] as Record<string, unknown>;
        const options = args[2] as Record<string, unknown>;
        const userId = args[3] as string | undefined;
        const actor = item.parent ?? item.actor ?? null;
        if (!isLoggableActor(actor) || !actor) return;
        const newQty = getByPath(changes, "system.quantidade");
        if (newQty === undefined) return;
        const oldQty = (options[SNAP_KEY] as { quantidade?: unknown } | undefined)?.quantidade;
        if (oldQty === newQty) return;
        const delta = (typeof oldQty === "number" && typeof newQty === "number") ? newQty - oldQty : null;
        const sign = delta == null ? "" : delta > 0 ? ` (+${delta})` : ` (${delta})`;
        logEntries(actor, [{
            path: "item.quantidade", label: `Quantidade — ${item.name}`,
            detail: `${oldQty ?? "—"} → ${newQty}${sign}`, delta,
        }], userName(userId));
    });

    // 5. Condições / efeitos (ignora os AEs do próprio módulo).
    Hooks.on("createActiveEffect", (...args: unknown[]) => {
        if (!isLogEnabled() || !isActiveGM()) return;
        logActiveEffect(args, "Condição/efeito adicionado");
    });
    Hooks.on("deleteActiveEffect", (...args: unknown[]) => {
        if (!isLogEnabled() || !isActiveGM()) return;
        logActiveEffect(args, "Condição/efeito removido");
    });

    log("Sheet-log (auditoria de fichas) instalado.");
}

function logActiveEffect(args: unknown[], label: string): void {
    const effect = args[0] as FoundryItemEffect;
    const userId = args[2] as string | undefined;
    // Skip effects created/managed by this module (automation noise).
    if (effect.flags?.[MODULE_ID]) return;
    const parent = effect.parent;
    if (!parent || !("type" in parent)) return;
    const actor = parent as FoundryActor;
    if (!isLoggableActor(actor)) return;
    logEntries(actor, [{ path: "effect", label, detail: effect.name, delta: null }], userName(userId));
}

// ── Settings ──────────────────────────────────────────────────────────────────

function registerSettings(): void {
    game.settings.register(MODULE_ID, SETTING_ENABLED, {
        name: "Log de alterações de ficha",
        hint: "Registra alterações nas fichas (PV/PM, dinheiro, munição, itens, condições…) num Diário só para o GM.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });
    game.settings.register(MODULE_ID, SETTING_NPCS, {
        name: "Incluir Ameaças (NPCs) no log",
        hint: "Quando ativo, alterações em fichas de Ameaça/NPC também são registradas. Pode gerar muito ruído em combate.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });
}
