/**
 * Area-spell engine — reusable scaffolding for "place a grid, everyone inside is
 * a target, roll resistance" spells.
 *
 * Generalises the pattern previously hand-written in `coluna-de-chamas.ts` and
 * the one-shot branch of `bola-de-fogo.ts`. A feature describes its spell with
 * `registerAreaSpell(def)`; the engine wires the shared hooks once and routes by
 * spell name:
 *
 *   1. `createChatMessage` — detects the cast (by normalized name `includes`),
 *      sums the damage rolls, resolves the CD (HTML > stored) and resistance
 *      text, and registers a pending cast for the caster.
 *   2. `createMeasuredTemplate` — the caster claims the T20-created template by
 *      writing our flags. For `anchorToCaster` spells (cone/self) the template
 *      origin is snapped to the caster token's centre in the same update, so the
 *      grid always emanates from the conjurer (the player only aims direction).
 *   3. `updateMeasuredTemplate` — once our flag lands, the caster dispatches the
 *      resistance modal to every token inside the area (any shape, via
 *      `tokensInAreaTemplate`). The original `messageId` is forwarded so the
 *      modal's curated condition auto-apply (`conditions-map`) still fires.
 *   4. cleanup — `after-resolve` removes the grid (and its autoanim) once every
 *      target finishes the modal (with a safety fallback); `linger` removes it
 *      after a fixed delay.
 *
 * Conditions caused by the spell are NOT handled here — they flow through the
 * resistance modal's `conditions-map` integration (keyed by spell name +
 * selected aprimoramentos), so adding a curated map entry is all that a new
 * condition-causing area spell needs.
 *
 * Shapes supported: cone, circle (sphere/cylinder/radius), ray (line/wall),
 * rect (cube/square) — see `_shared/canvas-geometry.ts`.
 */

import { MODULE_ID } from "@/constants";
import {
    extractSpellName,
    normalizeCondName,
    getMsgAuthorId,
    parseResistance,
    extractCD,
    getTargetUserId,
    dispatchSpellResistanceToTarget,
} from "@/spell-resistance/index";
import type { SpellResistPreRollRequest } from "@/spell-resistance/types";
import { tokensInAreaTemplate, getTokenCenterPx } from "@/_shared";
import { onSocketReady } from "@/socket";
import { log, warn } from "@/utils/logging";

// ── Public API ───────────────────────────────────────────────────────────────

export type AreaCleanup = { mode: "after-resolve"; fallbackMs?: number } | { mode: "linger"; ms: number };

export interface AreaSpellDef {
    /** Flag value identifying our claim on the template, e.g. "explosao-de-chamas". */
    key: string;
    /** Normalized spell name for detection via `includes` (keep spaces, no accents). */
    nameNormalized: string;
    /** Display name shown in the resistance modal / notifications. */
    displayName: string;
    /** Fallback resistance text when the item has none. */
    defaultResistTxt?: string;
    /** Snap the template origin to the caster token's centre (cone/self spells). */
    anchorToCaster?: boolean;
    /** How/when the grid is removed. Defaults to a 3.5s linger. */
    cleanup?: AreaCleanup;
}

const FLAG_SPELL          = "spell";
const PENDING_WINDOW_MS   = 30_000;
const DEFAULT_LINGER_MS   = 3_500;
const RESOLVE_FALLBACK_MS = 90_000;
const EMPTY_LINGER_MS     = 2_500;
const SOCKET_RESOLVED     = "area-spell/resolved";

const _defs = new Map<string, AreaSpellDef>();
let _hooksInstalled = false;

/** Register an area spell with the engine. Idempotent per `key`. */
export function registerAreaSpell(def: AreaSpellDef): void {
    _defs.set(def.key, def);
    installHooks();
}

// ── State ─────────────────────────────────────────────────────────────────────

type PendingCast = {
    defKey:        string;
    casterActorId: string;
    casterTokenId: string;
    casterName:    string;
    casterUserId:  string;
    messageId:     string;
    damageTotal:   number;
    damageFormula: string;
    cd:            number;
    resistTxt:     string;
    spellName:     string;
    ts:            number;
};
// One pending cast per caster (a user can't be mid-placement on two area spells).
const _pendingByUser = new Map<string, PendingCast>();

type TplLike = {
    id: string; uuid: string;
    t?: string; x: number; y: number; distance: number;
    direction?: number; angle?: number; width?: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
    delete?(): Promise<unknown>;
};

// Resolution tracking (after-resolve cleanup). Lives on the caster client.
type Resolution = { remaining: number; tpl: TplLike; timer: ReturnType<typeof setTimeout> | null };
const _resolutions = new Map<string, Resolution>();

// ── Helpers ────────────────────────────────────────────────────────────────────

function matchDef(message: ChatMessage): AreaSpellDef | null {
    const name = normalizeCondName(extractSpellName(message));
    if (!name) return null;
    for (const def of _defs.values()) {
        if (name.includes(def.nameNormalized)) return def;
    }
    return null;
}

function buildFlags(meta: PendingCast): Record<string, unknown> {
    return {
        [FLAG_SPELL]:   meta.defKey,
        defKey:         meta.defKey,
        casterActorId:  meta.casterActorId,
        casterTokenId:  meta.casterTokenId,
        casterName:     meta.casterName,
        casterUserId:   meta.casterUserId,
        messageId:      meta.messageId,
        damageTotal:    meta.damageTotal,
        damageFormula:  meta.damageFormula,
        cd:             meta.cd,
        resistTxt:      meta.resistTxt,
        spellName:      meta.spellName,
        createdAtMs:    Date.now(),
        dispatched:     false,
    };
}

/** Centre (px) of the caster's token, for anchoring self/cone templates. */
function casterTokenCenter(tokenId: string): { x: number; y: number } | null {
    const tok = canvas?.tokens?.get(tokenId);
    if (!tok) return null;
    return getTokenCenterPx(tok);
}

async function claimTemplate(tplDoc: TplLike, pending: PendingCast, def: AreaSpellDef): Promise<void> {
    const update: Record<string, unknown> = { [`flags.${MODULE_ID}`]: buildFlags(pending) };
    // Anchor cone/self spells to the caster token centre (preserve the user's aim).
    if (def.anchorToCaster && pending.casterTokenId) {
        const c = casterTokenCenter(pending.casterTokenId);
        if (c) { update["x"] = c.x; update["y"] = c.y; }
    }
    try {
        await tplDoc.update(update);
    } catch (err) {
        warn(`Area engine (${def.key}): falha ao reclamar template:`, err);
    }
}

async function removeTemplate(tpl: TplLike): Promise<void> {
    try {
        await tpl.delete?.();
    } catch (err) {
        warn(`Area engine: falha ao remover template:`, err);
    }
}

/** Called on the caster client whenever ONE target finishes the resistance modal. */
function onTargetResolved(castId: string): void {
    const res = _resolutions.get(castId);
    if (!res) return;
    res.remaining -= 1;
    if (res.remaining > 0) return;
    if (res.timer) clearTimeout(res.timer);
    _resolutions.delete(castId);
    void removeTemplate(res.tpl);
}

// ── Dispatch ────────────────────────────────────────────────────────────────────

async function dispatchArea(tplDoc: TplLike, def: AreaSpellDef): Promise<void> {
    const flags = tplDoc.flags?.[MODULE_ID];
    if (!flags || flags[FLAG_SPELL] !== def.key || flags["dispatched"] === true) return;
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}.dispatched`]: true });
    } catch (err) {
        warn(`Area engine (${def.key}): falha ao marcar dispatched:`, err);
    }

    const casterActorId = (flags["casterActorId"] as string) ?? "";
    const casterTokenId = (flags["casterTokenId"] as string) ?? "";
    const casterName    = (flags["casterName"]    as string) ?? "Lançador";
    const casterUserId  = (flags["casterUserId"]  as string) ?? "";
    const messageId     = (flags["messageId"]     as string) ?? "";
    const damageTotal   = (flags["damageTotal"]   as number) ?? 0;
    const damageFormula = (flags["damageFormula"] as string) ?? "";
    const cd            = (flags["cd"]            as number) ?? 0;
    const resistTxt     = (flags["resistTxt"]     as string) ?? def.defaultResistTxt ?? "Reflexos reduz à metade";
    const spellName     = (flags["spellName"]     as string) ?? def.displayName;
    const { skill, outcome } = parseResistance(resistTxt);

    const cleanup: AreaCleanup = def.cleanup ?? { mode: "linger", ms: DEFAULT_LINGER_MS };
    const afterResolve = cleanup.mode === "after-resolve";

    const tokens = tokensInAreaTemplate({
        t: tplDoc.t, x: tplDoc.x, y: tplDoc.y, distance: tplDoc.distance,
        direction: tplDoc.direction, angle: tplDoc.angle, width: tplDoc.width,
    });

    type RandomIDFn = () => string;
    const rid = (globalThis as unknown as { randomID?: RandomIDFn }).randomID
             ?? (() => Math.random().toString(36).slice(2, 18));

    let dispatched = 0;
    for (const token of tokens) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        // Self/cone spells emanate from the caster — never target the caster token.
        if (def.anchorToCaster && (token.id === casterTokenId || targetActor.id === casterActorId)) continue;

        const targetUserId = getTargetUserId(targetActor);
        if (!targetUserId) {
            ui.notifications?.warn(`${def.displayName}: nenhum usuário ativo para ${targetActor.name}.`);
            continue;
        }
        const preReq: SpellResistPreRollRequest = {
            type:              "spell-resist-preroll",
            requestId:         rid(),
            targetUserId,
            casterUserId,
            targetActorId:     targetActor.id,
            targetActorUuid:   targetActor.uuid,
            casterName,
            spellName,
            resistTxt,
            resistSkill:       skill,
            resistOutcome:     outcome,
            cd,
            messageId,
            damageTotal,
            damageFormula,
            isHeal:            false,
            maxHealValue:      0,
            removeFadiga:      false,
            truqueAtivo:       false,
            conditions:        [],
            customEffectNames: [],
            ...(afterResolve
                ? { resolveNotify: { socketName: SOCKET_RESOLVED, userId: casterUserId, payload: tplDoc.id } }
                : {}),
        };
        dispatchSpellResistanceToTarget(preReq);
        dispatched++;
    }

    if (dispatched === 0) {
        ui.notifications?.info(`${def.displayName}: nenhum alvo na área (${damageTotal} de dano rolado).`);
        setTimeout(() => void removeTemplate(tplDoc), afterResolve ? EMPTY_LINGER_MS : (cleanup.mode === "linger" ? cleanup.ms : DEFAULT_LINGER_MS));
        return;
    }

    ui.notifications?.info(`${def.displayName}: ${damageTotal} de dano em ${dispatched} alvo(s).`);

    if (afterResolve) {
        const fallback = cleanup.fallbackMs ?? RESOLVE_FALLBACK_MS;
        const timer = setTimeout(() => {
            if (!_resolutions.has(tplDoc.id)) return;
            _resolutions.delete(tplDoc.id);
            void removeTemplate(tplDoc);
            warn(`Area engine (${def.key}): fallback de tempo — grid removido sem todos responderem.`);
        }, fallback);
        _resolutions.set(tplDoc.id, { remaining: dispatched, tpl: tplDoc, timer });
    } else {
        setTimeout(() => void removeTemplate(tplDoc), cleanup.ms);
    }
}

// ── Hooks (installed once) ───────────────────────────────────────────────────

function installHooks(): void {
    if (_hooksInstalled) return;
    _hooksInstalled = true;

    onSocketReady((socket) => {
        socket.register(SOCKET_RESOLVED, (...args: unknown[]) => {
            const castId = args[0] as string;
            if (castId) onTargetResolved(castId);
        });
    });

    // 1. Detect the cast (only the author processes).
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        const uid = getMsgAuthorId(message);
        if (uid !== game.user?.id) return;
        const def = matchDef(message);
        if (!def) return;

        const itemData = message.getFlag("tormenta20", "itemData") as Record<string, unknown> | undefined;
        if (!itemData) return;

        const dmgRolls = (message.rolls ?? []).filter(
            r => (r.options as Record<string, unknown>)?.["type"] === "damage",
        );
        if (dmgRolls.length === 0) {
            warn(`${def.displayName} castada mas sem damage roll na msg.`);
            return;
        }
        const damageTotal   = dmgRolls.reduce((s, r) => s + (r.total ?? 0), 0);
        const damageFormula = dmgRolls.map(r => r.formula).filter(Boolean).join(" + ");

        const resist = itemData["resistencia"] as Record<string, unknown> | undefined;
        let cd = Number(resist?.["cd"] ?? 0);
        const cdFromHtml = extractCD(message);
        if (cdFromHtml > 0) cd = cdFromHtml; // HTML inclui todos os bônus de poder
        const resistTxt = String(resist?.["txt"] ?? def.defaultResistTxt ?? "Reflexos reduz à metade");

        _pendingByUser.set(uid, {
            defKey:        def.key,
            casterActorId: message.speaker?.actor ?? "",
            casterTokenId: message.speaker?.token ?? "",
            casterName:    message.speaker?.alias ?? "Lançador",
            casterUserId:  uid,
            messageId:     message.id,
            damageTotal,
            damageFormula,
            cd,
            resistTxt,
            spellName:     def.displayName,
            ts:            Date.now(),
        });
    });

    // 2. T20 created the area template → the author claims it.
    Hooks.on("createMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc = args[0] as TplLike & { user?: string | { id?: string }; author?: { id?: string } };
        const triggerUserId = typeof args[2] === "string" ? (args[2] as string) : undefined;
        const currentUid = game.user?.id;
        if (!currentUid) return;
        if (tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL]) return; // already claimed (any feature)

        const authorUid =
            tplDoc.author?.id
            ?? (typeof tplDoc.user === "string" ? tplDoc.user : tplDoc.user?.id)
            ?? triggerUserId;
        if (authorUid !== currentUid) return;

        const pending = _pendingByUser.get(currentUid);
        if (!pending || Date.now() - pending.ts >= PENDING_WINDOW_MS) return;
        const def = _defs.get(pending.defKey);
        if (!def) return;
        _pendingByUser.delete(currentUid);
        void claimTemplate(tplDoc, pending, def);
    });

    // 3. Flag just landed → the caster dispatches resistance per target.
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc  = args[0] as TplLike;
        const changes = args[1] as Record<string, unknown> | undefined;
        const flagKey = tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] as string | undefined;
        if (!flagKey) return;
        const def = _defs.get(flagKey);
        if (!def) return;
        if (tplDoc.flags?.[MODULE_ID]?.["dispatched"] === true) return;
        const changedFlags = (changes?.["flags"] as Record<string, unknown> | undefined)?.[MODULE_ID];
        if (!changedFlags) return;
        if (tplDoc.flags?.[MODULE_ID]?.["casterUserId"] !== game.user?.id) return;
        void dispatchArea(tplDoc, def);
    });

    log(`Area-spell engine hooks installed.`);
}
