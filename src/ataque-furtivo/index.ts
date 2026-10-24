/** Ladino: progressão do Ataque Furtivo e análise de alvo com Assassinar. */
import { MODULE_ID } from "@/constants";
import { escHtml } from "@/_shared/html";
import { isActiveGM } from "@/_shared/gm";
import { getSocket, onSocketReady } from "@/socket";
import { warn } from "@/utils/logging";
import { advanceAnalysis, analysisMatches, isAnatomicalSneak, isSneakEffect, isSneakPower, named, rogueLevel, scaleSneakRolls, sneakDice, sneakLevel, type Analysis, type AssassinarPayload, type SneakRoll } from "./format";
export type { AssassinarPayload } from "./format";

const FLAG = "assassinar";
export const ROLL_ASSASSINAR = "t20Assassinar";
const SOCKET_CONSUME = "assassinar/consume";
interface Effect {
    id: string;
    name?: string;
    disabled?: boolean;
    flags?: Record<string, Record<string, unknown>>;
    changes: Array<{ key: string; mode: number; value: string; priority?: number | null }>;
    clone(data: object, options: { keepId: boolean }): Effect;
    update(data: object): Promise<unknown>;
}
interface Actor {
    id: string;
    uuid: string;
    name?: string;
    isOwner?: boolean;
    items?: { contents: Item[] };
    effects: { contents: Effect[] };
    system?: { attributes?: { pm?: { value?: number; temp?: number }; pv?: { value?: number; temp?: number } } };
    spendMana(amount: number): Promise<unknown>;
    createEmbeddedDocuments(type: string, data: object[]): Promise<Effect[]>;
    deleteEmbeddedDocuments(type: string, ids: string[]): Promise<unknown>;
}
interface Item {
    name?: string;
    type?: string;
    uuid?: string;
    img?: string;
    actor?: Actor | null;
    system?: { niveis?: number; rolls?: SneakRoll[]; rolled?: Record<string, Roll> };
    clone(data: object, options: { keepId: boolean }): Item;
    updateSource(data: object): unknown;
    prepareFinalAttributes?(): unknown;
}
interface Token {
    id: string;
    actor?: Actor | null;
    center?: { x: number; y: number };
    x?: number; y?: number; w?: number; h?: number;
    document?: { uuid?: string; name?: string };
}
interface Combat {
    id?: string;
    started?: boolean;
    round?: number;
    turn?: number;
    combatant?: { actor?: Actor };
    combatants?: { contents: Array<{ actor?: Actor }> };
}
function cvs() {
    return canvas as unknown as { scene?: { id: string; grid?: { size?: number; distance?: number } }; tokens?: { placeables: Token[]; get(id: string): Token | undefined } };
}
function combat(): Combat | undefined { return game.combat as Combat | undefined; }
function state(effect: Effect): Analysis | undefined { return effect.flags?.[MODULE_ID]?.[FLAG] as Analysis | undefined; }
function marks(actor: Actor): Effect[] { return actor.effects.contents.filter(e => state(e)); }
function currentMark(actor: Actor): Effect | undefined {
    const targets = [...(game.user?.targets ?? [])] as unknown as Token[];
    if (targets.length !== 1) return;
    const target = targets[0].document?.uuid ?? "";
    return marks(actor).find(e => !e.disabled && analysisMatches(state(e)!, target, cvs().scene?.id ?? "", combat()?.id));
}
function selectedSneak(options: unknown): boolean {
    const list = (options as { onUseEffects?: Array<{ description?: string }> } | undefined)?.onUseEffects;
    return Boolean(list?.some(e => isSneakEffect(e.description)));
}
const applied = new WeakMap<Item, AssassinarPayload>();

/** Clones conservam seleção/id/custo; o efeito e o item do compêndio ficam intactos. */
export function rogueAttackEffects(item: Item, effects: Effect[]): Effect[] {
    const actor = item.actor;
    if (!actor || item.type !== "arma") return effects;
    applied.delete(item);
    const mark = currentMark(actor);
    const brutal = actor.items?.contents.some(i => i.type === "poder" && named(i.name, "ataque furtivo brutal"));
    const anatomicalActive = effects.some(e => isAnatomicalSneak(e.name) && !e.disabled);
    return effects.filter(e => !(named(e.name, "assassinar") && e.flags?.tormenta20?.attack)
        && !(brutal && named(e.name, "ataque furtivo")) && !(anatomicalActive && isSneakPower(e.name))).map(effect => {
        if (!isSneakEffect(effect.name) || !effect.flags?.tormenta20?.onuse || !effect.flags.tormenta20.attack) return effect;
        const anatomical = isAnatomicalSneak(effect.name);
        const isBrutal = named(effect.name, "ataque furtivo brutal") || (anatomical && brutal);
        const faces = anatomical ? (isBrutal ? 10 : 8) : (isBrutal ? 8 : 6);
        const level = sneakLevel(actor, isBrutal ? "Ataque Furtivo Brutal" : "Ataque Furtivo");
        const power = actor.items?.contents.find(i => i.type === "poder" && named(i.name, isBrutal ? "ataque furtivo brutal" : "ataque furtivo"));
        const stored = power?.system?.rolls?.find(r => r.type === "dano")?.parts?.[0]?.[0]?.match(/^(\d+)d[68]$/i);
        const count = level ? sneakDice(level) : Number(stored?.[1] ?? 0);
        if (!count) return effect;
        const changes = effect.changes.map(change => change.key === "dano" && change.mode === 2 && (anatomical || change.value === "roll" || /^\d+d[68](?:\[\w+\])?$/.test(change.value))
            ? { ...change, value: `${count * (mark ? 2 : 1)}d${faces}` } : change);
        if (mark) applied.set(item, { casterUuid: actor.uuid, effectId: mark.id, targetUuid: state(mark)!.targetUuid });
        return effect.clone({ changes }, { keepId: true });
    });
}

async function consumeLocal(payload: AssassinarPayload, damagedActorUuid: string): Promise<void> {
    if (!payload || payload.targetUuid !== damagedActorUuid) return;
    const actor = fromUuidSync(payload.casterUuid) as unknown as Actor | null;
    if (!actor?.isOwner) return;
    const effect = marks(actor).find(e => e.id === payload.effectId && state(e)?.targetUuid === damagedActorUuid);
    if (effect) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
}
/** Chamado só após perda REAL de PV/PV temporários, nunca no mero lançamento do ataque. */
export async function consumeAssassinar(payload: AssassinarPayload | undefined, damagedActorUuid: string): Promise<void> {
    if (!payload || payload.targetUuid !== damagedActorUuid) return;
    const caster = fromUuidSync(payload.casterUuid) as unknown as Actor | null;
    if (caster?.isOwner) await consumeLocal(payload, damagedActorUuid);
    else await getSocket()?.executeAsGM(SOCKET_CONSUME, payload, damagedActorUuid);
}

const preparing = new WeakSet<Actor>();
async function prepare(item: Item, createMessage: boolean): Promise<unknown> {
    const actor = item.actor;
    if (!actor?.isOwner || preparing.has(actor)) return;
    preparing.add(actor);
    try {
        const targets = [...(game.user?.targets ?? [])] as unknown as Token[];
        const target = targets[0];
        if (rogueLevel(actor) < 5) { ui.notifications.warn("Assassinar exige 5º nível de ladino."); return; }
        if (targets.length !== 1 || !target?.actor || target.actor.uuid === actor.uuid) { ui.notifications.warn("Assassinar: marque uma criatura como alvo com T."); return; }
        const source = cvs().tokens?.placeables.find(t => t.actor?.uuid === actor.uuid);
        if (!source?.center || !target.center) { ui.notifications.warn("Assassinar: coloque o ladino e o alvo na cena."); return; }
        const grid = cvs().scene?.grid;
        const distance = Math.hypot(source.center.x - target.center.x, source.center.y - target.center.y) * (grid?.distance ?? 1.5) / (grid?.size ?? 100);
        if (distance > 9 + 0.001) { ui.notifications.warn("Assassinar: o alvo deve estar em alcance curto (9 m)."); return; }
        const pm = actor.system?.attributes?.pm;
        if (Number(pm?.value ?? 0) + Number(pm?.temp ?? 0) < 3) { ui.notifications.warn("Assassinar: PM insuficiente (custo 3 PM)."); return; }
        const c = combat(), old = marks(actor).map(e => e.id);
        const analysis: Analysis = {
            casterUuid: actor.uuid, targetUuid: target.actor.uuid,
            targetTokenUuid: target.document?.uuid ?? "", targetName: target.document?.name ?? target.actor.name ?? "Alvo",
            sceneId: cvs().scene?.id ?? "", combatId: c?.started ? c.id : undefined,
            endsRemaining: c?.started && c.combatant?.actor?.uuid === actor.uuid ? 2 : 1,
        };
        await actor.createEmbeddedDocuments("ActiveEffect", [{
            name: `Assassinar — ${analysis.targetName}`, img: item.img, origin: item.uuid,
            transfer: false, disabled: false, changes: [],
            flags: { tormenta20: { onuse: false, durationScene: true }, [MODULE_ID]: { [FLAG]: analysis } },
        }]);
        await actor.spendMana(3);
        if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
        const card = {
            speaker: { actor: actor.id, token: source.id, scene: analysis.sceneId, alias: actor.name },
            content: `<div class="tormenta20 chat-card item-card"><h3>Assassinar</h3><p>3 PM · Ação de movimento</p><p>Alvo analisado: <b>${escHtml(analysis.targetName)}</b>.</p><p>Até o fim do próximo turno, o primeiro Ataque Furtivo que causar dano a este alvo tem seus dados extras dobrados.</p></div>`,
            flags: { [MODULE_ID]: { assassinarPreparation: true } }, rolls: [],
        };
        if (createMessage) return await ChatMessage.create(card);
        return card;
    } catch (error) { warn("Assassinar: falha ao analisar alvo", error); ui.notifications.error("Não foi possível preparar Assassinar."); }
    finally { preparing.delete(actor); }
}

async function endTurn(prior: { actorId?: string; tokenId?: string }, c: Combat): Promise<void> {
    if (!isActiveGM() || !prior) return;
    const actor = (prior.tokenId ? cvs().tokens?.get(prior.tokenId)?.actor : null)
        ?? (prior.actorId ? game.actors?.get(prior.actorId) as unknown as Actor : null);
    if (!actor) return;
    const key = `${c.id}:${c.round}:${c.turn}:${prior.tokenId ?? prior.actorId}`;
    for (const effect of marks(actor)) {
        const previous = state(effect)!;
        if (previous.combatId && previous.combatId !== c.id) continue;
        const next = advanceAnalysis(previous, actor.uuid, key);
        if (!next) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        else if (next !== previous) await effect.update({ [`flags.${MODULE_ID}.${FLAG}`]: { ...next, combatId: c.id } });
    }
}

export function setupAtaqueFurtivo(): void {
    onSocketReady(socket => socket.register(SOCKET_CONSUME, (...args: unknown[]) => consumeLocal(args[0] as AssassinarPayload, args[1] as string)));
    Hooks.on("renderApplication", (...args: unknown[]) => {
        const app = args[0] as { item?: Item; _onInputChange?: (html: HTMLElement[]) => void };
        if (app.item?.type !== "arma") return;
        const html = args[1], root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement } | null)?.[0];
        if (!root) return;
        let changed = false;
        root.querySelectorAll(".aprimoramentos-list li").forEach(row => {
            if (named(row.querySelector("h4.item-name")?.textContent ?? "", "assassinar")) { row.remove(); changed = true; }
        });
        // Conhecimento Anatômico é uma alternativa (contra humanoides), não uma
        // segunda parcela de furtivo. Preserva ids/custos e os itens originais.
        const sneakBoxes = Array.from(root.querySelectorAll(".aprimoramentos-list li"))
            .filter(row => isSneakEffect(row.querySelector("h4.item-name")?.textContent ?? ""))
            .map(row => row.querySelector<HTMLInputElement>('input[type="checkbox"]'))
            .filter((input): input is HTMLInputElement => !!input);
        for (const input of sneakBoxes) input.addEventListener("change", () => {
            if (!input.checked) return;
            for (const other of sneakBoxes) if (other !== input && other.checked) {
                other.checked = false;
                other.dispatchEvent(new Event("change", { bubbles: true }));
            }
        });
        if (changed) app._onInputChange?.([root]);
    });
    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        void endTurn(args[1] as { actorId?: string; tokenId?: string }, args[0] as Combat).catch(e => warn("Assassinar: expiração", e));
    });
    Hooks.on("deleteCombat", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const c = args[0] as Combat;
        for (const { actor } of c.combatants?.contents ?? []) if (actor) {
            const ids = marks(actor).filter(e => !state(e)?.combatId || state(e)?.combatId === c.id).map(e => e.id);
            if (ids.length) void actor.deleteEmbeddedDocuments("ActiveEffect", ids);
        }
    });
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as Item;
        if (args[2] !== game.user?.id || item.type !== "poder" || !named(item.name, "assassinar") || !item.actor) return;
        const ids = marks(item.actor).map(e => e.id);
        if (ids.length) void item.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    });
    Hooks.once("ready", () => {
        const proto = (CONFIG as unknown as { Item: { documentClass: { prototype: Record<string, unknown> } } }).Item.documentClass.prototype;
        if (proto._t20SneakPatched) return;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "validOnUseEffects");
        if (!descriptor?.get || !descriptor.configurable || typeof proto.roll !== "function" || typeof proto.rollDamage !== "function") return;
        const nativeRoll = proto.roll as (this: Item, ...args: unknown[]) => unknown;
        proto.roll = function (this: Item, ...args: unknown[]) {
            if (this.type === "poder" && this.actor && named(this.name, "assassinar")) return prepare(this, (args[0] as { createMessage?: boolean } | undefined)?.createMessage !== false);
            if (this.type === "poder" && isSneakPower(this.name) && sneakLevel(this.actor, this.name)) {
                const clone = this.clone({}, { keepId: true });
                const rolls = (clone.system?.rolls ?? []).map(roll => roll.toObject?.(false) ?? roll);
                clone.updateSource({ "system.rolls": scaleSneakRolls(rolls, sneakLevel(this.actor, this.name), named(this.name, "ataque furtivo brutal") ? 8 : 6) });
                return nativeRoll.call(clone, ...args);
            }
            return nativeRoll.call(this, ...args);
        };
        const nativeEffects = descriptor.get;
        Object.defineProperty(proto, "validOnUseEffects", { ...descriptor, get(this: Item) { return rogueAttackEffects(this, nativeEffects.call(this)); } });
        const nativePrepare = proto.prepareFinalAttributes as ((this: Item) => unknown) | undefined;
        if (nativePrepare) proto.prepareFinalAttributes = function (this: Item) {
            // Dado derivado também aparece corretamente na ficha; _source não muda.
            if (this.type === "poder" && isSneakPower(this.name) && this.system && sneakLevel(this.actor, this.name)) {
                this.system.rolls = scaleSneakRolls(this.system.rolls ?? [], sneakLevel(this.actor, this.name), named(this.name, "ataque furtivo brutal") ? 8 : 6);
            }
            if (this.type === "poder" && named(this.name, "assassinar") && this.system) this.system.rolls = [];
            return nativePrepare.call(this);
        };
        const nativeDamage = proto.rollDamage as (this: Item, arg?: { options?: unknown }) => Promise<unknown>;
        proto.rollDamage = async function (this: Item, arg?: { options?: unknown }) {
            const payload = selectedSneak(arg?.options) ? applied.get(this) : undefined;
            try {
                const result = await nativeDamage.call(this, arg);
                if (payload) for (const roll of Object.values(this.system?.rolled ?? {})) if (roll.options.type === "damage") roll.options[ROLL_ASSASSINAR] = payload;
                return result;
            } finally { applied.delete(this); }
        };
        proto._t20SneakPatched = true;
        const actors = new Set<Actor>([
            ...((game.actors?.contents ?? []) as unknown as Actor[]),
            ...(cvs()?.tokens?.placeables ?? []).flatMap(t => t.actor ? [t.actor] : []),
        ]);
        for (const actor of actors) for (const item of actor.items?.contents ?? []) {
            if (item.type === "poder" && (isSneakPower(item.name) || named(item.name, "assassinar"))) item.prepareFinalAttributes?.();
        }
        const actorProto = (CONFIG as unknown as { Actor: { documentClass: { prototype: Record<string, unknown> } } }).Actor.documentClass.prototype;
        const nativeApply = actorProto.applyDamageV2 as (this: Actor, roll: Roll, ...args: unknown[]) => Promise<unknown>;
        if (typeof nativeApply === "function") actorProto.applyDamageV2 = async function (this: Actor, roll: Roll, ...args: unknown[]) {
            const pv = this.system?.attributes?.pv, before = Number(pv?.value ?? 0) + Number(pv?.temp ?? 0);
            const result = await nativeApply.call(this, roll, ...args);
            const after = this.system?.attributes?.pv;
            if (Number(after?.value ?? 0) + Number(after?.temp ?? 0) < before) await consumeAssassinar(roll.options[ROLL_ASSASSINAR] as AssassinarPayload | undefined, this.uuid);
            return result;
        };
    });
}
