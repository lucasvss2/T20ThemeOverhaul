/**
 * Inspiração do Bardo — helpers puros/testáveis (sem dependências de Foundry).
 *
 * Regra da Inspiração (T20): ação padrão + 2 PM → você e aliados em alcance
 * curto (9 m) ganham +1 em testes de perícia até o fim da cena. A cada quatro
 * níveis pode gastar +2 PM para +1 no bônus.
 *
 * Escala por nível de bardo (teto do bônus base): 1º +1, 5º +2, 9º +3, 13º +4,
 * 17º +5. Custo = 2 PM por ponto de bônus.
 */

export type InspiracaoImprovement =
    | "marcial"      // bônus também em rolagens de dano
    | "resoluta"     // bônus também na Defesa
    | "revigorante"  // PV temporários = 5× bônus
    | "espirituosa"  // (fase futura) PM temp = bônus na 1ª vez por combate
    | "artemagica";  // (fase futura) +2 na CD das habilidades de bardo

interface ItemLike {
    type?: string;
    name?: string;
}

/** Normaliza acentos/caixa (sem trocar espaços por hífens). */
export function norm(s: string | undefined | null): string {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * True se for o poder BASE "Inspiração" — igualdade (ou sufixo, p/ eventuais
 * prefixos de categoria tipo "Música: Inspiração"), NUNCA as melhorias
 * ("Inspiração Marcial", "Resoluta", ...) que têm palavra depois de "inspiração".
 */
export function isInspiracaoPower(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    const n = norm(item.name);
    return n === "inspiracao" || n.endsWith(" inspiracao");
}

/** Classifica uma melhoria de Inspiração pelo nome, ou null se não for. */
export function inspiracaoImprovementOf(name: string | undefined | null): InspiracaoImprovement | null {
    const n = norm(name);
    if (n.includes("inspiracao marcial")) return "marcial";
    if (n.includes("inspiracao resoluta")) return "resoluta";
    if (n.includes("inspiracao revigorante")) return "revigorante";
    if (n.includes("inspiracao espirituosa")) return "espirituosa";
    if (n.includes("arte magica")) return "artemagica";
    return null;
}

/** Teto do bônus base pela tabela de nível de bardo (1..5). */
export function maxBonusForLevel(level: number): number {
    const l = Math.max(1, Math.floor(level || 0));
    return Math.min(5, 1 + Math.floor((l - 1) / 4));
}

/** Custo em PM de um bônus base (2 PM por ponto). */
export function pmCostForBonus(bonus: number): number {
    return 2 * Math.max(0, Math.floor(bonus || 0));
}

/** Maior bônus base que os PM disponíveis permitem pagar (0 se < 2 PM). */
export function maxAffordableBonus(pm: number): number {
    return Math.max(0, Math.floor((pm || 0) / 2));
}

/**
 * Resolve o bônus base efetivo: limitado pela escolha, pelo teto de nível e pelo
 * PM disponível. Retorna 0 quando não dá nem pra pagar o mínimo (caller avisa).
 */
export function resolveBaseBonus(chosen: number, level: number, pm: number): number {
    return Math.max(0, Math.min(
        Math.floor(chosen || 0),
        maxBonusForLevel(level),
        maxAffordableBonus(pm),
    ));
}

/** CD do teste de Atuação da Gaita de Foles: 20 + total de PM gastos. */
export function gaitaCD(totalPm: number): number {
    return 20 + Math.max(0, Math.floor(totalPm || 0));
}

export interface FinalBonusInput {
    /** Bônus base (perícia/nível/PM). */
    base: number;
    /** Gaita de Foles equipada e passou no teste de Atuação? (+1) */
    gaitaPassed?: boolean;
    /** Instrumento de material Adamante equipado? (+1) */
    adamante?: boolean;
}

/**
 * Bônus final aplicado nos alvos. Gaita e Adamante somam ACIMA do teto de nível
 * (são fontes externas ao escalonamento por PM).
 */
export function computeFinalBonus(i: FinalBonusInput): number {
    return Math.max(0, Math.floor(i.base || 0)) + (i.gaitaPassed ? 1 : 0) + (i.adamante ? 1 : 0);
}

export interface AEChangeLike { key: string; mode: number; value: string; priority: number }

/**
 * Inspiração Espirituosa: PM temporários = bônus, mas SÓ na 1ª vez que a
 * Inspiração é usada em cada combate. Fora dessa condição → 0.
 */
export function espirituosaPmTemp(bonus: number, firstUseInCombat: boolean): number {
    return firstUseInCombat ? Math.max(0, Math.floor(bonus || 0)) : 0;
}

/**
 * Arte Mágica: enquanto o bardo está sob a PRÓPRIA Inspiração, a CD para resistir
 * às suas habilidades de bardo aumenta em +2. Modelamos como change extra na AE
 * do PRÓPRIO bardo (`system.attributes.cd += 2`) — o T20 lê `actor.attributes.cd`
 * ao computar a CD das magias, então cai/volta junto com a Inspiração.
 */
export function arteMagicaCdChanges(hasArteMagica: boolean): AEChangeLike[] {
    return hasArteMagica ? [{ key: "system.attributes.cd", mode: 2, value: "2", priority: 20 }] : [];
}

// ── Instrumentos / materiais ────────────────────────────────────────────────

/**
 * Custo da Inspiração com reduções (Cornamusa −1, Madeira Tollon −1) — **nunca
 * abaixo de 1 PM** (regra do usuário: custo de habilidade não fica < 1).
 */
export function adjustInspiracaoCost(baseCost: number, reductions: number): number {
    const c = Math.max(0, Math.floor(baseCost || 0));
    const r = Math.max(0, Math.floor(reductions || 0));
    return Math.max(1, c - r);
}

/** Aço-Rubi: no 1d4, um resultado 1 evita o dano extra do crítico. */
export function acoRubiNegatesCrit(d4: number): boolean {
    return Math.floor(d4 || 0) === 1;
}

/** Clarim Deheoni: +1 em testes de resistência das criaturas sob a Inspiração. */
export function clarimResistChanges(has: boolean): AEChangeLike[] {
    return has ? [{ key: "system.modificadores.pericias.resistencia", mode: 2, value: "1", priority: 20 }] : [];
}

/** Tamborete Marcial: +3 m de deslocamento das criaturas sob a Inspiração. */
export function tamboreteMoveChanges(has: boolean): AEChangeLike[] {
    return has ? [{ key: "system.attributes.movement.walk.bonus", mode: 2, value: "3", priority: 20 }] : [];
}
