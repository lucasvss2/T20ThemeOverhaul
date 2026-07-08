/**
 * Fix — defesa de Ameaças (NPC) sem o bônus da armadura equipada.
 *
 * Com o setting `equipmentSlots` LIGADO, o `prepareDefense` do T20 só considera
 * equipado o item com `equipado2.slot` truthy (tormenta20.mjs ~L16851-16854).
 * NPCs (importados pelo StatblockParser, compêndios, Bestiário) marcam a
 * armadura com `system.equipado: true` mas `equipado2.slot: 0` → a armadura e o
 * escudo NÃO somam na Defesa (Sargento-mor mostrava 13 em vez de 24; Recruta
 * Purista 11 em vez de 16).
 *
 * Fix: em `Item.prepareDerivedData` (wrapper instalado no `init`, encadeado com
 * o do Ajustada), para item `equipamento` de ATOR NPC com `equipado` truthy e
 * `equipado2.slot` zerado, o slot DERIVADO recebe um valor sintético truthy
 * (1.2 body / 1.1 demais). Nada é persistido; o toggle de equipar do NPC segue
 * controlando por `system.equipado` (desequipou → patch não roda → slot 0).
 * Também conserta, de quebra, a supressão de AEs de upgrades em itens de NPC
 * (`areEffectsSuppressed` usa o mesmo critério de slot).
 *
 * PCs não são tocados (usam o sistema de slots de verdade).
 */

import { log, warn } from "@/utils/logging";
import { SYSTEM_ID } from "@/constants";

interface ItemForSlots {
    type?: string;
    parent?: { type?: string } | null;
    system?: {
        equipado?: unknown;
        equipado2?: { slot?: number; type?: string };
    };
}

/** Slot sintético para NPCs: truthy; preserva o dígito do tipo (body = .2). */
export function syntheticSlotFor(slotType: string | undefined): number {
    return slotType === "body" ? 1.2 : 1.1;
}

/** O item precisa da normalização? (NPC + equipado boolean + slot zerado) */
export function needsNpcSlotFix(item: ItemForSlots, equipmentSlots: boolean): boolean {
    if (!equipmentSlots) return false;
    if (item.type !== "equipamento") return false;
    if (item.parent?.type !== "npc") return false;
    const sys = item.system;
    if (!sys?.equipado) return false;
    return !(sys.equipado2?.slot ?? 0);
}

type ItemProtoLike = {
    prepareDerivedData?: (this: ItemForSlots) => void;
    _t20NpcEquipadoPatched?: boolean;
};

function patchItemNpcSlots(): void {
    const proto = (CONFIG as unknown as { Item?: { documentClass?: { prototype: object } } })
        .Item?.documentClass?.prototype as ItemProtoLike | undefined;
    if (!proto || typeof proto.prepareDerivedData !== "function") {
        warn("npc-equipado: ItemT20.prototype.prepareDerivedData não encontrado — patch não aplicado.");
        return;
    }
    if (proto._t20NpcEquipadoPatched) return;
    const orig = proto.prepareDerivedData;
    proto.prepareDerivedData = function (this: ItemForSlots): void {
        orig.call(this);
        try {
            let slots = false;
            try { slots = !!game.settings.get("tormenta20", "equipmentSlots"); } catch { return; }
            if (!needsNpcSlotFix(this, slots)) return;
            const e2 = this.system!.equipado2 ?? (this.system!.equipado2 = { slot: 0 });
            e2.slot = syntheticSlotFor(e2.type);
        } catch { /* nunca quebrar a preparação do item */ }
    };
    proto._t20NpcEquipadoPatched = true;
    log("ItemT20.prepareDerivedData patched — NPC: equipado:true conta como equipado (slot sintético).");
}

/**
 * Chamar no TOP-LEVEL do main.ts — o patch precisa entrar no `init`, antes da
 * primeira preparação dos documentos do mundo (mesmo racional do Ajustada).
 */
export function setupNpcEquipadoFix(): void {
    Hooks.once("init", () => {
        if ((game as unknown as { system?: { id?: string } }).system?.id !== SYSTEM_ID) return;
        patchItemNpcSlots();
    });
}
