/**
 * Weapon / Equipment AE Transfer
 *
 * O T20 não transfere Active Effects de items do tipo `arma` para o ator
 * (mesmo com `transfer: true` e item equipado). E para `equipamento`, o T20/
 * Foundry só cria a cópia no ator no MOMENTO em que o item é ADICIONADO ao
 * ator (transferral legado): efeitos `transfer:true` adicionados/editados num
 * item já existente (homebrew editado depois) NUNCA são aplicados — nem
 * recriar o efeito resolve, só re-adicionar o item. Ex.: "Chapéu Arcano"
 * (+1 PM total) ficava sem efeito.
 *
 * Este módulo garante a aplicação para AMBOS os tipos:
 *
 *  - Quando uma arma/equipamento é EQUIPADO (`equipado` truthy ou
 *    `equipado2.slot > 0`): cria cópias dos AE `transfer:true` no ator, com
 *    `origin: item.uuid` e um flag interno apontando para o item de origem.
 *    Para `equipamento`, só cria se o efeito NÃO estiver já aplicado por
 *    outra fonte (ex.: a cópia nativa do T20) — evita duplicar o bônus.
 *
 *  - Quando é DESEQUIPADO: remove as cópias que ESTE módulo criou (pelo flag);
 *    nunca toca nas cópias nativas do T20.
 *
 *  - Quando o item é DELETADO: cleanup das nossas cópias.
 *
 *  - No `ready`, o GM faz uma sincronização inicial pra corrigir estados
 *    desatualizados (efeitos órfãos ou faltando — caso clássico do Chapéu).
 *
 * Os efeitos criados ganham o flag MODULE_ID.weaponTransferOrigin = item.id,
 * usado tanto para reconhecimento quanto para evitar conflito com efeitos
 * criados manualmente pelo jogador / pelo T20.
 */

import { MODULE_ID } from "@/constants";
import { warn } from "@/utils/logging";

const FLAG_KEY = "weaponTransferOrigin";
const ELIGIBLE_TYPES = ["arma", "equipamento"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True se o item é de um tipo que tratamos (arma ou equipamento). */
function isEligible(item: FoundryItem): boolean {
    return ELIGIBLE_TYPES.includes(item.type);
}

/** Considera "equipado": legacy (`system.equipado`) OU slot system (`equipado2.slot > 0`). */
function isItemEquipped(item: FoundryItem): boolean {
    const sys = item.system as { equipado?: unknown; equipado2?: { slot?: unknown } } | undefined;
    const eq = sys?.equipado;
    let legacy = false;
    if (typeof eq === "number") legacy = eq > 0;
    else if (typeof eq === "boolean") legacy = eq;
    else if (typeof eq === "string") legacy = eq !== "" && eq !== "0" && eq !== "false";
    else legacy = Boolean(eq);
    const slot = Number(sys?.equipado2?.slot ?? 0);
    return legacy || slot > 0;
}

/**
 * Para `equipamento`: True se o efeito (por nome) já está aplicado ao ator por
 * uma fonte que NÃO é uma cópia nossa — i.e., a transferência nativa do T20 já
 * funcionou. Nesse caso não criamos cópia (evita duplicar o bônus).
 */
function isEffectAppliedByOther(actor: FoundryActor, item: FoundryItem, effName: string): boolean {
    type AppliedLike = { name?: string; flags?: Record<string, Record<string, unknown>> };
    const applied = ((actor as unknown as { appliedEffects?: AppliedLike[] }).appliedEffects) ?? [];
    return applied.some(e =>
        e.name === effName
        && (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_KEY] !== item.id
    );
}

/** Efeitos do item elegíveis para transferência ao ator. */
function getTransferableEffects(item: FoundryItem): FoundryItemEffect[] {
    type EffWithTransfer = FoundryItemEffect & { transfer?: boolean };
    const effects = (item.effects?.contents ?? []) as EffWithTransfer[];
    return effects.filter(e => e.transfer === true && !e.disabled && (e.changes?.length ?? 0) > 0);
}

/** Efeitos no ator que ESTE módulo criou a partir deste item. */
function getOurTransferredEffects(actor: FoundryActor, itemId: string): FoundryItemEffect[] {
    const effects = actor.effects?.contents ?? [];
    return effects.filter(e => {
        const flag = (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_KEY];
        return flag === itemId;
    });
}

/** Sincroniza os efeitos transferidos de uma arma/equipamento com seu ator pai. */
async function syncWeaponEffects(item: FoundryItem): Promise<void> {
    if (!isEligible(item)) return;
    const actor = (item as unknown as { parent?: FoundryActor }).parent;
    if (!actor) return;
    const isEquip = item.type === "equipamento";

    const equipped       = isItemEquipped(item);
    const existing       = getOurTransferredEffects(actor, item.id);

    type CreateActor = FoundryActor & {
        createEmbeddedDocuments(t: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
        deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
    };
    const a = actor as CreateActor;

    if (!equipped) {
        // Desequipado → remove qualquer cópia que tínhamos criado.
        if (existing.length > 0) {
            try {
                await a.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
            } catch (err) {
                warn(`weapon-ae-transfer: falha ao remover de ${actor.name}:`, err);
            }
        }
        return;
    }

    // Equipado → garantir que cada effect transferível tem cópia no ator.
    let transferable      = getTransferableEffects(item);
    if (isEquip) {
        // Para `equipamento` só replicamos efeitos PERSISTENTES de dados do ator
        // (todas as changes com key "system.*"). Efeitos roll-time (key curta
        // como "dano"/"ataque", ou onuse) já são aplicados pelo T20 via
        // applyOnUseEffects durante a rolagem — copiá-los aqui duplicaria o bônus.
        type EffFlags = { flags?: { tormenta20?: { onuse?: unknown } }; changes?: Array<{ key?: string }> };
        transferable = transferable.filter(e => {
            const ef = e as unknown as EffFlags;
            if (ef.flags?.tormenta20?.onuse) return false;
            const changes = ef.changes ?? [];
            return changes.length > 0 && changes.every(c => String(c.key ?? "").startsWith("system."));
        });
    }
    if (transferable.length === 0) {
        // Item equipado mas sem efeitos transferíveis: remove qualquer cópia velha.
        if (existing.length > 0) {
            try { await a.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id)); } catch { /* ignore */ }
        }
        return;
    }

    const existingByName = new Map(existing.map(e => [e.name, e]));
    const toCreate: Record<string, unknown>[] = [];

    for (const eff of transferable) {
        if (existingByName.has(eff.name)) continue; // já existe (cópia nossa) — idempotente
        // Para equipamento: se o T20 já aplicou esse efeito nativamente, não duplicamos.
        if (isEquip && isEffectAppliedByOther(actor, item, eff.name)) continue;
        const src = (eff as unknown as { toObject(): Record<string, unknown> }).toObject();
        toCreate.push({
            ...src,
            transfer: false,
            origin:   (item as unknown as { uuid: string }).uuid,
            flags: {
                ...(src["flags"] as Record<string, unknown> | undefined ?? {}),
                [MODULE_ID]: { [FLAG_KEY]: item.id },
            },
        });
    }

    if (toCreate.length === 0) return;
    try {
        await a.createEmbeddedDocuments("ActiveEffect", toCreate);
    } catch (err) {
        warn(`weapon-ae-transfer: falha ao criar em ${actor.name}:`, err);
    }
}

/** Cleanup quando o item é deletado: remove cópias órfãs no ator. */
async function cleanupOrphans(item: FoundryItem): Promise<void> {
    const actor = (item as unknown as { parent?: FoundryActor }).parent;
    if (!actor) return;
    const orphans = getOurTransferredEffects(actor, item.id);
    if (orphans.length === 0) return;
    try {
        await (actor as FoundryActor & {
            deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
        }).deleteEmbeddedDocuments("ActiveEffect", orphans.map(e => e.id));
    } catch (err) {
        warn(`weapon-ae-transfer: falha ao limpar órfãos em ${actor.name}:`, err);
    }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupWeaponAETransfer(): void {
    // Re-sync quando o item muda (equipa/desequipa)
    Hooks.on("updateItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[3] as string;
        if (userId !== game.user?.id) return;
        if (!isEligible(item)) return;
        void syncWeaponEffects(item);
    });

    // Item novo já equipado: cria efeitos
    Hooks.on("createItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[2] as string;
        if (userId !== game.user?.id) return;
        if (!isEligible(item)) return;
        void syncWeaponEffects(item);
    });

    // Item deletado: limpa cópias no ator
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[2] as string;
        if (userId !== game.user?.id) return;
        if (!isEligible(item)) return;
        void cleanupOrphans(item);
    });

    // ActiveEffect dentro do item mudou (toggle disabled, edição de changes):
    // re-sincroniza para propagar ao ator.
    Hooks.on("updateActiveEffect", (...args: unknown[]) => {
        const eff    = args[0] as { parent?: FoundryItem };
        const userId = args[3] as string;
        if (userId !== game.user?.id) return;
        const item = eff.parent;
        if (!item || !isEligible(item)) return;
        // Limpa as cópias antigas e re-cria do zero para refletir as mudanças.
        const actor = (item as unknown as { parent?: FoundryActor }).parent;
        if (!actor) return;
        void (async () => {
            const old = getOurTransferredEffects(actor, item.id);
            if (old.length > 0) {
                try {
                    await (actor as FoundryActor & { deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>; })
                        .deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
                } catch { /* ignore */ }
            }
            await syncWeaponEffects(item);
        })();
    });

    Hooks.on("createActiveEffect", (...args: unknown[]) => {
        const eff    = args[0] as { parent?: FoundryItem };
        const userId = args[2] as string;
        if (userId !== game.user?.id) return;
        const item = eff.parent;
        if (!item || !isEligible(item)) return;
        void syncWeaponEffects(item);
    });

    Hooks.on("deleteActiveEffect", (...args: unknown[]) => {
        const eff    = args[0] as { parent?: FoundryItem; name?: string };
        const userId = args[2] as string;
        if (userId !== game.user?.id) return;
        const item = eff.parent;
        if (!item || !isEligible(item)) return;
        // Remove a cópia no ator com mesmo nome.
        const actor = (item as unknown as { parent?: FoundryActor }).parent;
        if (!actor) return;
        const stale = getOurTransferredEffects(actor, item.id).filter(e => e.name === eff.name);
        if (stale.length === 0) return;
        void (actor as FoundryActor & { deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>; })
            .deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
    });

    // Sincronização inicial no ready: cada usuário sincroniza apenas os atores
    // que pode editar (próprios + GM tem todos). Evita duplicação porque cada
    // ator só é processado por quem tem permissão de write.
    Hooks.once("ready", () => {
        const userId = game.user?.id ?? "";
        const isGM   = Boolean(game.user?.isGM);
        const actors = (game.actors?.contents ?? []) as unknown as FoundryActor[];
        void (async () => {
            for (const actor of actors) {
                if (!isGM) {
                    const ownership = actor.ownership ?? {};
                    const userLevel = (ownership[userId] ?? ownership["default"] ?? 0) as number;
                    if (userLevel < 3) continue; // só dono (3+) processa
                }
                for (const item of (actor.items?.contents ?? [])) {
                    if (!isEligible(item)) continue;
                    await syncWeaponEffects(item);
                }
            }
        })();
    });
}
