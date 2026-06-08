/**
 * Baforada Dracônica — sopro elemental ativo do dracônico.
 *
 * Ao ADICIONAR o poder, abre modal para escolher o elemento (imutável).
 * Ao USAR o poder na ficha (card no chat), interceptamos e abrimos um diálogo
 * perguntando quantos PM gastar (1..mod. Constituição, limitado pelo PM atual).
 * Cada PM = 1d10 do elemento. Gasta o PM (origin marcada para o sheet-log),
 * rola o dano e despacha o teste de resistência (Reflexos CD Con reduz à
 * metade) para cada alvo selecionado, reaproveitando o modal de resistência.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import {
    normalizeCondName,
    parseResistance,
    getTargetUserId,
    dispatchSpellResistanceToTarget,
} from "@/spell-resistance/index";
import type { SpellResistPreRollRequest } from "@/spell-resistance/types";
import {
    ELEMENT_KEYS,
    isElementKey,
    computeBaforadaCD,
    maxBaforadaPm,
    clampBaforadaPm,
    buildBaforadaFormula,
    RESIST_TXT,
    type ElementKey,
} from "./format";
import STYLES from "./baforada.css?inline";

const STYLES_ID = "bg3-t20-baforada-styles";
const ELEMENT_FLAG = "baforadaElement";
const BAFORADA_NAME = "baforada draconica";

// ── CSS ───────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rid(): string {
    const f = (globalThis as unknown as { randomID?: () => string }).randomID;
    return f ? f() : Math.random().toString(36).slice(2, 18);
}

// ── Detecção / dados ──────────────────────────────────────────────────────────

interface ItemLike {
    type?: string;
    name?: string;
    id?: string | null;
    uuid?: string;
    flags?: Record<string, Record<string, unknown>>;
    parent?: FoundryActor | null;
    setFlag?(scope: string, key: string, value: unknown): Promise<unknown>;
}

export function isBaforada(item: ItemLike | null | undefined): boolean {
    return !!item && item.type === "poder" && normalizeCondName(item.name ?? "").includes(BAFORADA_NAME);
}

function elementLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { damageTypes?: Record<string, string> } }).T20?.damageTypes;
    return cfg?.[key] ?? key;
}

function attrMod(actor: FoundryActor, key: string): number {
    const a = (actor.system?.atributos as Record<string, { value?: number }> | undefined)?.[key];
    return Number(a?.value ?? 0);
}

function totalLevel(actor: FoundryActor): number {
    const items = (actor as { items?: { contents: FoundryItem[] } }).items?.contents ?? [];
    return items.filter((i) => i.type === "classe")
        .reduce((s, c) => s + Number((c.system as { niveis?: number })?.niveis ?? 0), 0);
}

function currentPm(actor: FoundryActor): number {
    return Number((actor.system?.attributes as { pm?: { value?: number } } | undefined)?.pm?.value ?? 0);
}

const ROUND_FLAG = "baforadaLastRound";

/** Chave da rodada de combate atual (`combatId:round`), ou null fora de combate. */
function combatRoundKey(): string | null {
    const c = (game as unknown as { combat?: { id?: string; round?: number; started?: boolean } }).combat;
    if (!c || !c.started) return null;
    return `${c.id ?? ""}:${c.round ?? 0}`;
}

/** true se o ator já usou a Baforada nesta rodada de combate. */
function usedThisRound(actor: FoundryActor): boolean {
    const key = combatRoundKey();
    if (!key) return false; // sem combate ativo → sem limite de 1×/rodada
    const last = (actor.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ROUND_FLAG];
    return last === key;
}

function readElement(item: ItemLike | null | undefined): ElementKey | null {
    const v = (item?.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ELEMENT_FLAG];
    return isElementKey(typeof v === "string" ? v : null) ? (v as ElementKey) : null;
}

// ── Modal de escolha do elemento (na adição) ───────────────────────────────────

function openElementModal(item: ItemLike, onDone?: () => void): void {
    ensureStyles();
    const radios = ELEMENT_KEYS.map((k, i) => `
        <label class="baf-elem">
            <input type="radio" name="baf-element" value="${k}" ${i === 0 ? "checked" : ""}/>
            <span>${esc(elementLabel(k))}</span>
        </label>`).join("");
    const content = `
        <div class="baf-modal">
            <div class="baf-intro">Escolha o <b>elemento</b> da sua Baforada Dracônica
            <i>(uma vez feita, a escolha não muda)</i>:</div>
            <div class="baf-elem-grid">${radios}</div>
        </div>`;
    const dlg = new Dialog({
        title: "Baforada Dracônica — Elemento",
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-fire"></i>',
                label: "Confirmar",
                callback: async ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const chosen = root.querySelector<HTMLInputElement>('input[name="baf-element"]:checked')?.value;
                    if (!isElementKey(chosen ?? null)) return;
                    await item.setFlag?.(MODULE_ID, ELEMENT_FLAG, chosen);
                    ui.notifications?.info(`Baforada Dracônica: elemento ${elementLabel(chosen as string)}.`);
                    onDone?.();
                },
            },
        },
        default: "confirm",
    }, { classes: ["bg3-dialog", "bg3-baforada-dialog"], width: 420 });
    dlg.render(true);
}

// ── Diálogo de uso (gasto de PM) ───────────────────────────────────────────────

function openUsePrompt(actor: FoundryActor, element: ElementKey): void {
    ensureStyles();
    const conMod = attrMod(actor, "con");
    const level = totalLevel(actor);
    const max = maxBaforadaPm(conMod, level, currentPm(actor));
    if (max <= 0) {
        ui.notifications?.warn(`Baforada: PM insuficiente (Con ${conMod}, nível ${level}, PM ${currentPm(actor)}).`);
        return;
    }
    const cd = computeBaforadaCD(level, conMod);

    const content = `
        <div class="baf-modal">
            <div class="baf-intro">Sopro de <b>${esc(elementLabel(element))}</b> — gaste PM (1d10 por PM).
            Reflexos <b>CD ${cd}</b> reduz à metade.</div>
            <div class="baf-row">
                <label>PM a gastar (máx ${max}):</label>
                <input type="number" name="baf-pm" min="1" max="${max}" value="${max}" class="baf-pm-input"/>
            </div>
            <div class="baf-hint">Limite: mín(Con ${conMod}, nível ${level}, PM ${currentPm(actor)}). 1×/rodada em combate.</div>
        </div>`;

    const dlg = new Dialog({
        title: "Baforada Dracônica — Sopro",
        content,
        buttons: {
            cast: {
                icon: '<i class="fas fa-wind"></i>',
                label: "Soprar",
                callback: (($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const raw = Number(root.querySelector<HTMLInputElement>('input[name="baf-pm"]')?.value ?? "1");
                    const pm = clampBaforadaPm(raw, max);
                    if (pm <= 0) return;
                    void fireBaforada(actor, element, pm, cd);
                }) as (html: JQuery) => void,
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
        },
        default: "cast",
    }, { classes: ["bg3-dialog", "bg3-baforada-dialog"], width: 420 });
    dlg.render(true);
}

// ── Execução ────────────────────────────────────────────────────────────────

async function fireBaforada(
    actor: FoundryActor,
    element: ElementKey,
    pm: number,
    cd: number,
): Promise<void> {
    // 1. Gasta PM (origin para o sheet-log) + marca uso na rodada de combate.
    const pmValue = currentPm(actor);
    const update: Record<string, unknown> = { "system.attributes.pm.value": Math.max(0, pmValue - pm) };
    const roundKey = combatRoundKey();
    if (roundKey) update[`flags.${MODULE_ID}.${ROUND_FLAG}`] = roundKey;
    await actor.update(update, { [MODULE_ID]: { origin: { kind: "pm-cost", source: "Baforada Dracônica" } } });

    // 2. Rola o dano (Nd10 do elemento).
    const formula = buildBaforadaFormula(pm, element);
    const roll = new Roll(formula);
    await roll.evaluate();
    const damageTotal = roll.total ?? 0;

    // 3. Card no chat (único — o diálogo nativo do T20 foi cancelado no patch).
    const messageId = await postBaforadaCard(actor.name, element, pm, cd, roll);

    // 4. Despacha resistência (Reflexos reduz à metade) por alvo selecionado.
    const targets = Array.from(game.user?.targets ?? []) as FoundryToken[];
    if (!targets.length) {
        ui.notifications?.info(`Baforada: ${damageTotal} de ${elementLabel(element)} (nenhum alvo selecionado — aplique manualmente).`);
        return;
    }
    const { skill, outcome } = parseResistance(RESIST_TXT);
    const casterUserId = game.user?.id ?? "";
    for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        const targetUserId = getTargetUserId(targetActor);
        if (!targetUserId) {
            ui.notifications?.warn(`Baforada: sem usuário ativo para ${targetActor.name}.`);
            continue;
        }
        const preReq: SpellResistPreRollRequest = {
            type: "spell-resist-preroll",
            requestId: rid(),
            targetUserId,
            casterUserId,
            targetActorId: targetActor.id,
            targetActorUuid: targetActor.uuid,
            casterName: actor.name,
            spellName: `Baforada Dracônica (${elementLabel(element)})`,
            resistTxt: RESIST_TXT,
            resistSkill: skill,
            resistOutcome: outcome,
            cd,
            messageId,
            damageTotal,
            damageFormula: formula,
            isHeal: false,
            maxHealValue: 0,
            conditions: [],
            customEffectNames: [],
        };
        dispatchSpellResistanceToTarget(preReq);
    }
    log(`Baforada: ${pm} PM → ${damageTotal} de ${element} (CD ${cd}) em ${targets.length} alvo(s).`);
}

async function postBaforadaCard(
    casterName: string,
    element: ElementKey,
    pm: number,
    cd: number,
    roll: Roll,
): Promise<string> {
    let rendered = "";
    try { rendered = await roll.render({ flavor: `${elementLabel(element)} — ${pm}d10` }); } catch { /* ignore */ }
    const content =
        `<div class="bg3-baforada-card">` +
        `<div class="baf-card-title">🐉 Baforada Dracônica — ${esc(casterName)}</div>` +
        `<div class="baf-card-sub">${esc(elementLabel(element))} · ${pm} PM · Reflexos CD ${cd} reduz à metade</div>` +
        `${rendered}` +
        `</div>`;
    const msg = await ChatMessage.create({
        speaker: { alias: casterName },
        content,
        rolls: [roll.toJSON?.() ?? roll] as unknown[],
        flags: { [MODULE_ID]: { baforadaCard: true } },
    } as Record<string, unknown>);
    return msg?.id ?? "";
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function isMine(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

/**
 * Fluxo de uso da Baforada — substitui o diálogo nativo do T20 (cancelado no
 * patch de AbilityUseDialog.create). Faz a checagem de 1×/rodada, garante o
 * elemento escolhido e abre o nosso modal de PM (que rola, gasta PM e despacha
 * a resistência). Roll ÚNICO — o T20 não rola nada para a Baforada.
 */
function onBaforadaUse(cloneItem: ItemLike): void {
    const actor = cloneItem.parent as (FoundryActor & { items?: { contents: FoundryItem[] } }) | null;
    if (!actor || actor.type !== "character") return;

    if (usedThisRound(actor)) {
        ui.notifications?.warn("Baforada Dracônica: já usada nesta rodada (recarga: ação de movimento).");
        return;
    }

    // O item que o AbilityUseDialog.create recebe é um CLONE efêmero (id null) —
    // setFlag nele NÃO persiste. Resolve o item real do ator para ler/gravar o
    // elemento escolhido.
    const realItem = (actor.items?.contents.find((i) => isBaforada(i as ItemLike)) as ItemLike | undefined) ?? cloneItem;

    const element = readElement(realItem);
    if (!element) {
        // ainda não escolheu o elemento → escolhe agora (salva no item real), depois abre o prompt
        openElementModal(realItem, () => {
            const el = readElement(realItem);
            if (el) openUsePrompt(actor, el);
        });
        return;
    }
    openUsePrompt(actor, element);
}

/**
 * Monkey-patch de `AbilityUseDialog.create`: para a Baforada Dracônica,
 * CANCELA o diálogo/uso nativo do T20 (return null → o item.roll() do T20
 * aborta: sem diálogo nativo, sem rolagem, sem gasto de PM, sem card duplicado)
 * e dispara o NOSSO fluxo. O poder já traz `rolls:[1d10]` + aprimoramento
 * "+1d10/PM", então deixar o T20 rolar gerava uma SEGUNDA rolagem.
 */
function patchAbilityUseDialog(): void {
    type DlgLike = { create: (item: unknown, ...a: unknown[]) => Promise<unknown>; _bg3PatchedBaforada?: boolean };
    type T20Global = { applications?: { AbilityUseDialog?: DlgLike } };
    const Dlg = (game as unknown as { tormenta20?: T20Global }).tormenta20?.applications?.AbilityUseDialog;
    if (!Dlg) { warn("Baforada: AbilityUseDialog não encontrado — patch não aplicado."); return; }
    if (Dlg._bg3PatchedBaforada) return;
    const orig = Dlg.create.bind(Dlg);
    Dlg.create = async function (item: unknown, ...args: unknown[]): Promise<unknown> {
        if (isBaforada(item as ItemLike)) {
            // Dispara nosso fluxo no próximo tick e cancela o uso nativo.
            setTimeout(() => { try { onBaforadaUse(item as ItemLike); } catch (e) { warn("Baforada: onUse falhou:", e); } }, 0);
            return null;
        }
        return orig(item, ...args);
    };
    Dlg._bg3PatchedBaforada = true;
    log("Baforada: AbilityUseDialog.create patcheado (uso nativo cancelado para a Baforada).");
}

export function setupBaforada(): void {
    Hooks.once("ready", () => { ensureStyles(); patchAbilityUseDialog(); });

    // Escolha do elemento ao adicionar o poder.
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike;
        if (!isMine(args[2] as string | undefined)) return;
        if (!isBaforada(item)) return;
        if (item.parent?.type !== "character") return;
        if (readElement(item)) return; // já escolhido
        try { openElementModal(item); } catch (e) { warn("Baforada: modal de elemento falhou:", e); }
    });
}
