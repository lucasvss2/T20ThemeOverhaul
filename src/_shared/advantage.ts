/**
 * Registro compartilhado de vantagem/desvantagem em testes de d20 (ataque e
 * perícia). Cada feature que concede vantagem/desvantagem se registra aqui
 * (`registerAdvantageSource`); quem for rolar consulta `resolveRollKeep`, que
 * agrega TODAS as fontes ativas — não importa de onde a vantagem/desvantagem
 * vem, elas interagem pela mesma regra:
 *
 * **Cancelamento simples, sem empilhar.** Se o ator tem QUALQUER fonte de
 * vantagem E QUALQUER fonte de desvantagem aplicável ao MESMO teste, elas se
 * anulam → teste normal (1d20). Duas ou mais fontes do MESMO sinal continuam
 * valendo como uma vantagem/desvantagem só (2d20kh/2d20kl) — sem "3d20kh".
 * Motivo técnico: o `d20Roll` nativo do T20 (tormenta20.mjs ~4806-4843) só
 * sabe rolar exatamente 2 dados quando há vantagem/desvantagem (`nd=2`
 * hardcoded); ele reescreve `parts[0]` sempre que detecta "kh"/"kl" na
 * fórmula ou vantagem/desvantagem no roll, então não dá pra "enganar" com uma
 * fórmula "3d20kh" pré-montada — o nativo substitui por `2d20kh` de qualquer
 * jeito. Empilhamento de verdade (N fontes → N+1 dados) exigiria reimplementar
 * essa parte do motor de rolagem por fora — fora de escopo por ora (decisão
 * do usuário: só cancelamento).
 */

export type RollKind = "attack" | "pericia";

export interface AdvantageActorLike {
    id?: string;
}

export interface AdvantageQuery {
    actor: AdvantageActorLike | null | undefined;
    kind: RollKind;
    /** Chave da perícia sendo rolada — só relevante p/ `kind:"pericia"`. */
    skillKey?: string;
}

export interface AdvantageSource {
    /** Id único da feature (p/ idempotência ao re-registrar em testes/HMR). */
    id: string;
    hasAdvantage(q: AdvantageQuery): boolean;
    hasDisadvantage(q: AdvantageQuery): boolean;
}

const _sources: AdvantageSource[] = [];

/** Registra (ou substitui, por `id`) uma fonte de vantagem/desvantagem. */
export function registerAdvantageSource(src: AdvantageSource): void {
    const idx = _sources.findIndex((s) => s.id === src.id);
    if (idx >= 0) _sources[idx] = src;
    else _sources.push(src);
}

function anyHasAdvantage(q: AdvantageQuery): boolean {
    for (const s of _sources) {
        try { if (s.hasAdvantage(q)) return true; } catch { /* uma fonte com bug não deve quebrar as outras */ }
    }
    return false;
}

function anyHasDisadvantage(q: AdvantageQuery): boolean {
    for (const s of _sources) {
        try { if (s.hasDisadvantage(q)) return true; } catch { /* idem */ }
    }
    return false;
}

/** Combina vantagem/desvantagem líquidas em um `rollKeep` (ou `undefined` = normal). Pura/testável. */
export function combineAdvantage(hasAdvantage: boolean, hasDisadvantage: boolean): "khd20" | "kld20" | undefined {
    if (hasAdvantage && hasDisadvantage) return undefined;
    if (hasAdvantage) return "khd20";
    if (hasDisadvantage) return "kld20";
    return undefined;
}

/** Agrega todas as fontes registradas aplicáveis a este teste e resolve o `rollKeep` final. */
export function resolveRollKeep(q: AdvantageQuery): "khd20" | "kld20" | undefined {
    if (!q.actor) return undefined;
    return combineAdvantage(anyHasAdvantage(q), anyHasDisadvantage(q));
}

/** Só para testes: limpa o registro entre specs (evita vazamento entre arquivos de teste). */
export function _clearAdvantageSourcesForTests(): void {
    _sources.length = 0;
}
