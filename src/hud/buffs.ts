/**
 * Buffs & Condições — lista de Active Effects atualmente visíveis do ator
 * (condições de status + buffs temporários), pra exibir como chips de ícone
 * na HUD. Puramente de EXIBIÇÃO — não gerencia nada (isso é o
 * `duration-manager`); reusa `DUR_FLAG` só pra enriquecer o tooltip com a
 * duração, quando o gerenciador já classificou o effect.
 *
 * ⚠️ Achado ao vivo (verificação desta feature): `disabled:false` + `transfer:
 * false` NÃO discrimina "buff temporário" de "traço permanente" — o T20 copia
 * pra `actor.effects` praticamente TODO poder/traço de classe (Magia
 * Instintiva, Caminho do Arcanista, Aumento de Atributo, Dom da Esperança...)
 * com exatamente essa mesma forma (sem `statuses`, sem duração, sem `onuse`).
 * Um filtro baseado só em campos nativos (transfer/onuse/disabled) mostrava
 * esse lixo junto dos buffs de verdade. O único sinal confiável de "isso é
 * temporário" é: (a) é uma CONDIÇÃO de status (`statuses` não-vazio — sempre
 * temporário por definição, T20 ou não), ou (b) tem QUALQUER flag sob o
 * namespace do módulo (`flags.<MODULE_ID>`) — ou seja, foi um subsistema
 * NOSSO que criou/marcou o effect de propósito (duration-manager, Consagrar/
 * Aura Sagrada/Égide Sagrada, Inspiração, Orientação, Concentração de
 * Combate...), nunca uma cópia nativa passiva do T20. Isso exclui
 * corretamente os traços permanentes e inclui tanto os buffs geridos pelo
 * duration-manager quanto os buffs de área (que o duration-manager
 * deliberadamente NÃO tagueia — são de outro subsistema).
 */
import { MODULE_ID } from "@/constants";
import { DUR_FLAG, type DurData } from "@/duration-manager/types";

export interface BuffSlotVM {
    id: string;
    name: string;
    icon: string;
    isCondition: boolean;
    durationLabel?: string;
}

type EffectLike = FoundryItemEffect & {
    img?: string;
    icon?: string;
    statuses?: Set<string> | string[];
    isSuppressed?: boolean;
};

const FALLBACK_ICON = "icons/svg/aura.svg";

function effStatuses(e: EffectLike): string[] {
    const s = e.statuses;
    if (!s) return [];
    return Array.isArray(s) ? s : Array.from(s);
}

function isOnUseEffect(e: EffectLike): boolean {
    const f = e.flags?.["tormenta20"] as { onuse?: unknown } | undefined;
    return f?.onuse === true;
}

/** Tem qualquer flag sob o namespace do módulo — marca de "um subsistema NOSSO criou/tagueou isso de propósito" (ver nota do arquivo). */
function hasOwnModuleFlag(e: EffectLike): boolean {
    const f = e.flags?.[MODULE_ID];
    return !!f && Object.keys(f).length > 0;
}

/** Puro/testável — critério de "isso é um buff/condição temporário digno de exibição" (ver nota do arquivo pro porquê). */
export function isVisibleBuff(e: EffectLike): boolean {
    if (e.disabled) return false;
    if (e.isSuppressed === true) return false;
    if (e.transfer) return false;
    if (isOnUseEffect(e)) return false;
    return effStatuses(e).length > 0 || hasOwnModuleFlag(e);
}

/** Puro/testável — texto curto de duração a partir do flag do gerenciador (`undefined` se não classificado/indeterminado). */
export function formatDurationLabel(dur: DurData | null | undefined): string | undefined {
    if (!dur?.managed) return undefined;
    switch (dur.kind) {
        case "rounds": return `${dur.remaining ?? dur.rounds ?? 1} rodada(s)`;
        case "scene": return "até o fim da cena";
        case "day": return "até passar 1 dia";
        case "sustained": return "sustentada";
        default: return undefined;
    }
}

function durationLabelFor(e: EffectLike): string | undefined {
    const f = e.flags?.[MODULE_ID] as Record<string, unknown> | undefined;
    return formatDurationLabel(f?.[DUR_FLAG] as DurData | undefined);
}

/** Buffs/condições visíveis do ator, condições primeiro (agrupamento visual). */
export function buildBuffSlots(actor: FoundryActor): BuffSlotVM[] {
    const effects = (actor.effects?.contents ?? []) as EffectLike[];
    return effects
        .filter(isVisibleBuff)
        .map((e) => ({
            id: e.id,
            name: e.name,
            icon: e.img || e.icon || FALLBACK_ICON,
            isCondition: effStatuses(e).length > 0,
            durationLabel: durationLabelFor(e),
        }))
        .sort((a, b) => Number(b.isCondition) - Number(a.isCondition));
}
