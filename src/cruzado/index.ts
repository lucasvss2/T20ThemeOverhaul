/**
 * Classe Cruzado (Clérigo variante) — mecânicas (Fase 2).
 *
 * O compêndio (classe + 7 poderes) é a Fase 1 (`packs-src/cruzado/`). Aqui ficam
 * as 4 mecânicas automatizadas:
 *
 * 1. **Presente dos Deuses** — checkbox na aba Aprimoramentos da arma marcando-a
 *    como o "presente" (flag `flags.t20-theme-overhaul.presenteDosDeuses`). NÃO
 *    ocupa os 4 slots de melhoria nem o slot de material. É a base p/ detectar o
 *    presente nas mecânicas 2 e 4.
 * 2. **Alma Guerreira** — com o presente EQUIPADO, ao entrar em combate, PV
 *    temporários = nível + Sabedoria (não acumula: pega o maior).
 * 3. **Oração Marcial** — ao usar o poder (gasta 5 PM nativo), aplica um AE buff
 *    "Oração Marcial" no conjurador (o poder concedido escolhido é manual).
 * 4. **Guerreiro Santificado** — com o presente equipado, −1 PM no custo de
 *    habilidades que custam mana, via AE `system.modificadores.custoPM = -1` no
 *    ator (modelo do upgrade `harmonized`). A 1ª parte (Ataque Especial como
 *    guerreiro nv 20) é manual.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

const GIFT_FLAG = "presenteDosDeuses";
const GS_AE_FLAG = "guerreiroSantificado";
const ORACAO_AE_FLAG = "oracaoMarcial";

const POWER_ALMA = "alma guerreira";
const POWER_ORACAO = "oracao marcial";
const POWER_GS = "guerreiro santificado";

// ── Helpers de detecção (puros/testáveis) ───────────────────────────────────────

interface ItemLike {
    id?: string | null;
    type?: string;
    name?: string;
    uuid?: string;
    img?: string;
    system?: { equipado?: unknown; equipado2?: { slot?: unknown } };
    flags?: Record<string, Record<string, unknown> | undefined>;
}
interface ActorLike {
    type?: string;
    items?: Iterable<ItemLike>;
    system?: {
        atributos?: { sab?: { value?: number } };
        attributes?: { nivel?: { value?: number }; pv?: { value?: number; temp?: number; max?: number } };
        nivel?: { value?: number };
    };
}

/** A arma está marcada como Presente dos Deuses? */
export function isGiftWeapon(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "arma") return false;
    return (item.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[GIFT_FLAG] === true;
}

/** Equipado: legacy (`system.equipado`) OU slot system (`equipado2.slot > 0`). */
export function isWeaponEquipped(item: ItemLike | null | undefined): boolean {
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

/** O ator tem um poder cujo nome normalizado é `normName`? */
export function actorHasPowerNamed(actor: ActorLike | null | undefined, normName: string): boolean {
    for (const it of actor?.items ?? []) {
        if (it.type === "poder" && normalizeCondName(it.name ?? "") === normName) return true;
    }
    return false;
}

/** O ator tem o Presente dos Deuses EQUIPADO? Retorna a arma ou null. */
export function findEquippedGift(actor: ActorLike | null | undefined): ItemLike | null {
    for (const it of actor?.items ?? []) {
        if (isGiftWeapon(it) && isWeaponEquipped(it)) return it;
    }
    return null;
}

/** Nível do PC (system.attributes.nivel.value, com fallbacks). */
export function actorLevel(actor: ActorLike | null | undefined): number {
    return Number(
        actor?.system?.attributes?.nivel?.value ??
        actor?.system?.nivel?.value ??
        0,
    ) || 0;
}

/** PV temporários da Alma Guerreira: nível + Sabedoria (mínimo 0). */
export function computeAlmaGuerreiraTempHP(actor: ActorLike | null | undefined): number {
    const lvl = actorLevel(actor);
    const sab = Number(actor?.system?.atributos?.sab?.value ?? 0) || 0;
    return Math.max(0, lvl + sab);
}

// ── Eleição de GM p/ mutações ───────────────────────────────────────────────────

function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter(u => u.isGM && u.active)
        .map(u => u.id)
        .sort();
    return activeGMs[0] === myId;
}

function combatStarted(): boolean {
    return Boolean((game.combat as unknown as { started?: boolean } | undefined)?.started);
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Mecânica 1: checkbox "Presente dos Deuses" na ficha da arma ──────────────────

const CHECKBOX_CLASS = "t20-presente-dos-deuses";

/** Injeta o checkbox na aba Aprimoramentos. Retorna true se injetou. */
export function injectGiftCheckbox(root: ParentNode, item: ItemLike): boolean {
    if (root.querySelector(`.${CHECKBOX_CLASS}`)) return false; // idempotente
    const tab = root.querySelector(".tab.enhancements");
    if (!tab) return false;
    const checked = isGiftWeapon(item) ? "checked" : "";
    const html =
        `<div class="form-group ${CHECKBOX_CLASS}">` +
        `<label><i class="fa-solid fa-hand-holding-heart"></i> Presente dos Deuses</label>` +
        `<div class="form-fields">` +
        `<input type="checkbox" class="${CHECKBOX_CLASS}-input" ${checked} ` +
        `title="Marca esta arma como o Presente dos Deuses do Cruzado (não ocupa slots de melhoria/material).">` +
        `</div>` +
        `<p class="notes">Não ocupa os slots de melhoria nem o de material. Base p/ Alma Guerreira e Guerreiro Santificado.</p>` +
        `</div>`;
    // Insere logo após o <h2> de "Aprimoramentos/Melhorias" (primeiro h2 da aba), senão no topo.
    const h2 = tab.querySelector("h2");
    if (h2) h2.insertAdjacentHTML("afterend", html);
    else (tab as Element).insertAdjacentHTML("afterbegin", html);

    const input = tab.querySelector<HTMLInputElement>(`.${CHECKBOX_CLASS}-input`);
    input?.addEventListener("change", () => { void setGiftFlag(item, input.checked); });
    return true;
}

interface GiftToggleItem {
    system?: { espacos?: number };
    getFlag?: (scope: string, key: string) => unknown;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Marca/desmarca a arma como Presente dos Deuses. Ao MARCAR, zera os espaços de
 * inventário (regra "não ocupa espaços") guardando o valor original em
 * `flags.<MODULE_ID>.espacosOrig`; ao DESMARCAR, restaura. Tudo num update só.
 */
async function setGiftFlag(item: ItemLike, val: boolean): Promise<void> {
    const it = item as unknown as GiftToggleItem;
    try {
        if (val) {
            const cur = Number(it.system?.espacos ?? 0) || 0;
            await it.update?.({
                [`flags.${MODULE_ID}.${GIFT_FLAG}`]: true,
                [`flags.${MODULE_ID}.espacosOrig`]: cur,
                "system.espacos": 0,
            });
        } else {
            const orig = Number(it.getFlag?.(MODULE_ID, "espacosOrig") ?? it.system?.espacos ?? 0) || 0;
            await it.update?.({
                [`flags.${MODULE_ID}.${GIFT_FLAG}`]: false,
                "system.espacos": orig,
            });
        }
    } catch (err) {
        warn(`cruzado: falha ao alternar Presente dos Deuses:`, err);
    }
}

// ── Mecânica 2: Alma Guerreira (PV temporários ao entrar em combate) ─────────────

interface ActorWithUpdate extends ActorLike {
    name?: string;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}

/** Concede os PV temporários da Alma Guerreira se elegível. Idempotente (max). */
export async function grantAlmaGuerreira(actor: ActorWithUpdate | null | undefined): Promise<boolean> {
    if (!actor) return false;
    if (!actorHasPowerNamed(actor, POWER_ALMA)) return false;
    if (!findEquippedGift(actor)) return false;
    const want = computeAlmaGuerreiraTempHP(actor);
    if (want <= 0) return false;
    const curTemp = Number(actor.system?.attributes?.pv?.temp ?? 0) || 0;
    if (curTemp >= want) return false; // não reduz PV temp já maior
    try {
        await actor.update?.({ "system.attributes.pv.temp": want });
        await ChatMessage.create({
            content:
                `<div class="t20-reaction-block" style="border-left:3px solid #c8a96e">` +
                `<div class="t20-reac-title"><i class="fa-solid fa-shield-heart"></i> Alma Guerreira</div>` +
                `<div class="t20-reac-line"><b>${esc(actor.name ?? "Cruzado")}</b> invoca o Presente dos Deuses e recebe <b>${want}</b> PV temporários (nível + Sabedoria).</div>` +
                `</div>`,
            speaker: { alias: actor.name ?? "Cruzado" } as never,
        });
        log(`Alma Guerreira: ${actor.name} recebeu ${want} PV temporários.`);
        return true;
    } catch (err) {
        warn(`cruzado: falha ao conceder Alma Guerreira:`, err);
        return false;
    }
}

interface CombatLike { combatants?: Iterable<{ actor?: ActorWithUpdate | null }> }

async function onCombatStartGrant(combat: CombatLike): Promise<void> {
    if (!isActiveGM()) return;
    for (const c of combat.combatants ?? []) {
        if (c.actor) await grantAlmaGuerreira(c.actor);
    }
}

// ── Mecânica 3: Oração Marcial (buff ao usar o poder) ────────────────────────────

function extractItemIdFromContent(content: string): string | null {
    const m = (content ?? "").match(/data-item-id="([^"]+)"/);
    return m ? m[1] : null;
}

interface MessageLike {
    content?: string;
    speaker?: { actor?: string; alias?: string };
    getFlag?: (scope: string, key: string) => unknown;
}

async function onOracaoMarcialCast(message: MessageLike): Promise<void> {
    const actor = game.actors?.get(message.speaker?.actor ?? "") as (ActorWithUpdate & {
        items?: { get?: (id: string) => ItemLike | undefined };
        createEmbeddedDocuments?: (t: string, d: object[]) => Promise<unknown>;
        effects?: { find?: (fn: (e: { name?: string }) => boolean) => unknown };
    }) | undefined;
    if (!actor) return;
    const itemId = extractItemIdFromContent(message.content ?? "");
    const item = itemId ? actor.items?.get?.(itemId) : undefined;
    if (!item || item.type !== "poder" || normalizeCondName(item.name ?? "") !== POWER_ORACAO) return;

    // Evita duplicar o buff se já houver um ativo.
    const already = actor.effects?.find?.((e) => normalizeCondName(e.name ?? "") === POWER_ORACAO);
    if (already) return;

    const effect = {
        name: "Oração Marcial",
        icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
        origin: item.uuid,
        duration: { seconds: 86400 }, // ~1 dia
        changes: [],
        flags: { [MODULE_ID]: { [ORACAO_AE_FLAG]: true }, tormenta20: { durationScene: false } },
    };
    try {
        await actor.createEmbeddedDocuments?.("ActiveEffect", [effect]);
        log(`Oração Marcial: buff aplicado em ${actor.name}.`);
    } catch (err) {
        warn(`cruzado: falha ao aplicar buff de Oração Marcial:`, err);
    }
}

// ── Mecânica 4: Guerreiro Santificado (−1 PM via custoPM com o presente equipado) ─

interface ActorForSync extends ActorWithUpdate {
    id?: string;
    isOwner?: boolean;
    effects?: { contents?: Array<{ id?: string | null; flags?: Record<string, Record<string, unknown> | undefined> }> };
    createEmbeddedDocuments?: (t: string, d: object[], c?: object) => Promise<unknown>;
    deleteEmbeddedDocuments?: (t: string, ids: string[], c?: object) => Promise<unknown>;
}

/** Deve o ator ter o efeito −1 PM ativo? (tem o poder + presente equipado) */
export function shouldHaveGuerreiroSantificado(actor: ActorLike | null | undefined): boolean {
    return actorHasPowerNamed(actor, POWER_GS) && !!findEquippedGift(actor);
}

/** Reconcilia (idempotente) o AE −1 PM no ator conforme elegibilidade. */
async function syncGuerreiroSantificado(actor: ActorForSync | null | undefined): Promise<void> {
    if (!actor) return;
    const existing = (actor.effects?.contents ?? [])
        .filter(e => (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[GS_AE_FLAG]);
    const want = shouldHaveGuerreiroSantificado(actor);
    try {
        if (want && existing.length === 0) {
            await actor.createEmbeddedDocuments?.("ActiveEffect", [{
                name: "Guerreiro Santificado (−1 PM)",
                icon: "icons/magic/holy/saint-glass-portrait-halo.webp",
                changes: [{ key: "system.modificadores.custoPM", value: "-1", mode: 2, priority: 0 }],
                transfer: false,
                flags: { [MODULE_ID]: { [GS_AE_FLAG]: true }, tormenta20: { durationScene: false } },
            }], { render: false });
            log(`Guerreiro Santificado: −1 PM ativado para ${actor.name}.`);
        } else if (!want && existing.length > 0) {
            await actor.deleteEmbeddedDocuments?.("ActiveEffect", existing.map(e => e.id ?? "").filter(Boolean), { render: false });
            log(`Guerreiro Santificado: −1 PM removido de ${actor.name}.`);
        } else if (want && existing.length > 1) {
            await actor.deleteEmbeddedDocuments?.("ActiveEffect", existing.slice(1).map(e => e.id ?? "").filter(Boolean), { render: false });
        }
    } catch (err) {
        warn(`cruzado: falha ao sincronizar Guerreiro Santificado:`, err);
    }
}

// ── Setup / hooks ────────────────────────────────────────────────────────────────

function hookUserId(args: unknown[]): string | undefined {
    for (let i = args.length - 1; i >= 0; i--) if (typeof args[i] === "string") return args[i] as string;
    return undefined;
}
function characterParent(item: { parent?: unknown }): ActorForSync | null {
    const p = item.parent as (ActorForSync & { type?: string }) | null;
    return p && p.type === "character" ? p : null;
}

export function setupCruzado(): void {
    // Mecânica 1 — checkbox na ficha da arma.
    Hooks.on("renderItemSheet", (...args: unknown[]) => {
        const app = args[0] as { item?: ItemLike; object?: ItemLike; document?: ItemLike } | undefined;
        const item = app?.item ?? app?.object ?? app?.document;
        if (!item || item.type !== "arma") return;
        const htmlArg = args[1] as { 0?: HTMLElement } | HTMLElement | undefined;
        const root = ((htmlArg as { 0?: HTMLElement })?.[0] ?? htmlArg) as ParentNode | undefined;
        if (!root || typeof root.querySelector !== "function") return;
        try { injectGiftCheckbox(root, item); }
        catch (err) { warn(`cruzado: falha ao injetar checkbox Presente dos Deuses:`, err); }
    });

    // Mecânica 2 — Alma Guerreira ao entrar em combate (GM eleito).
    Hooks.on("combatStart", (...args: unknown[]) => { void onCombatStartGrant(args[0] as CombatLike); });
    Hooks.on("createCombatant", (...args: unknown[]) => {
        if (!isActiveGM() || !combatStarted()) return;
        const combatant = args[0] as { actor?: ActorWithUpdate | null };
        if (combatant.actor) void grantAlmaGuerreira(combatant.actor);
    });
    // Invocar (equipar) o presente DURANTE o combate também concede.
    Hooks.on("updateItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isGiftWeapon(item)) return;
        const changes = args[1] as { system?: { equipado?: unknown; equipado2?: unknown } } | undefined;
        const ch = changes?.system;
        if (!ch || (ch.equipado === undefined && ch.equipado2 === undefined)) return;
        if (!isWeaponEquipped(item)) return;            // só ao equipar
        if (!isActiveGM() || !combatStarted()) return;
        const actor = characterParent(item);
        if (actor) void grantAlmaGuerreira(actor);
    });

    // Mecânica 3 — Oração Marcial: buff ao usar o poder (só o autor processa).
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as MessageLike;
        const m = message as { author?: { id?: string }; user?: { id?: string } | string };
        const authorId = m.author?.id
            ?? (typeof m.user === "object" ? m.user?.id : m.user);
        if (authorId !== game.user?.id) return;
        if (!/data-item-id=/.test(message.content ?? "")) return;
        void onOracaoMarcialCast(message);
    });

    // Mecânica 4 — Guerreiro Santificado: sincroniza o −1 PM ao equipar/desequipar
    // o presente, adicionar/remover o poder, e no ready.
    Hooks.on("updateItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isGiftWeapon(item)) return;
        const changes = args[1] as { system?: { equipado?: unknown; equipado2?: unknown } } | undefined;
        const ch = changes?.system;
        if (!ch || (ch.equipado === undefined && ch.equipado2 === undefined)) return;
        const actor = characterParent(item);
        if (actor) void syncGuerreiroSantificado(actor);
    });
    Hooks.on("updateItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        // arma marcada/desmarcada como presente (flag mudou)
        const changes = args[1] as { flags?: Record<string, unknown> } | undefined;
        if (item.type !== "arma" || changes?.flags === undefined) return;
        const actor = characterParent(item);
        if (actor) void syncGuerreiroSantificado(actor);
    });
    Hooks.on("createItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        const actor = characterParent(item);
        if (actor && (item.type === "poder" || item.type === "arma")) void syncGuerreiroSantificado(actor);
    });
    Hooks.on("deleteItem", (...args: unknown[]) => {
        if (!isMyUser(hookUserId(args))) return;
        const item = args[0] as ItemLike & { parent?: unknown };
        const actor = characterParent(item);
        if (actor && (item.type === "poder" || item.type === "arma")) void syncGuerreiroSantificado(actor);
    });

    Hooks.once("ready", () => {
        const actors = (game.actors?.contents ?? []) as Array<ActorForSync & { type?: string }>;
        for (const a of actors) {
            if (a.type === "character" && a.isOwner) void syncGuerreiroSantificado(a);
        }
    });

    log(`Cruzado: mecânicas ativas (Presente dos Deuses, Alma Guerreira, Oração Marcial, Guerreiro Santificado).`);
}

function isMyUser(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

/** Diagnóstico (API): estado de detecção do Cruzado p/ um ator. */
export function diagnoseCruzado(actor: ActorLike | null | undefined): Record<string, unknown> {
    const gift = findEquippedGift(actor);
    return {
        nivel: actorLevel(actor),
        sab: Number(actor?.system?.atributos?.sab?.value ?? 0) || 0,
        temAlmaGuerreira: actorHasPowerNamed(actor, POWER_ALMA),
        temOracaoMarcial: actorHasPowerNamed(actor, POWER_ORACAO),
        temGuerreiroSantificado: actorHasPowerNamed(actor, POWER_GS),
        presenteEquipado: gift ? (gift.name ?? true) : null,
        almaGuerreiraTempHP: computeAlmaGuerreiraTempHP(actor),
        guerreiroSantificadoAtivo: shouldHaveGuerreiroSantificado(actor),
    };
}
