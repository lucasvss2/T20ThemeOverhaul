/**
 * Bolsa de Pó — "−2 PM no custo dos APRIMORAMENTOS de magias de Encantamento e
 * Ilusão" (não afeta o custo BASE da magia; o custo total nunca fica < 1).
 *
 * Ex.: Adaga Mental (enc, 1 PM) + aprimoramento de +2 PM = 3 PM; com a bolsa
 * equipada o aprimoramento sai de graça → 1 PM. Sem aprimoramento → 1 PM
 * (a bolsa não desconta o custo base).
 *
 * ── Como o T20 cobra (tormenta20.mjs) ────────────────────────────────────────
 * O `applyOnUseEffects` SOMA o custo dos aprimoramentos selecionados no
 * `ativacao.custo` do CLONE do item (~L5884: `id.ativacao.custo += cost`), e o
 * débito real usa esse total (~L6983: `consumeMana = max(item.system.ativacao
 * .custo, 1)` — piso 1 nativo). O card de chat também lê o custo do clone.
 *
 * ── Implementação ────────────────────────────────────────────────────────────
 * 1. Wrapper em `AbilityUseDialog.create` (padrão Baforada/Inspiração —
 *    encadeável): para magia enc/ilu de conjurador com a bolsa equipada, mede
 *    `custoBefore` do clone, chama o create nativo (dialog roda; o
 *    applyOnUseEffects muta o custo do clone no submit) e depois aplica
 *    `custo -= min(2, delta)` — delta = exatamente o custo dos aprimoramentos
 *    aplicados. Nunca toca o custo base (delta 0 → sem desconto).
 * 2. Hook `renderAbilityUseDialog` (só display): injeta a nota "Bolsa de Pó:
 *    −2 PM em aprimoramentos" + um input oculto `ajustecusto` que o
 *    `_onInputChange` NATIVO já soma no total exibido (~L6132); um listener
 *    nos checkboxes recalcula `ajustecusto = −min(2, Σ custos selecionados)`
 *    e re-dispara o recompute nativo (que já tem o piso `max(total, 1)`).
 */

import { log, warn } from "@/utils/logging";
import { norm } from "@/inspiracao/format";

const BOLSA_NAME = "bolsa de po";
const SCHOOLS = ["enc", "ilu"];

// ── Helpers puros ─────────────────────────────────────────────────────────────

/** Desconto da bolsa: até 2 PM, limitado ao custo dos aprimoramentos. */
export function computeBolsaDiscount(aprimoramentoCost: number): number {
    return Math.min(2, Math.max(0, Math.floor(aprimoramentoCost || 0)));
}

/** Magia de Encantamento ou Ilusão? */
export function isEncIluSpell(item: { type?: string; system?: { escola?: string } } | null | undefined): boolean {
    return !!item && item.type === "magia" && SCHOOLS.includes(item.system?.escola ?? "");
}

interface ItemLike {
    type?: string;
    name?: string;
    system?: { equipado?: unknown; equipped?: unknown; equipado2?: { slot?: number } };
}

/** O ator tem uma Bolsa de Pó equipada? */
export function hasBolsaDePo(actor: { items?: { contents: ItemLike[] } } | null | undefined): boolean {
    if (!actor) return false;
    return (actor.items?.contents ?? []).some((it) => {
        if (it.type !== "equipamento") return false;
        if (!norm(it.name).includes(BOLSA_NAME)) return false;
        const sys = it.system;
        return !!(sys?.equipado || sys?.equipped || (sys?.equipado2?.slot ?? 0) > 0);
    });
}

// ── Wrapper do AbilityUseDialog.create (débito real) ──────────────────────────

interface SpellClone {
    type?: string;
    name?: string;
    actor?: { items?: { contents: ItemLike[] } } | null;
    system?: { escola?: string; ativacao?: { custo?: number } };
}

function isEligible(item: SpellClone): boolean {
    return isEncIluSpell(item) && hasBolsaDePo(item.actor);
}

function patchAbilityUseDialog(): void {
    type DlgLike = { create: (item: unknown, ...a: unknown[]) => Promise<unknown>; _t20PatchedBolsaDePo?: boolean };
    type T20Global = { applications?: { AbilityUseDialog?: DlgLike } };
    const Dlg = (game as unknown as { tormenta20?: T20Global }).tormenta20?.applications?.AbilityUseDialog;
    if (!Dlg) { warn("bolsa-de-po: AbilityUseDialog não encontrado — patch não aplicado."); return; }
    if (Dlg._t20PatchedBolsaDePo) return;
    const orig = Dlg.create.bind(Dlg);
    Dlg.create = async function (item: unknown, ...args: unknown[]): Promise<unknown> {
        const clone = item as SpellClone;
        const eligible = (() => { try { return isEligible(clone); } catch { return false; } })();
        const custoBefore = Number(clone?.system?.ativacao?.custo ?? 0);
        const result = await orig(item, ...args);
        if (result && eligible) {
            try {
                const ativacao = clone.system?.ativacao;
                const custoAfter = Number(ativacao?.custo ?? 0);
                const aprCost = custoAfter - custoBefore; // só o que os aprimoramentos somaram
                const discount = computeBolsaDiscount(aprCost);
                if (discount > 0 && ativacao) {
                    ativacao.custo = custoAfter - discount; // base intacta; débito nativo tem piso 1
                    ui.notifications?.info(`Bolsa de Pó: −${discount} PM no custo dos aprimoramentos.`);
                }
            } catch (e) { warn("bolsa-de-po: desconto falhou:", e); }
        }
        return result;
    };
    Dlg._t20PatchedBolsaDePo = true;
    log("Bolsa de Pó: AbilityUseDialog.create patcheado (−2 PM em aprimoramentos enc/ilu).");
}

// ── Display no dialog nativo ──────────────────────────────────────────────────

/** Soma dos custos dos aprimoramentos SELECIONADOS (replica o loop nativo). */
function selectedAprimoramentoCost(root: HTMLElement): number {
    let total = 0;
    root.querySelectorAll<HTMLInputElement>(".aprimoramentos-list li input:not([type=hidden])").forEach((input) => {
        const cost = input.closest("div")?.querySelector<HTMLInputElement>("input[type=hidden]");
        if (!cost) return;
        const c = Number(cost.value);
        if (!c) return;
        if (input.type === "checkbox") {
            if (input.checked) total += c;
        } else if (Number(input.value)) {
            total += c * Number(input.value);
        }
    });
    return Math.max(0, total);
}

function setupRenderHook(): void {
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]) => {
        try {
            const app = args[0] as { item?: SpellClone; element?: JQuery | HTMLElement; _onInputChange?: (html: unknown) => void };
            const item = app.item;
            if (!item || !isEligible(item)) return;
            const el = ((app.element as { 0?: HTMLElement })?.[0] ?? app.element) as HTMLElement | undefined;
            const form = el?.querySelector("form");
            if (!form || form.querySelector(".t20-bolsa-po-note")) return;

            // Nota visual + input oculto que o _onInputChange nativo soma no total.
            const note = document.createElement("div");
            note.className = "t20-bolsa-po-note";
            note.style.cssText = "margin:4px 0;padding:4px 8px;border-left:3px solid #9a6bd8;color:#c8a96e;font-size:12px;";
            note.textContent = "Bolsa de Pó: −2 PM no custo dos aprimoramentos desta magia.";
            const costRow = form.querySelector(".total-cost")?.closest(".form-group") ?? form.querySelector(".total-cost");
            (costRow?.parentElement ?? form).insertBefore(note, costRow ?? null);

            let adjust = form.querySelector<HTMLInputElement>('input[name="ajustecusto"]');
            if (!adjust) {
                adjust = document.createElement("input");
                adjust.type = "hidden";
                adjust.name = "ajustecusto";
                adjust.value = "0";
                form.appendChild(adjust);
            }

            const refresh = (): void => {
                const disc = computeBolsaDiscount(selectedAprimoramentoCost(form as unknown as HTMLElement));
                adjust!.value = String(-disc);
                try { app._onInputChange?.((app.element as unknown)); } catch { /* display only */ }
            };
            form.querySelectorAll<HTMLInputElement>(".aprimoramentos-list li input:not([type=hidden])").forEach((input) => {
                input.addEventListener("change", () => setTimeout(refresh, 0));
                input.addEventListener("click", () => setTimeout(refresh, 0));
            });
            // Os botões +/− (.numCtrl) também mudam quantidades.
            form.querySelectorAll<HTMLElement>(".numCtrl").forEach((btn) => {
                btn.addEventListener("click", () => setTimeout(refresh, 0));
            });
            refresh();
        } catch (e) { warn("bolsa-de-po: render hook falhou:", e); }
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupBolsaDePo(): void {
    Hooks.once("ready", () => { patchAbilityUseDialog(); });
    setupRenderHook();
}
