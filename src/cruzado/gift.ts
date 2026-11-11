import { MODULE_ID } from "@/constants";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { isActiveGM } from "@/_shared/gm";
import { warn } from "@/utils/logging";
import { chooseActionActor } from "@/_shared/actor-choice";
import { cruzadoLevel, giftBudget, GIFT_CONFIG, SUMMONED_GIFT, summonedGiftData, validateGiftPlan, type GiftPlan, type GiftClassActor } from "./gift-format";

interface Item {
    id: string; uuid: string; name: string; type: string;
    actor?: Actor; system: { niveis?: number; ativacao?: { custo?: number } };
    flags?: Record<string, Record<string, unknown>>;
    getFlag(scope: string, key: string): unknown;
    update(data: object): Promise<unknown>;
    toObject(): Record<string, unknown>;
    roll(...args: unknown[]): Promise<unknown>;
}
interface Actor extends GiftClassActor {
    id: string; uuid: string; name: string; isOwner: boolean;
    items: Iterable<Item> & { contents: Item[] };
    effects: { contents: Array<{ id: string; origin?: string }> };
    system: { attributes: { pm: { value: number; temp: number } } };
    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    update(data: object): Promise<unknown>;
    createEmbeddedDocuments(type: string, data: object[]): Promise<Item[]>;
    deleteEmbeddedDocuments(type: string, ids: string[]): Promise<unknown>;
}
interface Upgrade { name: string; description?: string; flags?: { tormenta20?: Record<string, unknown> }; [key: string]: unknown }
interface Config { weaponUpgrades: Record<string, string>; weaponEnchantments: Record<string, string>; upgrades: { general: Record<string, Upgrade>; weapon: Record<string, Upgrade> } }
function config(): Config { return (CONFIG as unknown as { T20: Config }).T20; }
function giftPower(item: Item): boolean { return item.type === "poder" && item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "presente dos deuses"; }
function gift(actor: Actor): Item | undefined { return actor.items.contents.find(giftPower); }
function actors(): Actor[] {
    const out = new Map<string, Actor>();
    for (const actor of game.actors?.contents ?? []) out.set(actor.uuid, actor as unknown as Actor);
    for (const token of canvas?.tokens?.placeables ?? []) if (token.actor) out.set(token.actor.uuid, token.actor as unknown as Actor);
    return [...out.values()];
}
function sceneId(): string { return (canvas as unknown as { scene?: { id?: string } })?.scene?.id ?? ""; }
function esc(value: unknown): string { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
let catalog: Promise<Record<string, unknown>[]> | undefined;
async function weapons(): Promise<Record<string, unknown>[]> {
    catalog ??= (async () => {
        const pack = (game as unknown as { packs: { get(id: string): { getIndex(options: object): Promise<Array<{ _id: string; type: string }>>; getDocument(id: string): Promise<Item> } } }).packs.get("tormenta20.equipamentos");
        const index = await pack.getIndex({ fields: ["type"] });
        const docs = await Promise.all(index.filter(i => i.type === "arma").map(i => pack.getDocument(i._id)));
        return docs.map(i => i.toObject()).sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    })();
    try { return await catalog; } catch (error) { catalog = undefined; throw error; }
}
const configuring = new Map<string, Promise<boolean>>();
export function configureDivineGift(power: Item): Promise<boolean> {
    const running = configuring.get(power.uuid);
    if (running) return running;
    const pending = openBuilder(power).finally(() => configuring.delete(power.uuid));
    configuring.set(power.uuid, pending);
    return pending;
}
async function openBuilder(power: Item): Promise<boolean> {
    const actor = power.actor;
    if (!actor?.isOwner) return false;
    const level = cruzadoLevel(actor), budget = giftBudget(level);
    if (!budget.improvements) { ui.notifications.warn("Presente dos Deuses: adicione a classe Cruzado à ficha primeiro."); return false; }
    const all = await weapons(), cfg = config();
    const current = power.getFlag(MODULE_ID, GIFT_CONFIG) as GiftPlan | undefined;
    const list = all.filter(w => Number((w.system as { preco?: number })?.preco ?? Infinity) <= 200);
    const improvementKeys = Object.keys(cfg.weaponUpgrades).filter(k => k !== "specialmaterial");
    const enchantKeys = Object.keys(cfg.weaponEnchantments);
    const select = (name: string, values: string[], labels: Record<string, string>, selected?: string) => `<select name="${name}"><option value="">Escolha…</option>${values.map(key => `<option value="${esc(key)}" ${key === selected ? "selected" : ""}>${esc(game.i18n.localize(labels[key]))}</option>`).join("")}</select>`;
    const optionRows = [
        ...Array.from({ length: budget.improvements }, (_, i) => `<div class="form-group"><label>Melhoria ${i + 1}</label>${select(`improvement${i}`, improvementKeys, cfg.weaponUpgrades, current?.improvements[i])}</div>`),
        ...Array.from({ length: budget.enchantments }, (_, i) => `<div class="form-group"><label>Encanto ${i + 1}</label>${select(`enchantment${i}`, enchantKeys, cfg.weaponEnchantments, current?.enchantments[i])}</div>`),
    ].join("");
    return new Promise<boolean>(resolve => {
        let saved = false;
        const dialog = new Dialog({
            title: `Presente dos Deuses — Cruzado ${level}`,
            content: `<form class="t20-gift-builder"><p>Monte sua arma divina: <b>${budget.improvements} melhoria(s) e ${budget.enchantments} encanto(s)</b>.</p><p>A arma com a primeira melhoria custa até T$ 500. Material especial não é permitido. Ela só aparece ao invocar, custa 2 PM e ocupa zero espaços.</p><div class="form-group"><label>Buscar arma</label><input name="weaponSearch" placeholder="Nome da arma…"></div><div class="form-group"><label>Arma base</label><select name="weapon"><option value="">Escolha…</option>${list.map((w, i) => `<option value="${i}" ${w._id === current?.weapon._id ? "selected" : ""}>${esc(w.name)} — T$ ${Number((w.system as { preco?: number }).preco)}</option>`).join("")}</select></div>${optionRows}<p class="gift-description"></p><p class="gift-error" role="alert" style="color:#ff9b83"></p></form>`,
            buttons: {
                save: { label: "Salvar arma divina", callback: async (html: unknown) => {
                    const root = (html as { 0: HTMLElement })[0], form = root.querySelector("form")!;
                    const selected = form.querySelector<HTMLSelectElement>('[name="weapon"]')!.value;
                    const plan: GiftPlan = {
                        weapon: list[Number(selected)] ?? {}, milestone: budget.milestone,
                        improvements: Array.from({ length: budget.improvements }, (_, i) => form.querySelector<HTMLSelectElement>(`[name="improvement${i}"]`)!.value).filter(Boolean),
                        enchantments: Array.from({ length: budget.enchantments }, (_, i) => form.querySelector<HTMLSelectElement>(`[name="enchantment${i}"]`)!.value).filter(Boolean),
                    };
                    const error = selected === "" ? "Escolha uma arma." : validateGiftPlan(plan, cruzadoLevel(actor), improvementKeys, enchantKeys);
                    if (error) { ui.notifications.warn(error); root.querySelector(".gift-error")!.textContent = error; return; }
                    await power.update({ [`flags.${MODULE_ID}.${GIFT_CONFIG}`]: plan });
                    saved = true; resolve(true);
                } }, cancel: { label: "Cancelar", callback: () => resolve(false) },
            },
            render: (html: unknown) => {
                const root = (html as { 0: HTMLElement })[0];
                root.querySelector<HTMLInputElement>('[name="weaponSearch"]')?.addEventListener("input", event => {
                    const query = (event.target as HTMLInputElement).value.toLocaleLowerCase("pt-BR");
                    root.querySelectorAll<HTMLOptionElement>('[name="weapon"] option').forEach(o => { o.hidden = !!o.value && !o.text.toLocaleLowerCase("pt-BR").includes(query); });
                });
                root.querySelectorAll("select").forEach(s => s.addEventListener("change", () => {
                    const selected = Array.from(root.querySelectorAll<HTMLSelectElement>('select:not([name="weapon"])')).map(s => s.value).filter(Boolean);
                    root.querySelector(".gift-description")!.textContent = selected.map(k => game.i18n.localize(cfg.upgrades.weapon[k]?.description ?? "").replace(/<[^>]+>/g, " ")).filter(Boolean).join(" ");
                    root.querySelector(".gift-error")!.textContent = "";
                }));
            },
            close: () => resolve(saved),
        }, { classes: ["t20-dialog"], width: 640, height: "auto" });
        // O Dialog V1 fecha após qualquer callback. Validação ocorre antes de
        // acionar o callback nativo para manter o formulário em caso de erro.
        let submitting = false;
        (dialog as unknown as { submit: (button: { callback?: (html: unknown, event: unknown) => unknown }, event: unknown) => Promise<unknown> }).submit = async function(button, event) {
            if (submitting) return;
            const root = (dialog as unknown as { element: { 0: HTMLElement } }).element[0];
            if (button.callback === (dialog as unknown as { data: { buttons: { save: { callback: unknown } } } }).data.buttons.save.callback) {
                const form = root.querySelector("form")!, choice = form.querySelector<HTMLSelectElement>('[name="weapon"]')!.value;
                const plan: GiftPlan = { weapon: list[Number(choice)] ?? {}, milestone: budget.milestone,
                    improvements: Array.from(form.querySelectorAll<HTMLSelectElement>('[name^="improvement"]')).map(s => s.value).filter(Boolean),
                    enchantments: Array.from(form.querySelectorAll<HTMLSelectElement>('[name^="enchantment"]')).map(s => s.value).filter(Boolean) };
                const error = choice === "" ? "Escolha uma arma." : validateGiftPlan(plan, cruzadoLevel(actor), improvementKeys, enchantKeys);
                if (error) { root.querySelector(".gift-error")!.textContent = error; return; }
            }
            submitting = true;
            try {
                await button.callback?.call(dialog, (dialog as unknown as { element: unknown }).element, event);
                await (dialog as unknown as { close(): Promise<void> }).close();
            } catch (error) {
                warn("Presente dos Deuses: não foi possível salvar a configuração", error);
                root.querySelector(".gift-error")!.textContent = "Não foi possível salvar. Tente novamente.";
            } finally { submitting = false; }
        };
        dialog.render(true);
    });
}

export async function removeDivineGift(actor: Actor): Promise<void> {
    const weapons = actor.items.contents.filter(i => i.flags?.[MODULE_ID]?.[SUMMONED_GIFT]);
    const origins = new Set(weapons.map(w => w.uuid));
    const effects = actor.effects.contents.filter(e => e.origin && origins.has(e.origin));
    if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
    if (weapons.length) await actor.deleteEmbeddedDocuments("Item", weapons.map(w => w.id));
}
const casting = new Set<string>();
export function setupDivineGift(callbacks: { summoned(actor: unknown): Promise<void>; dismiss(actor: unknown): Promise<void> }): void {
    Hooks.once("ready", () => {
        const proto = (CONFIG as unknown as { Item: { documentClass: { prototype: Item } } }).Item.documentClass.prototype;
        const native = proto.roll;
        proto.roll = async function(...args) {
            if (!giftPower(this) || !this.actor) return native.apply(this, args);
            const actor = this.actor;
            if (casting.has(actor.uuid)) return;
            casting.add(actor.uuid);
            try {
                const cfg = config();
                let plan = this.getFlag(MODULE_ID, GIFT_CONFIG) as GiftPlan | undefined;
                if (!plan || plan.milestone !== giftBudget(cruzadoLevel(actor)).milestone
                    || validateGiftPlan(plan, cruzadoLevel(actor), Object.keys(cfg.weaponUpgrades), Object.keys(cfg.weaponEnchantments))) {
                    if (!await configureDivineGift(this)) return;
                    plan = this.getFlag(MODULE_ID, GIFT_CONFIG) as GiftPlan;
                }
                if (actor.items.contents.some(i => i.flags?.[MODULE_ID]?.[SUMMONED_GIFT])) {
                    ui.notifications.info("Seu Presente dos Deuses já está invocado. Você pode dispensá-lo pelo menu T20."); return;
                }
                const templates = { ...cfg.upgrades.general, ...cfg.upgrades.weapon };
                const effects = [...plan.improvements, ...plan.enchantments].flatMap(key => {
                    const template = templates[key];
                    if (!template) return [];
                    const effect = structuredClone(template);
                    effect.name = game.i18n.localize(template.name); effect.description = game.i18n.localize(template.description ?? "");
                    // Melhorias da arma são locais a ela; nunca transferem seus
                    // bônus para todas as outras armas do personagem.
                    effect.transfer = false; effect.disabled = false;
                    effect.flags = { ...template.flags, tormenta20: { ...template.flags?.tormenta20, self: true, onuse: template.flags?.tormenta20?.onuse ?? true, upgrade: key } };
                    return [effect];
                });
                const data = summonedGiftData(plan, this.id, sceneId(), effects);
                const result = await native.apply(this, args);
                if (!result) return result;
                await actor.createEmbeddedDocuments("Item", [data]);
                await actor.setFlag(MODULE_ID, "presenteInvocado", { ts: Date.now(), sceneId: sceneId() });
                await callbacks.summoned(actor); refreshSkillsMenu();
                return result;
            } finally { casting.delete(actor.uuid); }
        };
    });
    const prompt = (item: Item, userId: unknown) => {
        if (userId !== game.user?.id || !item.actor?.isOwner) return;
        const isCruzado = item.type === "classe" && item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "cruzado";
        const power = giftPower(item) ? item : isCruzado ? gift(item.actor) : undefined;
        if (power && giftBudget(cruzadoLevel(item.actor)).milestone > Number((power.getFlag(MODULE_ID, GIFT_CONFIG) as GiftPlan)?.milestone ?? 0)) {
            void configureDivineGift(power).catch(error => warn("Presente dos Deuses: configuração", error));
        }
    };
    Hooks.on("createItem", (...args: unknown[]) => { prompt(args[0] as Item, args[2]); });
    Hooks.on("updateItem", (...args: unknown[]) => {
        const item = args[0] as Item, changes = args[1] as { system?: { niveis?: number }; "system.niveis"?: number };
        if (item.type === "classe" && (changes.system?.niveis !== undefined || changes["system.niveis"] !== undefined)) prompt(item, args[3]);
    });
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as Item;
        if (giftPower(item) && item.actor && args[2] === game.user?.id) void callbacks.dismiss(item.actor);
    });
    for (const hook of ["deleteScene", "updateScene"]) Hooks.on(hook, (...args: unknown[]) => {
        if (!isActiveGM()) return;
        if (hook === "updateScene" && (args[1] as { active?: boolean }).active !== false) return;
        const id = (args[0] as { id: string }).id;
        for (const actor of actors()) if ((actor.getFlag(MODULE_ID, "presenteInvocado") as { sceneId?: string })?.sceneId === id) void callbacks.dismiss(actor);
    });
    registerSkillAction({ id: "cruzado-presente-configurar", label: "Configurar Presente dos Deuses", icon: "fa-solid fa-hammer",
        isVisible: () => actors().some(a => a.isOwner && gift(a)),
        onClick: async () => {
            const actor=await chooseActionActor(actors().filter(a=>a.isOwner&&gift(a)),"Configurar Presente dos Deuses");
            if(actor)await configureDivineGift(gift(actor)!);
        },
    });
}
