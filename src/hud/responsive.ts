/**
 * Colunas do grid calculadas pela largura REAL do container (`this.element`
 * via `ResizeObserver`), não `window.innerWidth` — a área central do
 * Foundry (`#ui-middle`) é bem menor que o viewport inteiro (sidebar de
 * chat ~300px+12px, controles de cena ~272px), e a largura muda quando a
 * sidebar colapsa/expande sem disparar o `_onResize()` nativo (que só reage
 * a resize de janela). Breakpoints calibrados ao vivo (Fase 7).
 */
export interface ColsBreakpoint { minWidth: number; cols: number }

export const COLS_BREAKPOINTS: ColsBreakpoint[] = [
    { minWidth: 0, cols: 4 },
    { minWidth: 620, cols: 5 },
    { minWidth: 760, cols: 6 },
    { minWidth: 900, cols: 7 },
    { minWidth: 1040, cols: 8 },
];

/** Nº de colunas do grid para uma largura de container em px. Puro/testável. */
export function colsForWidth(width: number): number {
    let cols = COLS_BREAKPOINTS[0]!.cols;
    for (const bp of COLS_BREAKPOINTS) {
        if (width >= bp.minWidth) cols = bp.cols;
    }
    return cols;
}
