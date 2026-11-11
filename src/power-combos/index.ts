import { warn } from "@/utils/logging";
import { comboSources, effectivePowerCost, empathyBonus, powerFamily, powerLabel, resolvePowerEffects, visiblePowerItems, type Power, type PowerActor, type PowerEffect } from "./format";

interface Actor extends PowerActor {
    effects: { contents: PowerEffect[]; filter: (predicate: (e: PowerEffect) => boolean) => PowerEffect[] };
    system: { pericias?: Record<string, { bonus?: string[] }> };
}
interface Item extends Power {
    actor?: Actor; clone(data: object, options?: { keepId: boolean }): Item;
    roll(...args: unknown[]): Promise<unknown>;
}
const patched = new WeakSet<object>();
/** O T20 lê AEs por Collection.filter tanto ao montar o formulário quanto ao
 * aplicar os usos. Resolver ANTES do predicado mantém ambos os caminhos iguais,
 * inclusive usos sem diálogo; contents/toObject preservam os documentos reais.
 */
export function patchPowerEffectCollection(actor: Actor): void {
    const effects = actor.effects;
    if (!effects || patched.has(effects)) return;
    const native = effects.filter;
    effects.filter = function(predicate) {
        return resolvePowerEffects(actor, native.call(this, () => true)).filter(predicate);
    };
    patched.add(effects);
}
export function applyEmpathyBonus(actor: Actor): void {
    const skill = actor.system.pericias?.ades;
    if (!skill) return;
    // prepareData pode rodar sem resetar os campos derivados (por exemplo,
    // ao abrir uma ficha). Substituir nossa parcela evita acumulá-la.
    const marker = "2[Empatia Selvagem combinada]";
    skill.bonus = (skill.bonus ?? []).filter(value => value !== marker);
    if (empathyBonus(actor)) skill.bonus.push(marker);
}
function enhanceSheet(actor: Actor, root: HTMLElement): void {
    const powers = actor.items?.contents ?? [];
    const visible = new Set(visiblePowerItems(actor, powers).map(i => i.id));
    root.querySelectorAll<HTMLElement>(".item[data-item-id]").forEach(row => {
        const item = powers.find(i => i.id === row.dataset.itemId);
        if (!item || !powerFamily(item)) return;
        if (!visible.has(item.id)) { row.hidden = true; row.style.display = "none"; return; }
        const label = row.querySelector(".item-name label, .item-name h4");
        if (label) label.textContent = powerLabel(actor, item);
        const cost = row.querySelector(".item-activation");
        if (cost) cost.textContent = `${effectivePowerCost(actor, item)} PM`;
        const sources = comboSources(actor, item);
        if (sources.length < 2 || row.querySelector(".t20-power-sources")) return;
        const details = document.createElement("details");
        details.className = "t20-power-sources";
        details.style.cssText = "flex-basis:100%;font-size:11px;padding:3px 8px";
        const summary = document.createElement("summary"); summary.textContent = `Fontes (${sources.length})`;
        details.append(summary);
        for (const source of sources) {
            const button = document.createElement("a");
            button.textContent = source.name ?? "Poder"; button.style.marginRight = "12px";
            button.addEventListener("click", e => {
                e.preventDefault(); e.stopPropagation();
                (source as Power & { sheet?: { render(force: boolean): unknown } }).sheet?.render(true);
            });
            details.append(button);
        }
        row.append(details);
    });
}
export function setupPowerCombos(): void {
    Hooks.once("ready", () => {
        const config = CONFIG as unknown as {
            Actor: { documentClass: { prototype: { applyActiveEffects: (this: Actor, ...args: unknown[]) => unknown; _t20PowerCombos?: boolean } } };
            Item: { documentClass: { prototype: Item & { _t20PowerCombos?: boolean } } };
        };
        const actorProto = config.Actor.documentClass.prototype;
        if (!actorProto._t20PowerCombos) {
            const native = actorProto.applyActiveEffects;
            actorProto.applyActiveEffects = function(...args) {
                patchPowerEffectCollection(this);
                const result = native.apply(this, args);
                applyEmpathyBonus(this);
                return result;
            };
            actorProto._t20PowerCombos = true;
        }
        const itemProto = config.Item.documentClass.prototype;
        if (!itemProto._t20PowerCombos) {
            const native = itemProto.roll;
            itemProto.roll = function(...args) {
                const actor = this.actor;
                if (!actor || !powerFamily(this)) return native.apply(this, args);
                const cost = effectivePowerCost(actor, this);
                if (cost === Number(this.system?.ativacao?.custo)) return native.apply(this, args);
                const item = this.clone({ "system.ativacao.custo": cost }, { keepId: true });
                return native.apply(item, args);
            };
            itemProto._t20PowerCombos = true;
        }
        // Conectar a visão de AEs não exige recalcular os demais bônus. Empatia
        // já existente precisa de reset (prepareData isolado pode reaplicar AEs
        // de outros poderes sobre dados já preparados pelo sistema).
        for (const actor of game.actors?.contents ?? []) {
            try {
                patchPowerEffectCollection(actor as unknown as Actor);
                if (empathyBonus(actor)) (actor as unknown as { reset(): void }).reset();
            }
            catch (error) { warn("Combinações: não foi possível preparar o ator", actor.name, error); }
        }
    });
    Hooks.on("renderActorSheet", (...args: unknown[]) => {
        const actor = (args[0] as { actor?: Actor }).actor;
        const html = args[1], root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })?.[0];
        if (actor && root) enhanceSheet(actor, root);
    });
}
