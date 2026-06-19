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
    applyRetention,
    dayKey,
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
const SETTING_MAX = "sheetLog.maxEntries";
/** Máximo de linhas RENDERIZADAS na página (os dados completos ficam no flag). */
const RENDER_MAX = 300;

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

/** Limite de registros por personagem (0 = ilimitado/permanente — default). */
function maxEntries(): number {
    try {
        const v = Number(game.settings.get(MODULE_ID, SETTING_MAX));
        return Number.isFinite(v) ? v : 0;
    } catch {
        return 0;
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
    // Retenção: default ILIMITADA (histórico permanente até o GM apagar
    // manualmente); a setting sheetLog.maxEntries pode impor um teto.
    const merged = applyRetention([...records, ...existing], maxEntries());

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
    const time = new Date(r.ts).toLocaleTimeString("pt-BR");
    const deltaColor = r.delta == null ? GOLD : r.delta < 0 ? RED : GREEN;
    return (
        `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 6px;border-bottom:1px solid rgba(200,169,110,0.12);">` +
        `<span style="color:${MUTED};font-size:0.78em;white-space:nowrap;min-width:70px;">${esc(time)}</span>` +
        `<span style="flex:1;"><strong style="color:${deltaColor};">${esc(r.label)}</strong> ` +
        `<span style="color:#e8e0d0;">${esc(r.detail)}</span> ` +
        `<span style="color:${MUTED};font-style:italic;">— ${esc(r.origin)} · ${esc(r.user)}</span></span>` +
        `</div>`
    );
}

/** Divisor visual entre dias (sessões) — facilita ler o histórico acumulado. */
function renderDayDivider(day: string): string {
    return (
        `<div style="margin:10px 0 4px;padding:3px 6px;color:${GOLD};font-weight:700;` +
        `font-size:0.82em;letter-spacing:0.08em;border-bottom:1px solid rgba(200,169,110,0.45);">` +
        `📅 ${esc(day)}</div>`
    );
}

function renderEntries(records: LogRecord[]): string {
    const shown = records.slice(0, RENDER_MAX);
    const rows: string[] = [];
    let lastDay = "";
    for (const r of shown) {
        const day = dayKey(r.ts);
        if (day !== lastDay) {
            rows.push(renderDayDivider(day));
            lastDay = day;
        }
        rows.push(renderRow(r));
    }
    const trimmedNote = records.length > shown.length
        ? ` · exibindo os ${shown.length} mais recentes`
        : "";
    const header =
        `<div style="color:${GOLD};font-weight:700;letter-spacing:0.04em;margin-bottom:2px;">` +
        `Histórico de alterações (mais recente no topo · ${records.length} registro(s)${trimmedNote})</div>` +
        `<div style="color:${MUTED};font-size:0.78em;margin-bottom:6px;">` +
        `Histórico permanente entre sessões — para limpar, use “Manutenção do log” nas configurações do módulo ` +
        `(ou apague este Diário/página manualmente).</div>`;
    return `<div style="font-family:'Signika',sans-serif;">${header}${rows.join("")}</div>`;
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
    game.settings.register(MODULE_ID, SETTING_MAX, {
        name: "Log de fichas — máximo de registros por personagem",
        hint: "0 = ilimitado (histórico permanente entre sessões, até apagar manualmente). Um número > 0 mantém apenas os N registros mais recentes de cada personagem.",
        scope: "world",
        config: true,
        type: Number,
        default: 0,
    });
    // Menu GM: limpeza manual do log (botão nas configurações do módulo).
    // O Foundry EXIGE que `type` seja subclasse de FormApplication/ApplicationV2 —
    // uma classe qualquer faz registerMenu LANÇAR e derrubar o setup inteiro
    // (bug v1.43.0). Por isso: subclasse real + try/catch de isolamento.
    try {
        const MenuType = buildMaintenanceMenuType();
        if (MenuType) {
            game.settings.registerMenu?.(MODULE_ID, "sheetLog.maintenance", {
                name: "Log de fichas — manutenção",
                label: "Manutenção do log",
                hint: "Apagar o histórico de alterações de fichas (todo o Diário). Ação manual e irreversível.",
                icon: "fas fa-scroll",
                restricted: true,
                type: MenuType,
            });
        }
    } catch (e) {
        warn("sheet-log: registerMenu falhou (menu de manutenção indisponível):", e);
    }
}

/**
 * Constrói o tipo do menu de manutenção como subclasse REAL de FormApplication
 * (exigência do registerMenu). O render é sobrescrito para abrir nosso Dialog —
 * o template do FormApplication nunca é usado.
 */
function buildMaintenanceMenuType(): (new () => { render(force?: boolean): unknown }) | null {
    const Base = (globalThis as unknown as {
        FormApplication?: new (object?: object, options?: object) => { render(force?: boolean): unknown };
    }).FormApplication;
    if (!Base) return null;
    const Cls = class extends Base {
        render(): unknown {
            openMaintenanceDialog();
            return this;
        }
    };
    return Cls as unknown as new () => { render(force?: boolean): unknown };
}

/** Dialog GM de manutenção: apagar todo o log (Diário inteiro). */
function openMaintenanceDialog(): void {
    if (!game.user?.isGM) return;
    const journal = game.journal?.getName(JOURNAL_NAME) ?? null;
    const pages = journal?.pages?.contents ?? [];
    const totals = pages.map((p) => {
        const n = ((p.flags?.[MODULE_ID] as { entries?: unknown[] } | undefined)?.entries ?? []).length;
        return `<li>${p.name}: <b>${n}</b> registro(s)</li>`;
    }).join("");
    const body = journal
        ? `<p>O log atual contém:</p><ul>${totals || "<li>(vazio)</li>"}</ul>
           <p><b>Apagar TODO o log?</b> Essa ação é irreversível — o Diário inteiro será excluído.
           Um novo (vazio) será criado automaticamente na próxima alteração de ficha.</p>`
        : `<p>Não há log no momento — ele será criado automaticamente na próxima alteração de ficha.</p>`;

    new Dialog({
        title: "Log de fichas — manutenção",
        content: `<div style="padding:4px 2px;">${body}</div>`,
        buttons: journal ? {
            wipe: {
                icon: '<i class="fas fa-trash"></i>',
                label: "Apagar TODO o log",
                callback: () => {
                    void (journal as unknown as { delete(): Promise<unknown> }).delete().then(() => {
                        ui.notifications?.info("Log de alterações de fichas apagado.");
                        log("Sheet-log: diário apagado manualmente pelo GM.");
                    });
                },
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
        } : {
            ok: { icon: '<i class="fas fa-check"></i>', label: "Entendi" },
        },
        default: "cancel",
    }, { classes: ["t20-dialog"], width: 420 }).render(true);
}
