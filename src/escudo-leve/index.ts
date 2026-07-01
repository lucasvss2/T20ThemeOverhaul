/**
 * Escudo Leve — mão livre (v1.73.0)
 *
 * Regra do item (Tormenta20, p. ~): "Escudo Leve … é amarrado no antebraço,
 * deixando a mão livre. Você pode carregar um objeto na mão que empunha o escudo
 * e usar ataques desarmados normalmente, mas não manusear uma arma."
 *
 * No sistema de SLOTS do T20 (`equipmentSlots`), cada mão é um slot exclusivo:
 * um escudo leve ocupava um slot de empunhadura (ex.: `equipado2.slot = 2.1`),
 * o que IMPEDIA (a) carregar outro item na mesma mão e (b) manter o ataque
 * desarmado empunhado como DUAS MÃOS (slot 12.1 zera 1.1 e 2.1 → removia o
 * escudo).
 *
 * Solução: o escudo leve passa a ocupar um slot de **ANTEBRAÇO** — um índice
 * ALÉM dos slots de empunhadura (`limiteEmpunhado + 1`, ex.: 3.1). Assim:
 *   - Continua contando como equipado (Defesa/RD do escudo dependem só de
 *     `equipado2.slot > 0` — verificado ao vivo: Defesa idêntica em 2.1 e 3.1).
 *   - NÃO ocupa nenhuma das mãos → ambas ficam livres p/ objeto/arma/desarmado.
 *   - A lógica de exclusividade nativa só limpa 1.1/2.1/12.1 → nunca toca no 3.1,
 *     então duas-mãos desarmado + escudo leve coexistem naturalmente.
 *
 * Implementação (patches em `ActorSheetT20`):
 *   - `_onToggleItem`: para escudos leves, alterna o slot de antebraço (liga/
 *     desliga) em vez de um slot de mão — e NÃO evita/limpa o ocupante da mão.
 *   - `_getItemToggleContextOptions`: troca as opções por-mão do escudo leve por
 *     um único "Equipar/Desequipar (antebraço)".
 *   - Migração no `ready`: move escudos leves já equipados numa mão p/ o antebraço.
 *
 * Só se aplica quando o setting `equipmentSlots` do T20 está LIGADO (o modelo
 * booleano antigo não usa `_onToggleItem`).
 */

import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

// ── Detecção (pura, testável) ─────────────────────────────────────────────────

interface ShieldItemLike {
    type?: string;
    name?: string;
    system?: {
        tipo?: string;
        subtipo?: string;
        equipado2?: { slot?: number; type?: string };
    };
}

/** True para um "Escudo Leve" (tipo escudo + nome contém "escudo leve"). */
export function isLightShield(item: ShieldItemLike | null | undefined): boolean {
    if (!item || item.type !== "equipamento") return false;
    const norm = normalizeCondName(item.name ?? "");
    const isShield = item.system?.tipo === "escudo"
        || item.system?.subtipo === "escudo"
        || norm.includes("escudo");
    return isShield && norm.includes("escudo leve");
}

/** Slot de antebraço = 1 além do último slot de empunhadura (ex.: limite 2 → 3.1). */
export function forearmSlotFor(limiteEmpunhado: number | null | undefined): number {
    const limit = Number(limiteEmpunhado ?? 2) || 2;
    return (limit + 1) + 0.1; // tipo "hand" (fração .1), índice além das mãos
}

/** True se `slot` é um slot de EMPUNHADURA (mão) real (índice 1..limite, ou duas-mãos 12). */
export function isGripSlot(slot: number | null | undefined, limiteEmpunhado: number | null | undefined): boolean {
    const s = Number(slot ?? 0);
    if (s <= 0) return false;
    const isHandType = Math.round((s % 1) * 10) === 1; // fração .1 = tipo mão
    if (!isHandType) return false;
    const idx = Math.floor(s);
    const limit = Number(limiteEmpunhado ?? 2) || 2;
    return (idx >= 1 && idx <= limit) || idx === 12;
}

// ── Runtime shapes (loosely-typed Foundry docs) ───────────────────────────────

interface SheetLike {
    actor?: {
        system?: { equipamentos?: { limiteEmpunhado?: number } };
        updateEmbeddedDocuments?: (type: string, updates: object[], ctx?: object) => Promise<unknown>;
    };
}
type ToggleFn = (item: ShieldItemLike & { id?: string }, context: string, index: number, currentId?: string) => Promise<unknown>;
type MenuFn = (item: ShieldItemLike) => Array<{ name?: string; group?: string; [k: string]: unknown }>;

function slotsEnabled(): boolean {
    try { return game.settings?.get("tormenta20", "equipmentSlots") === true; }
    catch { return false; }
}

// ── Patch: ActorSheetT20 ──────────────────────────────────────────────────────

interface SheetProto {
    _onToggleItem?: ToggleFn;
    _getItemToggleContextOptions?: MenuFn;
    _t20LightShieldPatched?: boolean;
}

/** Sobe a cadeia de protótipos das sheet classes registradas até achar ActorSheetT20. */
function findActorSheetT20(): { prototype: SheetProto } | null {
    const sc = (CONFIG as unknown as { Actor?: { sheetClasses?: Record<string, Record<string, { cls?: unknown }>> } })
        ?.Actor?.sheetClasses ?? {};
    for (const type of Object.keys(sc)) {
        for (const id of Object.keys(sc[type] ?? {})) {
            let cls = sc[type]![id]?.cls as { name?: string; prototype?: SheetProto } | undefined;
            while (cls && cls.name) {
                if (cls.name === "ActorSheetT20") return cls as { prototype: SheetProto };
                cls = Object.getPrototypeOf(cls) as { name?: string; prototype?: SheetProto } | undefined;
            }
        }
    }
    return null;
}

function patchSheet(): boolean {
    const cls = findActorSheetT20();
    if (!cls) return false;
    const proto = cls.prototype;
    if (proto._t20LightShieldPatched) return true;
    if (typeof proto._onToggleItem !== "function") {
        warn("escudo-leve: ActorSheetT20._onToggleItem ausente — patch não aplicado.");
        return true; // não retentar
    }

    const origToggle = proto._onToggleItem;
    proto._onToggleItem = async function (this: SheetLike, item, context, index, currentId) {
        // Escudo leve → alterna o slot de ANTEBRAÇO, sem tocar no ocupante da mão.
        if (context === "hand" && isLightShield(item)) {
            const forearm = forearmSlotFor(this.actor?.system?.equipamentos?.limiteEmpunhado);
            const equipped = Number(item.system?.equipado2?.slot ?? 0) > 0;
            return this.actor?.updateEmbeddedDocuments?.("Item", [{
                _id: item.id,
                "system.equipado2.slot": equipped ? 0 : forearm,
                "system.equipado": !equipped,
            }]);
        }
        return origToggle.call(this, item, context, index, currentId);
    };

    // Menu polish: 1 opção única de antebraço p/ escudos leves.
    if (typeof proto._getItemToggleContextOptions === "function") {
        const origMenu = proto._getItemToggleContextOptions;
        proto._getItemToggleContextOptions = function (this: SheetLike, item) {
            const options = origMenu.call(this, item);
            if (!isLightShield(item)) return options;
            const favLabels = new Set([
                game.i18n?.localize?.("T20.Favorite"),
                game.i18n?.localize?.("T20.Unfavorite"),
            ]);
            // Remove as opções por-mão (group "equips") preservando Favoritar.
            const kept = options.filter(o => o.group !== "equips" || favLabels.has(o.name as string));
            const forearm = forearmSlotFor(this.actor?.system?.equipamentos?.limiteEmpunhado);
            const equipped = Number((item.system?.equipado2?.slot) ?? 0) > 0;
            kept.push({
                name: equipped ? "Desequipar (antebraço)" : "Equipar (antebraço)",
                group: "equips",
                icon: '<i class="fa-solid fa-shield-halved"></i>',
                callback: () => (this as unknown as { _onToggleItem: ToggleFn })
                    ._onToggleItem(item as ShieldItemLike & { id?: string }, "hand", Math.floor(forearm), undefined),
            });
            return kept;
        };
    }

    proto._t20LightShieldPatched = true;
    log("escudo-leve: ActorSheetT20 patcheado (escudo leve ocupa o antebraço).");
    return true;
}

// ── Migração: escudos leves já equipados numa mão → antebraço ──────────────────

interface MigItem extends ShieldItemLike { id?: string }
interface MigActor {
    type?: string;
    isOwner?: boolean;
    system?: { equipamentos?: { limiteEmpunhado?: number } };
    items?: { contents?: MigItem[] } | MigItem[];
    updateEmbeddedDocuments?: (type: string, updates: object[], ctx?: object) => Promise<unknown>;
}

async function migrateActor(actor: MigActor): Promise<number> {
    const items: MigItem[] = Array.isArray(actor.items) ? actor.items : (actor.items?.contents ?? []);
    const limit = actor.system?.equipamentos?.limiteEmpunhado;
    const forearm = forearmSlotFor(limit);
    const updates: object[] = [];
    for (const it of items) {
        if (!isLightShield(it)) continue;
        const slot = Number(it.system?.equipado2?.slot ?? 0);
        if (slot > 0 && isGripSlot(slot, limit)) {
            updates.push({ _id: it.id, "system.equipado2.slot": forearm, "system.equipado": true });
        }
    }
    if (updates.length) {
        try { await actor.updateEmbeddedDocuments?.("Item", updates, { render: false }); }
        catch (e) { warn("escudo-leve: falha ao migrar escudo leve", e); return 0; }
    }
    return updates.length;
}

async function migrateOwnedLightShields(): Promise<void> {
    if (!slotsEnabled()) return;
    const actors = (game.actors?.contents ?? []) as unknown as MigActor[];
    let n = 0;
    for (const a of actors) {
        if (a.type !== "character" || !a.isOwner) continue;
        n += await migrateActor(a);
    }
    if (n > 0) log(`escudo-leve: ${n} escudo(s) leve(s) movido(s) da mão para o antebraço.`);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupEscudoLeve(): void {
    // Patch no setup; se as sheet classes ainda não estiverem registradas, tenta no ready.
    if (!patchSheet()) {
        Hooks.once("ready", () => { patchSheet(); });
    }
    Hooks.once("ready", () => { void migrateOwnedLightShields(); });
    log("escudo-leve: mão livre do Escudo Leve ativa.");
}
