/**
 * Tradição Perdida (e Aprimorada) — poderes raciais de conjuração alternativa.
 *
 * Tradição Perdida: ao adicionar, abre modal para escolher um ATRIBUTO e uma
 * CLASSE com Magias. Passa a somar o atributo escolhido (limitado pelo teto do
 * patamar) ao PM, em vez do atributo da classe. Implementado via AE no ator que
 * soma o delta a `system.attributes.pm.bonus.total`. Recalcula automaticamente
 * quando o nível ou os atributos mudam (hook updateActor).
 *
 * Tradição Perdida Aprimorada: o atributo-chave de conjuração (CD) passa a ser
 * o atributo escolhido. Exposto via `getCastingAttrOverride(actor)` e consumido
 * pelo patch de CD de magia (t20-fixes/spell-cd-formula).
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";
import {
    ATTR_KEYS,
    isAttrKey,
    pmCap,
    computePmDelta,
    buildTradicaoPmChange,
    type AttrKey,
} from "./format";
import STYLES from "./tradicao-perdida.css?inline";

const STYLES_ID = "bg3-t20-tradicao-styles";
const ATTR_FLAG = "tradAttr";
const CLASS_FLAG = "tradClassId";

const BASE_NAME = "tradicao perdida";
const APRIMORADA_NAME = "tradicao perdida aprimorada";

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

// ── Detecção ────────────────────────────────────────────────────────────────

interface ItemLike {
    type?: string;
    name?: string;
    id?: string | null;
    uuid?: string;
    flags?: Record<string, Record<string, unknown>>;
    parent?: FoundryActor | null;
    setFlag?(scope: string, key: string, value: unknown): Promise<unknown>;
}

export function isTradicaoPerdida(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    const n = normalizeCondName(item.name ?? "");
    return n.includes(BASE_NAME) && !n.includes("aprimorada");
}

export function isTradicaoAprimorada(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    return normalizeCondName(item.name ?? "").includes(APRIMORADA_NAME);
}

function attrLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { atributos?: Record<string, string> } }).T20?.atributos;
    return cfg?.[key] ?? key.toUpperCase();
}

// ── Acesso ao ator ──────────────────────────────────────────────────────────

interface TradActor extends FoundryActor {
    items?: { contents: FoundryItem[]; get(id: string): FoundryItem | null };
}

function attrMod(actor: FoundryActor, key: string): number {
    const a = (actor.system?.atributos as Record<string, { value?: number }> | undefined)?.[key];
    return Number(a?.value ?? 0);
}

/**
 * Nível total do personagem = soma dos níveis de todas as classes. T20 não
 * expõe um `system.nivel` confiável (varia/ausente); o nível de classe (`niveis`)
 * é a fonte canônica e o que o cálculo de PM usa.
 */
function totalLevel(actor: TradActor): number {
    const classes = (actor.items?.contents ?? []).filter((i) => i.type === "classe");
    return classes.reduce((sum, c) => sum + Number((c.system as { niveis?: number })?.niveis ?? 0), 0);
}

/** Atributo que a classe usa para PM (o marcado `true` em pm.atributos). */
function classKeyAttr(actor: FoundryActor): AttrKey | null {
    const pm = (actor.system?.attributes as { pm?: { atributos?: Record<string, boolean> } } | undefined)?.pm;
    const found = Object.entries(pm?.atributos ?? {}).find(([, v]) => v === true)?.[0];
    return isAttrKey(found ?? null) ? (found as AttrKey) : null;
}

function findTradicao(actor: TradActor): FoundryItem | null {
    return (actor.items?.contents ?? []).find((i) => isTradicaoPerdida(i as ItemLike)) ?? null;
}

function hasAprimorada(actor: TradActor): boolean {
    return (actor.items?.contents ?? []).some((i) => isTradicaoAprimorada(i as ItemLike));
}

function readChosenAttr(item: FoundryItem | null): AttrKey | null {
    const v = (item?.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ATTR_FLAG];
    return isAttrKey(typeof v === "string" ? v : null) ? (v as AttrKey) : null;
}

// ── Casting attribute override (consumido pelo patch de CD) ────────────────────

export interface CastingOverride {
    attr: AttrKey;
    classId: string | null;
}

/**
 * Quando a Tradição Perdida Aprimorada está presente + a base configurada,
 * o atributo-chave de conjuração passa a ser o atributo escolhido.
 */
export function getCastingAttrOverride(actor: FoundryActor): CastingOverride | null {
    const a = actor as TradActor;
    if (a.type !== "character") return null;
    if (!hasAprimorada(a)) return null;
    const trad = findTradicao(a);
    const attr = readChosenAttr(trad);
    if (!attr) return null;
    const classId = (trad?.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[CLASS_FLAG];
    return { attr, classId: typeof classId === "string" ? classId : null };
}

// ── Sincronização do PM ────────────────────────────────────────────────────────

const OUR_AE_FLAG = "tradicaoPerdida";

async function syncTradicao(actor: TradActor): Promise<void> {
    if (actor.type !== "character") return;

    // Remove nossa AE anterior.
    const ourIds = (actor.effects?.contents ?? [])
        .filter((e) => (e.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[OUR_AE_FLAG])
        .map((e) => e.id)
        .filter((id): id is string => Boolean(id));
    if (ourIds.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", ourIds, { render: false });

    const trad = findTradicao(actor);
    const chosen = readChosenAttr(trad);
    if (!trad || !chosen) return;

    const classKey = classKeyAttr(actor);
    const classMod = classKey ? attrMod(actor, classKey) : 0;
    const cap = pmCap(totalLevel(actor));
    const delta = computePmDelta(attrMod(actor, chosen), classMod, cap);
    const changes = buildTradicaoPmChange(delta);
    if (!changes.length) return;

    await actor.createEmbeddedDocuments?.("ActiveEffect", [{
        name: `Tradição Perdida — PM por ${attrLabel(chosen)} (${delta >= 0 ? "+" : ""}${delta})`,
        icon: "icons/magic/light/orb-lightning-purple.webp",
        origin: trad.uuid,
        transfer: false,
        disabled: false,
        changes,
        flags: { [MODULE_ID]: { [OUR_AE_FLAG]: true } },
    }], { render: false });
    log(`Tradição Perdida: PM por ${chosen} (delta ${delta}, cap ${cap}, classe ${classKey}).`);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ClassOption { id: string; name: string }

function spellcastingClasses(actor: TradActor): ClassOption[] {
    const classes = (actor.items?.contents ?? []).filter((i) => i.type === "classe");
    const poderes = (actor.items?.contents ?? []).filter((i) => i.type === "poder");
    const withMagias = classes.filter((c) => {
        const cn = normalizeCondName(c.name ?? "");
        return poderes.some((p) => {
            const pn = normalizeCondName(p.name ?? "");
            return pn.includes("magias") && pn.includes(cn);
        });
    });
    const list = (withMagias.length ? withMagias : classes).map((c) => ({ id: c.id, name: c.name }));
    return list;
}

function openTradicaoModal(item: ItemLike): void {
    ensureStyles();
    const actor = item.parent as TradActor | null;
    if (!actor) return;

    const classes = spellcastingClasses(actor);
    const classDefault = classKeyAttr(actor);
    const attrRadios = ATTR_KEYS.map((k, i) => `
        <label class="trad-attr">
            <input type="radio" name="trad-attr" value="${k}" ${i === 0 ? "checked" : ""}/>
            <span>${esc(attrLabel(k))}</span>
        </label>`).join("");
    const classOpts = classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");

    const content = `
        <div class="trad-modal">
            <div class="trad-intro">Escolha o <b>atributo</b> que passará a alimentar seu PM (no lugar do atributo
            da classe${classDefault ? `, atualmente <b>${esc(attrLabel(classDefault))}</b>` : ""}) e a <b>classe com Magias</b>.</div>
            <div class="trad-section-label">Atributo</div>
            <div class="trad-attr-grid">${attrRadios}</div>
            <div class="trad-section-label">Classe</div>
            <select name="trad-class" class="trad-select">${classOpts}</select>
        </div>`;

    const dlg = new Dialog({
        title: "Tradição Perdida — Atributo de Conjuração",
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-hat-wizard"></i>',
                label: "Confirmar",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const attr = root.querySelector<HTMLInputElement>('input[name="trad-attr"]:checked')?.value;
                    const classId = root.querySelector<HTMLSelectElement>('select[name="trad-class"]')?.value ?? null;
                    if (!isAttrKey(attr ?? null)) return;
                    void applyTradicao(item, attr as AttrKey, classId);
                },
            },
        },
        default: "confirm",
    }, { classes: ["bg3-dialog", "bg3-tradicao-dialog"], width: 440 });
    dlg.render(true);
}

async function applyTradicao(item: ItemLike, attr: AttrKey, classId: string | null): Promise<void> {
    await item.setFlag?.(MODULE_ID, ATTR_FLAG, attr);
    await item.setFlag?.(MODULE_ID, CLASS_FLAG, classId ?? "");
    const actor = item.parent as TradActor | null;
    if (actor) await syncTradicao(actor);
    ui.notifications?.info(`Tradição Perdida: PM passa a usar ${attrLabel(attr)}.`);
}

// ── Auto-recompute (level / atributos) ─────────────────────────────────────────

function relevantActorChange(changes: Record<string, unknown>): boolean {
    const sys = changes["system"] as Record<string, unknown> | undefined;
    if (!sys) return false;
    return "atributos" in sys || "nivel" in sys;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function isMine(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

function hookUserId(args: unknown[]): string | undefined {
    for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === "string") return args[i] as string;
    }
    return undefined;
}

export function setupTradicaoPerdida(): void {
    Hooks.once("ready", () => ensureStyles());

    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike;
        if (!isMine(args[2] as string | undefined)) return;
        if (item.parent?.type !== "character") return;
        if (isTradicaoPerdida(item)) {
            const existing = (item.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ATTR_FLAG];
            if (isAttrKey(typeof existing === "string" ? existing : null)) {
                void syncTradicao(item.parent as TradActor);
            } else {
                try { openTradicaoModal(item); } catch (e) { warn("Tradição Perdida: modal falhou:", e); }
            }
        }
        // Aprimorada não tem PM próprio; só afeta o override de CD (já reativo via patch).
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike;
        if (!isMine(args[2] as string | undefined)) return;
        const actor = item.parent as TradActor | null;
        if (!actor || actor.type !== "character") return;
        if (isTradicaoPerdida(item)) {
            setTimeout(() => void syncTradicao(actor), 50);
        }
    });

    // Recálculo automático: nível ou atributos mudaram no ator.
    Hooks.on("updateActor", (...args: unknown[]) => {
        const actor = args[0] as TradActor;
        const changes = args[1] as Record<string, unknown>;
        if (!isMine(hookUserId(args))) return;
        if (actor.type !== "character") return;
        if (!relevantActorChange(changes)) return;
        if (!findTradicao(actor)) return;
        void syncTradicao(actor);
    });

    // Recálculo automático: subir de nível altera o item de classe (niveis) →
    // muda o patamar/teto. (updateActor não dispara nesse caso.)
    Hooks.on("updateItem", (...args: unknown[]) => {
        const item = args[0] as { type?: string; parent?: TradActor | null };
        const changes = args[1] as Record<string, unknown>;
        if (!isMine(hookUserId(args))) return;
        if (item.type !== "classe") return;
        const sys = changes["system"] as Record<string, unknown> | undefined;
        if (!sys || !("niveis" in sys)) return;
        const actor = item.parent;
        if (!actor || actor.type !== "character" || !findTradicao(actor)) return;
        setTimeout(() => void syncTradicao(actor), 50);
    });
}
