/**
 * T20 fix — Manopla: aprimoramentos de ARMA (UI + aplicação mecânica).
 *
 * Regra: "Uma manopla conta como uma arma para receber melhorias e encantos
 * para usá-los em seus ataques desarmados."
 *
 * ── Parte 1 — UI ───────────────────────────────────────────────────────────────
 * A Manopla é `type: "equipamento"` (tipo "traje"). A aba `enhancements` do
 * sheet do T20 escolhe a lista de melhorias pelo TIPO do item — só type "arma"
 * recebe `weaponUpgrades`; a Manopla caía nas genéricas (toolUpgrades). Como o
 * template é do sistema, repopulamos no DOM (renderItemSheet) os selects de
 * melhoria com `CONFIG.T20.weaponUpgrades`, preservando o valor salvo. A
 * gravação continua pelo handler nativo (`.updateUpgrades`).
 *
 * ── Parte 2 — Aplicação mecânica ───────────────────────────────────────────────
 * Cada melhoria de arma (`CONFIG.T20.upgrades.weapon[key]`) é um AE com
 * `flags.tormenta20.{onuse:true, self:true, upgrade:key}` e changes de arma
 * (ataque, criticoM, dano, …). O T20 aplica esses AEs no roll da ARMA via
 * `applyOnUseEffects`. Para a Manopla valer no ataque desarmado, espelhamos os
 * AEs das melhorias selecionadas na Manopla EQUIPADA para a arma "Ataque
 * desarmado" (com `flags.aeris-bg3-rolls-t20.manoplaUpgrade = key` para limpeza).
 * Aí o T20 os lista (pré-marcados, self:true) e aplica no soco, igual a uma arma
 * de verdade. Reconciliação idempotente em create/delete/update de item e ready.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

const APPLY_FLAG = "manoplaUpgrade";

interface ItemLike {
    id?: string | null;
    type?: string;
    name?: string;
    img?: string;
    uuid?: string;
    system?: {
        upgrades?: Record<string, string | undefined>;
        equipado?: unknown;
        equipado2?: { slot?: unknown };
    };
}

/** O item é uma Manopla? (equipamento cujo nome normalizado contém "manopla") */
export function isManopla(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "equipamento") return false;
    return normalizeCondName(item.name ?? "").includes("manopla");
}

/** O item é o "Ataque desarmado"? (arma cujo nome normalizado contém "desarmado") */
export function isUnarmedWeapon(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "arma") return false;
    return normalizeCondName(item.name ?? "").includes("desarmado");
}

/** Equipado: legacy (`system.equipado`) OU slot system (`equipado2.slot > 0`). */
export function isManoplaEquipped(item: ItemLike | null | undefined): boolean {
    const sys = item?.system;
    const eq = sys?.equipado;
    let legacy = false;
    if (typeof eq === "number") legacy = eq > 0;
    else if (typeof eq === "boolean") legacy = eq;
    else if (typeof eq === "string") legacy = eq !== "" && eq !== "0" && eq !== "false";
    else legacy = Boolean(eq);
    const slot = Number(sys?.equipado2?.slot ?? 0);
    return legacy || slot > 0;
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Parte 1 — UI da aba de aprimoramentos ──────────────────────────────────────

/**
 * HTML das <option> de um select de melhoria, a partir do mapa de upgrades
 * (key → label i18n) e tooltips. Sempre inclui a opção em branco "-". Pura.
 */
export function buildUpgradeOptionsHtml(
    upgrades: Record<string, string>,
    tooltips: Record<string, string>,
    localize: (s: string) => string,
): string {
    const out = ['<option value="">-</option>'];
    for (const [key, label] of Object.entries(upgrades)) {
        const tipRaw = tooltips[key];
        const tip = tipRaw ? ` title="${esc(localize(tipRaw))}"` : "";
        out.push(`<option value="${esc(key)}"${tip}>${esc(localize(String(label)))}</option>`);
    }
    return out.join("");
}

interface WeaponUpgradeTemplate {
    name?: string;
    description?: string;
    changes?: unknown[];
    flags?: { tormenta20?: Record<string, unknown> };
    transfer?: boolean;
    disabled?: boolean;
}

interface T20Config {
    weaponUpgrades?: Record<string, string>;
    weaponUpgradesTooltips?: Record<string, string>;
    upgrades?: { weapon?: Record<string, WeaponUpgradeTemplate> };
}

function rebuildMelhoriaSelects(root: ParentNode, item: ItemLike): number {
    const cfg = (CONFIG as unknown as { T20?: T20Config }).T20;
    const upgrades = cfg?.weaponUpgrades ?? {};
    if (!Object.keys(upgrades).length) return 0;
    const tooltips = cfg?.weaponUpgradesTooltips ?? {};
    const localize = (s: string): string => game.i18n?.localize(s) ?? s;
    const optionsHtml = buildUpgradeOptionsHtml(upgrades, tooltips, localize);

    const selects = root.querySelectorAll<HTMLSelectElement>(
        'select.updateUpgrades[data-name^="system.upgrades.melhoria"]',
    );
    for (const sel of selects) {
        const key = (sel.getAttribute("data-name") ?? "").split(".").pop() ?? "";
        const saved = item.system?.upgrades?.[key] ?? "";
        sel.innerHTML = optionsHtml;
        sel.value = saved;
    }
    return selects.length;
}

// ── Parte 2 — Aplicação mecânica no ataque desarmado ───────────────────────────

/** Keys de melhoria de arma selecionadas na Manopla que têm efeito mecânico. */
export function getManoplaWeaponUpgradeKeys(
    upgrades: Record<string, string | undefined> | undefined,
    weaponMap: Record<string, unknown>,
): string[] {
    const out = new Set<string>();
    for (const v of Object.values(upgrades ?? {})) {
        if (typeof v === "string" && v && v !== "status"
            && Object.prototype.hasOwnProperty.call(weaponMap, v)) {
            out.add(v);
        }
    }
    return [...out];
}

/** Monta o AE da melhoria de arma para colocar na arma desarmada. */
export function buildManoplaUpgradeAE(
    key: string,
    tpl: WeaponUpgradeTemplate,
    icon: string | undefined,
    originUuid: string | undefined,
    localize: (s: string) => string,
): Record<string, unknown> {
    return {
        ...tpl,
        name: `Manopla — ${localize(tpl.name ?? key)}`,
        description: localize(tpl.description ?? ""),
        icon,
        origin: originUuid,
        flags: { ...(tpl.flags ?? {}), [MODULE_ID]: { [APPLY_FLAG]: key } },
    };
}

interface EffectLike { id?: string | null; flags?: Record<string, Record<string, unknown> | undefined> }
interface WeaponItem extends ItemLike {
    effects?: { contents?: EffectLike[] };
    createEmbeddedDocuments?: (t: string, d: object[], c?: object) => Promise<unknown>;
    deleteEmbeddedDocuments?: (t: string, ids: string[], c?: object) => Promise<unknown>;
}
interface ActorLike { type?: string; items?: Iterable<unknown> }

/** Reconcilia (idempotente) os AEs de melhoria nas armas desarmadas do ator. */
async function syncManoplaUpgrades(actor: ActorLike): Promise<void> {
    const cfg = (CONFIG as unknown as { T20?: T20Config }).T20;
    const weaponMap = cfg?.upgrades?.weapon ?? {};
    if (!Object.keys(weaponMap).length) return;
    const localize = (s: string): string => game.i18n?.localize(s) ?? s;

    const items = [...(actor.items ?? [])] as ItemLike[];
    // melhorias desejadas (só de Manoplas EQUIPADAS) → fonte (uuid/img)
    const desired = new Map<string, { uuid?: string; img?: string }>();
    for (const m of items) {
        if (!isManopla(m) || !isManoplaEquipped(m)) continue;
        for (const k of getManoplaWeaponUpgradeKeys(m.system?.upgrades, weaponMap)) {
            if (!desired.has(k)) desired.set(k, { uuid: m.uuid, img: m.img });
        }
    }

    for (const uw of items.filter(isUnarmedWeapon) as WeaponItem[]) {
        const existing = (uw.effects?.contents ?? [])
            .filter(e => (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[APPLY_FLAG]);
        const byKey = new Map<string, string[]>();
        for (const e of existing) {
            const k = String((e.flags?.[MODULE_ID] as Record<string, unknown>)[APPLY_FLAG]);
            const arr = byKey.get(k) ?? [];
            arr.push(e.id ?? "");
            byKey.set(k, arr);
        }

        const toDelete: string[] = [];
        for (const [k, ids] of byKey) {
            if (!desired.has(k)) toDelete.push(...ids);              // melhoria não mais ativa
            else if (ids.length > 1) toDelete.push(...ids.slice(1)); // dedup (mantém 1)
        }
        const toCreate: object[] = [];
        for (const [k, src] of desired) {
            if (byKey.has(k)) continue;
            toCreate.push(buildManoplaUpgradeAE(k, weaponMap[k], uw.img ?? src.img, src.uuid, localize));
        }

        try {
            const del = toDelete.filter(Boolean);
            if (del.length) await uw.deleteEmbeddedDocuments?.("ActiveEffect", del, { render: false });
            if (toCreate.length) await uw.createEmbeddedDocuments?.("ActiveEffect", toCreate, { render: false });
            if (toCreate.length || del.length) {
                log(`Manopla: ataque desarmado sincronizado (+${toCreate.length} / −${del.length} melhorias).`);
            }
        } catch (err) {
            warn(`manopla-upgrades: falha ao sincronizar AEs no ataque desarmado:`, err);
        }
    }
}

// ── Setup / hooks ──────────────────────────────────────────────────────────────

function hookUserId(args: unknown[]): string | undefined {
    for (let i = args.length - 1; i >= 0; i--) if (typeof args[i] === "string") return args[i] as string;
    return undefined;
}
function isMyUser(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}
function characterParent(item: { parent?: unknown }): (ActorLike & { type?: string }) | null {
    const p = item.parent as (ActorLike & { type?: string }) | null;
    return p && p.type === "character" ? p : null;
}

export function setupManoplaUpgrades(): void {
    // Parte 1 — UI: aba de aprimoramentos mostra melhorias de arma.
    Hooks.on("renderItemSheet", (...args: unknown[]) => {
        const app = args[0] as { item?: ItemLike; object?: ItemLike; document?: ItemLike } | undefined;
        const item = app?.item ?? app?.object ?? app?.document;
        if (!isManopla(item)) return;
        const htmlArg = args[1] as { 0?: HTMLElement } | HTMLElement | undefined;
        const root = ((htmlArg as { 0?: HTMLElement })?.[0] ?? htmlArg) as ParentNode | undefined;
        if (!root || typeof root.querySelectorAll !== "function") return;
        try {
            const n = rebuildMelhoriaSelects(root, item!);
            if (n) log(`Manopla: ${n} slot(s) de melhoria exibindo aprimoramentos de arma.`);
        } catch (err) {
            warn(`manopla-upgrades: falha ao repopular melhorias:`, err);
        }
    });

    // Parte 2 — Mecânica: sincroniza AEs no ataque desarmado.
    Hooks.on("createItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        const actor = characterParent(item);
        if (actor && (isManopla(item) || isUnarmedWeapon(item))) void syncManoplaUpgrades(actor);
    });
    Hooks.on("deleteItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        const actor = characterParent(item);
        if (actor && isManopla(item)) void syncManoplaUpgrades(actor);
    });
    Hooks.on("updateItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isManopla(item)) return;
        const changes = args[1] as { system?: { upgrades?: unknown; equipado?: unknown; equipado2?: unknown } } | undefined;
        const ch = changes?.system;
        if (!ch || (ch.upgrades === undefined && ch.equipado === undefined && ch.equipado2 === undefined)) return;
        const actor = characterParent(item);
        if (actor) void syncManoplaUpgrades(actor);
    });

    // Sync inicial dos personagens que o usuário possui (corrige estados antigos).
    Hooks.once("ready", () => {
        const actors = (game.actors?.contents ?? []) as Array<ActorLike & { type?: string; isOwner?: boolean }>;
        for (const a of actors) {
            if (a.type === "character" && a.isOwner) void syncManoplaUpgrades(a);
        }
    });
}
