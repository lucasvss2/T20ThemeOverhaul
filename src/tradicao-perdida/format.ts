/**
 * Tradição Perdida — lógica pura (testável).
 *
 * "Escolha um atributo e uma de suas classes com Magias. Para essa classe, você
 * soma o atributo escolhido no seu total de PM, em vez do atributo determinado
 * por ela, até um limite de 6 pontos de atributo, +2 pontos por patamar acima
 * de iniciante. Aumentos temporários nesse atributo não fornecem PM adicionais."
 *
 * Patamares T20 (CONFIG.T20.patamares = [4,10,16,20]):
 *   Iniciante 1-4 · Veterano 5-10 · Campeão 11-16 · Lendário 17-20.
 */

export const ATTR_KEYS = ["for", "des", "con", "int", "sab", "car"] as const;
export type AttrKey = (typeof ATTR_KEYS)[number];

export function isAttrKey(s: string | null | undefined): s is AttrKey {
    return !!s && (ATTR_KEYS as readonly string[]).includes(s);
}

/** Quantos patamares ACIMA de iniciante o nível representa (0..3). */
export function tierAboveIniciante(level: number, patamares: number[] = [4, 10, 16, 20]): number {
    // patamares são os tetos de cada patamar; "acima de iniciante" conta quantos
    // tetos (exceto o último) o nível ultrapassou.
    let tier = 0;
    for (let i = 0; i < patamares.length - 1; i++) {
        if (level > patamares[i]) tier++;
    }
    return tier;
}

/** Teto de pontos de atributo que a Tradição Perdida soma ao PM. */
export function pmCap(level: number, patamares: number[] = [4, 10, 16, 20]): number {
    return 6 + 2 * tierAboveIniciante(level, patamares);
}

/**
 * Delta de PM da Tradição Perdida: substitui a contribuição do atributo da
 * classe pela do atributo escolhido (limitado pelo teto).
 *   delta = min(chosenAttrMod, cap) − classKeyAttrMod
 */
export function computePmDelta(chosenAttrMod: number, classKeyAttrMod: number, cap: number): number {
    return Math.min(chosenAttrMod, cap) - classKeyAttrMod;
}

export interface AEChange {
    key: string;
    value: string;
    mode: number;
    priority: number;
}

/** AE change que soma o delta ao total de PM (ArrayField acumulativo do T20). */
export function buildTradicaoPmChange(delta: number): AEChange[] {
    if (delta === 0) return [];
    return [{ key: "system.attributes.pm.bonus.total", value: String(delta), mode: 2, priority: 20 }];
}
