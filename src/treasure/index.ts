/**
 * Gerador de Tesouro (Tormenta20) — ferramenta de GM.
 *
 * Dois pontos de acesso:
 *  1. Botão na toolbar lateral (GM-only) → modal: o GM escolhe ND (1/4..20) e a
 *     quantidade (padrão/metade/dobro) e gera. Também abre o modo de CONSULTA da
 *     tabela completa.
 *  2. Botão no cabeçalho da ficha de Ameaça (npc) → lê o ND e o tipo de tesouro
 *     (`system.detalhes.tesouro`: Nenhum/Padrão/Metade/Dobro) da própria criatura
 *     e gera automaticamente.
 *
 * A rolagem é interna (GM); o resultado aparece no modal e um resumo é
 * sussurrado só para o GM como registro.
 */

import { deliverItemToActor } from "./item-resolver";
import { perShareTibar, splitGoldShare, summarizeLoot, tibarToCoins, type LootItem } from "./loot";
import { showLootOverlay, type LootOverlayPlayer } from "./loot-overlay";
import { clearLootLog, getLootLog, getPresentPlayers, recordLoot, type PresentPlayer } from "./loot-store";
import { parseRiquezaCategories, pickRiquezaItem } from "./riqueza-picker";
import { TREASURE } from "./treasure-data";
import {
    generateTreasure, listNDs, type DieRoller, type Quantity, type ResultLine, type TreasureResult,
} from "./treasure-engine";
import TREASURE_STYLES from "./treasure.css?inline";
import { MODULE_ID } from "@/constants";
import { getSocket, onSocketReady } from "@/socket";
import { registerSkillAction } from "@/ui/skills-menu";
import { log, warn } from "@/utils/logging";

const SHEET_BTN_CLASS = "t20-treasure-sheet-btn";
const STYLES_ID = "t20-treasure-styles";
const LOOT_SOCKET = "treasure/loot-token";
const LOOT_OVERLAY_SOCKET = "treasure/loot-overlay";
const LOOTED_FLAG = "treasureLooted";

/** Payload transmitido a todos os clientes para exibir o overlay de resumo. */
interface LootBroadcast {
    title: string;
    subtitle?: string;
    totalTibar: number;
    /** Fração de `totalTibar` que veio especificamente de moeda TO (tibares de ouro). */
    totalOuroTibar?: number;
    items: LootItem[];
    players: PresentPlayer[];
}

// ── infra ─────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = TREASURE_STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Roller interno (Math.random) — rolagem GM, não-pública. */
const roller: DieRoller = (sides: number) => 1 + Math.floor(Math.random() * sides);

const QTY_LABEL: Record<Quantity, string> = { padrao: "Padrão", metade: "Metade", dobro: "Dobro" };

// ── render de resultado ───────────────────────────────────────────────────────

function renderTree(lines: ResultLine[]): string {
    const li = (l: ResultLine): string => `
        <li>
            <span class="tre-line-label">${esc(l.label)}</span>
            ${l.detail ? `<span class="tre-line-detail">${esc(l.detail).replace(/\n/g, "<br>")}</span>` : ""}
            ${l.children?.length ? `<ul>${l.children.map(li).join("")}</ul>` : ""}
        </li>`;
    return `<ul class="tre-tree">${lines.map(li).join("")}</ul>`;
}

async function whisperResult(res: TreasureResult): Promise<void> {
    try {
        const uid = game.user?.id;
        await ChatMessage.create({
            flavor: `Tesouro — ND ${res.nd} (${QTY_LABEL[res.quantity]})`,
            content: `<div class="tre-card">${renderTree(res.lines)}</div>`,
            speaker: { alias: "Gerador de Tesouro (GM)" },
            whisper: uid ? [uid] : [],
        } as unknown as Record<string, unknown>);
    } catch (err) {
        warn(`treasure: falha ao registrar sussurro (resultado já no modal):`, err);
    }
}

/** Presentes para distribuição no modal de geração: combate atual, senão todos os PJs. */
function presentPlayersForDistribution(): PresentPlayer[] {
    const combat = game.combat as unknown as Parameters<typeof getPresentPlayers>[0] | null;
    if (combat) { const p = getPresentPlayers(combat); if (p.length) return p; }
    const actors = (game.actors?.contents ?? []) as Array<{ id?: string; type?: string; name?: string; hasPlayerOwner?: boolean }>;
    return actors.filter(a => a.id && a.type === "character" && a.hasPlayerOwner).map(a => ({ actorId: a.id!, name: a.name ?? "Jogador" }));
}

async function rollInto(nd: string, quantity: Quantity, resultBox: HTMLElement): Promise<void> {
    const res = generateTreasure(nd, quantity, roller);
    if (!res) {
        resultBox.innerHTML = `<div class="tre-empty">ND inválido.</div>`;
        return;
    }
    await resolveRiquezasInteractive(res.lines);
    resultBox.innerHTML = `
        <div class="tre-result-head">ND ${esc(nd)} · ${esc(QTY_LABEL[quantity])}</div>
        <div class="tre-card">${renderTree(res.lines)}</div>
        <div class="tre-actions"><button type="button" class="tre-distribute-btn"><i class="fas fa-people-arrows"></i> Distribuir / Atribuir</button></div>`;
    void whisperResult(res);
    const summary = summarizeLoot(res.lines, "gen");
    resultBox.querySelector<HTMLButtonElement>(".tre-distribute-btn")?.addEventListener("click", () => {
        const players = presentPlayersForDistribution();
        if (!players.length) { ui.notifications?.warn("Nenhum personagem de jogador para distribuir."); return; }
        presentLootOverlay({ title: "Tesouro Gerado", subtitle: `ND ${nd} · ${QTY_LABEL[quantity]}`, totalTibar: summary.totalTibar, totalOuroTibar: summary.totalOuroTibar, items: summary.items, players });
    });
    log(`Tesouro gerado: ND ${nd} (${quantity}) — ${res.lines.length} linha(s).`);
}

// ── modal de geração ──────────────────────────────────────────────────────────

interface Prefill { nd?: string; quantity?: Quantity; auto?: boolean; casterName?: string }

function openGenerateDialog(prefill: Prefill = {}): void {
    ensureStyles();
    const ndOptions = listNDs()
        .map(nd => `<option value="${esc(nd)}"${nd === prefill.nd ? " selected" : ""}>${esc(nd)}</option>`)
        .join("");
    const qtyOptions = (Object.keys(QTY_LABEL) as Quantity[])
        .map(q => `<option value="${q}"${q === (prefill.quantity ?? "padrao") ? " selected" : ""}>${esc(QTY_LABEL[q])}</option>`)
        .join("");
    const subtitle = prefill.casterName ? `<div class="tre-subtitle">Ameaça: ${esc(prefill.casterName)}</div>` : "";

    const content = `
        <div class="tre-modal">
            ${subtitle}
            <div class="tre-row">
                <label class="tre-label">Nível de Desafio (ND)</label>
                <select name="tre-nd" class="tre-select">${ndOptions}</select>
            </div>
            <div class="tre-row">
                <label class="tre-label">Quantidade</label>
                <select name="tre-qty" class="tre-select">${qtyOptions}</select>
            </div>
            <div class="tre-actions">
                <button type="button" class="tre-roll-btn"><i class="fas fa-dice-d20"></i> Gerar Tesouro</button>
                <button type="button" class="tre-consult-btn"><i class="fas fa-book-open"></i> Consultar tabela</button>
            </div>
            <div class="tre-result" data-empty="true"></div>
        </div>`;

    const dlg = new Dialog({
        title: "Gerador de Tesouro",
        content,
        buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
        default: "close",
        render: ($html: JQuery) => {
            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            const ndSel = root.querySelector<HTMLSelectElement>('select[name="tre-nd"]');
            const qtySel = root.querySelector<HTMLSelectElement>('select[name="tre-qty"]');
            const resultBox = root.querySelector<HTMLElement>(".tre-result");
            const rollBtn = root.querySelector<HTMLButtonElement>(".tre-roll-btn");
            const consultBtn = root.querySelector<HTMLButtonElement>(".tre-consult-btn");
            if (!ndSel || !qtySel || !resultBox || !rollBtn || !consultBtn) return;

            const doRoll = (): void => {
                resultBox.dataset["empty"] = "false";
                void rollInto(ndSel.value, qtySel.value as Quantity, resultBox);
            };
            rollBtn.addEventListener("click", doRoll);
            consultBtn.addEventListener("click", () => openConsultDialog());
            if (prefill.auto && prefill.nd) doRoll();
        },
    }, { classes: ["t20-dialog", "t20-treasure-dialog"], width: 520 });
    dlg.render(true);
}

// ── modo de consulta ──────────────────────────────────────────────────────────

const CONSULT_TABLES: Array<{ id: string; label: string }> = [
    { id: "main", label: "Tesouro por ND" },
    { id: "riquezas", label: "Riquezas" },
    { id: "itensDiversos", label: "Itens Diversos" },
    { id: "equipamentos", label: "Equipamentos" },
    { id: "pocoes", label: "Poções" },
    { id: "superiores", label: "Superiores (melhorias)" },
    { id: "magicos", label: "Mágicos (encantos)" },
    { id: "acessorios", label: "Mágicos (Acessórios)" },
];

const rangeLabel = (r: [number, number] | null): string =>
    r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`) : "—";

function renderConsultTable(id: string): string {
    const T = TREASURE;
    const simpleRows = (rows: Array<{ range: [number, number]; nome?: string; item?: string; preco?: string; livro?: string; pagina?: string }>): string =>
        rows.map(r => `<tr><td>${rangeLabel(r.range)}</td><td>${esc(r.nome || r.item || "")}</td>${r.preco !== undefined ? `<td>${esc(r.preco || "")}</td>` : ""}<td>${esc(r.livro || "")}${r.pagina ? `, p.${esc(r.pagina)}` : ""}</td></tr>`).join("");

    if (id === "main") {
        const rows = T.main.map(e => {
            const din = e.dinheiro.map(d => `${rangeLabel(d.range)}: ${esc(d.result)}`).join("<br>");
            const it = e.itens.map(d => `${rangeLabel(d.range)}: ${esc(d.result)}`).join("<br>");
            return `<tr><td class="tre-nd-cell">${esc(e.nd)}</td><td>${din}</td><td>${it}</td></tr>`;
        }).join("");
        return `<table class="tre-table"><thead><tr><th>ND</th><th>Dinheiro</th><th>Itens</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (id === "riquezas") {
        const rows = T.riquezas.filter(r => r.valor).map(r =>
            `<tr><td>${rangeLabel(r.menor)}</td><td>${rangeLabel(r.media)}</td><td>${rangeLabel(r.maior)}</td><td class="tre-nowrap">${esc(r.valor)}</td><td class="tre-exemplos">${esc(r.exemplos).replace(/\n/g, "<br>")}</td></tr>`).join("");
        return `<table class="tre-table"><thead><tr><th>Menor</th><th>Média</th><th>Maior</th><th>Valor</th><th>Exemplos</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (id === "itensDiversos" || id === "pocoes") {
        const hasPreco = id === "pocoes";
        const head = `<tr><th>d%</th><th>Item</th>${hasPreco ? "<th>Preço</th>" : ""}<th>Livro</th></tr>`;
        return `<table class="tre-table"><thead>${head}</thead><tbody>${simpleRows(id === "pocoes" ? T.pocoes : T.itensDiversos)}</tbody></table>`;
    }
    // tabelas de 3 blocos
    const blocks = (T as unknown as Record<string, Record<string, Array<{ range: [number, number]; nome?: string; preco?: string; livro?: string; pagina?: string }>>>)[id];
    const hasPreco = id === "acessorios";
    return Object.entries(blocks).map(([bk, rows]) =>
        `<div class="tre-block-title">${esc(bk)}</div>
         <table class="tre-table"><thead><tr><th>d%</th><th>Item</th>${hasPreco ? "<th>Preço</th>" : ""}<th>Livro</th></tr></thead><tbody>${simpleRows(rows)}</tbody></table>`).join("");
}

function openConsultDialog(): void {
    ensureStyles();
    const tabOptions = CONSULT_TABLES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join("");
    const content = `
        <div class="tre-consult">
            <div class="tre-row">
                <label class="tre-label">Tabela</label>
                <select name="tre-consult-sel" class="tre-select">${tabOptions}</select>
            </div>
            <div class="tre-consult-body"></div>
        </div>`;
    const dlg = new Dialog({
        title: "Consultar Tabela de Tesouros",
        content,
        buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
        default: "close",
        render: ($html: JQuery) => {
            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            const sel = root.querySelector<HTMLSelectElement>('select[name="tre-consult-sel"]');
            const body = root.querySelector<HTMLElement>(".tre-consult-body");
            if (!sel || !body) return;
            const refresh = (): void => { body.innerHTML = renderConsultTable(sel.value); };
            sel.addEventListener("change", refresh);
            refresh();
        },
    }, { classes: ["t20-dialog", "t20-treasure-dialog", "t20-treasure-consult"], width: 720 });
    dlg.render(true);
}

// ── Menu "T20 Overhaul" ──────────────────────────────────────────────────────

function registerMenuAction(): void {
    registerSkillAction({
        id: "treasure-generate",
        label: "Gerar Tesouro",
        icon: "fa-solid fa-coins",
        color: "#e8c860",
        isVisible: () => !!game.user?.isGM,
        onClick: () => openGenerateDialog(),
    });
}

// ── botão na ficha de Ameaça ──────────────────────────────────────────────────

/** Mapeia o texto do campo tesouro da ameaça para uma quantidade (ou null = nenhum). */
export function parseTreasureType(raw: unknown): Quantity | null {
    const t = String(raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!t.trim() || /\bnenhum\b/.test(t)) return null;
    if (/\bdobro\b/.test(t)) return "dobro";
    if (/\bmetade\b/.test(t)) return "metade";
    return "padrao"; // "padrão" ou texto descritivo → padrão
}

function injectSheetBtn(app: { actor?: { type?: string; system?: Record<string, unknown>; name?: string } }, root: HTMLElement): void {
    if (!game.user?.isGM) return;
    const actor = app.actor;
    if (!actor || actor.type !== "npc") return;
    const header = root.querySelector(".window-header");
    if (!header || header.querySelector(`.${SHEET_BTN_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = SHEET_BTN_CLASS;
    btn.innerHTML = '<i class="fas fa-coins"></i>';
    btn.setAttribute("data-tooltip", "Gerar Tesouro desta ameaça");
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sys = actor.system ?? {};
        const nd = String(((sys["attributes"] as { nd?: unknown } | undefined)?.nd) ?? "").trim();
        const tesouro = (sys["detalhes"] as { tesouro?: unknown } | undefined)?.tesouro;
        const qty = parseTreasureType(tesouro);
        if (!listNDs().includes(nd)) {
            ui.notifications?.warn(`Gerador de Tesouro: ND "${nd}" da ameaça não está na tabela (1/4 a 20). Abrindo modal para ajuste.`);
            openGenerateDialog({ casterName: actor.name });
            return;
        }
        if (qty === null) {
            ui.notifications?.info(`${actor.name ?? "Ameaça"}: tesouro "Nenhum" — sem rolagem.`);
            return;
        }
        openGenerateDialog({ nd, quantity: qty, auto: true, casterName: actor.name });
    });

    // insere antes do botão de fechar, se houver
    const closeBtn = header.querySelector('[data-action="close"], .close');
    if (closeBtn) header.insertBefore(btn, closeBtn);
    else header.appendChild(btn);
}

// ── saque por right-click no token (jogadores) ───────────────────────────────

interface DeadActorLike {
    type?: string;
    name?: string;
    system?: Record<string, unknown>;
    statuses?: Set<string>;
}

/** Ator é um NPC morto? (pv <= 0 ou status de morte). Exportado para testes. */
export function isDeadNpcActor(actor: DeadActorLike | null | undefined): boolean {
    if (!actor || actor.type !== "npc") return false;
    const pv = (actor.system?.["attributes"] as { pv?: { value?: number } } | undefined)?.pv?.value;
    if (typeof pv === "number" && pv <= 0) return true;
    const st = actor.statuses;
    return !!st && (st.has("dead") || st.has("morto") || st.has("unconscious"));
}

interface TokenLike {
    isOwner?: boolean;
    actor?: DeadActorLike | null;
    id?: string;
    document?: { id?: string; getFlag?: (m: string, k: string) => unknown };
}

/**
 * O usuário atual (jogador, não-dono) pode tentar saquear este token?
 * Morto (PV<=0/status) OU PV ilegível (jogador sem permissão de ver o inimigo)
 * → permite e deixa o GM confirmar. Claramente vivo (PV legível > 0) → não.
 */
function isLootableByPlayer(token: TokenLike): boolean {
    if (game.user?.isGM) return false;
    if (token.isOwner) return false;
    const a = token.actor;
    if (!a || a.type !== "npc") return false;
    if (isDeadNpcActor(a)) return true;
    const pv = (a.system?.["attributes"] as { pv?: { value?: number } } | undefined)?.pv?.value;
    return typeof pv !== "number"; // PV desconhecido → permite (GM decide)
}

/** Jogador → pede ao GM para rolar o tesouro do token. */
function requestLoot(token: TokenLike): void {
    const sceneId = (canvas as unknown as { scene?: { id?: string } }).scene?.id ?? "";
    const tokenId = token.id ?? token.document?.id ?? "";
    if (!tokenId) return;
    if (token.document?.getFlag?.(MODULE_ID, LOOTED_FLAG)) {
        ui.notifications?.info("Este inimigo já foi saqueado.");
        return;
    }
    if (!playerHasArmsReach(token)) {
        ui.notifications?.warn("Você precisa estar ao alcance do inimigo para saqueá-lo.");
        return;
    }
    const socket = getSocket();
    if (!socket) { ui.notifications?.warn("Saque indisponível (socket não pronto)."); return; }
    ui.notifications?.info("Saqueando tesouro…");
    void socket.executeAsGM(LOOT_SOCKET, { sceneId, tokenId, requesterId: game.user?.id ?? "" });
}

interface LootPayload { sceneId: string; tokenId: string; requesterId: string }
interface TokenDocLike {
    actor?: DeadActorLike | null;
    getFlag?: (m: string, k: string) => unknown;
    setFlag?: (m: string, k: string, v: unknown) => Promise<unknown>;
}

/** GM → resolve e rola o tesouro do token, postando no chat (público). */
async function lootTokenAsGM(payload: LootPayload): Promise<void> {
    if (!game.user?.isGM) return;
    const scenes = (game as unknown as { scenes?: { get(id: string): { tokens?: { get(id: string): TokenDocLike | undefined } } | undefined } }).scenes;
    const scene = scenes?.get(payload.sceneId);
    const tokenDoc = scene?.tokens?.get(payload.tokenId);
    const actor = tokenDoc?.actor;
    const whisper = (msg: string): void => {
        void ChatMessage.create({ content: msg, whisper: payload.requesterId ? [payload.requesterId] : [] } as unknown as Record<string, unknown>);
    };
    if (!tokenDoc || !actor) { whisper("Saque: token não encontrado."); return; }
    if (!isDeadNpcActor(actor)) { whisper("Esse inimigo ainda não está morto."); return; }
    if (tokenDoc.getFlag?.(MODULE_ID, LOOTED_FLAG)) { whisper("Este inimigo já foi saqueado."); return; }
    await tokenDoc.setFlag?.(MODULE_ID, LOOTED_FLAG, true);

    const name = actor.name ?? "Inimigo";
    const nd = String((actor.system?.["attributes"] as { nd?: unknown } | undefined)?.nd ?? "").trim();
    const tesouro = (actor.system?.["detalhes"] as { tesouro?: unknown } | undefined)?.tesouro;
    const qty = parseTreasureType(tesouro);

    if (!listNDs().includes(nd)) { whisper(`Tesouro de ${name}: ND "${nd}" não está na tabela (1/4 a 20).`); return; }
    if (qty === null) {
        await ChatMessage.create({
            content: `<div class="tre-card"><em>${esc(name)} não tinha tesouro.</em></div>`,
            speaker: { alias: `Tesouro de ${name}` },
        } as unknown as Record<string, unknown>);
        return;
    }
    const res = generateTreasure(nd, qty, roller);
    if (!res) { whisper(`Tesouro de ${name}: falha ao gerar.`); return; }
    await resolveRiquezasInteractive(res.lines);
    const summary = summarizeLoot(res.lines, `t-${payload.tokenId}`);
    const combat = game.combat as unknown as (Parameters<typeof recordLoot>[0] & { started?: boolean }) | undefined;
    if (combat?.started) {
        await recordLoot(combat, { tokenId: payload.tokenId, name, nd, totalTibar: summary.totalTibar, totalOuroTibar: summary.totalOuroTibar, items: summary.items });
        await ChatMessage.create({
            content: `<div class="tre-card"><i class="fas fa-coins"></i> <strong>${esc(name)}</strong> saqueado — guardado para o resumo do fim do combate (${summary.totalTibar} T$${summary.items.length ? `, ${summary.items.length} item(ns)` : ""}).</div>`,
            speaker: { alias: `Tesouro de ${name}` },
        } as unknown as Record<string, unknown>);
    } else {
        await ChatMessage.create({
            content: `<div class="tre-result-head">${esc(name)} · ND ${esc(nd)} · ${esc(QTY_LABEL[qty])}</div><div class="tre-card">${renderTree(res.lines)}</div>`,
            speaker: { alias: `Tesouro de ${name}` },
        } as unknown as Record<string, unknown>);
    }
    log(`Tesouro saqueado de ${name} (ND ${nd}, ${qty}).`);
}

// ── fim de combate: agrega o loot e transmite o overlay ───────────────────────

async function onCombatEnd(combat: unknown): Promise<void> {
    if (!game.user?.isGM) return;
    const c = combat as Parameters<typeof getLootLog>[0] & Parameters<typeof getPresentPlayers>[0];
    const logEntries = getLootLog(c);
    if (!logEntries.length) return;
    const players = getPresentPlayers(c);
    const totalTibar = Math.round(logEntries.reduce((s, e) => s + (e.totalTibar || 0), 0) * 100) / 100;
    const totalOuroTibar = Math.round(logEntries.reduce((s, e) => s + (e.totalOuroTibar || 0), 0) * 100) / 100;
    const items = logEntries.flatMap(e => e.items);
    const payload: LootBroadcast = {
        title: "Tesouro do Combate",
        subtitle: `${logEntries.length} inimigo(s) saqueado(s)`,
        totalTibar, totalOuroTibar, items, players,
    };
    try { await clearLootLog(c as Parameters<typeof clearLootLog>[0]); } catch { /* combate já deletado */ }
    const socket = getSocket();
    if (socket) socket.executeForEveryone(LOOT_OVERLAY_SOCKET, payload);
    else presentLootOverlay(payload); // fallback sem socket
}

/**
 * Liga o saque por right-click via listener PIXI direto no token.
 *
 * Não usamos os métodos `Token#_canHUD`/`_onClickRight` porque o `clickRight` é
 * gated por `_canHUD` (GM/dono apenas) e o `MouseInteractionManager` captura a
 * referência da permissão na criação do token — patchar o protótipo depois não
 * tem efeito. O evento PIXI `rightdown`, ao contrário, dispara para QUALQUER
 * usuário que veja o token (independe das permissões do Foundry), então o
 * jogador consegue saquear inimigos não-próprios.
 *
 * Para o GM/dono o handler é no-op (isLootableByPlayer = false) → o HUD normal
 * do Foundry continua funcionando, sem regressão.
 */
type LootHandler = () => void;
type LootBoundToken = TokenLike & {
    _t20LootHandler?: LootHandler;
    on?: (event: string, fn: LootHandler) => void;
    off?: (event: string, fn: LootHandler) => void;
    listeners?: (event: string) => LootHandler[];
};

/**
 * Garante (idempotente) o listener `rightdown` de saque no token. NÃO usa flag
 * persistente: o Foundry chama `removeAllListeners()` ao redesenhar o token, o
 * que apagaria o listener — então re-verificamos a cada draw/refresh se o nosso
 * handler ainda está anexado e re-anexamos se necessário (checagem barata).
 */
function bindTokenLoot(token: LootBoundToken | null | undefined): void {
    if (!token || typeof token.on !== "function") return;
    const cur = token._t20LootHandler;
    if (cur && token.listeners?.("rightdown").includes(cur)) return; // já ligado
    if (cur && token.off) token.off("rightdown", cur);               // referência velha (já removida)
    const handler: LootHandler = () => {
        try { if (isLootableByPlayer(token)) requestLoot(token); } catch { /* ignore */ }
    };
    token._t20LootHandler = handler;
    token.on("rightdown", handler);
}

function setupTokenLoot(): void {
    onSocketReady((socket) => {
        socket.register(LOOT_SOCKET, (p: unknown) => lootTokenAsGM(p as LootPayload));
        socket.register(LOOT_OVERLAY_SOCKET, (p: unknown) => presentLootOverlay(p as LootBroadcast));
    });
    const bindAll = (): void => {
        const placeables = (canvas as unknown as { tokens?: { placeables?: LootBoundToken[] } }).tokens?.placeables ?? [];
        for (const t of placeables) bindTokenLoot(t);
    };
    Hooks.on("drawToken", (...args: unknown[]) => bindTokenLoot(args[0] as LootBoundToken));
    Hooks.on("refreshToken", (...args: unknown[]) => bindTokenLoot(args[0] as LootBoundToken));
    Hooks.on("canvasReady", bindAll);
}

// ── distribuição de tibares + entrega de itens (GM) ───────────────────────────

interface DinheiroActor {
    name?: string;
    system?: { dinheiro?: { to?: number; tp?: number; tc?: number } };
    update: (d: Record<string, unknown>) => Promise<unknown>;
    createEmbeddedDocuments: (type: string, data: Array<Record<string, unknown>>) => Promise<unknown>;
}

/**
 * GM: soma dinheiro/N em cada personagem presente. Se o loot trouxe tibares de
 * ouro (TO), esses são distribuídos em ouro primeiro (quinhão fracionário vira
 * prata — ver `splitGoldShare`); o restante do total (T$/TP/TC) é distribuído
 * como antes.
 */
async function distributeTibarToPlayers(totalTibar: number, totalOuroTibar: number, players: PresentPlayer[]): Promise<void> {
    if (!game.user?.isGM || !players.length || totalTibar <= 0) return;
    const ouro = Math.min(Math.max(totalOuroTibar || 0, 0), totalTibar);
    const restante = totalTibar - ouro;
    const { to, tp: tpFromGold } = splitGoldShare(ouro / 10, players.length);
    const share = perShareTibar(restante, players.length);
    const { tp: tpFromRest, tc } = tibarToCoins(share);
    const tp = tpFromGold + tpFromRest;
    const done: string[] = [];
    for (const p of players) {
        const actor = game.actors?.get(p.actorId) as unknown as DinheiroActor | undefined;
        if (!actor) continue;
        const curTo = actor.system?.dinheiro?.to ?? 0;
        const curTp = actor.system?.dinheiro?.tp ?? 0;
        const curTc = actor.system?.dinheiro?.tc ?? 0;
        await actor.update({ "system.dinheiro.to": curTo + to, "system.dinheiro.tp": curTp + tp, "system.dinheiro.tc": curTc + tc });
        done.push(p.name);
    }
    const parts: string[] = [];
    if (to) parts.push(`${to} TO`);
    if (tp) parts.push(`${tp} T$`);
    if (tc) parts.push(`${tc} TC`);
    const shareLabel = parts.length ? parts.join(" + ") : "0 T$";
    await ChatMessage.create({
        content: `<div class="tre-card"><strong><i class="fas fa-coins"></i> Tibares distribuídos:</strong> ${shareLabel} para cada — ${esc(done.join(", "))}.</div>`,
        speaker: { alias: "Distribuição de Tesouro" },
    } as unknown as Record<string, unknown>);
}

/** GM: entrega itens às fichas escolhidas (resolve compêndio / placeholder). */
async function deliverItems(items: LootItem[], assignments: Array<{ uid: string; actorId: string }>): Promise<void> {
    if (!game.user?.isGM) return;
    const byUid = new Map(items.map(i => [i.uid, i]));
    const lines: string[] = [];
    const attention: string[] = [];
    for (const a of assignments) {
        const item = byUid.get(a.uid);
        const actor = game.actors?.get(a.actorId) as unknown as (DinheiroActor & Parameters<typeof deliverItemToActor>[0]) | undefined;
        if (!item || !actor) continue;
        try {
            const res = await deliverItemToActor(actor, item);
            lines.push(`${esc(res.itemName)} → ${esc(actor.name ?? "?")}`);
            if (res.needsAttention) attention.push(res.itemName + (res.found ? " (aplicar melhorias)" : " (preencher atributos)"));
        } catch (err) { warn("treasure: falha ao entregar item:", err); }
    }
    if (lines.length) {
        await ChatMessage.create({
            content: `<div class="tre-card"><strong><i class="fas fa-hand-holding"></i> Itens entregues:</strong><br>${lines.join("<br>")}</div>`,
            speaker: { alias: "Distribuição de Tesouro" },
        } as unknown as Record<string, unknown>);
    }
    if (attention.length) ui.notifications?.warn(`Atenção do GM: ${attention.join("; ")}.`);
}

/** Mostra o overlay (todos os clientes) com handlers do GM ligados localmente. */
function presentLootOverlay(b: LootBroadcast): void {
    const players: LootOverlayPlayer[] = b.players.map(p => ({ actorId: p.actorId, tokenId: p.tokenId, name: p.name }));
    showLootOverlay(
        {
            title: b.title, subtitle: b.subtitle, totalTibar: b.totalTibar,
            items: b.items.map(i => ({ uid: i.uid, display: i.display, category: i.category, ref: i.ref })),
            players,
        },
        {
            onDistribute: () => distributeTibarToPlayers(b.totalTibar, b.totalOuroTibar ?? 0, b.players),
            onDeliver: (a) => deliverItems(b.items, a),
        },
    );
}

// ── modal interativo de Riqueza (o que a riqueza "é") ─────────────────────────

/** Abre o picker de categoria para uma riqueza; resolve com o texto do item (ou null). */
function openRiquezaPicker(exemplos: string, valorLabel: string): Promise<string | null> {
    const cats = parseRiquezaCategories(exemplos);
    if (!cats.length) return Promise.resolve(null);
    return new Promise((resolve) => {
        const rows = cats.map((c, i) =>
            `<label class="riq-row"><input type="checkbox" data-i="${i}" checked><span class="riq-space">${esc(c.space)}</span><span class="riq-items">${esc(c.items.join(", "))}</span></label>`).join("");
        const content = `<div class="riq-modal">
            <div class="riq-hint">Marque as categorias de espaço cabíveis (${esc(valorLabel)}). Será sorteada 1 categoria (1d${cats.length}) e depois 1 item.</div>
            <div class="riq-list">${rows}</div>
        </div>`;
        let resolved = false;
        const finish = (v: string | null): void => { if (!resolved) { resolved = true; resolve(v); } };
        const dlg = new Dialog({
            title: "Riqueza — o que é?",
            content,
            buttons: {
                roll: {
                    icon: '<i class="fas fa-dice"></i>', label: "Sortear",
                    callback: (html: JQuery) => {
                        const root = (html as unknown as { 0?: HTMLElement })[0] ?? (html as unknown as HTMLElement);
                        const checked = Array.from(root.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")).map(el => Number(el.dataset["i"]));
                        if (!checked.length) { ui.notifications?.warn("Marque ao menos uma categoria."); return; }
                        const lineRoll = 1 + Math.floor(Math.random() * checked.length);
                        const cat = cats[checked[lineRoll - 1]];
                        const itemRoll = 1 + Math.floor(Math.random() * cat.items.length);
                        const pick = pickRiquezaItem(cat, itemRoll, roller);
                        const unit = (cat.space === "—" || cat.space === "1") ? "espaço" : "espaços";
                        finish(`${pick.text}${cat.space === "—" ? "" : ` (${cat.space} ${unit})`}`);
                    },
                },
                skip: { icon: '<i class="fas fa-forward"></i>', label: "Pular", callback: () => finish(null) },
            },
            default: "roll",
            close: () => finish(null),
        }, { classes: ["t20-dialog", "t20-treasure-dialog", "t20-riqueza-dialog"], width: 560 });
        dlg.render(true);
    });
}

/** Para cada riqueza na árvore, abre o picker (GM) e troca a descrição pelo item escolhido. */
async function resolveRiquezasInteractive(lines: ResultLine[]): Promise<void> {
    const walk = async (arr: ResultLine[]): Promise<void> => {
        for (const l of arr) {
            if (l.assign?.category === "riqueza" && l.detail) {
                const chosen = await openRiquezaPicker(l.detail, l.label);
                if (chosen) {
                    const head = l.label.split(":")[0];
                    l.label = `${head}: ${chosen}${typeof l.tibar === "number" && l.tibar > 0 ? ` — ${l.tibar} T$` : ""}`;
                    l.detail = undefined;
                    if (l.assign) { l.assign.name = chosen; l.assign.upgrades = []; }
                }
            }
            if (l.children?.length) await walk(l.children);
        }
    };
    await walk(lines);
}

// ── Arms Reach: gate de alcance para saque ────────────────────────────────────

interface ArmsReachApi { isReachable?: (source: unknown, target: unknown, ...rest: unknown[]) => boolean }

/** Se o módulo arms-reach estiver ativo, o alvo precisa estar ao alcance de um token do jogador. */
function playerHasArmsReach(targetToken: TokenLike): boolean {
    const mod = game.modules?.get?.("arms-reach") as unknown as { active?: boolean; api?: ArmsReachApi } | undefined;
    if (!mod?.active || typeof mod.api?.isReachable !== "function") return true; // não instalado → sem gate
    const target = (targetToken as { object?: unknown }).object ?? targetToken;
    const myTokens = ((canvas as unknown as { tokens?: { placeables?: Array<{ isOwner?: boolean; actor?: { type?: string } }> } }).tokens?.placeables ?? [])
        .filter(t => t.isOwner && t.actor?.type === "character");
    if (!myTokens.length) return true; // jogador sem token na cena → não bloqueia
    try {
        return myTokens.some(src => mod.api!.isReachable!(src, target));
    } catch (err) { warn("arms-reach: falha em isReachable, liberando:", err); return true; }
}

// ── setup ─────────────────────────────────────────────────────────────────────

export function setupTreasure(): void {
    setupTokenLoot();
    ensureStyles();
    registerMenuAction();
    Hooks.on("deleteCombat", (c: unknown) => void onCombatEnd(c));

    Hooks.on("renderActorSheet", (...args: unknown[]) => {
        const app = args[0] as { actor?: { type?: string; system?: Record<string, unknown>; name?: string } };
        const htmlArg = args[1];
        let root: HTMLElement | null = null;
        if (htmlArg instanceof HTMLElement) root = htmlArg;
        else if (htmlArg && typeof htmlArg === "object") root = (htmlArg as Record<string, unknown>)[0] as HTMLElement | null;
        // fallback: o elemento da app
        if (!root) root = (app as { element?: { [0]?: HTMLElement } }).element?.[0] ?? null;
        if (root) { ensureStyles(); injectSheetBtn(app, root); }
    });
}
