import { MODULE_ID } from "@/constants";
import { getKeptD20Natural } from "@/grito-kiai/index";

type Preparation = "fury" | "fatal" | "trip";
type Limit = "scene" | "round";

export interface NpcPower {
    limit?: Limit;
    prepare?: Preparation;
    shieldCost?: number;
    save?: boolean;
    conditions?: string[];
    rounds?: number;
    radius?: number;
    fullOnPass?: boolean;
    onPass?: string[];
    magical?: boolean;
    drain?: boolean;
    conceal?: boolean;
    conditionDuration?: "scene";
    fearSplash?: number;
}

export interface NpcTraits {
    bond?: "aslan" | "sanaa";
    shield?: string;
    guard?: boolean;
    captain?: boolean;
    gang?: boolean;
    antimagia?: boolean;
    daze?: boolean;
    sneakDice?: number;
    poison?: boolean;
    immuneCritical?: boolean;
    panther?: boolean;
    acid?: boolean;
}

type NpcState = { scene: string; used: Record<string, string>; pending?: Preparation | null };
type NpcActor = FoundryActor & {
    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    statuses?: Set<string>;
    type?: string;
};
type NpcItem = {
    id: string;
    name: string;
    type: string;
    actor?: NpcActor;
    getFlag(scope: string, key: string): unknown;
};
type NpcToken = FoundryToken & {
    center: { x: number; y: number };
    document: { disposition: number; width: number; height: number };
};
type RollOptions = { createMessage?: boolean; configureDialog?: boolean; extra?: Record<string, string> };
type NativeRoll = (this: NpcItem, options?: RollOptions) => Promise<ChatMessage | undefined>;

const rolling = new Set<string>();
const resolving = new Set<string>();
const preparing = new Map<string, Preparation>();

function encounter() {
    const current = (game as unknown as { combat?: {
        id: string; started: boolean; round: number; combatants: { contents: Array<{ tokenId: string; defeated?: boolean }> };
    } }).combat;
    return current?.started ? current : undefined;
}

function sceneKey(): string {
    return encounter()?.id ?? canvas?.scene?.id ?? "world";
}

function state(actor: NpcActor): NpcState {
    const scene = sceneKey();
    const stored = actor.getFlag(MODULE_ID, "npcState") as NpcState | undefined;
    return stored?.scene === scene ? stored : { scene, used: {} };
}

function limitKey(limit: Limit): string {
    return limit === "round" ? sceneKey() + "/" + (encounter()?.round ?? 0) : sceneKey();
}

function wasUsed(actor: NpcActor, id: string, limit: Limit): boolean {
    return state(actor).used[id] === limitKey(limit);
}

export async function claimNpcUse(actor: FoundryActor, id: string, limit: Limit): Promise<boolean> {
    const npc = actor as NpcActor;
    const key = npc.uuid;
    if (resolving.has(key) || wasUsed(npc, id, limit)) return false;
    resolving.add(key);
    try {
        const current = state(npc);
        await npc.setFlag(MODULE_ID, "npcState", { ...current, used: { ...current.used, [id]: limitKey(limit) } });
        return true;
    } finally {
        resolving.delete(key);
    }
}

export function getNpcTraits(actor: FoundryActor | null | undefined): NpcTraits | undefined {
    return (actor as NpcActor | undefined)?.getFlag?.(MODULE_ID, "npcTraits") as NpcTraits | undefined;
}

function tokenLayer() {
    return (canvas as unknown as { tokens?: { placeables?: NpcToken[]; get(id: string): NpcToken | undefined } }).tokens;
}

export function npcMessageActor(message: ChatMessage): FoundryActor | undefined {
    return tokenLayer()?.get(message.speaker?.token ?? "")?.actor
        ?? game.actors?.get(message.speaker?.actor ?? "");
}

export function npcMessagePower(message: ChatMessage): NpcPower | undefined {
    const id = message.content?.match(/data-item-id="([^"]+)"/)?.[1];
    const item = id ? npcMessageActor(message)?.items?.get(id) as NpcItem | undefined : undefined;
    return item?.getFlag(MODULE_ID, "npcPower") as NpcPower | undefined;
}

export function npcHitPreparation(actor: FoundryActor | null, itemId: string): Preparation | undefined {
    return actor ? preparing.get(actor.uuid + "/" + itemId) : undefined;
}

export function npcPowerTargets(message: ChatMessage, radius: number): FoundryToken[] {
    const origin = tokenLayer()?.get(message.speaker?.token ?? "");
    if (!origin) return [];
    return (tokenLayer()?.placeables ?? []).filter(token => token.id !== origin.id && token.actor
        && token.document.disposition !== origin.document.disposition && distance(origin, token) <= radius);
}

export function npcFearSplashTargets(message: ChatMessage, target: FoundryToken, radius: number): FoundryToken[] {
    const origin = tokenLayer()?.get(message.speaker?.token ?? "");
    const center = tokenLayer()?.get(target.id);
    if (!origin || !center) return [];
    return (tokenLayer()?.placeables ?? []).filter(t => t.id !== target.id && t.id !== origin.id && t.actor
        && t.document.disposition !== origin.document.disposition && distance(center, t) <= radius);
}

function distance(origin: NpcToken, target: NpcToken): number {
    const grid = (canvas as unknown as { grid: {
        measurePath(points: Array<{ x: number; y: number }>): { distance: number };
    } }).grid;
    return grid?.measurePath([origin.center, target.center]).distance ?? Infinity;
}

export function qualifiesNpcSneak(target: FoundryActor, originId: string, targetId: string): boolean {
    const statuses = (target as NpcActor).statuses;
    if (statuses?.has("desprevenido") || statuses?.has("surpreso")) return true;
    const layer = tokenLayer();
    const origin = layer?.get(originId);
    const victim = layer?.get(targetId);
    if (!origin || !victim || distance(origin, victim) > 1.5) return false;
    const attackerX = origin.center.x - victim.center.x;
    const attackerY = origin.center.y - victim.center.y;
    return (layer?.placeables ?? []).some(ally => ally.id !== originId && ally.id !== targetId
        && ally.document.disposition === origin.document.disposition && (ally.actor?.system?.attributes?.pv?.value ?? 0) > 0
        && distance(ally, victim) <= 1.5
        && Math.sign(ally.center.x - victim.center.x) === -Math.sign(attackerX)
        && Math.sign(ally.center.y - victim.center.y) === -Math.sign(attackerY));
}

function attackBonuses(actor: NpcActor): { attack: number; damage: number } {
    const traits = getNpcTraits(actor);
    const combat = encounter();
    if (!combat) return { attack: 0, damage: 0 };
    const tokens = tokenLayer()?.placeables ?? [];
    const active = combat.combatants.contents.filter(entry => !entry.defeated).map(entry => entry.tokenId);
    const origin = tokens.find(token => token.actor?.uuid === actor.uuid && active.includes(token.id));
    if (!origin) return { attack: 0, damage: 0 };
    const allies = tokens.filter(token => token.id !== origin.id && active.includes(token.id)
        && token.document.disposition === origin.document.disposition
        && (token.actor?.system?.attributes?.pv?.value ?? 0) > 0);
    const bond = traits?.bond && allies.some(token => {
        const ally = getNpcTraits(token.actor)?.bond;
        return ally && ally !== traits.bond;
    });
    const formation = traits?.guard && allies.some(token => getNpcTraits(token.actor)?.guard && distance(origin, token) <= 1.5);
    const banner = origin.document.disposition !== 0 && allies.some(token => getNpcTraits(token.actor)?.captain);
    const damage = (formation ? 2 : 0) + (banner ? 2 : 0);
    return { attack: damage + (bond ? 2 : 0), damage };
}

function appendBonus(options: RollOptions | undefined, attack: number, damage: number, critical: boolean): RollOptions {
    if (!attack && !damage && !critical) return options ?? {};
    const extra = { ...options?.extra };
    if (attack) extra.atq = [extra.atq, String(attack)].filter(Boolean).join("+");
    if (damage) extra.dano = [extra.dano, String(damage)].filter(Boolean).join("+");
    if (critical) extra.margemCritico = "=1";
    return { ...options, extra };
}

async function rollPower(item: NpcItem, actor: NpcActor, power: NpcPower, original: NativeRoll, options?: RollOptions) {
    if (power.shieldCost) {
        ui.notifications.info("Use o escudo no diálogo de dano recebido.");
        return;
    }
    if (power.limit && wasUsed(actor, item.id, power.limit)) {
        ui.notifications.warn(item.name + " já foi usado neste " + (power.limit === "scene" ? "encontro." : "round."));
        return;
    }
    const message = await original.call(item, options);
    if (!message) return;
    const current = state(actor);
    if (power.limit || power.prepare) {
        const used = { ...current.used };
        if (power.limit) used[item.id] = limitKey(power.limit);
        await actor.setFlag(MODULE_ID, "npcState", { ...current, used, pending: power.prepare ?? current.pending });
    }
    if (power.conceal) {
        const document = actor as NpcActor & { createEmbeddedDocuments(type: string, data: unknown[]): Promise<unknown> };
        await document.createEmbeddedDocuments("ActiveEffect", [{
            name: "Sumiço Discreto", img: "icons/svg/invisible.svg",
            description: "<p>Camuflagem total. Percepção CD 18 permite ignorá-la.</p>",
            duration: { rounds: 1, seconds: 6 }, origin: actor.uuid,
            changes: [],
        }]);
    }
    return message;
}

async function rollStrike(item: NpcItem, actor: NpcActor, original: NativeRoll, options?: RollOptions) {
    const pending = state(actor).pending;
    const key = actor.uuid + "/" + item.id;
    const bonuses = attackBonuses(actor);
    if (pending) preparing.set(key, pending);
    try {
        const message = await original.call(item, appendBonus(options, bonuses.attack + (pending === "fury" ? 5 : 0), bonuses.damage, pending === "fatal"));
        if (!message || !pending) return message;
        const attack = message.rolls?.find(r => r.options.type === "attack");
        if (!attack) return message;
        const natural = getKeptD20Natural(attack);
        const targets = [...(game.user?.targets ?? [])];
        const hit = natural !== 1 && (natural === 20 || targets.some(t => (attack.total ?? 0) >= (t.actor?.system?.attributes?.defesa?.value ?? 10)));
        if (pending === "fury" || hit) {
            await actor.setFlag(MODULE_ID, "npcState", { ...state(actor), pending: null });
        }
        return message;
    } finally {
        preparing.delete(key);
    }
}

export function npcShield(actor: FoundryActor | null): { name: string; cost: number } | undefined {
    const name = getNpcTraits(actor)?.shield;
    if (!actor || !name || wasUsed(actor as NpcActor, "shield", "round")) return undefined;
    const item = (actor.items?.contents ?? []).find(i => i.name === name) as NpcItem | undefined;
    const power = item?.getFlag(MODULE_ID, "npcPower") as NpcPower | undefined;
    const mana = actor.system?.attributes?.pm;
    const cost = power?.shieldCost;
    if (cost && (mana?.value ?? 0) + (mana?.temp ?? 0) >= cost) return { name, cost };
}

export async function useNpcShield(actor: FoundryActor): Promise<boolean> {
    const shield = npcShield(actor);
    if (!shield || !await claimNpcUse(actor, "shield", "round")) return false;
    const mana = actor.system?.attributes?.pm;
    const fromTemp = Math.min(mana?.temp ?? 0, shield.cost);
    await actor.update({
        "system.attributes.pm.temp": (mana?.temp ?? 0) - fromTemp,
        "system.attributes.pm.value": (mana?.value ?? 0) - (shield.cost - fromTemp),
    });
    return true;
}

export function setupNpcCombat(): void {
    const proto = (CONFIG.Item as { documentClass: { prototype: { roll?: NativeRoll } } }).documentClass.prototype;
    const original = proto.roll;
    if (!original) return;
    proto.roll = async function (options) {
        const actor = this.actor;
        if (!actor || actor.type !== "npc" || options?.createMessage === false) return original.call(this, options);
        const power = this.getFlag(MODULE_ID, "npcPower") as NpcPower | undefined;
        const hits = this.type === "arma" ? Number(this.getFlag(MODULE_ID, "npcRoutineHits")) || 1 : 0;
        if (!power && !hits) return original.call(this, options);
        if (rolling.has(actor.uuid)) return;
        rolling.add(actor.uuid);
        try {
            if (power) return await rollPower(this, actor, power, original, options);
            let last: ChatMessage | undefined;
            for (let i = 0; i < hits; i++) {
                const message = await rollStrike(this, actor, original, options);
                if (!message) break;
                last = message;
            }
            return last;
        } finally {
            rolling.delete(actor.uuid);
        }
    };
}
