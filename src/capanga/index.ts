/** Capanga: variante de ladino; efeitos condicionais permanecem itens normais. */
import { MODULE_ID } from "@/constants";
import { isActiveGM } from "@/_shared/gm";
import { warn } from "@/utils/logging";
import { capangaLevel, named, norm, type ClassActor } from "@/ataque-furtivo/format";

interface Change { key: string; mode: number; value: string; priority?: number | null }
interface Effect { id: string; name?: string; changes: Change[]; flags?: Record<string, Record<string, unknown>>; clone(data: object, options: { keepId: boolean }): Effect }
interface Item { id?: string; name?: string; type?: string; actor?: Actor; validOnUseEffects?: Effect[]; system?: { niveis?: number; rolls?: Array<{ type?: string; parts?: string[][] }> }; }
interface Actor extends ClassActor {
    id: string; uuid: string; isOwner?: boolean;
    items: { contents: Item[] };
    effects: { contents: Effect[] };
    createEmbeddedDocuments(type: string, data: object[]): Promise<unknown>;
    deleteEmbeddedDocuments(type: string, ids: string[]): Promise<unknown>;
}
interface Combat { round?: number; started?: boolean; combatants?: { contents: Array<{ actor?: Actor }> } }
export function rapidoBonus(level: number): number { return level >= 15 ? 6 : level >= 7 ? 4 : level >= 3 ? 2 : 0; }
export function incompatibleClass(actor: ClassActor | undefined, name?: string, exceptId?: string): boolean {
    const opposite = named(name, "capanga") ? "ladino" : named(name, "ladino") ? "capanga" : "";
    return Boolean(opposite && actor?.items?.contents?.some(i => (!exceptId || (i as Item).id !== exceptId) && i.type === "classe" && named(i.name, opposite)));
}

/** Limita as opções pelo contexto; não transforma bônus condicionais em passivos. */
export function capangaEffects(item: Item, effects: Effect[], round?: number, participant = true): Effect[] {
    const level = capangaLevel(item.actor);
    return effects.flatMap(effect => {
        const name = norm(effect.name);
        if (name.startsWith("rapido e rasteiro")) {
            const initiative = name.includes("iniciativa");
            const available = rapidoBonus(level) && (initiative ? round === undefined || round <= 1 : participant && round === 1);
            if (!available || (initiative && (item.type !== "pericia" || norm(item.name) !== "iniciativa"))) return [];
            if (!initiative && item.type !== "arma" && !item.system?.rolls?.some(r => r.type === "dano" && r.parts?.some(p => p[1] !== "curapv" && p[1] !== "curapm"))) return [];
            return [effect.clone({ changes: effect.changes.map(c => ({ ...c, value: String(rapidoBonus(level)) })) }, { keepId: true })];
        }
        if (named(name, "cara feia") && (level < 4 || item.type !== "pericia" || !["fortitude", "reflexos", "vontade"].includes(norm(item.name)))) return [];
        if (named(name, "flanquear aprimorado") && level < 6) return [];
        if (named(name, "debulhar inimigos") && level < 20) return [];
        return [effect];
    });
}

const FLAG = "capangaRapidoDefesa";
const queues = new Map<string, Promise<void>>();
function activeCombat(): Combat | undefined { return game.combat as Combat | undefined; }
function participant(actor: Actor): boolean { return Boolean(activeCombat()?.combatants?.contents.some(c => c.actor?.uuid === actor.uuid)); }
async function syncDefense(actor: Actor): Promise<void> {
    if (!isActiveGM()) return;
    const c = activeCombat(), level = capangaLevel(actor);
    const has = actor.items.contents.some(i => i.type === "poder" && named(i.name, "rapido e rasteiro"));
    const bonus = c?.started && c.round === 1 && participant(actor) && has ? rapidoBonus(level) : 0;
    const marks = actor.effects.contents.filter(e => e.flags?.[MODULE_ID]?.[FLAG]);
    if (marks.length === 1 && bonus && marks[0].changes[0]?.value === String(bonus)) return;
    if (marks.length) await actor.deleteEmbeddedDocuments("ActiveEffect", marks.map(e => e.id));
    if (bonus) await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Rápido e Rasteiro — Defesa (1ª rodada)", img: `modules/${MODULE_ID}/assets/Capanga/rapido-e-rasteiro.png`,
        transfer: false, disabled: false, changes: [{ key: "system.attributes.defesa.bonus", mode: 2, value: String(bonus), priority: 20 }],
        flags: { [MODULE_ID]: { [FLAG]: true }, tormenta20: { onuse: false } },
    }]);
}
function schedule(actor?: Actor): void {
    if (!actor || !isActiveGM()) return;
    const previous = queues.get(actor.uuid) ?? Promise.resolve();
    const next = previous.then(() => syncDefense(actor)).catch(e => warn("Capanga: Rápido e Rasteiro", e));
    queues.set(actor.uuid, next);
    void next.finally(() => { if (queues.get(actor.uuid) === next) queues.delete(actor.uuid); });
}
function syncAll(): void {
    const actors = new Set<Actor>([
        ...((game.actors?.contents ?? []) as unknown as Actor[]),
        ...(activeCombat()?.combatants?.contents ?? []).flatMap(c => c.actor ? [c.actor] : []),
    ]);
    for (const actor of actors) if (capangaLevel(actor) || actor.effects.contents.some(e => e.flags?.[MODULE_ID]?.[FLAG])) schedule(actor);
}

export function setupCapanga(): void {
    // Perícias usam um objeto simples no diálogo nativo, não ItemT20/getter.
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]) => {
        const app = args[0] as { item?: Item; _onInputChange?: (html: unknown) => void };
        const item = app.item;
        if (!item?.actor || !capangaLevel(item.actor)) return;
        const effects = capangaEffects(item, item.validOnUseEffects ?? [], activeCombat()?.round, participant(item.actor));
        if (item.type === "pericia") item.validOnUseEffects = effects;
        const html = args[1], root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })?.[0];
        if (!root) return;
        const allowed = new Set(effects.map(e => e.id));
        let changed = false;
        root.querySelectorAll(".aprimoramentos-list li").forEach(row => {
            const label = norm(row.querySelector("h4.item-name")?.textContent ?? "");
            if (!label.startsWith("rapido e rasteiro") && !["cara feia", "flanquear aprimorado", "debulhar inimigos", "ataque furtivo"].includes(label)) return;
            const id = row.querySelector("input[name$='.aplica']")?.getAttribute("name")?.split(".")[1];
            if (id && !allowed.has(id)) { row.remove(); changed = true; }
        });
        if (changed) app._onInputChange?.([root]);
    });
    Hooks.on("preCreateItem", (...args: unknown[]) => {
        const item = args[0] as Item;
        if (item.type === "classe" && incompatibleClass(item.actor, item.name)) {
            ui.notifications.warn("Capanga é uma variante de Ladino: não é permitido fazer multiclasse entre as duas.");
            return false;
        }
    });
    Hooks.on("preUpdateItem", (...args: unknown[]) => {
        const item = args[0] as Item, change = args[1] as { name?: string };
        if (item.actor && item.type === "classe" && change.name && incompatibleClass({ items: { contents: [item] } }, change.name)) {
            ui.notifications.warn("A escolha entre Ladino e Capanga não pode ser alterada após o 1º nível da classe.");
            return false;
        }
    });
    for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, (...args: unknown[]) => {
        const item = args[0] as Item;
        if (item.type === "classe" || named(item.name, "rapido e rasteiro")) schedule(item.actor);
    });
    for (const hook of ["updateCombat", "deleteCombat", "createCombatant", "deleteCombatant", "canvasReady"]) Hooks.on(hook, syncAll);
    Hooks.once("ready", () => {
        const proto = (CONFIG as unknown as { Item: { documentClass: { prototype: Record<string, unknown> } } }).Item.documentClass.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "validOnUseEffects");
        if (!proto._t20CapangaPatched && desc?.get && desc.configurable) {
            const native = desc.get;
            Object.defineProperty(proto, "validOnUseEffects", { ...desc, get(this: Item) {
                return capangaEffects(this, native.call(this), activeCombat()?.round, this.actor ? participant(this.actor) : false);
            } });
            proto._t20CapangaPatched = true;
        }
        syncAll();
    });
}
