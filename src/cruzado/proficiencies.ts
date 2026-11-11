import { cruzadoLevel, type GiftClassActor } from "./gift-format";
interface Actor extends GiftClassActor { system?: { tracos?: { profArmas?: { value: string[] }; profArmaduras?: { value: string[] } } } }
/** A arma divina usa as proficiências normais da classe. União derivada para
 * alcançar também fichas antigas, sem apagar escolhas ou regravar recursos. */
export function deriveCruzadoProficiencies(actor: Actor): void {
    if (!cruzadoLevel(actor)) return;
    for (const [field, grants] of [["profArmas", ["simples", "marcial"]], ["profArmaduras", ["lev", "pes", "esc"]]] as const) {
        const trait = actor.system?.tracos?.[field];
        if (trait) trait.value = [...new Set([...trait.value, ...grants])];
    }
}
export function setupCruzadoProficiencies(): void {
    Hooks.once("init", () => {
        const proto = (CONFIG as unknown as { Actor: { documentClass: { prototype: { applyActiveEffects(this: Actor): unknown } } } }).Actor.documentClass.prototype;
        const native = proto.applyActiveEffects;
        proto.applyActiveEffects = function() { deriveCruzadoProficiencies(this); return native.call(this); };
    });
}
