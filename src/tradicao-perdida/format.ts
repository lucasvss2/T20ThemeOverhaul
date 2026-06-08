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

/** Valor do atributo escolhido que entra no PM, limitado pelo teto do patamar. */
export function cappedChosen(chosenAttrMod: number, cap: number): number {
    return Math.min(chosenAttrMod, cap);
}

export interface AEChange {
    key: string;
    value: string;
    mode: number;
    priority: number;
}

/**
 * Changes da AE da Tradição Perdida. Em vez de SOMAR um delta por cima do
 * atributo da classe (que ficava exibido como "Sabedoria +2" + patch), a gente:
 *   1. DESLIGA o atributo da classe no PM (`pm.atributos.<classKeyAttr>` = false),
 *      em prioridade alta (1000) pra vencer a AE da habilidade "Magias (Classe)"
 *      que liga esse atributo em mode OVERRIDE (prioridade efetiva 50);
 *   2. SOMA o valor do atributo escolhido (já capado) ao total de PM, exibido
 *      como "Tradição Perdida — PM por <Atributo>: +N".
 *
 * Resultado no breakdown: "Classe +X" + "Tradição (Atributo) +N" (sem o atributo
 * original da classe).
 */
export function buildTradicaoChanges(cappedValue: number, classKeyAttr: string | null): AEChange[] {
    const out: AEChange[] = [];
    if (classKeyAttr) {
        out.push({ key: `system.attributes.pm.atributos.${classKeyAttr}`, value: "false", mode: 5, priority: 1000 });
    }
    if (cappedValue !== 0) {
        out.push({ key: "system.attributes.pm.bonus.total", value: String(cappedValue), mode: 2, priority: 1000 });
    }
    return out;
}
