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

import { TREASURE } from "./treasure-data";
import {
    generateTreasure, listNDs, type DieRoller, type Quantity, type ResultLine, type TreasureResult,
} from "./treasure-engine";
import TREASURE_STYLES from "./treasure.css?inline";
import { log, warn } from "@/utils/logging";

const SIDEBAR_BTN_ID = "bg3-t20-treasure-btn";
const SHEET_BTN_CLASS = "bg3-t20-treasure-sheet-btn";
const STYLES_ID = "bg3-t20-treasure-styles";

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

function rollInto(nd: string, quantity: Quantity, resultBox: HTMLElement): void {
    const res = generateTreasure(nd, quantity, roller);
    if (!res) {
        resultBox.innerHTML = `<div class="tre-empty">ND inválido.</div>`;
        return;
    }
    resultBox.innerHTML = `
        <div class="tre-result-head">ND ${esc(nd)} · ${esc(QTY_LABEL[quantity])}</div>
        <div class="tre-card">${renderTree(res.lines)}</div>`;
    void whisperResult(res);
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
                rollInto(ndSel.value, qtySel.value as Quantity, resultBox);
            };
            rollBtn.addEventListener("click", doRoll);
            consultBtn.addEventListener("click", () => openConsultDialog());
            if (prefill.auto && prefill.nd) doRoll();
        },
    }, { classes: ["bg3-dialog", "bg3-treasure-dialog"], width: 520 });
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
    }, { classes: ["bg3-dialog", "bg3-treasure-dialog", "bg3-treasure-consult"], width: 720 });
    dlg.render(true);
}

// ── botão na toolbar lateral ──────────────────────────────────────────────────

function findSceneControlsMenu(): Element | null {
    return (
        document.querySelector("menu#scene-controls-layers") ??
        document.querySelector("aside#scene-controls menu") ??
        document.querySelector("#ui-left menu")
    );
}

function injectSidebarBtn(): void {
    if (!game.user?.isGM) {
        document.getElementById(SIDEBAR_BTN_ID)?.parentElement?.remove();
        return;
    }
    if (document.getElementById(SIDEBAR_BTN_ID)) return;
    const menu = findSceneControlsMenu();
    if (!menu) return;
    const btn = document.createElement("button");
    btn.id = SIDEBAR_BTN_ID;
    btn.type = "button";
    btn.className = "control ui-control layer icon fa-solid fa-coins";
    btn.style.color = "#e8c860";
    btn.setAttribute("data-tooltip", "Gerar Tesouro");
    btn.setAttribute("aria-label", "Gerar Tesouro");
    const li = document.createElement("li");
    li.appendChild(btn);
    menu.appendChild(li);
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openGenerateDialog(); });
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
    btn.className = `${SHEET_BTN_CLASS} header-control`;
    btn.innerHTML = '<i class="fas fa-coins"></i>';
    btn.style.cssText = "flex:0 0 auto;background:none;border:none;color:#e8c860;cursor:pointer;font-size:14px;";
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

// ── setup ─────────────────────────────────────────────────────────────────────

export function setupTreasure(): void {
    Hooks.once("ready", () => { ensureStyles(); injectSidebarBtn(); });
    Hooks.on("renderSceneControls", () => { ensureStyles(); injectSidebarBtn(); });
    Hooks.on("canvasReady", () => injectSidebarBtn());

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
