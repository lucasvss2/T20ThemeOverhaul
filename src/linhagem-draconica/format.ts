/**
 * Linhagem Dracônica (Básica / Aprimorada / Superior) — lógica pura (testável).
 *
 * Básica:     +Carisma nos PV iniciais + RD 5 no tipo escolhido.
 * Aprimorada: magias do tipo escolhido custam −1 PM (piso 1 nativo) e causam
 *             +1 de dano POR DADO (mecanismo nativo `d*N` do applyRollChanges).
 * Superior:   dobro do Carisma nos PV iniciais + imunidade ao tipo + PM
 *             temporários = círculo da magia ao reduzir ≥1 inimigo a 0 PV.
 *
 * O elemento é escolhido UMA vez e vincula as três versões (flag no ATOR).
 */

/** Os 4 elementos selecionáveis (chaves de CONFIG.T20.damageTypes). */
export const LINHAGEM_ELEMENTS = ["acido", "eletricidade", "fogo", "frio"] as const;
export type LinhagemElement = (typeof LINHAGEM_ELEMENTS)[number];

export const BASICA_NAME = "linhagem draconica basica";
export const APRIMORADA_NAME = "linhagem draconica aprimorada";
export const SUPERIOR_NAME = "linhagem draconica superior";

export type LinhagemKind = "basica" | "aprimorada" | "superior";

export function isLinhagemElement(s: string | null | undefined): s is LinhagemElement {
    return !!s && (LINHAGEM_ELEMENTS as readonly string[]).includes(s);
}

/**
 * Classifica um nome normalizado de poder. O item genérico "Linhagem Dracônica"
 * (texto-mãe do compêndio, sem sufixo) retorna null — não é automatizado.
 */
export function linhagemKindOf(normName: string): LinhagemKind | null {
    if (normName.includes(BASICA_NAME)) return "basica";
    if (normName.includes(APRIMORADA_NAME)) return "aprimorada";
    if (normName.includes(SUPERIOR_NAME)) return "superior";
    return null;
}

export interface AEChange {
    key: string;
    value: string;
    mode: number;
    priority: number;
}

const MODE_CUSTOM = 0;
const MODE_ADD = 2;
const MODE_OVERRIDE = 5;

/**
 * Básica: +Car nos PV iniciais (`pv.atributos.car` — preparePVPM soma o valor
 * do atributo UMA vez) + RD 5 no elemento (bonus[] → T20 deriva `.value`).
 */
export function buildBasicaChanges(element: LinhagemElement): AEChange[] {
    return [
        { key: "system.attributes.pv.atributos.car", value: "true", mode: MODE_OVERRIDE, priority: 20 },
        { key: `system.tracos.resistencias.${element}.bonus`, value: "5", mode: MODE_ADD, priority: 20 },
    ];
}

/**
 * Superior: garante o 1º Car via `pv.atributos.car` (caso o ator não tenha a
 * Básica) + soma o 2º Car via `pv.bonus.total` (fórmula "@car" resolvida pelo
 * simplifyRollFormula do preparePVPM) + imunidade ao elemento (applyDamage
 * zera o dano do tipo).
 */
export function buildSuperiorChanges(element: LinhagemElement): AEChange[] {
    return [
        { key: "system.attributes.pv.atributos.car", value: "true", mode: MODE_OVERRIDE, priority: 20 },
        { key: "system.attributes.pv.bonus.total", value: "@car", mode: MODE_ADD, priority: 20 },
        { key: `system.tracos.resistencias.${element}.imunidade`, value: "true", mode: MODE_OVERRIDE, priority: 20 },
    ];
}

/**
 * Aprimorada (effect ONUSE — vira checkbox no dialog de magia): key
 * `dano:<elemento>` targeta SÓ as parts de dano do elemento (dmgType);
 * value `d*1` = +1 por dado (nativo, mjs applyRollChanges/re.perd).
 * O −1 PM vem da flag `custo:"-1"` do effect (piso 1 nativo no débito).
 */
export function buildAprimoradaChanges(element: LinhagemElement): AEChange[] {
    return [
        { key: `dano:${element}`, value: "d*1", mode: MODE_CUSTOM, priority: 20 },
    ];
}

/** PM temporários concedidos pela Superior ao reduzir inimigo(s) a 0 PV. */
export function superiorTempPmForCircle(circle: number): number {
    const c = Number(circle);
    if (!Number.isFinite(c)) return 0;
    return Math.max(0, Math.floor(c));
}

/**
 * true quando o dano da magia é do elemento escolhido — o tipo primário vem do
 * modal (`damageType`); fallback: a fórmula contém `[elemento]`.
 */
export function damageMatchesElement(
    element: LinhagemElement,
    damageType: string | null | undefined,
    damageFormula?: string | null,
): boolean {
    if (damageType && damageType.toLowerCase() === element) return true;
    if (damageFormula && damageFormula.toLowerCase().includes(`[${element}]`)) return true;
    return false;
}
