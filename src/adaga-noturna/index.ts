/** Adaga Noturna: 1 PM por arma, +1d6 de frio durante a cena. */
import { MODULE_ID } from "@/constants";
import { escHtml } from "@/_shared/html";
import { warn } from "@/utils/logging";

const FLAG = "adagaNoturnaWeaponId";
interface Weapon {
    id?: string | null;
    uuid?: string;
    name?: string;
    img?: string;
    type?: string;
    actor?: Actor | null;
    system?: { equipado?: boolean | number; equipado2?: { slot?: number }; rolls?: Array<{ type?: string; parts?: string[][] }> };
    clone?(data: object, options: { keepId: boolean }): Weapon;
    updateSource?(data: object): unknown;
}
interface Effect {
    id?: string;
    name?: string;
    disabled?: boolean;
    flags?: Record<string, Record<string, unknown>>;
}
interface Actor {
    isOwner?: boolean;
    items?: { contents: Weapon[]; get(id: string): Weapon | undefined };
    effects: { contents: Effect[] };
    system: { attributes: { pm: { value: number; temp?: number } } };
    spendMana(amount: number): Promise<unknown>;
    createEmbeddedDocuments(type: string, data: object[]): Promise<unknown>;
}

function isNightDagger(name?: string): boolean {
    return (name ?? "").trim().toLocaleLowerCase("pt-BR") === "adaga noturna";
}

export function isPiercingWeapon(item: Weapon): boolean {
    const equipped = game.settings.get("tormenta20", "equipmentSlots")
        ? Boolean(item.system?.equipado2?.slot) : Boolean(item.system?.equipado);
    return item.type === "arma" && equipped && Boolean(item.system?.rolls?.some(
        roll => roll.type === "dano" && roll.parts?.some(part => part[1] === "perfuracao"),
    ));
}

/** Retira o aprimoramento legado que cobrava por ataque e herdava o tipo da arma. */
export function nightDaggerEffects(effects: Effect[]): Effect[] {
    return effects.filter(e => !(isNightDagger(e.name) && e.flags?.tormenta20?.onuse && e.flags.tormenta20.attack));
}

/** Injeta o frio no clone de uso: funciona também sem o diálogo nativo de ataque. */
export function nightDaggerRolls(item: Weapon, actorEffects: Effect[]): NonNullable<Weapon["system"]>["rolls"] {
    const rolls = item.system?.rolls;
    if (!isPiercingWeapon(item) || !actorEffects.some(e => !e.disabled && e.flags?.[MODULE_ID]?.[FLAG] === item.id)) return rolls;
    return rolls?.map(roll => roll.type === "dano"
        ? { ...roll, parts: [...(roll.parts ?? []).map(part => [...part]), ["1d6", "frio", "Adaga Noturna"]] }
        : roll);
}

/** O marcador vazio no ator usa o gerenciador de duração já existente. */
export async function activateNightDagger(actor: Actor, weapon: Weapon, origin: string, img: string): Promise<boolean> {
    if (!weapon.id || !isPiercingWeapon(weapon)) return false;
    if (actor.effects.contents.some(e => e.flags?.[MODULE_ID]?.[FLAG] === weapon.id)) return false;
    const pm = actor.system.attributes.pm;
    if (Number(pm.value) + Number(pm.temp ?? 0) < 1) return false;
    // Aguarda a criação antes de debitar: uma falha de documento não consome PM.
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: `Adaga Noturna — ${weapon.name}`, img, origin, disabled: false, transfer: false,
        changes: [], duration: { rounds: 99 },
        flags: {
            tormenta20: { onuse: false, durationScene: true },
            [MODULE_ID]: { [FLAG]: weapon.id, dur: { managed: true, kind: "scene", source: "power", label: "Adaga Noturna" } },
        },
    }]);
    await actor.spendMana(1);
    return true;
}

const pending = new WeakSet<Actor>();
async function usePower(item: Weapon): Promise<null> {
    const actor = item.actor;
    if (!actor?.isOwner || pending.has(actor)) return null;
    pending.add(actor);
    try {
        const weapons = (actor.items?.contents ?? []).filter(isPiercingWeapon).filter(
            weapon => !actor.effects.contents.some(e => e.flags?.[MODULE_ID]?.[FLAG] === weapon.id),
        );
        if (!weapons.length) {
            ui.notifications.warn("Adaga Noturna: empunhe uma arma de perfuração que ainda não tenha este efeito.");
            return null;
        }
        const selected = await foundry.applications.api.DialogV2.wait({
            window: { title: "Adaga Noturna" },
            content: `<p>Gaste 1 PM para uma arma de perfuração causar +1d6 de frio até o fim da cena.</p>`
                + `<label>Arma <select name="weapon">${weapons.map((w, i) => `<option value="${i}">${escHtml(w.name ?? "Arma")}</option>`).join("")}</select></label>`,
            buttons: [{ action: "activate", label: "Encantar (1 PM)", default: true,
                callback: (_event, button) => {
                    const select = button.form?.querySelector<HTMLSelectElement>('select[name="weapon"]');
                    return select?.value ?? null;
                } }, { action: "cancel", label: "Cancelar", callback: () => null }],
            rejectClose: false,
        });
        if (selected === null) return null;
        const chosen = weapons[Number(selected)];
        const current = chosen?.id ? actor.items?.get(chosen.id) : undefined;
        if (!current || !await activateNightDagger(actor, current, item.uuid ?? "", item.img ?? "icons/svg/ice-aura.svg")) {
            ui.notifications.warn("Adaga Noturna: confira os PM disponíveis e a arma empunhada.");
        } else ui.notifications.info(`Adaga Noturna: ${current.name} causa +1d6 de frio nesta cena.`);
    } catch (error) {
        warn("Adaga Noturna: falha na ativação", error);
        ui.notifications.error("Não foi possível ativar Adaga Noturna.");
    } finally { pending.delete(actor); }
    return null;
}

export function setupAdagaNoturna(): void {
    Hooks.once("ready", () => {
        const proto = (CONFIG as unknown as { Item: { documentClass: { prototype: {
            roll: (this: Weapon, ...args: unknown[]) => unknown;
            _t20AdagaNoturna?: boolean;
        } } } }).Item.documentClass.prototype;
        if (proto._t20AdagaNoturna) return;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "validOnUseEffects");
        if (!descriptor?.get || !descriptor.configurable) return;
        const originalRoll = proto.roll;
        proto.roll = function (...args: unknown[]): unknown {
            if (this.type === "poder" && isNightDagger(this.name) && this.actor) return usePower(this);
            const rolls = nightDaggerRolls(this, this.actor?.effects.contents ?? []);
            if (rolls !== this.system?.rolls && this.clone) {
                const clone = this.clone({}, { keepId: true });
                clone.updateSource?.({ "system.rolls": rolls });
                return originalRoll.call(clone, ...args);
            }
            return originalRoll.call(this, ...args);
        };
        const originalEffects = descriptor.get;
        Object.defineProperty(proto, "validOnUseEffects", { ...descriptor, get(this: Weapon) {
            const effects = originalEffects.call(this) as Effect[];
            return this.type === "arma" ? nightDaggerEffects(effects) : effects;
        } });
        proto._t20AdagaNoturna = true;
    });
}
