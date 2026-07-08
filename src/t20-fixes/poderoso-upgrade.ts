/**
 * Aprimoramento "Poderoso" (esotérico) — "A CD para resistir a suas magias
 * aumenta em +1."
 *
 * Nativamente o T20 só declara `T20.upgrades.esoteric.status.powerful =
 * "MANUAL"` (tormenta20.mjs ~L1007) — NÃO existe template, então selecionar a
 * melhoria não cria Active Effect nenhum e a CD não muda.
 *
 * Damos efeito mecânico ao upgrade:
 *  - Template `esoteric.powerful` com change `system.attributes.cd += 1`
 *    (mode ADD, transfer:true). O patch existente do módulo
 *    (`t20-fixes/spell-cd-formula.ts`) faz a CD das magias ler
 *    `actor.attributes.cd` — o +1 flui para a CD de TODAS as magias do
 *    portador, e o fluxo nativo suprime a AE quando o esotérico não está
 *    equipado (`isSuppressedUnnequipped`, origin = uuid do item).
 *  - Status "DONE" → aparece como Automatizado na ficha.
 *  - Migração no `ready` (GM, idempotente): esotéricos que JÁ têm "powerful"
 *    selecionado numa melhoria (mas sem AE, porque o template não existia)
 *    ganham a AE. ⚠️ Criamos SÓ a cópia no ATOR (origin = uuid do item) — o
 *    fluxo nativo cria também uma cópia no ITEM, mas o T20 RE-COPIA efeitos do
 *    item pro ator quando `system.equipado` muda (verificado ao vivo: toggle
 *    equipado duplicou a AE → CD +2), e `isSuppressedDuplicated` só protege
 *    efeitos de STATUS. Sem cópia no item não há o que re-copiar. A migração
 *    também DEDUPLICA AEs powerful com a mesma origem (mantém a mais antiga).
 *    Gated por `system.enableAutoUpgrades` (mesmo gate do fluxo nativo).
 */

import { log, warn } from "@/utils/logging";

export const PODEROSO_KEY = "powerful";

export interface PoderosoTemplate {
    name: string;
    description: string;
    tint?: string;
    changes: Array<{ key: string; value: string; mode: number; priority: number }>;
    flags: { tormenta20: Record<string, unknown> };
    disabled: boolean;
    transfer: boolean;
}

/** Template do Poderoso: +1 na CD (via actor.attributes.cd), persistente. */
export function buildPoderosoTemplate(): PoderosoTemplate {
    return {
        name: "Poderoso",
        description: "Poderoso: a CD para resistir às suas magias aumenta em +1.",
        tint: "#9a6bd8",
        changes: [
            { key: "system.attributes.cd", value: "1", mode: 2, priority: 0 },
        ],
        flags: { tormenta20: { onuse: false, durationScene: false, upgrade: PODEROSO_KEY, self: false } },
        disabled: false,
        transfer: true,
    };
}

// ── Setup: injeta o template no CONFIG ────────────────────────────────────────

export function setupPoderosoUpgrade(): void {
    const esoteric = (CONFIG as unknown as {
        T20?: { upgrades?: { esoteric?: Record<string, unknown> & { status?: Record<string, string> } } };
    }).T20?.upgrades?.esoteric;
    if (!esoteric) {
        warn("poderoso: CONFIG.T20.upgrades.esoteric não encontrado — upgrade não registrado.");
    } else {
        esoteric[PODEROSO_KEY] = buildPoderosoTemplate();
        esoteric.status ??= {};
        esoteric.status[PODEROSO_KEY] = "DONE";
        log("Poderoso (esotérico) registrado: +1 CD via AE em attributes.cd.");
    }

    Hooks.once("ready", () => { void migratePoderoso(); });
}

// ── Migração: esotéricos com o upgrade já selecionado, sem a AE ───────────────

interface ItemLike {
    id?: string;
    uuid?: string;
    name?: string;
    type?: string;
    img?: string;
    system?: {
        tipo?: string;
        enableAutoUpgrades?: boolean;
        upgrades?: Record<string, string>;
    };
    effects?: { contents: Array<{ flags?: Record<string, Record<string, unknown>>; origin?: string }> };
    createEmbeddedDocuments?(type: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
}

interface ActorLike {
    name?: string;
    uuid?: string;
    id?: string;
    items?: { contents: ItemLike[] };
    effects?: { contents: Array<{ flags?: Record<string, Record<string, unknown>>; origin?: string }> };
    createEmbeddedDocuments?(type: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
}

/** O item tem "powerful" selecionado em alguma melhoria? */
export function hasPoderosoSelected(upgrades: Record<string, string> | undefined): boolean {
    if (!upgrades) return false;
    return ["melhoria1", "melhoria2", "melhoria3", "melhoria4"].some((k) => upgrades[k] === PODEROSO_KEY);
}

function hasPoderosoEffect(doc: { effects?: { contents: Array<{ flags?: Record<string, Record<string, unknown>>; origin?: string }> } }, originUuid: string): boolean {
    return (doc.effects?.contents ?? []).some((e) =>
        (e.flags?.["tormenta20"] as { upgrade?: string } | undefined)?.upgrade === PODEROSO_KEY
        && e.origin === originUuid,
    );
}

function relevantActors(): ActorLike[] {
    const out = new Map<string, ActorLike>();
    for (const a of (game.actors?.contents ?? [])) out.set((a as { uuid?: string }).uuid ?? a.id ?? "", a as unknown as ActorLike);
    for (const t of (canvas?.tokens?.placeables ?? [])) {
        const a = t.actor as unknown as ActorLike | null;
        if (a) out.set(a.uuid ?? Math.random().toString(), a);
    }
    return Array.from(out.values());
}

async function migratePoderoso(): Promise<void> {
    if (!game.user?.isGM) return;
    let created = 0;
    let deduped = 0;
    for (const actor of relevantActors()) {
        // Dedup: várias AEs powerful com a MESMA origem → mantém a primeira.
        const byOrigin = new Map<string, string[]>();
        for (const e of (actor.effects?.contents ?? []) as Array<{ id?: string; origin?: string; flags?: Record<string, Record<string, unknown>> }>) {
            if ((e.flags?.["tormenta20"] as { upgrade?: string } | undefined)?.upgrade !== PODEROSO_KEY) continue;
            const key = e.origin ?? "";
            const list = byOrigin.get(key) ?? [];
            if (e.id) list.push(e.id);
            byOrigin.set(key, list);
        }
        const toDelete = Array.from(byOrigin.values()).flatMap((ids) => ids.slice(1));
        if (toDelete.length) {
            try {
                await (actor as unknown as { deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown> })
                    .deleteEmbeddedDocuments("ActiveEffect", toDelete);
                deduped += toDelete.length;
            } catch (err) { warn(`poderoso: dedup falhou em ${actor.name}:`, err); }
        }

        for (const item of actor.items?.contents ?? []) {
            if (item.type !== "equipamento" || item.system?.tipo !== "esoterico") continue;
            if (!item.system?.enableAutoUpgrades) continue;
            if (!hasPoderosoSelected(item.system?.upgrades)) continue;
            const originUuid = item.uuid ?? "";
            if (!originUuid || hasPoderosoEffect(actor, originUuid)) continue;
            // SÓ a cópia no ATOR — cópia no item é vetor de duplicação (T20
            // re-copia efeitos do item no toggle de equipado).
            const tpl = buildPoderosoTemplate();
            const effect = { ...tpl, icon: item.img, img: item.img, origin: originUuid };
            try {
                await actor.createEmbeddedDocuments?.("ActiveEffect", [effect], { render: false });
                created++;
            } catch (err) {
                warn(`poderoso: migração falhou em ${actor.name}/${item.name}:`, err);
            }
        }
    }
    if (created > 0 || deduped > 0) log(`Poderoso: migração criou ${created} AE(s), deduplicou ${deduped}.`);

    // O label de CD das magias (`resistencia.cd`) é computado 1 preparação
    // ANTES da AE aplicar no load inicial (fica 1 abaixo até re-preparar).
    // Um reset() nos atores com a AE atualiza os labels já no ready.
    for (const actor of relevantActors()) {
        const has = (actor.effects?.contents ?? []).some((e) =>
            (e.flags?.["tormenta20"] as { upgrade?: string } | undefined)?.upgrade === PODEROSO_KEY);
        if (has) { try { (actor as unknown as { reset?: () => void }).reset?.(); } catch { /* ignore */ } }
    }
}
