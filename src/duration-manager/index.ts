/**
 * Duration manager — automatic expiry of buffs & conditions in combat.
 *
 * Tags managed ActiveEffects with `flags.<MODULE_ID>.dur` (see types.ts) and
 * drives their lifecycle:
 *  - Conditions added manually (token HUD) prompt for a duration (default 1
 *    round); spells/buffs are auto-classified from their data + source spell.
 *  - "In combat" = an encounter is started (`game.combat.started`). Round/scene
 *    durations only count while an encounter is running, and they begin counting
 *    when the encounter starts (item 4) — not at cast time, if cast earlier.
 *  - Outside an encounter nothing expires automatically (item 3).
 *  - "day" durations expire when ≥1 in-game day passes, or via the manual
 *    "Descanso" action in the skills-menu. "indeterminate" is manual-only.
 *  - "sustained" effects survive the encounter; at encounter end the caster is
 *    asked whether to drop concentration.
 *
 * All mutations run on the elected active GM (`isActiveGM()`), except the manual
 * HUD prompt which runs on the user who toggled the condition.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { isActiveGM, escHtml } from "@/_shared";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { getSocket, onSocketReady } from "@/socket";
import { classifyDuration, isDerivedConditionOrigin, type ClassifyResult } from "./classify";
import { DUR_FLAG, type DurData } from "./types";
import { promptDuration } from "./hud";
import DUR_STYLES from "./duration.css?inline";

const DUR_STYLES_ID = "t20-duration-styles";
const SECONDS_PER_DAY = 86_400;
const SOCKET_SUSTAIN_PROMPT = "duration/sustain-prompt";

// ── Runtime shapes (loosely-typed Foundry docs) ───────────────────────────────

type EffectDoc = FoundryItemEffect & {
    uuid?: string;
    statuses?: Set<string> | string[];
    duration?: { type?: string | null; rounds?: number | null; seconds?: number | null };
    parent?: FoundryActor;
};

interface CombatLike {
    id: string;
    started?: boolean;
    combatant?: { tokenId?: string; actor?: FoundryActor | null } | null;
    combatants?: { contents?: Array<{ tokenId?: string; actor?: FoundryActor | null }> };
}

// ── Flag helpers ───────────────────────────────────────────────────────────────

function getDur(eff: EffectDoc): DurData | null {
    const f = eff.flags?.[MODULE_ID] as Record<string, unknown> | undefined;
    const d = f?.[DUR_FLAG] as DurData | undefined;
    return d?.managed ? d : null;
}

function hasAnyModuleFlag(eff: EffectDoc): boolean {
    const f = eff.flags?.[MODULE_ID] as Record<string, unknown> | undefined;
    return !!f && Object.keys(f).length > 0;
}

async function writeDur(eff: EffectDoc, dur: DurData): Promise<void> {
    try {
        await eff.update({ [`flags.${MODULE_ID}.${DUR_FLAG}`]: dur });
    } catch (e) {
        warn("duration: falha ao gravar flag", e);
    }
}

// ── Effect introspection ────────────────────────────────────────────────────────

function effStatuses(eff: EffectDoc): string[] {
    const s = eff.statuses;
    if (!s) return [];
    return Array.isArray(s) ? s : Array.from(s);
}

function sceneFlag(eff: EffectDoc): boolean {
    const f = eff.flags?.["tormenta20"] as { durationScene?: unknown } | undefined;
    return f?.durationScene === true;
}

/** "Efeitos de Uso": T20 applies these only during a roll — never durational. */
function isOnUseEffect(eff: EffectDoc): boolean {
    const f = eff.flags?.["tormenta20"] as { onuse?: unknown } | undefined;
    return f?.onuse === true;
}

/** Genuine, finite `duracao.units` we auto-manage for status-less buffs. */
const FINITE_BUFF_UNITS = new Set(["round", "turn", "scene", "sust", "day"]);

/**
 * A status-less BUFF is auto-managed ONLY when it carries a genuine finite
 * duration: a real spell/power `duracao.units` (round/turn/scene/sust/day)
 * resolved via origin, or a real turns-based effect duration.
 *
 * We deliberately do NOT trust `units: "inst"/"perm"/"special"` nor the bare
 * `durationScene` flag: passive powers default to `duracao.units: "inst"`
 * (e.g. Insolência, Golpista Divino, Resistência Elemental — permanent class/
 * racial features), and `durationScene` is an unreliable T20 default that also
 * lands on passive item/actor features. Trusting either previously tagged those
 * passives as "scene" and DELETED them at encounter end (deleteCombat).
 */
export function hasFiniteBuffDuration(units: string | null | undefined, effDurationType?: string | null): boolean {
    return FINITE_BUFF_UNITS.has((units ?? "").toLowerCase()) || effDurationType === "turns";
}

/** Resolve the source spell info from the effect `origin` (owned-item UUID). */
function originInfo(eff: EffectDoc): {
    units?: string;
    value?: number;
    casterActorId?: string;
} {
    const origin = eff.origin;
    if (!origin) return {};
    try {
        const doc = fromUuidSync(origin) as unknown as
            | {
                  system?: { duracao?: { units?: string; value?: number } };
                  actor?: { id?: string } | null;
                  parent?: { id?: string } | null;
              }
            | null;
        const d = doc?.system?.duracao;
        const actorId = doc?.actor?.id ?? doc?.parent?.id;
        return { units: d?.units, value: d?.value, casterActorId: actorId ?? undefined };
    } catch {
        return {};
    }
}

function worldTime(): number {
    return Number(game.time?.worldTime ?? 0);
}

function activeCombat(): CombatLike | null {
    const c = game.combat as unknown as CombatLike | undefined;
    return c?.started ? c : null;
}

// ── Build / anchor DurData ──────────────────────────────────────────────────────

function toDur(c: ClassifyResult, source: DurData["source"], label?: string): DurData {
    const dur: DurData = { managed: true, kind: c.kind, source };
    if (label) dur.label = label;
    if (c.kind === "rounds") dur.rounds = c.rounds ?? 1;
    return dur;
}

/** Mutates `dur` in place to begin counting against a running combat. */
function anchor(dur: DurData, combatId: string): void {
    if (dur.combatId) return;
    if (dur.kind === "day" || dur.kind === "indeterminate") return;
    dur.combatId = combatId;
    if (dur.kind === "rounds") dur.remaining = dur.rounds ?? 1;
}

// ── Combatant / actor resolution ────────────────────────────────────────────────

function resolveCombatantActor(c: { tokenId?: string; actor?: FoundryActor | null } | null | undefined): FoundryActor | null {
    if (!c) return null;
    if (c.tokenId) {
        const tok = (canvas as unknown as { tokens?: { get(id: string): { actor?: FoundryActor | null } | undefined } }).tokens?.get(c.tokenId);
        if (tok?.actor) return tok.actor;
    }
    return c.actor ?? null;
}

function combatActors(combat: CombatLike): FoundryActor[] {
    const seen = new Set<string>();
    const out: FoundryActor[] = [];
    for (const c of combat.combatants?.contents ?? []) {
        const actor = resolveCombatantActor(c);
        const key = c.tokenId ?? actor?.id;
        if (!actor || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(actor);
    }
    return out;
}

function managedEffects(actor: FoundryActor): EffectDoc[] {
    return ((actor.effects?.contents ?? []) as EffectDoc[]).filter((e) => getDur(e));
}

// ── Expiry / removal ─────────────────────────────────────────────────────────────

async function removeManaged(actor: FoundryActor, eff: EffectDoc, dur: DurData, reason: string): Promise<void> {
    try {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [eff.id], { render: false });
        log(`duration: removido "${dur.label ?? eff.name}" de ${actor.name} (${reason}).`);
    } catch (e) {
        warn("duration: falha ao remover effect", e);
    }
}

async function postExpiry(actorName: string, label: string, successorLabel?: string): Promise<void> {
    await ChatMessage.create({
        content:
            `<div style="border-left:3px solid #c8a96e;padding:5px 10px;">` +
            `<div style="color:#c8a96e;font-weight:700;letter-spacing:0.05em;">⏱️ ${escHtml(label)} expirou</div>` +
            `<div style="color:#9a8e7a;font-size:0.85em;">${escHtml(actorName)}` +
            (successorLabel ? ` — agora <b style="color:#c8a96e;">${escHtml(successorLabel)}</b>` : "") +
            `</div></div>`,
    });
}

function statusName(statusId: string): string {
    const list = (CONFIG as { statusEffects?: Array<{ id: string; name?: string; label?: string }> }).statusEffects ?? [];
    const s = list.find((e) => e.id === statusId);
    const raw = s?.name ?? s?.label ?? statusId;
    return game.i18n?.localize(raw) ?? raw;
}

/**
 * Aplica a condição SUCESSORA (`dur.then`) quando a condição base expira —
 * ex.: Amedrontar (Apavorado → Abalado cena), Sono em combate (Exausto →
 * Fatigado cena). Rola a fórmula de rodadas se houver, registra a duração pro
 * próprio manager (via `expected`, evitando o prompt) e liga o status.
 */
async function applySuccessor(actor: FoundryActor, then: NonNullable<DurData["then"]>): Promise<string | undefined> {
    const withToggle = actor as FoundryActor & {
        toggleStatusEffect?: (id: string, opts?: Record<string, unknown>) => Promise<void>;
    };
    if (typeof withToggle.toggleStatusEffect !== "function") return undefined;
    let rounds = then.rounds;
    if (then.formula) {
        try { const r = new Roll(then.formula); await r.evaluate(); rounds = r.total ?? 1; } catch { rounds = 1; }
    }
    const dur: DurData = { managed: true, kind: then.durKind, source: "spell", label: statusName(then.statusId) };
    if (then.durKind === "rounds") dur.rounds = rounds ?? 1;
    registerExpectedCondition(actor.id, then.statusId, dur);
    try {
        await withToggle.toggleStatusEffect(then.statusId, { active: true });
    } catch (e) { warn("duration: falha ao aplicar condição sucessora", e); return undefined; }
    const suffix = then.durKind === "rounds" ? ` (${dur.rounds} rod.)` : then.durKind === "scene" ? " (cena)" : "";
    return `${statusName(then.statusId)}${suffix}`;
}

// ── Suppression map (spell flow applies conditions with a known duration) ────────

const expected = new Map<string, DurData>();

function expKey(actorId: string, statusId: string): string {
    return `${actorId}:${statusId}`;
}

/**
 * Called by the spell-resistance flow BEFORE applying a condition, so the
 * `createActiveEffect` handler tags it with the spell's duration instead of
 * prompting the user. Entry auto-expires if the create never fires.
 */
export function registerExpectedCondition(actorId: string, statusId: string, dur: DurData): void {
    const k = expKey(actorId, statusId);
    expected.set(k, dur);
    setTimeout(() => expected.delete(k), 4000);
}

// ── createActiveEffect: classify + tag ───────────────────────────────────────────

async function applyClassified(eff: EffectDoc, dur: DurData): Promise<void> {
    if (dur.kind === "day" && dur.startWorldTime == null) dur.startWorldTime = worldTime();
    const combat = activeCombat();
    if (combat) anchor(dur, combat.id);
    await writeDur(eff, dur);
}

async function onCreateEffect(eff: EffectDoc, userId: string): Promise<void> {
    if (userId !== game.user?.id) return; // only the initiating client handles it
    if (getDur(eff)) return; // already managed
    if (hasAnyModuleFlag(eff)) return; // owned by another subsystem (area spells, etc.)
    const actor = eff.parent;
    if (!actor || !actor.effects) return; // only actor-owned effects
    if (eff.transfer) return; // passive item-transferred features — not managed
    if (isOnUseEffect(eff)) return; // "Efeitos de Uso" (onuse) — roll-time only, never durational
    // Derived/linked conditions (origin = another ActiveEffect) cascade with
    // their parent — T20 removes them when the parent goes. Never manage/prompt.
    if (isDerivedConditionOrigin(eff.origin)) return;

    const statuses = effStatuses(eff);
    const isCondition = statuses.length > 0;
    const info = originInfo(eff);

    // 1) Spell-applied condition with a registered duration → no prompt.
    if (isCondition) {
        for (const sid of statuses) {
            const got = expected.get(expKey(actor.id, sid));
            if (got) {
                expected.delete(expKey(actor.id, sid));
                if (got.kind === "sustained" && !got.casterActorId) got.casterActorId = info.casterActorId;
                await applyClassified(eff, got);
                refreshSkillsMenu();
                return;
            }
        }
    }

    // 2) Condition from a spell card (has spell origin) → auto-classify silently.
    if (isCondition && info.units) {
        const c = classifyDuration({
            effDuration: eff.duration,
            durationSceneFlag: sceneFlag(eff),
            parentUnits: info.units,
            parentValue: info.value,
        });
        const dur = toDur(c, "spell", eff.name);
        if (c.kind === "sustained") dur.casterActorId = info.casterActorId;
        await applyClassified(eff, dur);
        refreshSkillsMenu();
        return;
    }

    // 3) Manually-toggled condition (no origin) → prompt for duration.
    if (isCondition) {
        const choice = await promptDuration(eff.name);
        await applyClassified(eff, toDur(choice, "manual", eff.name));
        refreshSkillsMenu();
        return;
    }

    // 4) Buff (no statuses). Manage ONLY with a genuine finite duration — see
    // hasFiniteBuffDuration for why "inst"/"perm"/durationScene are ignored.
    if (!hasFiniteBuffDuration(info.units, eff.duration?.type)) return; // passive/permanent feature — leave it alone
    const c = classifyDuration({
        effDuration: eff.duration,
        durationSceneFlag: sceneFlag(eff),
        parentUnits: info.units,
        parentValue: info.value,
    });
    // Nothing timeable after classification → don't manage.
    if (c.kind === "indeterminate") return;
    const dur = toDur(c, "spell", eff.name);
    if (c.kind === "sustained") dur.casterActorId = info.casterActorId;
    await applyClassified(eff, dur);
    refreshSkillsMenu();
}

// ── Combat lifecycle ─────────────────────────────────────────────────────────────

/** Anchor every not-yet-counting managed effect on the combatants (item 4). */
async function anchorCombat(combat: CombatLike): Promise<void> {
    if (!isActiveGM() || !combat?.id) return;
    for (const actor of combatActors(combat)) {
        for (const eff of managedEffects(actor)) {
            const dur = getDur(eff)!;
            if (dur.combatId) continue;
            if (dur.kind === "day" || dur.kind === "indeterminate") continue;
            anchor(dur, combat.id);
            await writeDur(eff, dur);
        }
    }
    refreshSkillsMenu();
}

/** Decrement round-durations at the start of the affected token's turn. */
async function onTurnChange(combat: CombatLike): Promise<void> {
    if (!isActiveGM() || !combat?.started) return;
    const actor = resolveCombatantActor(combat.combatant);
    if (!actor) return;
    for (const eff of managedEffects(actor)) {
        const dur = getDur(eff)!;
        if (dur.kind !== "rounds" || dur.combatId !== combat.id) continue;
        const rem = (dur.remaining ?? dur.rounds ?? 1) - 1;
        if (rem <= 0) {
            await removeManaged(actor, eff, dur, "expirou");
            // Encadeamento: ao expirar, aplica a condição sucessora (se houver).
            const successorLabel = dur.then ? await applySuccessor(actor, dur.then) : undefined;
            void postExpiry(actor.name, dur.label ?? eff.name, successorLabel);
        } else {
            dur.remaining = rem;
            await writeDur(eff, dur);
        }
    }
    refreshSkillsMenu();
}

/** At encounter end: clear scene/round effects; ask the caster about sustained. */
async function onCombatEnd(combat: CombatLike): Promise<void> {
    if (!isActiveGM()) return;
    for (const actor of combatActors(combat)) {
        for (const eff of managedEffects(actor)) {
            const dur = getDur(eff)!;
            if (dur.kind === "scene" || dur.kind === "rounds") {
                await removeManaged(actor, eff, dur, "fim do encontro");
            } else if (dur.kind === "sustained") {
                await resolveSustainedAtEnd(actor, eff, dur);
            }
        }
    }
    refreshSkillsMenu();
}

// ── Sustained: ask the caster whether to drop concentration ──────────────────────

function activeOwnerUserId(actor: FoundryActor | null | undefined): string | null {
    if (!actor) return null;
    const owners = (game.users?.contents ?? []).filter(
        (u) => !u.isGM && u.active && (actor.ownership?.[u.id] ?? 0) >= 3,
    );
    return owners[0]?.id ?? null;
}

function sustainDialog(spell: string, targetName: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (v: boolean): void => {
            if (done) return;
            done = true;
            resolve(v);
        };
        new Dialog(
            {
                title: "Concentração",
                content:
                    `<p>O encontro terminou. Encerrar a concentração de ` +
                    `<b>${escHtml(spell)}</b>${targetName ? ` (em ${escHtml(targetName)})` : ""}?</p>`,
                buttons: {
                    end: { icon: '<i class="fas fa-hand"></i>', label: "Encerrar", callback: () => finish(true) },
                    keep: { icon: '<i class="fas fa-infinity"></i>', label: "Manter", callback: () => finish(false) },
                },
                default: "keep",
                close: () => finish(false),
            },
            { classes: ["t20-dialog"], width: 380 },
        ).render(true);
    });
}

async function resolveSustainedAtEnd(actor: FoundryActor, eff: EffectDoc, dur: DurData): Promise<void> {
    const caster = dur.casterActorId ? game.actors?.get(dur.casterActorId) : null;
    const ownerUid = activeOwnerUserId(caster ?? actor);
    const label = dur.label ?? eff.name;
    let end = false;
    try {
        if (ownerUid && ownerUid !== game.user?.id) {
            end = !!(await getSocket()?.executeAsUser(SOCKET_SUSTAIN_PROMPT, ownerUid, { spell: label, target: actor.name }));
        } else {
            end = await sustainDialog(label, actor.name);
        }
    } catch {
        end = false;
    }
    if (end) {
        await removeManaged(actor, eff, dur, "concentração encerrada");
    } else {
        dur.combatId = null;
        await writeDur(eff, dur);
    }
}

// ── Day expiry (world-time) + manual rest ────────────────────────────────────────

/**
 * Every actor that could carry a managed effect: world/linked actors PLUS the
 * synthetic actors of UNLINKED tokens on the canvas. `game.actors.contents`
 * alone misses unlinked NPC tokens, whose effects live on the token-synthetic
 * actor (classic v13 gotcha — `game.actors.get` never reflects them).
 */
function relevantActors(): FoundryActor[] {
    const seen = new Set<string>();
    const out: FoundryActor[] = [];
    for (const actor of game.actors?.contents ?? []) {
        if (actor.id && !seen.has(actor.id)) {
            seen.add(actor.id);
            out.push(actor);
        }
    }
    type Placeable = { document?: { actorLink?: boolean }; id?: string; actor?: FoundryActor | null };
    const tokens = (canvas as unknown as { tokens?: { placeables?: Placeable[] } }).tokens?.placeables ?? [];
    for (const tok of tokens) {
        // Only unlinked token-synthetic actors add anything new; linked tokens
        // share the world actor already collected above.
        if (tok.document?.actorLink) continue;
        const actor = tok.actor;
        const key = tok.id ? `tok:${tok.id}` : undefined;
        if (actor && key && !seen.has(key)) {
            seen.add(key);
            out.push(actor);
        }
    }
    return out;
}

async function onWorldTime(): Promise<void> {
    if (!isActiveGM()) return;
    const now = worldTime();
    for (const actor of relevantActors()) {
        for (const eff of managedEffects(actor)) {
            const dur = getDur(eff)!;
            if (dur.kind !== "day") continue;
            const start = dur.startWorldTime ?? now;
            if (now - start >= SECONDS_PER_DAY) {
                await removeManaged(actor, eff, dur, "passou-se um dia");
            }
        }
    }
    refreshSkillsMenu();
}

function dayEffectActors(): FoundryActor[] {
    const isGM = game.user?.isGM;
    const myId = game.user?.id ?? "";
    const out: FoundryActor[] = [];
    for (const actor of relevantActors()) {
        if (!isGM && (actor.ownership?.[myId] ?? 0) < 3) continue;
        if (managedEffects(actor).some((e) => getDur(e)!.kind === "day")) out.push(actor);
    }
    return out;
}

function doRest(): void {
    const actors = dayEffectActors();
    if (!actors.length) return;
    new Dialog(
        {
            title: "Descanso",
            content: `<p>Encerrar todos os buffs/condições de <b>duração dia</b> (${actors.length} criatura(s))?</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Descansar",
                    callback: async () => {
                        for (const actor of actors) {
                            for (const eff of managedEffects(actor)) {
                                const dur = getDur(eff)!;
                                if (dur.kind === "day") await removeManaged(actor, eff, dur, "descanso");
                            }
                        }
                        refreshSkillsMenu();
                    },
                },
                no: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
            },
            default: "no",
        },
        { classes: ["t20-dialog"], width: 400 },
    ).render(true);
}

// ── Migration: repair effects mis-tagged by earlier builds ───────────────────────

/**
 * Earlier builds mis-tagged PASSIVE features (powers with `duracao.units:"inst"`,
 * equipment) and "Efeitos de Uso" (onuse) as scene-managed, which then DELETED
 * them at encounter end (deleteCombat → onCombatEnd). Strip the `dur` flag from
 * any managed effect the current rules would not manage. Idempotent; conditions
 * (with statuses) and genuinely-timed buffs are left intact.
 */
async function healMistaggedEffects(): Promise<void> {
    if (!isActiveGM()) return;
    let healed = 0;
    for (const actor of relevantActors()) {
        for (const eff of ((actor.effects?.contents ?? []) as EffectDoc[])) {
            if (!getDur(eff)) continue;
            const statuses = effStatuses(eff);
            const timeable = statuses.length > 0
                || hasFiniteBuffDuration(originInfo(eff).units, eff.duration?.type);
            if (!isOnUseEffect(eff) && timeable) continue;
            try {
                await eff.update({ [`flags.${MODULE_ID}.-=${DUR_FLAG}`]: null }, { render: false });
                healed++;
            } catch (e) {
                warn("duration: heal falhou", e);
            }
        }
    }
    if (healed > 0) log(`duration: destagueados ${healed} efeito(s) passivo(s)/de-uso marcados por engano.`);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(DUR_STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = DUR_STYLES_ID;
    el.textContent = DUR_STYLES;
    document.head.appendChild(el);
}

export function setupDurationManager(): void {
    ensureStyles();

    onSocketReady((socket) => {
        socket.register(SOCKET_SUSTAIN_PROMPT, (data: unknown) => {
            const d = data as { spell?: string; target?: string };
            return sustainDialog(d?.spell ?? "magia sustentada", d?.target ?? "");
        });
    });

    Hooks.on("createActiveEffect", (...args: unknown[]) => {
        const eff = args[0] as EffectDoc;
        const userId = args[2] as string;
        void onCreateEffect(eff, userId);
    });

    Hooks.on("combatStart", (...args: unknown[]) => {
        void anchorCombat(args[0] as CombatLike);
    });
    Hooks.on("createCombatant", (...args: unknown[]) => {
        const combat = (args[0] as { parent?: CombatLike })?.parent;
        const running = activeCombat();
        if (combat && running && combat.id === running.id) void anchorCombat(running);
    });
    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        void onTurnChange(args[0] as CombatLike);
    });
    Hooks.on("deleteCombat", (...args: unknown[]) => {
        void onCombatEnd(args[0] as CombatLike);
    });
    Hooks.on("updateWorldTime", () => {
        void onWorldTime();
    });

    registerSkillAction({
        id: "duration-rest",
        label: "Descanso (encerrar buffs de 1 dia)",
        icon: "fa-bed",
        color: "#7ec8ff",
        isVisible: () => dayEffectActors().length > 0,
        onClick: () => doRest(),
    });

    Hooks.once("ready", () => { void healMistaggedEffects(); refreshSkillsMenu(); });
    log("Gerenciador de duração de buffs/condições instalado.");
}
