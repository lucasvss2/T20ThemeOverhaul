/**
 * Aprimoramento "Energético" (esotérico) — "+1d6 de dano na magia".
 *
 * BUG nativo: o template `CONFIG.T20.upgrades.esoteric.energetic`
 * (tormenta20.mjs ~L1011) NÃO define `flags.tormenta20.custo`. Quando o
 * aprimoramento entra numa magia, o `applyOnUseEffects` faz:
 *
 *   if (!Number(applied[ef.id]?.custo + 1) && item.type == "magia")
 *       options.truque = true;   // (mjs ~L5885)
 *
 * Com `custo` = undefined → `undefined + 1 = NaN` → `Number(NaN) = NaN` →
 * `!NaN = true` → a magia é tratada como **TRUQUE** (custo/alcance/alvo de
 * truque), o que não é a intenção do Energético e gera o erro relatado.
 *
 * Fix: dar `custo: "0"` ao aprimoramento. Aí `Number("0" + 1) = 1` → `!1 =
 * false` → NÃO vira truque; e o custo somado é `Number("0") = 0` → o
 * aprimoramento continua de graça (só o +1d6 de dano). Corrige o template no
 * CONFIG (setup) e migra os Active Effects "energetic" já criados nos itens/
 * atores (ready, GM).
 */

import { log, warn } from "@/utils/logging";

export const ENERGETICO_KEY = "energetic";

/** Já tem custo definido (não-vazio)? Usado para migração idempotente. */
export function needsCustoFix(flags: { tormenta20?: { custo?: unknown; upgrade?: unknown } } | undefined): boolean {
    const t20 = flags?.tormenta20;
    if (!t20 || t20.upgrade !== ENERGETICO_KEY) return false;
    const c = t20.custo;
    return c === undefined || c === null || c === "";
}

// ── Setup: corrige o template no CONFIG ───────────────────────────────────────

export function setupEnergeticoUpgrade(): void {
    const esoteric = (CONFIG as unknown as {
        T20?: { upgrades?: { esoteric?: Record<string, { flags?: { tormenta20?: Record<string, unknown> } }> } };
    }).T20?.upgrades?.esoteric;
    const tpl = esoteric?.[ENERGETICO_KEY];
    if (!tpl?.flags?.tormenta20) {
        warn("energetico: CONFIG.T20.upgrades.esoteric.energetic não encontrado — fix não aplicado.");
    } else if (tpl.flags.tormenta20["custo"] === undefined || tpl.flags.tormenta20["custo"] === "") {
        tpl.flags.tormenta20["custo"] = "0";
        log("Energético (esotérico): custo definido como 0 (evita virar truque por custo indefinido).");
    }

    Hooks.once("ready", () => { void migrateEnergetico(); });
}

// ── Migração: efeitos "energetic" já criados sem custo ────────────────────────

interface EffectLike {
    id?: string;
    name?: string;
    flags?: { tormenta20?: { custo?: unknown; upgrade?: unknown } };
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}
interface DocLike {
    name?: string;
    effects?: { contents: EffectLike[] };
}
interface ActorLike extends DocLike {
    id?: string;
    uuid?: string;
    isGM?: boolean;
    items?: { contents: DocLike[] };
}

function relevantActors(): ActorLike[] {
    const out = new Map<string, ActorLike>();
    for (const a of (game.actors?.contents ?? [])) out.set((a as { uuid?: string }).uuid ?? (a as { id?: string }).id ?? "", a as unknown as ActorLike);
    for (const t of (canvas?.tokens?.placeables ?? [])) {
        const a = t.actor as unknown as ActorLike | null;
        if (a) out.set(a.uuid ?? Math.random().toString(), a);
    }
    return Array.from(out.values());
}

async function fixEffectsIn(doc: DocLike): Promise<number> {
    let n = 0;
    for (const ef of doc.effects?.contents ?? []) {
        if (!needsCustoFix(ef.flags)) continue;
        try {
            await ef.update?.({ "flags.tormenta20.custo": "0" });
            n++;
        } catch (err) { warn(`energetico: falha ao migrar efeito em ${doc.name}:`, err); }
    }
    return n;
}

async function migrateEnergetico(): Promise<void> {
    if (!game.user?.isGM) return;
    let fixed = 0;
    for (const actor of relevantActors()) {
        fixed += await fixEffectsIn(actor);
        for (const item of actor.items?.contents ?? []) fixed += await fixEffectsIn(item);
    }
    if (fixed > 0) log(`Energético: migração corrigiu ${fixed} efeito(s) (custo → 0).`);
}
