/**
 * Standalone BG3-style cinematic roll overlay for Tormenta20.
 * Injects its own CSS and renders a full-screen overlay when a T20 roll
 * is intercepted.
 */

import type { TestOutcome } from "@/hidden-test/types";
import STYLES from "./bg3-overlay.css?inline";

// ── CSS ───────────────────────────────────────────────────────────────────────

const STYLES_ID = "bg3-t20-styles";
const OVERLAY_ID = "bg3-t20-overlay";
const DISMISS_DELAY_MS = 3000;
const OVERLAY_Z = 99999;



// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (!document.getElementById(STYLES_ID)) {
        const el = document.createElement("style");
        el.id = STYLES_ID;
        el.textContent = STYLES
            .replace(/\$\{OVERLAY_ID\}/g, OVERLAY_ID)
            .replace(/\$\{OVERLAY_Z\}/g, String(OVERLAY_Z));
        document.head.appendChild(el);
    }
}

function esc(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const OUTCOME_TOTAL_CLASS: Record<TestOutcome, string> = {
    critico:       "is-crit",
    sucesso:       "is-success",
    falha:         "is-failure",
    falha_critica: "is-fumble",
};

const OUTCOME_LABEL: Record<TestOutcome, string> = {
    critico:       "SUCESSO CRÍTICO!",
    sucesso:       "SUCESSO",
    falha:         "FALHA",
    falha_critica: "FALHA CRÍTICA",
};

/** Classificação do d20 ativo. */
export type CritKind = "crit-nat" | "crit-margin" | "fumble" | "";

/** Resultado do d20 ATIVO (o mantido em vantagem/desvantagem) do roll. */
function activeD20(roll: Roll): number | null {
    return roll.dice?.find((d) => d.faces === 20)?.results?.find((r) => r.active)?.result ?? null;
}

/**
 * Classifica um d20 natural quanto a crítico/falha. `critThreshold` é a margem
 * de ameaça efetiva (20 por padrão; melhorias como Precisa baixam para 19/18/…).
 *   - 20 natural            → "crit-nat"
 *   - >= critThreshold (<20) → "crit-margin" (crítico por margem ampliada)
 *   - 1 natural             → "fumble"
 * Pura → testável.
 */
export function classifyD20(natural: number | null, critThreshold = 20): CritKind {
    if (natural == null) return "";
    if (natural === 20) return "crit-nat";
    if (natural === 1) return "fumble";
    if (critThreshold < 20 && natural >= critThreshold) return "crit-margin";
    return "";
}

/** Detecta crítico/falha do d20 ativo do roll, dada a margem efetiva. */
function detectD20Outcome(roll: Roll, critThreshold = 20): CritKind {
    return classifyD20(activeD20(roll), critThreshold);
}

/** Opções de exibição de crítico para uma rolagem (ataque). */
export interface OverlayCritOpts {
    /** Margem de ameaça efetiva (20 padrão; Precisa etc. baixam). */
    critThreshold?: number;
    /** É uma rolagem de ATAQUE? (mostra status "crítico/sem crítico" + diferencia 20 natural × margem). */
    isAttack?: boolean;
}

/** Monta o label de crítico/falha para a rolagem (ramo sem outcome explícito). */
function buildCritLabel(kind: CritKind, isAttack: boolean, threshold: number): string {
    const sub = (t: string) => `<span class="bg3-t20-crit-sub">${esc(t)}</span>`;
    switch (kind) {
        case "crit-nat":
            return isAttack
                ? `<div class="bg3-t20-crit-label is-crit">ACERTO CRÍTICO! ${sub("20 natural")}</div>`
                : `<div class="bg3-t20-crit-label is-crit">Acerto Crítico!</div>`;
        case "crit-margin":
            return `<div class="bg3-t20-crit-label is-crit">ACERTO CRÍTICO! ${sub(`margem ampliada (≥${threshold})`)}</div>`;
        case "fumble":
            return `<div class="bg3-t20-crit-label is-fumble">Falha Crítica</div>`;
        default:
            // Ataque sem crítico → diz explicitamente "sem crítico"; outras rolagens não poluem.
            return isAttack ? `<div class="bg3-t20-crit-label bg3-t20-crit-none">Sem crítico</div>` : "";
    }
}

export interface GridRollEntry {
    meta: RollMeta;
    roll: Roll;
    name: string;
}

function buildGridCellHtml(e: GridRollEntry): string {
    const total = e.roll.total ?? 0;
    const kind  = detectD20Outcome(e.roll); // iniciativa → margem 20 (só 20/1 natural)
    const totalCls = (kind === "crit-nat") ? "is-crit" : kind === "fumble" ? "is-fumble" : "";
    const critLabel =
        kind === "crit-nat" ? `<div class="bg3-t20-grid-crit is-crit">CRÍTICO!</div>`
      : kind === "fumble"   ? `<div class="bg3-t20-grid-crit is-fumble">FALHA!</div>`
      : "";
    const formula = e.roll.formula ? `<div class="bg3-t20-grid-formula">${esc(e.roll.formula)} = ${total}</div>` : "";
    return `
        <div class="bg3-t20-grid-cell">
            <div class="bg3-t20-grid-name">${esc(e.name)}</div>
            <div class="bg3-t20-grid-total${totalCls ? " " + totalCls : ""}">${total}</div>
            ${critLabel}
            ${formula}
        </div>
    `;
}

function buildGridHtml(entries: GridRollEntry[], title: string): string {
    const cols = Math.min(entries.length, 4);
    const cellsHtml = entries.map(buildGridCellHtml).join("");
    return `
        <div class="bg3-t20-grid-wrapper">
            <div class="bg3-t20-category">${esc(title)}</div>
            <div class="bg3-t20-divider"></div>
            <div class="bg3-t20-grid" style="--cols: ${cols}">${cellsHtml}</div>
        </div>
        <div class="bg3-t20-hint">clique para fechar</div>
    `;
}

function buildHtml(meta: RollMeta, roll: Roll, outcome?: TestOutcome, opts?: OverlayCritOpts): string {
    const total = roll.total ?? 0;

    let totalClass: string;
    let resultHtml: string;

    if (outcome) {
        totalClass = ` ${OUTCOME_TOTAL_CLASS[outcome]}`;
        resultHtml = `<div class="bg3-t20-crit-label ${OUTCOME_TOTAL_CLASS[outcome]}">${OUTCOME_LABEL[outcome]}</div>`;
    } else {
        const threshold = opts?.critThreshold ?? 20;
        const isAttack  = opts?.isAttack ?? false;
        const kind = detectD20Outcome(roll, threshold);
        totalClass = (kind === "crit-nat" || kind === "crit-margin") ? " is-crit"
                   : kind === "fumble" ? " is-fumble" : "";
        resultHtml = buildCritLabel(kind, isAttack, threshold);
    }

    const subHtml = meta.subcategory
        ? `<div class="bg3-t20-subcategory">${esc(meta.subcategory)}</div>`
        : "";

    const formulaHtml = roll.formula
        ? `<div class="bg3-t20-formula">${esc(roll.formula)} = ${total}</div>`
        : "";

    return `
        <div class="bg3-t20-card">
            <div class="bg3-t20-category">${esc(meta.category)}</div>
            ${subHtml}
            <div class="bg3-t20-divider"></div>
            <div class="bg3-t20-total${totalClass}">${total}</div>
            ${resultHtml}
            ${formulaHtml}
        </div>
        <div class="bg3-t20-hint">clique para fechar</div>
    `;
}

// ── Overlay singleton ─────────────────────────────────────────────────────────

// Selectors for 3D dice canvases that should always appear above the overlay
const DICE_CANVAS_SELECTORS = ["#dice-box-canvas", "#dice-box", "canvas.dsn-canvas"];

class BG3OverlaySingleton {
    private el: HTMLElement | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private diceElevations: Array<{ el: HTMLElement; original: string }> = [];

    private elevateDice(): void {
        this.diceElevations = [];
        for (const sel of DICE_CANVAS_SELECTORS) {
            document.querySelectorAll<HTMLElement>(sel).forEach((canvas) => {
                this.diceElevations.push({ el: canvas, original: canvas.style.zIndex });
                canvas.style.zIndex = String(Number(OVERLAY_Z) + 1);
            });
        }
    }

    private restoreDice(): void {
        for (const { el, original } of this.diceElevations) {
            el.style.zIndex = original;
        }
        this.diceElevations = [];
    }

    show(meta: RollMeta, roll: Roll, outcome?: TestOutcome, opts?: OverlayCritOpts): void {
        this.mount(buildHtml(meta, roll, outcome, opts), DISMISS_DELAY_MS);
    }

    /**
     * Renderiza um grid (até 4 por linha) com várias rolagens — usado pra
     * "Rolar para Todos" / "Rolar para PNJs" de iniciativa, mostrando cada
     * resultado com o nome de quem rolou. Auto-dismiss escala com o número
     * de células pra dar tempo de leitura.
     */
    showGrid(entries: GridRollEntry[], title: string): void {
        if (entries.length === 0) return;
        const dismissMs = Math.min(10000, DISMISS_DELAY_MS + entries.length * 600);
        this.mount(buildGridHtml(entries, title), dismissMs);
    }

    private mount(innerHtml: string, dismissMs: number): void {
        this.dismiss(true);
        ensureStyles();

        const el = document.createElement("div");
        el.id = OVERLAY_ID;
        el.innerHTML = innerHtml;
        el.addEventListener("click", () => this.dismiss());
        document.body.appendChild(el);
        this.el = el;

        this.elevateDice();
        this.timer = setTimeout(() => this.dismiss(), dismissMs);
    }

    dismiss(immediate = false): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const el = this.el;
        if (!el) return;
        this.el = null;
        this.restoreDice();

        if (immediate) {
            el.remove();
            return;
        }

        el.classList.add("leaving");
        el.addEventListener("animationend", () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 600);
    }
}

export const BG3Overlay = new BG3OverlaySingleton();
