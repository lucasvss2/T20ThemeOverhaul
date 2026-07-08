/**
 * Fix do aprimoramento "Ajustada" (armadura/escudo) — BUG DE SINAL do T20.
 *
 * Regra: "o item tem a sua penalidade de armadura diminuída em 1" (ex.: −1 → 0,
 * −2 → −1; nunca acima de 0).
 *
 * O template nativo (`T20.upgrades.armor.general.adjusted`, tormenta20.mjs
 * ~L844) aplica `system.attributes.defesa.pda += "-1"` — deixa a penalidade
 * MAIS negativa (Escudo Leve −1 virava −2 na prática).
 *
 * ⚠️ POR QUE NÃO DÁ para corrigir só o valor da change: `defesa.pda` (ator) e
 * `armadura.penalidade` (item) são `PenaltyField` — TODA atribuição é coercida
 * para `-Math.abs(valor)` (mjs ~L12118). Uma AE `ADD +1` produz 0+1=1 → cast
 * −1 → a "correção" vira −1 de novo (verificado ao vivo no Aller: pda −1 → −2
 * com a AE "+1"). Nenhum par de changes consegue SUBIR o pda.
 *
 * Fix em três partes:
 *  1. `setupAjustadaFix()` — o template do CONFIG vira um MARCADOR (changes
 *     vazias): mantém o fluxo nativo de criar/deletar a AE ao selecionar o
 *     upgrade (a AE serve de indicador visual), sem efeito mecânico próprio.
 *  2. Patch em `Item.prepareDerivedData` — para equipamentos com armadura e
 *     "adjusted" selecionado numa melhoria (e Automação ligada), a
 *     `system.armadura.penalidade` DERIVADA vira `min(0, penalidade + 1)`.
 *     Roda antes do `prepareDefense` do ator (que lê o valor do item), então a
 *     redução flui pro `defesa.pda` agregado. Mutação em derived data — nada é
 *     persistido, e o clamp `min(0, …)` garante "nunca acima de 0" POR ITEM.
 *  3. Migração no `ready` (GM, idempotente) — AEs "adjusted" antigas (no ator
 *     E no item — o `_createEffect` nativo cria nos dois) têm as changes de
 *     pda REMOVIDAS (viram marcador).
 */

import { log, warn } from "@/utils/logging";
import { SYSTEM_ID } from "@/constants";

const PDA_KEY = "system.attributes.defesa.pda";
export const AJUSTADA_KEY = "adjusted";

/** O item tem "adjusted" selecionado em alguma melhoria? */
export function hasAjustadaSelected(upgrades: Record<string, string> | undefined): boolean {
    if (!upgrades) return false;
    return ["melhoria1", "melhoria2", "melhoria3", "melhoria4"].some((k) => upgrades[k] === AJUSTADA_KEY);
}

/**
 * Penalidade de armadura com o Ajustada aplicado: reduz 1, nunca acima de 0.
 * (−1 → 0, −2 → −1, 0 → 0). Puro/testável.
 */
export function ajustadaPenalty(penalidade: number): number {
    return Math.min(0, (Number(penalidade) || 0) + 1);
}

/** True se a AE ainda carrega changes de pda (formato antigo — deve virar marcador). */
export function needsAjustadaFix(changes: Array<{ key?: string }> | undefined): boolean {
    if (!Array.isArray(changes)) return false;
    return changes.some((c) => c.key === PDA_KEY);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

interface UpgradeTemplateLike { changes?: unknown[]; [k: string]: unknown }

/**
 * ⚠️ Chamar no TOP-LEVEL do main.ts (fora do hook setup) — o patch de
 * `prepareDerivedData` precisa ser instalado no `init`, ANTES da primeira
 * preparação dos documentos do mundo (no setup/ready seria tarde: a penalidade
 * só corrigiria após alguma re-preparação). Mesmo racional do proficiencia.ts.
 */
export function setupAjustadaFix(): void {
    Hooks.once("init", () => {
        if ((game as unknown as { system?: { id?: string } }).system?.id !== SYSTEM_ID) return;
        patchItemPreparedPenalty();
    });

    Hooks.once("setup", () => {
        if (game.system.id !== SYSTEM_ID) return;
        const general = (CONFIG as unknown as {
            T20?: { upgrades?: { armor?: { general?: Record<string, UpgradeTemplateLike> } } };
        }).T20?.upgrades?.armor?.general;
        const adjusted = general?.[AJUSTADA_KEY];
        if (!adjusted) {
            warn("ajustada: template armor.general.adjusted não encontrado — fix não aplicado.");
        } else {
            adjusted.changes = []; // marcador — o efeito real é o patch de prepareDerivedData
            log("Ajustada: template neutralizado (marcador); redução aplicada no item.");
        }
    });

    Hooks.once("ready", () => {
        if (game.system.id !== SYSTEM_ID) return;
        void migrateAjustadaEffects();
    });
}

// ── Patch: penalidade derivada do item ────────────────────────────────────────

interface ItemForPenalty {
    type?: string;
    system?: {
        armadura?: { penalidade?: number };
        upgrades?: Record<string, string>;
        enableAutoUpgrades?: boolean;
    };
}

type ItemProtoLike = {
    prepareDerivedData?: (this: ItemForPenalty) => void;
    _t20AjustadaPatched?: boolean;
};

function patchItemPreparedPenalty(): void {
    const proto = (CONFIG as unknown as { Item?: { documentClass?: { prototype: object } } })
        .Item?.documentClass?.prototype as ItemProtoLike | undefined;
    if (!proto || typeof proto.prepareDerivedData !== "function") {
        warn("ajustada: ItemT20.prototype.prepareDerivedData não encontrado — patch não aplicado.");
        return;
    }
    if (proto._t20AjustadaPatched) return;
    const orig = proto.prepareDerivedData;
    proto.prepareDerivedData = function (this: ItemForPenalty): void {
        orig.call(this);
        try {
            if (this.type !== "equipamento") return;
            const sys = this.system;
            if (!sys?.armadura || !sys.enableAutoUpgrades) return;
            if (!hasAjustadaSelected(sys.upgrades)) return;
            sys.armadura.penalidade = ajustadaPenalty(Number(sys.armadura.penalidade ?? 0));
        } catch { /* nunca quebrar a preparação do item */ }
    };
    proto._t20AjustadaPatched = true;
    log("ItemT20.prepareDerivedData patched — Ajustada reduz a penalidade do item (mín 0).");
}

// ── Migração: AEs antigas viram marcador ──────────────────────────────────────

interface EffectLike {
    id?: string;
    changes?: Array<{ key?: string }>;
    flags?: Record<string, Record<string, unknown>>;
}

interface DocWithEffects {
    name?: string;
    effects?: { contents: EffectLike[] };
    updateEmbeddedDocuments?(type: string, updates: Array<Record<string, unknown>>): Promise<unknown>;
    items?: { contents: DocWithEffects[] };
}

async function fixEffectsOn(doc: DocWithEffects): Promise<number> {
    const updates: Array<Record<string, unknown>> = [];
    for (const e of doc.effects?.contents ?? []) {
        const upg = (e.flags?.["tormenta20"] as { upgrade?: string } | undefined)?.upgrade;
        if (upg !== AJUSTADA_KEY) continue;
        if (!needsAjustadaFix(e.changes)) continue;
        if (e.id) updates.push({ _id: e.id, changes: [] });
    }
    if (!updates.length) return 0;
    try {
        await doc.updateEmbeddedDocuments?.("ActiveEffect", updates);
        return updates.length;
    } catch (err) {
        warn(`ajustada: migração falhou em ${doc.name}:`, err);
        return 0;
    }
}

/** Atores relevantes: world + sintéticos de tokens unlinked do canvas. */
function relevantActors(): DocWithEffects[] {
    const out = new Map<string, DocWithEffects>();
    for (const a of (game.actors?.contents ?? [])) out.set((a as { uuid?: string }).uuid ?? a.id ?? "", a as unknown as DocWithEffects);
    for (const t of (canvas?.tokens?.placeables ?? [])) {
        const a = t.actor as unknown as (DocWithEffects & { uuid?: string }) | null;
        if (a) out.set(a.uuid ?? Math.random().toString(), a);
    }
    return Array.from(out.values());
}

async function migrateAjustadaEffects(): Promise<void> {
    if (!game.user?.isGM) return;
    let fixed = 0;
    for (const actor of relevantActors()) {
        fixed += await fixEffectsOn(actor);
        for (const item of actor.items?.contents ?? []) fixed += await fixEffectsOn(item);
    }
    const worldItems = (game as unknown as { items?: { contents: DocWithEffects[] } }).items?.contents ?? [];
    for (const item of worldItems) fixed += await fixEffectsOn(item);
    if (fixed > 0) log(`Ajustada: migração neutralizou ${fixed} effect(s) com changes de pda.`);
}
