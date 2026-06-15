/**
 * Contramágica — reação de TERCEIROS que anula uma magia na conjuração.
 *
 * Diferente das demais reações (sempre do próprio alvo), a Contramágica é feita
 * por qualquer conjurador na cena que conheça **Contramágica Aprimorada**
 * (pré-requisito: Dissipar Magia). Regra (pág. 173 / Dissipar Magia): ao ver uma
 * magia sendo lançada, gasta-se uma reação (custo de Dissipar Magia = 3 PM) e
 * rola-se **Misticismo**; se o resultado ≥ CD da magia, ela é **anulada**.
 *
 * Modelo de gatilho (escolhido pelo usuário): **janela no cliente do GM**. Ao
 * detectar a conjuração, o GM eleito verifica quais tokens na cena são reatores
 * elegíveis (conhecem o poder, têm ≥3 PM, reação disponível, disposição oposta
 * à do conjurador) e abre uma janela listando-os. O GM clica "Reagir" → rola
 * Misticismo → se anular, posta o card e fecha o modal de resistência do alvo
 * em todos os clientes via socket.
 *
 * Aprimoramentos passivos suportados:
 *  - **Contramágica Elemental**: +Sabedoria em Misticismo contra a escola/elemento
 *    da Afinidade (não dá pra detectar automaticamente → checkbox manual na linha).
 *  - **Contramágica Superior**: ao anular, ganha PM temporários = círculo da magia
 *    (limitado pelo PM gasto, 3).
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { getSocket, onSocketReady } from "@/socket";
import { computeSkillTotal } from "@/hidden-test/skills";
import {
    extractCD,
    extractSpellName,
    computeCasterSpellCD,
    closeSpellModalForMessage,
} from "@/spell-resistance";
import { normalizeName, roundKey, reactionAvailable, consumeReaction } from "@/reactions";

const SOCKET_NEGATED = "counterspell/negated";
const REACTION_USED_FLAG = "reactionUsedRound";
const STYLE_ID = "bg3-counterspell-styles";

const POWER_APRIMORADA = "contramagica aprimorada";
const POWER_SUPERIOR   = "contramagica superior";
const POWER_ELEMENTAL  = "contramagica elemental";
const DISSIPAR_COST    = 3; // PM de Dissipar Magia

const SPELL_TIPOS = ["arc", "div", "uni"];

/* -------------------------------------------------------------------------- */
/*  Núcleo puro (testável)                                                    */
/* -------------------------------------------------------------------------- */

/** O ator conhece Contramágica Aprimorada? (lista de nomes de itens) */
export function hasCounterspellPower(itemNames: string[]): boolean {
    return itemNames.some((n) => normalizeName(n).includes(POWER_APRIMORADA));
}

/** Contramágica bem-sucedida quando o teste de Misticismo ≥ CD da magia. */
export function counterspellSucceeds(rollTotal: number, cd: number): boolean {
    return cd > 0 && rollTotal >= cd;
}

/** PM temporários ganhos com Contramágica Superior (círculo, limitado pelo gasto). */
export function superiorTempPm(circle: number, pmSpent: number): number {
    return Math.max(0, Math.min(circle, pmSpent));
}

/* -------------------------------------------------------------------------- */
/*  Tipos de runtime                                                          */
/* -------------------------------------------------------------------------- */

type AnyObj = Record<string, unknown>;
interface ItemLike { type?: string; name?: string }
interface ActorLike {
    id?: string;
    name?: string;
    system?: AnyObj;
    items?: { contents?: ItemLike[] } | ItemLike[];
    getFlag?: (scope: string, key: string) => unknown;
    update?: (data: AnyObj) => Promise<unknown>;
}
interface TokenLike {
    id?: string;
    name?: string;
    actor?: ActorLike | null;
    document?: { disposition?: number };
}

interface Candidate {
    tokenId:     string;
    actorId:     string;
    name:        string;
    mistTotal:   number;
    pm:          number;
    sabMod:      number;
    hasSuperior: boolean;
    hasElemental: boolean;
}

function itemsOf(actor: ActorLike): ItemLike[] {
    const it = actor.items;
    if (!it) return [];
    return Array.isArray(it) ? it : (it.contents ?? []);
}
function pmOf(actor: ActorLike): number {
    return Number((actor.system?.["attributes"] as AnyObj | undefined)?.["pm"] != null
        ? (((actor.system?.["attributes"] as AnyObj)["pm"] as AnyObj)?.["value"] ?? 0) : 0);
}
function attrMod(actor: ActorLike, key: string): number {
    const at = (actor.system?.["atributos"] as AnyObj | undefined)?.[key] as AnyObj | undefined;
    return Number(at?.["value"] ?? 0);
}

function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter((u) => u.isGM && u.active)
        .map((u) => u.id)
        .sort();
    return activeGMs[0] === myId;
}

/* -------------------------------------------------------------------------- */
/*  Elegibilidade                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reatores elegíveis na cena: conhecem Contramágica Aprimorada, têm ≥3 PM,
 * reação disponível nesta rodada e disposição oposta à do conjurador (para não
 * oferecer "anular a magia do próprio aliado").
 */
function getEligibleCounterspellers(casterTokenId: string, casterDisposition: number | undefined): Candidate[] {
    const cvs = canvas as unknown as { tokens?: { placeables?: TokenLike[] } };
    const tokens = cvs.tokens?.placeables ?? [];
    const curKey = roundKey();
    const out: Candidate[] = [];
    for (const tok of tokens) {
        const actor = tok.actor;
        if (!actor || !tok.id) continue;
        if (tok.id === casterTokenId) continue;
        const disp = tok.document?.disposition;
        if (casterDisposition !== undefined && disp !== undefined && disp === casterDisposition) continue;
        const names = itemsOf(actor).filter((i) => i.type === "poder").map((i) => i.name ?? "");
        if (!hasCounterspellPower(names)) continue;
        const pm = pmOf(actor);
        if (pm < DISSIPAR_COST) continue;
        if (!reactionAvailable(actor.getFlag?.(MODULE_ID, REACTION_USED_FLAG), curKey)) continue;
        out.push({
            tokenId:      tok.id,
            actorId:      actor.id ?? "",
            name:         tok.name ?? actor.name ?? "Conjurador",
            mistTotal:    computeSkillTotal(actor as never, "mist"),
            pm,
            sabMod:       attrMod(actor, "sab"),
            hasSuperior:  itemsOf(actor).some((i) => normalizeName(i.name ?? "").includes(POWER_SUPERIOR)),
            hasElemental: itemsOf(actor).some((i) => normalizeName(i.name ?? "").includes(POWER_ELEMENTAL)),
        });
    }
    return out;
}

/* -------------------------------------------------------------------------- */
/*  Detecção de conjuração + janela                                           */
/* -------------------------------------------------------------------------- */

function escHtml(s: string): string {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

async function rollFormula(formula: string): Promise<{ total: number; html?: string; json?: unknown }> {
    const RollCls = (globalThis as unknown as { Roll?: new (f: string) => { evaluate: (o?: AnyObj) => Promise<unknown>; total?: number; render: () => Promise<string>; toJSON: () => unknown } }).Roll;
    if (!RollCls) return { total: 0 };
    const roll = new RollCls(formula);
    await roll.evaluate({ async: true });
    let html: string | undefined;
    try { html = await roll.render(); } catch { /* ignore */ }
    return { total: roll.total ?? 0, html, json: roll.toJSON() };
}

async function postCard(content: string, flags: AnyObj): Promise<void> {
    try {
        const ChatMessageCls = (globalThis as unknown as { ChatMessage?: { create: (d: AnyObj) => Promise<unknown> } }).ChatMessage;
        await ChatMessageCls?.create({ content, flags: { [MODULE_ID]: flags } });
    } catch (err) { warn("counterspell: falha ao postar card:", err); }
}

function processCastMessage(message: ChatMessage): void {
    if (!isActiveGM()) return;

    const itemData = message.getFlag("tormenta20", "itemData") as AnyObj | undefined;
    if (!itemData) return;
    const tipo = itemData["tipo"] as string | undefined;
    if (!tipo || !SPELL_TIPOS.includes(tipo)) return;

    const rolls = (message.rolls ?? []) as Array<{ options?: AnyObj }>;
    if (rolls.some((r) => (r.options as AnyObj | undefined)?.["type"] === "attack")) return; // ataque → não é magia "pura"

    const speaker = message.speaker as { token?: string; actor?: string } | undefined;
    const casterTokenId = speaker?.token ?? "";
    const cvs = canvas as unknown as { tokens?: { get(id: string): TokenLike | undefined } };
    const casterTok = casterTokenId ? cvs.tokens?.get(casterTokenId) : undefined;
    const casterDisposition = casterTok?.document?.disposition;

    const eligibles = getEligibleCounterspellers(casterTokenId, casterDisposition);
    if (eligibles.length === 0) return;

    const spellName = extractSpellName(message);
    const casterName = (speaker?.actor ? game.actors?.get(speaker.actor)?.name : undefined)
        ?? (message.speaker as { alias?: string } | undefined)?.alias ?? "Conjurador";
    const casterActor = speaker?.actor ? (game.actors?.get(speaker.actor) as FoundryActor | undefined) : undefined;
    const extracted = extractCD(message);
    const cd = extracted > 0 ? extracted : computeCasterSpellCD(casterActor ?? null);
    const circle = Number(itemData["circulo"] ?? 0);

    openCounterspellWindow({ messageId: message.id, spellName, casterName, cd, circle, eligibles });
}

interface WindowOpts {
    messageId: string;
    spellName: string;
    casterName: string;
    cd: number;
    circle: number;
    eligibles: Candidate[];
}

function openCounterspellWindow(opts: WindowOpts): void {
    ensureStyles();
    const { eligibles } = opts;

    const rowsHtml = eligibles.map((c) => `
        <div class="cs-row" data-token="${escHtml(c.tokenId)}" data-actor="${escHtml(c.actorId)}"
             data-mist="${c.mistTotal}" data-sab="${c.sabMod}" data-superior="${c.hasSuperior}">
            <div class="cs-row-main">
                <span class="cs-name">${escHtml(c.name)}</span>
                <span class="cs-stat">Misticismo +${c.mistTotal} · ${c.pm} PM</span>
            </div>
            ${c.hasElemental ? `<label class="cs-elem"><input type="checkbox" class="cs-elem-cb" /> +${c.sabMod} Sab (Afinidade)</label>` : ""}
            <button type="button" class="cs-react-btn"><i class="fas fa-hand-sparkles"></i> Reagir (${DISSIPAR_COST} PM)</button>
        </div>
    `).join("");

    const content = `
        <div class="cs-body">
            <div class="cs-banner">
                <div class="cs-label">CONTRAMÁGICA DISPONÍVEL</div>
                <div class="cs-spell">${escHtml(opts.spellName)}</div>
                <div class="cs-caster">por ${escHtml(opts.casterName)} · CD ${opts.cd}</div>
            </div>
            <div class="cs-hint">Rola Misticismo; se ≥ ${opts.cd}, a magia é anulada.</div>
            <div class="cs-rows">${rowsHtml}</div>
            <div class="cs-feedback" id="cs-feedback"></div>
        </div>
    `;

    void foundry.applications.api.DialogV2.wait({
        id:      `counterspell-${opts.messageId}`,
        classes: ["bg3-dialog", "cs-dialog"],
        window:  { title: `Contramágica — ${opts.spellName}` },
        position: { width: 420 },
        content,
        buttons: [
            { type: "submit", action: "close", label: "Fechar", icon: "fas fa-xmark", default: true, callback: () => { /* no-op */ } },
        ],
        render: (_event, dialog) => {
            const root = dialog.element;
            root.querySelectorAll<HTMLButtonElement>("button:not([type])").forEach((b) => { b.type = "button"; });

            root.querySelectorAll<HTMLButtonElement>(".cs-react-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    void (async () => {
                        if (btn.disabled) return;
                        btn.disabled = true;
                        const row = btn.closest<HTMLElement>(".cs-row");
                        if (!row) return;
                        const tokenId  = row.dataset["token"] ?? "";
                        const mist     = parseInt(row.dataset["mist"] ?? "0", 10);
                        const sab      = parseInt(row.dataset["sab"]  ?? "0", 10);
                        const superior = row.dataset["superior"] === "true";
                        const elemOn   = row.querySelector<HTMLInputElement>(".cs-elem-cb")?.checked ?? false;

                        const cvs = canvas as unknown as { tokens?: { get(id: string): TokenLike | undefined } };
                        const reactor = cvs.tokens?.get(tokenId)?.actor as ActorLike | undefined;
                        if (!reactor) { warn("counterspell: reator não encontrado"); return; }

                        const reactorName = row.querySelector(".cs-name")?.textContent ?? "Conjurador";
                        const bonus = mist + (elemOn ? sab : 0);
                        const { total, html, json } = await rollFormula(`1d20 + ${bonus}`);
                        const success = counterspellSucceeds(total, opts.cd);

                        // Gasta o PM de Dissipar Magia e consome a reação da rodada (sempre).
                        await consumeReaction(reactor as never, DISSIPAR_COST);

                        const badge = success ? "✦ ANULOU" : "✗ FALHOU";
                        await ChatMessage.create({
                            content: html ?? `<div>Misticismo: ${total}</div>`,
                            rolls:   json ? [json] : [],
                            type:    5,
                            speaker: ChatMessage.getSpeaker({ actor: (cvs.tokens?.get(tokenId)?.actor as never) ?? null }),
                            flavor:  `Contramágica — Misticismo (${reactorName}) vs CD ${opts.cd} — ${badge}`,
                            flags:   { [MODULE_ID]: { counterspellRoll: true } },
                        });

                        if (success) {
                            let tempNote = "";
                            if (superior && opts.circle > 0) {
                                const gain = superiorTempPm(opts.circle, DISSIPAR_COST);
                                if (gain > 0) {
                                    const cur = pmOf(reactor);
                                    const max = Number(((reactor.system?.["attributes"] as AnyObj)?.["pm"] as AnyObj)?.["max"] ?? cur);
                                    await reactor.update?.({ "system.attributes.pm.value": Math.min(max, cur + gain) });
                                    tempNote = `<div class="bg3-reac-note">Contramágica Superior: +${gain} PM (temporário).</div>`;
                                }
                            }
                            await postCard(`
                                <div class="bg3-reaction-block bg3-reaction-counter">
                                  <div class="bg3-reac-title"><i class="fa-solid fa-ban"></i> Magia Anulada</div>
                                  <div class="bg3-reac-line"><b>${escHtml(reactorName)}</b> anulou <b>${escHtml(opts.spellName)}</b> de ${escHtml(opts.casterName)} com Contramágica.</div>
                                  <div class="bg3-reac-stat">Misticismo ${total} ≥ CD ${opts.cd} — a magia não tem efeito.</div>
                                  <div class="bg3-reac-cost">−${DISSIPAR_COST} PM</div>
                                  ${tempNote}
                                </div>`, { counterspellNegated: true });

                            // Fecha o modal de resistência do alvo em todos os clientes.
                            void getSocket()?.executeForEveryone(SOCKET_NEGATED, {
                                messageId: opts.messageId, spellName: opts.spellName, byName: reactorName,
                            });

                            const fb = root.querySelector<HTMLElement>("#cs-feedback");
                            if (fb) { fb.textContent = `✦ ${reactorName} anulou a magia (${total} ≥ ${opts.cd}).`; fb.style.display = "block"; }
                            // Anulou → encerra a janela (uma contramágica resolve a conjuração).
                            try { (dialog as unknown as { close: () => void }).close(); } catch { /* ignore */ }
                        } else {
                            await postCard(`
                                <div class="bg3-reaction-block bg3-reaction-fail">
                                  <div class="bg3-reac-title"><i class="fa-solid fa-ban"></i> Contramágica Falhou</div>
                                  <div class="bg3-reac-line"><b>${escHtml(reactorName)}</b> tentou anular <b>${escHtml(opts.spellName)}</b> mas falhou.</div>
                                  <div class="bg3-reac-stat">Misticismo ${total} < CD ${opts.cd} — a magia prossegue.</div>
                                  <div class="bg3-reac-cost">−${DISSIPAR_COST} PM</div>
                                </div>`, { counterspellFail: true });
                            row.classList.add("cs-row-used");
                            const fb = root.querySelector<HTMLElement>("#cs-feedback");
                            if (fb) { fb.textContent = `✗ ${reactorName} falhou (${total} < ${opts.cd}). Outro reator pode tentar.`; fb.style.display = "block"; }
                        }
                    })();
                });
            });
        },
        rejectClose: false,
    });
}

/* -------------------------------------------------------------------------- */
/*  Estilos                                                                   */
/* -------------------------------------------------------------------------- */

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.cs-dialog .cs-banner { text-align:center; padding:6px 0 8px; border-bottom:1px solid rgba(138,102,68,0.4); margin-bottom:8px; }
.cs-dialog .cs-label { color:#b89bff; font-size:0.72rem; letter-spacing:0.1em; }
.cs-dialog .cs-spell { color:var(--bg3-accent,#c8a96e); font-size:1.1rem; font-weight:700; }
.cs-dialog .cs-caster { color:var(--bg3-text-muted,#9a8e7a); font-size:0.85rem; }
.cs-dialog .cs-hint { color:var(--bg3-text-muted,#9a8e7a); font-size:0.8rem; margin-bottom:6px; }
.cs-dialog .cs-row { border:1px solid rgba(138,102,68,0.35); border-left:3px solid #8a6ad0; border-radius:5px;
  padding:6px 8px; margin-bottom:6px; display:flex; flex-direction:column; gap:4px; }
.cs-dialog .cs-row-used { opacity:0.45; }
.cs-dialog .cs-row-main { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.cs-dialog .cs-name { color:var(--bg3-text-primary,#f0ebe0); font-weight:600; }
.cs-dialog .cs-stat { color:var(--bg3-text-muted,#9a8e7a); font-size:0.8rem; }
.cs-dialog .cs-elem { color:#b89bff; font-size:0.78rem; display:flex; align-items:center; gap:4px; }
.cs-dialog .cs-react-btn { background:linear-gradient(to bottom, rgba(138,106,208,0.25), rgba(0,0,0,0.2));
  border:1px solid #8a6ad0; color:#e8dfff; border-radius:4px; padding:5px 8px; cursor:pointer; font-size:0.85rem; }
.cs-dialog .cs-react-btn:hover { background:rgba(138,106,208,0.4); }
.cs-dialog .cs-react-btn:disabled { opacity:0.4; cursor:default; }
.cs-dialog .cs-feedback { display:none; color:var(--bg3-accent,#c8a96e); font-size:0.85rem; margin-top:4px; text-align:center; }
`;
    document.head.appendChild(style);
}

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

function setupSocket(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_NEGATED, (...args: unknown[]) => {
            const req = args[0] as { messageId?: string; spellName?: string; byName?: string };
            if (req?.messageId) closeSpellModalForMessage(req.messageId);
            try {
                ui.notifications?.warn(`${req?.spellName ?? "Magia"} anulada por Contramágica (${req?.byName ?? "?"}) — não aplique os efeitos.`);
            } catch { /* ignore */ }
        });
    });
}

export function setupCounterspell(): void {
    setupSocket();
    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        processCastMessage(args[0] as ChatMessage);
    });
    Hooks.once("ready", () => {
        ensureStyles();
        log("Contramágica ativa — janela de reação no cliente do GM.");
    });
}
