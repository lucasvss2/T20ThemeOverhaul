/**
 * Overlay persistente de resumo de loot (fim de combate / geração de tesouro).
 *
 * - Jogadores: veem total em T$ + lista de itens (somente leitura) + botão fechar.
 * - GM: além disso, um dropdown por item (quem carrega) + botão "distribuir T$
 *   igualmente" ao lado do total + botão "entregar itens".
 *
 * O overlay NÃO some sozinho — só fecha no botão. As ações do GM (distribuir/
 * entregar) rodam via `handlers` fornecidos pelo chamador (que mexe nas fichas).
 */

import STYLES from "./loot-overlay.css?inline";

const STYLES_ID = "t20-loot-overlay-styles";
const OVERLAY_ID = "t20-loot-overlay";

export interface LootOverlayPlayer { actorId: string; tokenId?: string; name: string }
export interface LootOverlayItem {
    uid: string;
    display: string;
    category: string;
    ref?: string;
}
export interface LootOverlayData {
    title: string;
    subtitle?: string;
    totalTibar: number;
    items: LootOverlayItem[];
    players: LootOverlayPlayer[];
}
export interface LootOverlayHandlers {
    /** GM: distribuir os tibares igualmente entre os presentes. */
    onDistribute?: () => void | Promise<void>;
    /** GM: entregar itens conforme as atribuições escolhidas. */
    onDeliver?: (assignments: Array<{ uid: string; actorId: string }>) => void | Promise<void>;
}

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtTibar(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
}

let current: HTMLElement | null = null;

export function dismissLootOverlay(): void {
    const el = current;
    if (!el) return;
    current = null;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 400);
}

export function showLootOverlay(data: LootOverlayData, handlers: LootOverlayHandlers = {}): void {
    ensureStyles();
    dismissLootOverlay();

    const isGM = !!game.user?.isGM;
    const playerOpts = (selected = ""): string =>
        `<option value="">— ninguém —</option>` +
        data.players.map(p => `<option value="${esc(p.actorId)}"${p.actorId === selected ? " selected" : ""}>${esc(p.name)}</option>`).join("");

    const itemsHtml = data.items.length
        ? data.items.map(it => `
            <div class="lo-item" data-uid="${esc(it.uid)}">
                <span class="lo-item-name">${esc(it.display)}<span class="lo-item-cat"> · ${esc(it.category)}</span>${it.ref ? `<span class="lo-item-ref">${esc(it.ref)}</span>` : ""}</span>
                ${isGM ? `<select class="lo-assign">${playerOpts()}</select>` : ""}
            </div>`).join("")
        : `<div class="lo-empty">Nenhum item — só tibares.</div>`;

    const distributeBtn = isGM && data.totalTibar > 0 && data.players.length
        ? `<button type="button" class="lo-btn lo-distribute lo-primary" data-act="distribute"><i class="fas fa-people-arrows"></i> Distribuir igualmente</button>`
        : "";
    const deliverBtn = isGM && data.items.length && data.players.length
        ? `<button type="button" class="lo-btn lo-primary" data-act="deliver"><i class="fas fa-hand-holding"></i> Entregar itens</button>`
        : "";

    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.innerHTML = `
        <div class="lo-panel">
            <div class="lo-head">
                <div class="lo-title">${esc(data.title)}</div>
                ${data.subtitle ? `<div class="lo-sub">${esc(data.subtitle)}</div>` : ""}
            </div>
            <div class="lo-total">
                <div class="lo-total-val"><i class="fas fa-coins"></i>${esc(fmtTibar(data.totalTibar))} T$</div>
                ${distributeBtn}
            </div>
            <div class="lo-body">${itemsHtml}</div>
            <div class="lo-actions">
                ${deliverBtn}
                <button type="button" class="lo-btn lo-close" data-act="close"><i class="fas fa-times"></i> Fechar</button>
            </div>
        </div>`;

    document.body.appendChild(el);
    current = el;

    el.querySelector('[data-act="close"]')?.addEventListener("click", () => dismissLootOverlay());

    const distBtn = el.querySelector<HTMLButtonElement>('[data-act="distribute"]');
    distBtn?.addEventListener("click", async () => {
        distBtn.disabled = true;
        try { await handlers.onDistribute?.(); } finally { distBtn.innerHTML = '<i class="fas fa-check"></i> Distribuído'; }
    });

    const delBtn = el.querySelector<HTMLButtonElement>('[data-act="deliver"]');
    delBtn?.addEventListener("click", async () => {
        const assignments: Array<{ uid: string; actorId: string }> = [];
        el.querySelectorAll<HTMLElement>(".lo-item").forEach(row => {
            const uid = row.dataset["uid"] ?? "";
            const sel = row.querySelector<HTMLSelectElement>("select.lo-assign");
            if (uid && sel?.value) assignments.push({ uid, actorId: sel.value });
        });
        if (!assignments.length) { ui.notifications?.info("Selecione ao menos um item para entregar."); return; }
        delBtn.disabled = true;
        try { await handlers.onDeliver?.(assignments); } finally { delBtn.innerHTML = '<i class="fas fa-check"></i> Entregue'; }
    });
}
