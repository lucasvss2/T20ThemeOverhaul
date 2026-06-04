/**
 * CHA dinâmico para auras ligadas ao Carisma do caster (Aura Sagrada / Égide Sagrada).
 *
 * O valor do efeito (resistência/defesa += CHA, e por tabela a cura/dano de
 * Aura de Cura/Ardente = 5 + CHA) é "baked" no `baseEffectData` do template no
 * momento do cast. Se o CHA do caster mudar DEPOIS — por item, habilidade
 * (Active Effect) ou edição manual da ficha, pra mais ou pra menos —
 * recomputamos dinamicamente:
 *
 *   1. Atualiza o `baseEffectData` do template → Aura de Cura/Ardente (que leem
 *      o CHA desse flag) e novos recipientes passam a usar o novo valor.
 *   2. Atualiza as AEs já aplicadas nos recipientes → o bônus de
 *      resistência/defesa reflete o novo CHA imediatamente.
 *
 * No-op quando o CHA não mudou. Gating multi-GM via isActiveGM. Ignora as
 * próprias AEs da aura (flagOrigin) pra não entrar em loop ao atualizá-las.
 */

import { log } from "@/utils/logging";
import { isActiveGM } from "@/_shared";

export interface ChaDynamicConfig {
    moduleId:      string;
    flagSpell:     string;  // template flag que identifica a aura ("spell")
    spellKey:      string;  // valor de flagSpell ("aura-sagrada" / "egide-sagrada")
    flagOrigin:    string;  // AE flag que liga a AE ao template de origem
    flagCasterAid: string;  // template flag com o actor id do caster
    label:         string;  // rótulo pra logs ("Aura Sagrada" / "Égide Sagrada")
}

type TplLike = {
    id: string; uuid: string;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
};

function listTemplates(cfg: ChaDynamicConfig): TplLike[] {
    return (canvas?.scene?.templates?.contents ?? [])
        .filter(t => t.flags?.[cfg.moduleId]?.[cfg.flagSpell] === cfg.spellKey);
}

/** CHA (modificador) atual do ator. NaN se indisponível. */
function readActorCha(actor: FoundryActor): number {
    const sys = actor.system as { atributos?: { car?: { value?: number } } } | undefined;
    const n = Number(sys?.atributos?.car?.value ?? NaN);
    return Number.isFinite(n) ? n : NaN;
}

/** Atualiza in-place as AEs já aplicadas nos recipientes deste template. */
async function updateRecipientAEs(cfg: ChaDynamicConfig, templateId: string, newChanges: unknown[]): Promise<void> {
    const tokens = canvas?.tokens?.placeables ?? [];
    const seen = new Set<string>();
    for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;
        const aid = actor.id;
        if (!aid || seen.has(aid)) continue;
        seen.add(aid);
        const ours = (actor.effects?.contents ?? []).filter(e =>
            (e.flags?.[cfg.moduleId] as Record<string, unknown> | undefined)?.[cfg.flagOrigin] === templateId
        );
        for (const ae of ours) {
            try {
                await ae.update({ changes: newChanges });
            } catch (err) {
                console.warn(`[${cfg.moduleId}] ${cfg.label}: falha ao atualizar AE de recipiente:`, err);
            }
        }
    }
}

/** Recomputa um template com o novo CHA (baseEffectData + AEs de recipiente). */
async function applyNewChaToTemplate(cfg: ChaDynamicConfig, tpl: TplLike, newCha: number): Promise<void> {
    const base = tpl.flags?.[cfg.moduleId]?.["baseEffectData"] as
        | { changes?: Array<{ value?: string | number }> } | undefined;
    if (!base?.changes?.length) return;
    const oldCha = Number(base.changes[0]?.value ?? NaN);
    if (!Number.isFinite(oldCha) || oldCha === newCha) return; // sem mudança → no-op

    const newBase = JSON.parse(JSON.stringify(base)) as { changes: Array<{ value?: string | number }> };
    for (const ch of newBase.changes) {
        // Só os changes cujo valor era o CHA antigo (resistência/defesa += CHA).
        if (Number(ch.value) === oldCha) ch.value = String(newCha);
    }
    try {
        await tpl.update({ [`flags.${cfg.moduleId}.baseEffectData`]: newBase });
    } catch (err) {
        console.warn(`[${cfg.moduleId}] ${cfg.label}: falha ao atualizar baseEffectData:`, err);
        return;
    }
    await updateRecipientAEs(cfg, tpl.id, newBase.changes);
    log(`${cfg.label}: CHA do caster mudou ${oldCha}→${newCha} — bônus/cura/dano da aura atualizados.`);
}

/** Recomputa todas as auras deste tipo emitidas pelo ator, com o CHA atual dele. */
async function recomputeForActor(cfg: ChaDynamicConfig, actor: FoundryActor): Promise<void> {
    if (!isActiveGM()) return;
    const actorId = actor.id;
    if (!actorId) return;
    const newCha = readActorCha(actor);
    if (!Number.isFinite(newCha)) return;
    const tpls = listTemplates(cfg).filter(t => t.flags?.[cfg.moduleId]?.[cfg.flagCasterAid] === actorId);
    for (const tpl of tpls) await applyNewChaToTemplate(cfg, tpl, newCha);
}

/**
 * Registra os hooks que recomputam o CHA da aura quando o Carisma do caster muda.
 * Chamado uma vez por aura (Aura Sagrada e Égide Sagrada têm a mesma estrutura).
 */
export function setupChaDynamicAura(cfg: ChaDynamicConfig): void {
    const pending = new Set<string>();
    const schedule = (actor: FoundryActor | null | undefined): void => {
        if (!actor) return;
        const actorId = actor.id;
        if (!actorId || pending.has(actorId)) return;
        // Só agenda se este ator emite alguma aura deste tipo (checagem barata).
        const isCaster = listTemplates(cfg).some(t => t.flags?.[cfg.moduleId]?.[cfg.flagCasterAid] === actorId);
        if (!isCaster) return;
        pending.add(actorId);
        // Defer: numa mudança via AE, o car.value derivado só estabiliza após o
        // prepareData do ator. 60ms cobre isso e ainda coalesce eventos rápidos.
        setTimeout(() => {
            pending.delete(actorId);
            void recomputeForActor(cfg, actor);
        }, 60);
    };

    // Edição manual da ficha (ou qualquer update que toque os atributos).
    Hooks.on("updateActor", (...args: unknown[]) => {
        const actor   = args[0] as FoundryActor;
        const changes = args[1] as Record<string, unknown> | undefined;
        const sys     = changes?.["system"] as { atributos?: { car?: unknown } } | undefined;
        if (sys?.atributos?.car === undefined) return;
        schedule(actor);
    });

    // CHA via Active Effect (item/habilidade): a mudança no car.value é derivada,
    // não aparece como diff em updateActor. Re-agenda lendo o valor pós-prepareData.
    const onAE = (ae: unknown): void => {
        const e = ae as {
            parent?: { documentName?: string; actor?: FoundryActor | null };
            flags?: Record<string, Record<string, unknown>>;
        };
        // Ignora as PRÓPRIAS AEs da aura (têm flagOrigin) — evita loop ao
        // atualizarmos as AEs dos recipientes.
        if ((e.flags?.[cfg.moduleId] as Record<string, unknown> | undefined)?.[cfg.flagOrigin]) return;
        const p = e.parent;
        const actor = p?.documentName === "Actor" ? (p as unknown as FoundryActor) : (p?.actor ?? null);
        schedule(actor);
    };
    Hooks.on("createActiveEffect", (...args: unknown[]) => onAE(args[0]));
    Hooks.on("deleteActiveEffect", (...args: unknown[]) => onAE(args[0]));
    Hooks.on("updateActiveEffect", (...args: unknown[]) => onAE(args[0]));
}
