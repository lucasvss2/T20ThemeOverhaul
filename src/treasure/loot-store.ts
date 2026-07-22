/**
 * Memória de loot por combate: acumula o tesouro saqueado de cada inimigo numa
 * flag do Combat (`flags.<MODULE_ID>.lootLog`) e agrega tudo no fim do encontro.
 */

import type { LootItem } from "./loot";
import { MODULE_ID } from "@/constants";

export const LOOT_LOG_FLAG = "lootLog";

/** Uma entrada de loot (um inimigo saqueado). */
export interface LootEntry {
    tokenId: string;
    name: string;
    nd: string;
    totalTibar: number;
    items: LootItem[];
}

interface CombatLike {
    getFlag?: (m: string, k: string) => unknown;
    setFlag?: (m: string, k: string, v: unknown) => Promise<unknown>;
    unsetFlag?: (m: string, k: string) => Promise<unknown>;
    combatants?: { contents?: CombatantLike[] } | CombatantLike[];
    started?: boolean;
}
interface CombatantLike {
    actor?: { id?: string; type?: string; name?: string; hasPlayerOwner?: boolean } | null;
    tokenId?: string;
    token?: { id?: string } | null;
}

export function getLootLog(combat: CombatLike | null | undefined): LootEntry[] {
    const raw = combat?.getFlag?.(MODULE_ID, LOOT_LOG_FLAG);
    return Array.isArray(raw) ? (raw as LootEntry[]) : [];
}

/** Acrescenta uma entrada ao log do combate (GM). Idempotente por tokenId. */
export async function recordLoot(combat: CombatLike, entry: LootEntry): Promise<void> {
    const log = getLootLog(combat);
    if (log.some(e => e.tokenId === entry.tokenId)) return; // já saqueado
    log.push(entry);
    await combat.setFlag?.(MODULE_ID, LOOT_LOG_FLAG, log);
}

export async function clearLootLog(combat: CombatLike): Promise<void> {
    await combat.unsetFlag?.(MODULE_ID, LOOT_LOG_FLAG);
}

/** Jogador presente na luta = combatente cujo ator é de personagem com dono jogador. */
export interface PresentPlayer { actorId: string; tokenId?: string; name: string }

export function getPresentPlayers(combat: CombatLike | null | undefined): PresentPlayer[] {
    const list = Array.isArray(combat?.combatants)
        ? combat?.combatants
        : (combat?.combatants as { contents?: CombatantLike[] } | undefined)?.contents ?? [];
    const seen = new Set<string>();
    const out: PresentPlayer[] = [];
    for (const c of list ?? []) {
        const a = c.actor;
        if (!a?.id || a.type !== "character" || !a.hasPlayerOwner) continue;
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push({ actorId: a.id, tokenId: c.tokenId ?? c.token?.id, name: a.name ?? "Jogador" });
    }
    return out;
}
