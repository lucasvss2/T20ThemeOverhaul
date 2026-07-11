/**
 * T20 spell CD formula fix.
 *
 * O T20 nativo computa o CD do item (magia/consumível) em prepareFinalAttributes:
 *
 *   cd = 10 + nivel/2 + atributo_conjuracao + resistencia.bonus
 *
 * Essa fórmula IGNORA bônus de items aplicados ao actor via Active Effects
 * (ex: Foco Arcano dá +1 ao `actor.system.attributes.cd`). Resultado: o CD
 * mostrado nas magias fica 1 ponto abaixo do CD real do conjurador.
 *
 * Fix: monkey-patch Tormenta20ItemData.prototype.prepareFinalAttributes para
 * usar `actor.attributes.cd` como base (que JÁ inclui todos os AEs do actor):
 *
 *   cd = actor.attributes.cd + atributo_conjuracao + resistencia.bonus
 *
 * Aplicado UMA vez no setup → corrige TODAS as magias e consumíveis do mundo.
 *
 * Preserva o caminho de NPCs (que já usavam `actor.attributes.cd` diretamente)
 * e mantém fallback pra fórmula antiga caso `actor.attributes.cd` esteja 0.
 */

import { log, warn } from "@/utils/logging";
import { getCastingAttrOverride } from "@/tradicao-perdida/index";

type ItemDataProtoLike = {
    prepareFinalAttributes?: () => void;
    _t20CDFormulaPatched?:   boolean;
};

export function patchT20SpellCDFormula(): void {
    type T20Global = {
        data?: { models?: { ConsumableData?: { prototype: object } } };
    };
    const t20 = (game as unknown as { tormenta20?: T20Global }).tormenta20;
    const Cons = t20?.data?.models?.ConsumableData;
    if (!Cons) {
        warn(`tormenta20.data.models.ConsumableData não encontrado — patch de CD não aplicado.`);
        return;
    }

    // ConsumableData estende Tormenta20ItemData. Acessamos a classe base via
    // protótipo do protótipo: prepareFinalAttributes é definido na base.
    const baseProto = Object.getPrototypeOf(Cons.prototype) as ItemDataProtoLike;
    if (!baseProto || typeof baseProto.prepareFinalAttributes !== "function") {
        warn(`Tormenta20ItemData.prototype.prepareFinalAttributes não encontrado — patch de CD não aplicado.`);
        return;
    }
    if (baseProto._t20CDFormulaPatched) return;

    baseProto.prepareFinalAttributes = function(this: {
        parent?: {
            isOwned?: boolean;
            parent?: {
                type?: string;
                system?: Record<string, unknown>;
            } | null;
        };
        resistencia?: {
            atributo?: string;
            txt?:      string;
            bonus?:    number;
            cd?:       number;
        };
    }): void {
        const item  = this.parent;
        const actor = item?.parent ?? undefined;
        if (!item?.isOwned || !actor) return;

        const resist = this.resistencia;
        if (!resist) return;
        if (!resist.txt) return;

        const actorSys = actor.system ?? {};
        if (actor.type === "npc") {
            const attrs = actorSys["attributes"] as { cd?: number } | undefined;
            resist.cd = Number(attrs?.cd ?? 0);
            return;
        }

        // PC: usa actor.attributes.cd (que JÁ tem Foco Arcano, AEs, etc.)
        const attrs   = actorSys["attributes"] as { cd?: number; nivel?: { value?: number }; conjuracao?: string } | undefined;
        const atrs    = actorSys["atributos"]  as Record<string, { value?: number } | undefined> | undefined;
        const actorCD = Number(attrs?.cd ?? 0);

        // Atributo-chave: o de CONJURAÇÃO do ATOR (dropdown "CD de Magias" da
        // ficha) tem precedência sobre o `resistencia.atributo` gravado no ITEM —
        // magias importadas do compêndio vêm com o atributo da classe "típica"
        // (arcanas=int, divinas=sab), o que quebrava conjuradores de outro
        // atributo (ex.: bardo/Carisma via magias arcanas com CD de Int).
        // Fallback: atributo do item (ator sem conjuração definida).
        let castingAttr = (attrs?.conjuracao || resist.atributo) ?? "";
        if (!castingAttr) return;
        // Tradição Perdida Aprimorada: o atributo escolhido no poder vence tudo.
        const override = getCastingAttrOverride(actor as unknown as FoundryActor);
        if (override) castingAttr = override.attr;
        const atrVal  = Number(atrs?.[castingAttr]?.value ?? 0);
        const bonus   = Number(resist.bonus ?? 0);

        if (actorCD > 0) {
            // Fórmula corrigida — actor.attributes.cd já inclui bônus de items via AE
            resist.cd = actorCD + atrVal + bonus;
        } else {
            // Fallback: fórmula T20 original (10 + nivel/2 + atributo + bonus)
            const nvl = Math.floor(Number(attrs?.nivel?.value ?? 0) / 2);
            resist.cd = 10 + nvl + atrVal + bonus;
        }
    };
    baseProto._t20CDFormulaPatched = true;

    log(`T20 spell CD formula patched — CD agora inclui bônus de items via actor.attributes.cd.`);

    // ⚠️ NÃO chamamos `actor.prepareData()` em loop aqui. T20 armazena bônus em
    // ArrayField acumulativo (ex: `pm.bonus.total`); cada `prepareData()` extra
    // duplica entradas — Sir Drake foi visto com pm.bonus.total de 11 entradas
    // em vez de 3 (3 prepareData chamadas → 3× aplicação). O patch funcionará
    // automaticamente no próximo prepareData natural (abrir ficha, fazer roll,
    // mudar AE, etc.).
}
