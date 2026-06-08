/**
 * Herança Dracônica + Escamas Elementais — lógica pura (testável).
 *
 * Herança Dracônica: criatura tipo monstro + RD 5 contra um tipo de dano à
 * escolha entre ácido, eletricidade, fogo, frio, luz ou trevas.
 * Escamas Elementais: +2 Defesa e aumenta a RD da Herança Dracônica para 10.
 */

/** Os 6 elementos selecionáveis (chaves de CONFIG.T20.damageTypes). */
export const ELEMENT_KEYS = ["acido", "eletricidade", "fogo", "frio", "luz", "trevas"] as const;
export type ElementKey = (typeof ELEMENT_KEYS)[number];

export const HERANCA_NAME = "heranca draconica";
export const ESCAMAS_NAME = "escamas elementais";

export const RD_BASE = 5;
export const RD_ESCAMAS = 10;
export const DEFESA_BONUS = 2;

export function isElementKey(s: string | null | undefined): s is ElementKey {
    return !!s && (ELEMENT_KEYS as readonly string[]).includes(s);
}

/** RD da Herança: 10 com Escamas Elementais, senão 5. */
export function computeHerancaRd(hasEscamas: boolean): number {
    return hasEscamas ? RD_ESCAMAS : RD_BASE;
}

export interface AEChange {
    key: string;
    value: string;
    mode: number;
    priority: number;
}

const MODE_ADD = 2;
const MODE_OVERRIDE = 5;

/**
 * Changes da AE da Herança Dracônica: RD contra o elemento (via bonus[] → o T20
 * deriva `.value`) + tipo de criatura = monstro.
 */
export function buildHerancaChanges(element: ElementKey, rd: number): AEChange[] {
    return [
        { key: `system.tracos.resistencias.${element}.bonus`, value: String(rd), mode: MODE_ADD, priority: 20 },
        { key: "system.detalhes.tipo", value: "mon", mode: MODE_OVERRIDE, priority: 20 },
    ];
}

/** Changes da AE de Escamas Elementais: +2 na Defesa. */
export function buildEscamasChanges(): AEChange[] {
    return [
        { key: "system.attributes.defesa.bonus", value: String(DEFESA_BONUS), mode: MODE_ADD, priority: 20 },
    ];
}
