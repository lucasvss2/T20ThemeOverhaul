/**
 * Luva de Ferro — "Suas magias arcanas PESSOAIS que concedem bônus na Defesa
 * ou em testes de resistência têm esse bônus aumentado em +1."
 *
 * Sem automação nativa (o nome não existe no tormenta20.mjs). Implementação:
 * quando o CONJURADOR está com uma "Luva de Ferro" equipada e lança uma magia
 * ARCANA de alcance PESSOAL cujos efeitos somam bônus de Defesa ou de testes
 * de resistência (Fortitude/Reflexos/Vontade), as changes correspondentes das
 * AEs são aumentadas em +1 ANTES da aplicação.
 *
 * Integração: nos dois pontos onde o módulo materializa AEs de buff de magia
 * (`spell-resistance`): o auto-apply de buff puro (⚡) e o botão de buff do
 * modal unificado (`applyBuffEffect`). O botão NATIVO `chat-apply-ae` do card
 * do T20 não passa pelo módulo — não é coberto (limitação documentada).
 */

import { norm } from "@/inspiracao/format";

const LUVA_NAME = "luva de ferro";

// ── Detecção ──────────────────────────────────────────────────────────────────

interface ItemLike {
    type?: string;
    name?: string;
    system?: { equipado?: unknown; equipped?: unknown; equipado2?: { slot?: number } };
}

/** O ator tem uma Luva de Ferro equipada? (cobre mundos com/sem equipmentSlots) */
export function hasLuvaDeFerro(actor: { items?: { contents: ItemLike[] } } | null | undefined): boolean {
    if (!actor) return false;
    return (actor.items?.contents ?? []).some((it) => {
        if (it.type !== "equipamento") return false;
        if (!norm(it.name).includes(LUVA_NAME)) return false;
        const sys = it.system;
        return !!(sys?.equipado || sys?.equipped || (sys?.equipado2?.slot ?? 0) > 0);
    });
}

/**
 * Magia arcana de alcance pessoal? `itemData` é o `.system` achatado do flag
 * da mensagem (`flags.tormenta20.itemData`): tipo em `.tipo`, alcance em
 * `.alcance` (key "self" do T20.distanceUnits; aceita "pessoal" livre também).
 */
export function isPersonalArcaneSpell(itemData: { tipo?: string; alcance?: string } | null | undefined): boolean {
    if (!itemData || itemData.tipo !== "arc") return false;
    const alc = norm(itemData.alcance ?? "");
    return alc === "self" || alc.startsWith("pessoal");
}

// ── Boost das changes ─────────────────────────────────────────────────────────

export interface AEChangeLike { key?: string; mode?: number; value?: unknown }

/** A change é um bônus de Defesa ou de teste de resistência? (mode ADD, valor > 0) */
export function isDefenseOrResistChange(c: AEChangeLike): boolean {
    const key = String(c.key ?? "");
    if (Number(c.mode ?? 2) !== 2) return false;
    const n = Number(c.value);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (key.startsWith("system.attributes.defesa.") && !key.endsWith(".pda")) return true;
    if (key.startsWith("system.modificadores.pericias.resistencia")) return true;
    if (/^system\.pericias\.(fort|refl|vont)\./.test(key)) return true;
    return false;
}

/**
 * Aplica +1 nas changes elegíveis de um conjunto de grupos de AE (deep-clone —
 * não muta a entrada). Retorna os grupos (boostados ou originais) e se houve
 * boost. Puro/testável.
 */
export function boostDefenseResistGroups<T extends { changes?: AEChangeLike[] }>(
    groups: T[][],
): { groups: T[][]; boosted: boolean } {
    let boosted = false;
    const out = (JSON.parse(JSON.stringify(groups)) as T[][]).map((group) =>
        group.map((ae) => {
            for (const c of ae.changes ?? []) {
                if (isDefenseOrResistChange(c)) {
                    c.value = String(Number(c.value) + 1);
                    boosted = true;
                }
            }
            return ae;
        }),
    );
    return { groups: boosted ? out : groups, boosted };
}

// ── Entrada usada pelo spell-resistance ───────────────────────────────────────

interface MessageLike {
    speaker?: { actor?: string };
    flags?: Record<string, Record<string, unknown>>;
}

/**
 * Se o cast é elegível (caster com Luva equipada + magia arcana pessoal),
 * devolve os grupos com +1 nos bônus de Defesa/resistência; senão devolve os
 * grupos originais. `boosted` indica se algo mudou (para feedback).
 */
export function maybeBoostLuvaEffects<T extends { changes?: AEChangeLike[] }>(
    message: MessageLike,
    groups: T[][],
): { groups: T[][]; boosted: boolean } {
    try {
        const itemData = (message.flags?.["tormenta20"] as { itemData?: { tipo?: string; alcance?: string } } | undefined)?.itemData;
        if (!isPersonalArcaneSpell(itemData)) return { groups, boosted: false };
        const caster = game.actors?.get(message.speaker?.actor ?? "");
        if (!hasLuvaDeFerro(caster as unknown as { items?: { contents: ItemLike[] } })) return { groups, boosted: false };
        return boostDefenseResistGroups(groups);
    } catch {
        return { groups, boosted: false };
    }
}
