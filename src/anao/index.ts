import { MODULE_ID } from "@/constants";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { warn } from "@/utils/logging";
import { chooseActionActor } from "@/_shared/actor-choice";
import { applyDuroComoAco, dwarfAttackBonus, dwarfPowerName, hasDwarfPower, isBelovedWeapon, norm, prepareDwarfActor, prepareDwarfWeapon, type DwarfActor, type DwarfItem } from "./format";

interface Effect { id?: string; name?: string; flags?: Record<string, Record<string, unknown>> }
interface Actor extends DwarfActor {
    id: string; isOwner?: boolean;
    effects: { contents: Effect[]; filter(predicate: (e: Effect) => boolean): Effect[] };
}
interface Power extends DwarfItem { actor?: Actor; update(data: object): Promise<unknown> }
const patched = new WeakSet<object>();
function slots(): boolean { return !!game.settings.get("tormenta20", "equipmentSlots"); }
function legacyAutomated(effect: Effect): boolean {
    return ["conforto do aco", "atracao pela polvora", "arma amada", "tradicao de heredrimm", "tradicao de ayrelynn"].includes(norm(effect.name).split(":")[0]);
}
function patchEffects(actor: Actor): void {
    const pool = actor.effects;
    if (patched.has(pool)) return;
    const native = pool.filter;
    pool.filter = function(predicate) {
        const effects = native.call(this, e => !legacyAutomated(e)
            && (!norm(e.name).startsWith("conhecimento das rochas") || hasDwarfPower(actor, "conhecimento das rochas")));
        const EffectClass = (CONFIG as unknown as { ActiveEffect: { documentClass: new (data: object, context: object) => Effect } }).ActiveEffect.documentClass;
        for (const power of actor.items?.contents ?? []) {
            if (power.type !== "poder" || dwarfPowerName(power) !== "arma amada") continue;
            const weapon = actor.items?.contents.find(i => i.type === "arma" && isBelovedWeapon({ items: { contents: [power] } }, i));
            if (!weapon) continue;
            effects.push(new EffectClass({
                _id: `AM${power.id?.slice(2)}`, name: "Arma Amada — resistir a desarmar/quebrar (+5)", disabled: true,
                changes: [{ key: "ataque", mode: 2, value: "5", priority: 0 }],
                flags: { tormenta20: { onuse: true, attack: true, items: weapon.name, custo: "", self: false } },
            }, { parent: actor }));
        }
        return effects.filter(predicate);
    };
    patched.add(pool);
}
export async function chooseBelovedWeapon(power: Power): Promise<void> {
    const weapons = [...(power.actor?.items?.contents.filter(i => i.type === "arma") ?? [])];
    for (const gift of power.actor?.items?.contents ?? []) {
        const plan = gift.flags?.[MODULE_ID]?.presenteConfig as { weapon?: { name?: string } } | undefined;
        if (plan?.weapon) weapons.push({ id: `gift:${gift.id}`, name: `${plan.weapon.name} — Presente dos Deuses` });
    }
    if (!weapons.length) { ui.notifications.warn("Arma Amada: adicione a arma escolhida à ficha e use Configurar Arma Amada no menu T20."); return; }
    const options = weapons.map(i => { const option = document.createElement("option"); option.value = i.id ?? ""; option.textContent = i.name ?? "Arma"; return option.outerHTML; }).join("");
    await new Promise<void>(resolve => new Dialog({
        title: "Arma Amada — escolha sua arma",
        content: `<form><div class="form-group"><label>Arma</label><select name="weapon">${options}</select></div><p>+2 no dano; +5 apenas ao resistir a desarmar e quebrar.</p></form>`,
        buttons: { save: { label: "Vincular arma", callback: async (html: unknown) => {
            const root = (html as { 0: HTMLElement })[0];
            await power.update({ [`flags.${MODULE_ID}.armaAmadaId`]: root.querySelector<HTMLSelectElement>("select")?.value });
            refreshSkillsMenu(); resolve();
        } } }, close: () => resolve(),
    }, { classes: ["t20-dialog"], width: 460 }).render(true));
}
/** Registrado antes do init: a primeira preparação já precisa usar os passivos. */
export function setupDwarfPowers(): void {
    Hooks.once("init", () => {
        const cfg = CONFIG as unknown as {
            Actor: { documentClass: { prototype: { applyActiveEffects(this: Actor): unknown; allApplicableEffects(this: Actor): Iterable<Effect> } }; dataModels: { character: { prototype: object } } };
            Item: { documentClass: { prototype: { clone(this: DwarfItem, ...args: unknown[]): DwarfItem | Promise<unknown>; prepareDerivedData(this: DwarfItem): unknown; prepareFinalAttributes(this: DwarfItem): unknown; getAttackToHit(this: DwarfItem): { parts: string[] } | undefined } } };
        };
        const actorProto = cfg.Actor.documentClass.prototype;
        const originalEffects = actorProto.allApplicableEffects;
        actorProto.allApplicableEffects = function*() {
            for (const effect of originalEffects.call(this)) {
                if (!["duro como pedra", "devagar e sempre"].includes(norm(effect.name))) yield effect;
            }
        };
        const originalApply = actorProto.applyActiveEffects;
        actorProto.applyActiveEffects = function() {
            patchEffects(this);
            // Imunidades precisam existir ANTES de verificar condições ativas.
            prepareDwarfActor(this, slots());
            const result = originalApply.call(this);
            prepareDwarfActor(this, slots());
            return result;
        };
        const itemProto = cfg.Item.documentClass.prototype;
        const originalClone = itemProto.clone;
        itemProto.clone = function(...args) {
            const result = originalClone.apply(this, args);
            if (result && !(result instanceof Promise)) {
                result._t20DwarfSourceId = this._t20DwarfSourceId ?? this.id;
                prepareDwarfWeapon(result);
            }
            return result;
        };
        const originalDerived = itemProto.prepareDerivedData, originalFinal = itemProto.prepareFinalAttributes;
        itemProto.prepareDerivedData = function() {
            const result = originalDerived.call(this);
            if (this.type === "equipamento" && ["leve", "pesada"].includes(this.system?.tipo ?? "")
                && this.system?.armadura && hasDwarfPower(this.actor, "conforto do aco")) this.system.armadura.penalidade = 0;
            prepareDwarfWeapon(this);
            return result;
        };
        itemProto.prepareFinalAttributes = function() { prepareDwarfWeapon(this); return originalFinal.call(this); };
        const originalAttack = itemProto.getAttackToHit;
        itemProto.getAttackToHit = function() {
            const result = originalAttack.call(this);
            const bonus = this.actor ? dwarfAttackBonus(this.actor, this) : 0;
            if (result && bonus) result.parts.push(String(bonus));
            return result;
        };
        // A Constituição definitiva só existe depois de prepareAtributos.
        let skillProto = cfg.Actor.dataModels.character.prototype as { prepareSkills?: (this: { parent: Actor }, ...args: unknown[]) => unknown };
        while (!Object.prototype.hasOwnProperty.call(skillProto, "prepareSkills")) skillProto = Object.getPrototypeOf(skillProto);
        const originalSkills = skillProto.prepareSkills!;
        skillProto.prepareSkills = function(...args) { applyDuroComoAco(this.parent, slots()); return originalSkills.apply(this, args); };
    });
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as Power;
        if (args[2] === game.user?.id && item.actor?.isOwner && dwarfPowerName(item) === "arma amada" && !item.flags?.[MODULE_ID]?.armaAmadaId) void chooseBelovedWeapon(item).catch(e => warn("Arma Amada", e));
    });
    registerSkillAction({
        id: "anao-arma-amada", label: "Configurar Arma Amada", icon: "fa-solid fa-hammer",
        isVisible: () => (game.actors?.contents ?? []).some(a => (a as FoundryActor & { isOwner?: boolean }).isOwner && hasDwarfPower(a as unknown as DwarfActor, "arma amada")),
        onClick: async () => {
            const actor=await chooseActionActor((game.actors?.contents ?? []).filter(a=>(a as FoundryActor & {isOwner?:boolean}).isOwner&&hasDwarfPower(a as unknown as DwarfActor,"arma amada")),"Configurar Arma Amada");
            if(actor) {
                for (const power of actor.items?.contents ?? []) if (dwarfPowerName(power as DwarfItem) === "arma amada") await chooseBelovedWeapon(power as unknown as Power);
            }
        },
    });
}
