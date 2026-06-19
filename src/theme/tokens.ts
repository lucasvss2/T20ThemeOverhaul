/**
 * Design tokens — fonte única da verdade para cores do tema T20-T20.
 *
 * Para usar:
 *  - Em CSS (dentro de strings injetadas): `color: var(--t20-accent);`
 *  - Em TypeScript (quando precisa da cor pura, ex: chat-render): `COLORS.accent`
 *
 * Princípios:
 *  - Nomes SEMÂNTICOS, não posicionais (`accent`, não `gold-1`).
 *  - Limite de variantes por alpha — não criar uma var nova para cada novo valor;
 *    arredondar para o token mais próximo. Se faltar uma variante essencial, adicionar
 *    aqui ANTES de hardcoded no módulo.
 *  - Cada hex listado em tokens deve aparecer em pelo menos 2 módulos diferentes,
 *    ou ser uma cor estruturalmente importante (estado de erro, sucesso, etc.).
 */

export const COLORS = {
    // ── Backgrounds ──────────────────────────────────────────────────────────
    bgDeepest:  "#0c0907",
    bgDark:     "#1a1108",
    bgMid:      "#2a1e08",
    bgOverlay:  "rgba(0,0,0,0.85)",

    // ── Accent (T20 gold) ────────────────────────────────────────────────────
    accent:        "#c9a76a",   // primary gold
    accentBright:  "#e8d8a8",   // highlight / hover (cream tint)
    accentGold:    "#e6c987",   // vivid bright gold — charname, stat values, hover highlights
    accentMuted:   "#8a7450",   // muted gold
    accentRgb:     "201,167,106", // for rgba() compositions

    // ── Borders / dividers ───────────────────────────────────────────────────
    borderAmbient: "#6a4e18",            // solid 1px amber border for cards
    border:        "rgba(201,167,106,0.25)",
    borderStrong:  "rgba(201,167,106,0.4)",
    divider:       "rgba(106, 78, 24, 0.4)",
    dividerMed:    "rgba(106, 78, 24, 0.2)",
    dividerSoft:   "rgba(106, 78, 24, 0.12)",

    // ── Accent tint layers (background washes / overlays) ────────────────────
    tintSubtle:  "rgba(201,167,106,0.08)",
    tintSoft:    "rgba(201,167,106,0.12)",
    tintMed:     "rgba(201,167,106,0.2)",
    tintStrong:  "rgba(201,167,106,0.3)",
    tintBold:    "rgba(201,167,106,0.45)",

    // ── Text ─────────────────────────────────────────────────────────────────
    textBright:    "#e8e0d0",
    textPrimary:   "#c8bda8",
    textSecondary: "#c0b4a0",
    textMuted:     "#9a8e7a",
    textDisabled:  "#6a5e48",

    // ── Semantic — estados ────────────────────────────────────────────────────
    success:     "#6ecf7a",  // healing, pass
    successRgb:  "110,207,122",
    danger:      "#cc4444",  // damage, fail
    dangerRgb:   "204,68,68",
    info:        "#8ab4e8",  // spell info, hint
    infoRgb:     "138,180,232",
    colorCrit:   "#ffd700",  // crítico (20 natural)
    colorCritRgb:"255,215,0",
    colorFailure:"#c8a070",  // falha não-crítica (outcome de perícia/teste secreto)

    // ── Button gradient (used by .numCtrl, action buttons) ───────────────────
    btnBgTop:    "#5c3a10",
    btnBgBottom: "#3a2208",
    btnBorder:   "#7a5818",
    btnText:     "#f0e0b0",
    btnTextHover: "#fff8e8",
} as const;

/**
 * CSS gerado a partir de COLORS. Injetar uma única vez no boot (setupTheme).
 * Aplicado em :root para que `var(--t20-*)` esteja disponível em qualquer
 * seletor descendente — incluindo dentro de dialogs/sheets do Foundry.
 */
export const THEME_CSS = `
:root {
    /* Backgrounds */
    --t20-bg-deepest:  ${COLORS.bgDeepest};
    --t20-bg-dark:     ${COLORS.bgDark};
    --t20-bg-mid:      ${COLORS.bgMid};
    --t20-bg-overlay:  ${COLORS.bgOverlay};

    /* Accent */
    --t20-accent:         ${COLORS.accent};
    --t20-accent-bright:  ${COLORS.accentBright};
    --t20-accent-gold:    ${COLORS.accentGold};
    --t20-accent-muted:   ${COLORS.accentMuted};
    --t20-accent-rgb:     ${COLORS.accentRgb};

    /* Borders / dividers */
    --t20-border-ambient: ${COLORS.borderAmbient};
    --t20-border:         ${COLORS.border};
    --t20-border-strong:  ${COLORS.borderStrong};
    --t20-divider:        ${COLORS.divider};
    --t20-divider-med:    ${COLORS.dividerMed};
    --t20-divider-soft:   ${COLORS.dividerSoft};

    /* Accent tints */
    --t20-tint-subtle:  ${COLORS.tintSubtle};
    --t20-tint-soft:    ${COLORS.tintSoft};
    --t20-tint-med:     ${COLORS.tintMed};
    --t20-tint-strong:  ${COLORS.tintStrong};
    --t20-tint-bold:    ${COLORS.tintBold};

    /* Text */
    --t20-text-bright:    ${COLORS.textBright};
    --t20-text-primary:   ${COLORS.textPrimary};
    --t20-text-secondary: ${COLORS.textSecondary};
    --t20-text-muted:     ${COLORS.textMuted};
    --t20-text-disabled:  ${COLORS.textDisabled};

    /* Semantic */
    --t20-color-success:     ${COLORS.success};
    --t20-color-success-rgb: ${COLORS.successRgb};
    --t20-color-danger:      ${COLORS.danger};
    --t20-color-danger-rgb:  ${COLORS.dangerRgb};
    --t20-color-info:        ${COLORS.info};
    --t20-color-info-rgb:    ${COLORS.infoRgb};
    --t20-color-crit:        ${COLORS.colorCrit};
    --t20-color-crit-rgb:    ${COLORS.colorCritRgb};
    --t20-color-failure:     ${COLORS.colorFailure};

    /* Button gradient */
    --t20-btn-bg-top:     ${COLORS.btnBgTop};
    --t20-btn-bg-bottom:  ${COLORS.btnBgBottom};
    --t20-btn-border:     ${COLORS.btnBorder};
    --t20-btn-text:       ${COLORS.btnText};
    --t20-btn-text-hover: ${COLORS.btnTextHover};
}
`;
