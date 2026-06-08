/**
 * Baforada Dracônica — lógica pura (testável).
 *
 * "Escolha um elemento (ácido, eletricidade, fogo, frio, luz ou trevas; escolha
 * imutável). Uma vez por rodada, gaste PM (limitados por sua Constituição) pra
 * desferir um sopro elemental numa criatura em alcance curto. Para cada PM
 * gasto, o alvo sofre 1d10 do tipo escolhido (Reflexos CD Con reduz à metade).
 * Recarga (movimento)."
 */

export { ELEMENT_KEYS, isElementKey, type ElementKey } from "@/heranca-draconica/format";

export const RESIST_TXT = "Reflexos reduz à metade";

/** CD do teste: Reflexos CD baseada em Constituição = 10 + ½ nível + Con. */
export function computeBaforadaCD(totalLevel: number, conMod: number): number {
    return 10 + Math.floor(totalLevel / 2) + conMod;
}

/** PM máximo gastável: limitado pela Constituição E pelo PM atual. (mín 0) */
export function maxBaforadaPm(conMod: number, currentPm: number): number {
    return Math.max(0, Math.min(conMod, currentPm));
}

/** Garante o PM escolhido dentro de [1, max] (ou 0 se max for 0). */
export function clampBaforadaPm(requested: number, max: number): number {
    if (max <= 0) return 0;
    if (!Number.isFinite(requested)) return 1;
    return Math.min(Math.max(1, Math.floor(requested)), max);
}

/** Fórmula de dano: Nd10 com o flavor do elemento (pra RD por tipo no alvo). */
export function buildBaforadaFormula(pm: number, element: string): string {
    return `${pm}d10[${element}]`;
}
