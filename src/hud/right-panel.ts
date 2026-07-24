/**
 * Painel direito: abas Inventário/Poderes/Magias (Macros entra na Fase 4b).
 * Filtro de itens do ator por categoria — precedente do filtro de inventário
 * em `src/miasma/index.ts:118`.
 */
import type { GenericSlot } from "./slots-grid";

export type RightTabKey = "inventario" | "poderes" | "magias" | "macros";

export const INVENTORY_TYPES = new Set(["arma", "equipamento", "consumivel", "tesouro"]);

const FALLBACK_ICON = "icons/svg/item-bag.svg";

/** Itens do ator pertencentes à aba (`type` do item Foundry). "macros" não usa esta fonte — ver `macros-tab.ts`. */
export function itemsForTab(actor: FoundryActor, tab: RightTabKey): FoundryItem[] {
    const all = actor.items?.contents ?? [];
    if (tab === "poderes") return all.filter(i => i.type === "poder");
    if (tab === "magias") return all.filter(i => i.type === "magia");
    if (tab === "macros") return [];
    return all.filter(i => INVENTORY_TYPES.has(i.type));
}

/** Converte itens do ator em slots genéricos para o grid. */
export function slotsForTab(actor: FoundryActor, tab: RightTabKey): GenericSlot[] {
    return itemsForTab(actor, tab).map(i => ({
        key: i.id,
        label: i.name,
        iconUrl: (i as unknown as { img?: string }).img || FALLBACK_ICON,
    }));
}

export const RIGHT_TABS: Array<{ key: RightTabKey; label: string }> = [
    { key: "inventario", label: "Inventário" },
    { key: "poderes", label: "Poderes" },
    { key: "magias", label: "Magias" },
    { key: "macros", label: "Macros" },
];
