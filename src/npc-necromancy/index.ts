import { MODULE_ID } from "@/constants";
import { isActiveGM } from "@/_shared/gm";
import { getTokenPosPx } from "@/_shared/canvas-geometry";
import { warn } from "@/utils/logging";

type Actor = FoundryActor & {
    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    delete(): Promise<unknown>;
};
type Token = {
    id: string; uuid: string; name: string; actorId: string; actorLink: boolean;
    x: number; y: number; width: number; height: number; disposition: number;
    actor: Actor | null; parent: Scene;
    getFlag(scope: string, key: string): unknown;
};
type Scene = {
    id: string; width: number; height: number; grid: { size: number; distance: number };
    tokens: { contents: Token[] };
    createEmbeddedDocuments(type: string, data: unknown[]): Promise<Token[]>;
    deleteEmbeddedDocuments(type: string, ids: string[]): Promise<unknown>;
};
type Necromancy = { action: "raise" | "sacrifice" | "strike"; count?: number; defense?: number; damage?: string; reduction?: number };
type Item = { id: string; name: string; actor?: Actor; getFlag(scope: string, key: string): unknown };
type RollOptions = { createMessage?: boolean; configureDialog?: boolean };
type NativeRoll = (this: Item, options?: RollOptions) => Promise<ChatMessage | undefined>;
const busy = new Set<string>();
const pruning = new Set<string>();
const SHADOW = "necromancyShadowOf";
const USED = "necromancySacrificeRound";

function currentScene(): Scene | undefined {
    return canvas?.scene as unknown as Scene | undefined;
}

function combat() {
    return (game as unknown as { combat?: { id: string; round: number; started: boolean; combatant?: { tokenId: string } } }).combat;
}

function turnKey(): string {
    const c = combat();
    return c?.started ? c.id + "/" + c.round : currentScene()?.id ?? "world";
}

function flag(actor: unknown, key: string): unknown {
    return (actor as Partial<Actor> | null)?.getFlag?.(MODULE_ID, key);
}

export function isNecromancyShadow(actor: unknown): boolean {
    return typeof flag(actor, SHADOW) === "string";
}

export function isInitiate(actor: unknown): boolean {
    return flag(actor, "necromancyInitiate") === true;
}

function ownedShadows(actor: Actor): Token[] {
    return (currentScene()?.tokens.contents ?? []).filter(t => !t.actorLink
        && t.getFlag(MODULE_ID, SHADOW) === actor.uuid
        && (t.actor?.system?.attributes?.pv?.value ?? 0) > 0);
}

/** Tokens are matched by the synthetic caster UUID, never by displayed name. */
export function necromancySacrifice(actor: unknown): { reduction: number; count: number } | undefined {
    if (!isInitiate(actor)) return;
    const caster = actor as Actor;
    if (caster.getFlag(MODULE_ID, USED) === turnKey() || busy.has(caster.uuid)) return;
    const items = caster.items?.contents ?? [];
    const config = items.map(i => (i as unknown as Item).getFlag(MODULE_ID, "necromancy") as Necromancy | undefined)
        .find(c => c?.action === "sacrifice");
    const count = ownedShadows(caster).length;
    if (count && config?.reduction && config.reduction > 0) return { reduction: config.reduction, count };
}

export async function consumeNecromancySacrifice(actor: unknown): Promise<number> {
    const available = necromancySacrifice(actor);
    if (!available) return 0;
    const caster = actor as Actor;
    busy.add(caster.uuid);
    const previous = caster.getFlag(MODULE_ID, USED) ?? null;
    try {
        const victim = ownedShadows(caster)[0];
        if (!victim) return 0;
        await caster.setFlag(MODULE_ID, USED, turnKey());
        try {
            await victim.parent.deleteEmbeddedDocuments("Token", [victim.id]);
        } catch (error) {
            await caster.setFlag(MODULE_ID, USED, previous);
            throw error;
        }
        return available.reduction;
    } finally {
        busy.delete(caster.uuid);
    }
}

export function findShadowSpaces(origin: { x: number; y: number }, scene: Pick<Scene, "width" | "height" | "grid">,
    occupied: Array<{ x: number; y: number; width: number; height: number }>, count: number): Array<{ x: number; y: number }> {
    const size = scene.grid.size;
    const squares = Math.floor(9 / scene.grid.distance);
    const candidates: Array<{ x: number; y: number; distance: number }> = [];
    for (let dx = -squares; dx <= squares; dx++) for (let dy = -squares; dy <= squares; dy++) {
        if (!dx && !dy || dx * dx + dy * dy > squares * squares) continue;
        const x = Math.floor(origin.x / size) * size + dx * size;
        const y = Math.floor(origin.y / size) * size + dy * size;
        if (x < 0 || y < 0 || x + size > scene.width || y + size > scene.height) continue;
        if (occupied.some(t => x < t.x + t.width * size && x + size > t.x && y < t.y + t.height * size && y + size > t.y)) continue;
        candidates.push({ x, y, distance: dx * dx + dy * dy });
    }
    return candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x)
        .slice(0, count).map(({ x, y }) => ({ x, y }));
}

function shadowData(master: Actor, defense: number, damage: string): Record<string, unknown> {
    const attribute = (value: number) => ({ value, base: value, bonus: 0, racial: 0 });
    return {
        name: "Servo de Sombra", type: "npc", img: "icons/svg/skull.svg",
        prototypeToken: { actorLink: false, width: 1, height: 1, texture: { src: "icons/svg/skull.svg" } },
        ownership: { default: 0 },
        flags: { [MODULE_ID]: { necromancyHelper: true, [SHADOW]: master.uuid } },
        system: {
            atributos: { for: attribute(3), des: attribute(3), con: attribute(0), int: attribute(0), sab: attribute(0), car: attribute(0) },
            attributes: {
                nd: "0", cd: 0, pv: { value: 1, max: 1, min: 0, temp: 0 }, pm: { value: 0, max: 0, temp: 0 },
                defesa: { base: 10, outros: defense - 13, atributo: "des" }, movement: { walk: { base: 9 } },
            },
            detalhes: { tipo: "mor", raca: "Morto-vivo de sombra", role: "lackey", tesouro: "Nenhum" },
            tracos: {
                tamanho: "med", resistencias: { frio: { base: 0, imunidade: true } },
                ic: { value: ["atordoado", "doente", "encantamento", "fatigado", "exausto", "ilusao", "paralisado", "sono", "envenenado"], custom: "Imune a dano não letal. Falha automaticamente em resistências e testes opostos." },
            },
        },
        items: [{
            name: "Golpe de Sombra", type: "poder", img: "icons/svg/skull.svg",
            flags: { [MODULE_ID]: { necromancy: { action: "strike" }, npcPower: { limit: "round", save: true } } },
            system: {
                tipo: "geral", ativacao: { execucao: "standard", custo: 0 }, alcance: "touch", alvo: "1 criatura adjacente",
                resistencia: { txt: "", pericia: "", atributo: "", bonus: 0 }, duracao: { units: "inst" },
                rolls: [{ name: "Dano", key: "dano0", type: "dano", parts: [[damage, "trevas", ""]] }],
                description: { value: "<p>No turno do mestre, uma vez por rodada, causa " + damage + " de trevas em uma criatura adjacente, sem teste de ataque.</p>" },
            },
        }],
    };
}

async function raise(item: Item, original: NativeRoll, options?: RollOptions): Promise<ChatMessage | undefined> {
    const actor = item.actor!;
    const scene = currentScene();
    const origin = scene?.tokens.contents.find(t => t.actor?.uuid === actor.uuid);
    if (!game.user?.isGM || !scene || !origin) {
        ui.notifications.warn("Selecione o token do iniciado em uma cena como mestre para conjurar os servos.");
        return;
    }
    const config = item.getFlag(MODULE_ID, "necromancy") as Necromancy;
    const count = Math.max(1, Math.min(4, config.count ?? 4));
    const spaces = findShadowSpaces(origin, scene, scene.tokens.contents, count);
    if (spaces.length < count) {
        ui.notifications.warn("Não há quatro espaços livres em alcance curto.");
        return;
    }
    const message = await original.call(item, options);
    if (!message) return;
    const actors = (globalThis as unknown as { Actor: { create(data: unknown): Promise<Actor> } }).Actor;
    const helper = await actors.create(shadowData(actor, config.defense ?? 22, config.damage ?? "1d8"));
    const previous = scene.tokens.contents.filter(t => t.getFlag(MODULE_ID, SHADOW) === actor.uuid);
    try {
        await scene.createEmbeddedDocuments("Token", spaces.map((xy, i) => ({
            ...xy, name: "Servo de Sombra " + (i + 1), actorId: helper.id, actorLink: false,
            texture: { src: "icons/svg/skull.svg" }, width: 1, height: 1, disposition: origin.disposition,
            flags: { [MODULE_ID]: { [SHADOW]: actor.uuid } },
        })));
    } catch (error) {
        await helper.delete();
        throw error;
    }
    if (previous.length) await scene.deleteEmbeddedDocuments("Token", previous.map(t => t.id));
    return message;
}

function canStrike(item: Item): boolean {
    const actor = item.actor!;
    const scene = currentScene();
    const owner = actor.getFlag(MODULE_ID, SHADOW);
    const master = scene?.tokens.contents.find(t => t.actor?.uuid === owner);
    const shadow = scene?.tokens.contents.find(t => t.actor?.uuid === actor.uuid);
    const c = combat();
    if (!master || !shadow || (master.actor?.system?.attributes?.pv?.value ?? 0) <= 0
        || (actor.system?.attributes?.pv?.value ?? 0) <= 0 || c?.started && c.combatant?.tokenId !== master.id) {
        ui.notifications.warn("O servo só age no turno de seu mestre vivo.");
        return false;
    }
    const targets = [...(game.user?.targets ?? [])];
    if (targets.length !== 1 || !targets[0]?.actor) {
        ui.notifications.warn("Marque exatamente uma criatura adjacente com T.");
        return false;
    }
    const target = getTokenPosPx(targets[0]);
    const size = scene!.grid.size;
    const gapX = Math.max(0, target.x - (shadow.x + size), shadow.x - (target.x + target.widthSq * size));
    const gapY = Math.max(0, target.y - (shadow.y + size), shadow.y - (target.y + target.heightSq * size));
    if (gapX > 0 || gapY > 0 || targets[0].id === shadow.id) {
        ui.notifications.warn("O alvo deve estar adjacente ao servo.");
        return false;
    }
    return true;
}

async function cleanup(scene: Scene, master?: string): Promise<void> {
    const shadows = scene.tokens.contents.filter(t => typeof t.getFlag(MODULE_ID, SHADOW) === "string"
        && (!master || t.getFlag(MODULE_ID, SHADOW) === master));
    if (shadows.length) await scene.deleteEmbeddedDocuments("Token", shadows.map(t => t.id));
    await pruneHelpers(master);
}

async function pruneHelpers(master?: string): Promise<void> {
    const scenes = (game as unknown as { scenes: { contents: Scene[] } }).scenes?.contents ?? [];
    for (const actor of game.actors?.contents ?? []) {
        const helper = actor as Actor;
        if (!helper.getFlag(MODULE_ID, "necromancyHelper") || master && helper.getFlag(MODULE_ID, SHADOW) !== master) continue;
        if (pruning.has(helper.id) || scenes.some(s => s.tokens.contents.some(t => t.actorId === helper.id))) continue;
        pruning.add(helper.id);
        try { await helper.delete(); }
        finally { pruning.delete(helper.id); }
    }
}

export function setupNpcNecromancy(): void {
    const proto = (CONFIG.Item as { documentClass: { prototype: { roll: NativeRoll } } }).documentClass.prototype;
    const original = proto.roll;
    proto.roll = async function (options) {
        const config = this.getFlag(MODULE_ID, "necromancy") as Necromancy | undefined;
        if (!config || !this.actor || options?.createMessage === false) return original.call(this, options);
        if (config.action === "sacrifice") {
            ui.notifications.info("Use Sacrificar Servo no diálogo de dano recebido.");
            return;
        }
        if (!currentScene()?.tokens.contents.some(t => t.actor?.uuid === this.actor!.uuid)) {
            const selected = (canvas?.tokens?.controlled ?? []).filter(t =>
                t.actor?.id === this.actor!.id || t.actor?.uuid.endsWith(".Actor." + this.actor!.id));
            if (selected.length === 1) {
                const owned = selected[0]?.actor?.items?.get(this.id) as unknown as { roll(options?: RollOptions): Promise<ChatMessage | undefined> } | undefined;
                if (owned) return owned.roll(options);
            }
        }
        if (config.action === "strike") return canStrike(this) ? original.call(this, options) : undefined;
        if (busy.has(this.actor.uuid)) return;
        busy.add(this.actor.uuid);
        try { return await raise(this, original, options); }
        finally { busy.delete(this.actor.uuid); }
    };
    Hooks.on("deleteCombat", (doc: unknown) => {
        if (!isActiveGM()) return;
        const scene = (doc as { scene?: Scene }).scene;
        if (scene) void cleanup(scene).catch(error => warn("Falha ao limpar servos:", error));
    });
    Hooks.on("deleteToken", (doc: unknown) => {
        if (!isActiveGM()) return;
        const token = doc as Token;
        if (token.actor && isInitiate(token.actor)) void cleanup(token.parent, token.actor.uuid).catch(error => warn("Falha ao dispensar servos:", error));
        else if (token.getFlag(MODULE_ID, SHADOW)) void pruneHelpers().catch(error => warn("Falha ao limpar servos sem tokens:", error));
    });
    Hooks.on("createActiveEffect", (doc: unknown) => {
        if (!isActiveGM()) return;
        const effect = doc as FoundryItemEffect & { parent?: Actor; delete(): Promise<unknown>; getFlag(s: string, k: string): unknown };
        if (!effect.getFlag(MODULE_ID, "necromancyArmor") || !effect.parent || !isInitiate(effect.parent)) return;
        const other = effect.parent.effects?.contents.find(e => e.id !== effect.id && e.flags?.[MODULE_ID]?.necromancyArmor);
        if (other) void effect.delete().catch(error => warn("Falha ao evitar Armadura Arcana duplicada:", error));
    });
    const actors = (CONFIG.Actor as { documentClass: { prototype: Record<string, unknown> } }).documentClass.prototype;
    for (const key of ["rollPericia", "rollAtributo"]) {
        const roll = actors[key] as ((this: Actor, ...args: unknown[]) => unknown) | undefined;
        if (!roll) continue;
        actors[key] = async function (this: Actor, ...args: unknown[]) {
            if (!isNecromancyShadow(this)) return roll.apply(this, args);
            const failed = new Roll("0");
            await failed.evaluate({ async: true });
            return ChatMessage.create({
                speaker: { actor: this.id, alias: this.name }, rolls: [failed.toJSON()],
                content: "<p><strong>Falha automática — Servo de Sombra.</strong> O servo falha em testes de resistência e testes opostos.</p>",
                flags: { [MODULE_ID]: { automaticFailure: true } },
            });
        };
    }
}
