/**
 * Grid genérico de slots (reutilizado por Perícias e pelo painel direito).
 * Paginação por seção: se os itens não cabem em `cols × rows`, um paginador
 * próprio (‹ N/M ›) navega dentro do espaço fixo — independente de outras
 * seções (Fase 7 calibra `cols` via ResizeObserver; por ora fixo).
 */

export interface GenericSlot {
    key: string;
    label: string;
    iconUrl: string;
    /** Texto extra opcional (ex.: bônus de perícia). */
    extra?: string;
}

export interface PageResult<T> {
    pageItems: T[];
    page: number;
    totalPages: number;
}

/** Recorta `items` para a página atual, dado `cols*rows` por página. Puro/testável. */
export function paginate<T>(items: T[], cols: number, rows: number, page: number): PageResult<T> {
    const perPage = Math.max(1, cols * rows);
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const clampedPage = Math.max(0, Math.min(totalPages - 1, page));
    const start = clampedPage * perPage;
    return { pageItems: items.slice(start, start + perPage), page: clampedPage, totalPages };
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Monta o HTML de um grid de slots (linhas × colunas) + paginador se necessário. */
export function buildSlotGridHtml(
    items: GenericSlot[],
    cols: number,
    rows: number,
    page: number,
    dataAttr: string,
): string {
    const { pageItems, totalPages, page: clamped } = paginate(items, cols, rows, page);
    const cells = pageItems.map((s, i) => `
        <div class="t20-hud-slot" data-${dataAttr}="${esc(s.key)}" title="${esc(s.label)}">
            <span class="t20-hud-slot-num">${i + 1}</span>
            <div class="t20-hud-slot-icon" style="background-image:url('${s.iconUrl}')"></div>
            <span class="t20-hud-slot-name">${esc(s.label)}</span>
            ${s.extra ? `<span class="t20-hud-slot-total">${esc(s.extra)}</span>` : ""}
        </div>`).join("");
    const pager = totalPages > 1
        ? `<div class="t20-hud-pager">
               <button type="button" class="t20-hud-pager-btn" data-page-dir="-1">‹</button>
               <span class="t20-hud-pager-label">${clamped + 1}/${totalPages}</span>
               <button type="button" class="t20-hud-pager-btn" data-page-dir="1">›</button>
           </div>`
        : "";
    return `<div class="t20-hud-grid-wrap" style="--t20-hud-cols:${cols}">
        <div class="t20-hud-grid-row">${cells}</div>
        ${pager}
    </div>`;
}
