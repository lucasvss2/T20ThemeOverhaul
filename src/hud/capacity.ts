/**
 * Barra de capacidade (Carga/Sobrecarga/Limite) — mesmos dados que
 * `system.attributes.carga` já expõe pra ficha nativa
 * (`templates/actor/parts/encumbrance.hbs`: `{value, limit, max, pct,
 * encumbered}`, todos derivados). Só lemos e formatamos; nada é recalculado
 * aqui.
 */

export interface CargaVM {
    value: number;
    limit: number;
    max: number;
    pct: number;
    encumbered: boolean;
}

interface CargaSystem { value?: number; limit?: number; max?: number; pct?: number; encumbered?: boolean }

/** `null` quando o ator não tem capacidade de carga rastreada (`carga.max` ausente/zero — mesmo guard do `{{#if carga.max}}` nativo). */
export function buildCargaVM(actor: FoundryActor): CargaVM | null {
    const carga = (actor.system?.attributes as { carga?: CargaSystem } | undefined)?.carga;
    if (!carga?.max) return null;
    return {
        value: carga.value ?? 0,
        limit: carga.limit ?? 0,
        max: carga.max ?? 0,
        pct: carga.pct ?? 0,
        encumbered: !!carga.encumbered,
    };
}
