/**
 * Veneno Aprimorado (Medusa): Natureza Venenosa passa de 1d12 para 2d12 PV.
 *
 * Trabalha apenas com clones de uso: o poder racial original e as cópias dos
 * seus efeitos no ator permanecem intactos. Remover o aprimoramento faz o uso
 * seguinte voltar automaticamente a 1d12, sem migração ou flags de restauração.
 */
import { log, warn } from "@/utils/logging";

interface NamedItem { type?: string; name?: string }
interface ActorLike { items?: { contents?: NamedItem[] } }
interface RollLike { type?: string; parts?: string[][] }
interface ChangeLike { key: string; value: string; mode: number; priority?: number | null }
interface EffectLike {
    name?: string;
    flags?: { tormenta20?: { onuse?: boolean; attack?: boolean } };
    changes: ChangeLike[];
    clone(data: { changes: ChangeLike[] }, options: { keepId: boolean }): EffectLike;
}
interface ItemLike extends NamedItem {
    actor?: ActorLike | null;
    system?: { rolls?: RollLike[] };
    clone(data: object, options: { keepId: boolean }): ItemLike;
    updateSource(data: object): unknown;
}
interface ItemPrototype {
    roll?: (this: ItemLike, ...args: unknown[]) => unknown;
    _t20VenenoAprimoradoPatched?: boolean;
}

function normalize(name: string | undefined): string {
    return (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isPower(item: NamedItem | null | undefined, name: string): boolean {
    const normalized = normalize(item?.name);
    return item?.type === "poder" && (normalized === name || normalized.endsWith(`: ${name}`));
}

export function hasVenenoAprimorado(actor: ActorLike | null | undefined): boolean {
    return (actor?.items?.contents ?? []).some(item => isPower(item, "veneno aprimorado"));
}

/** Altera só a parcela nativa de perda de PV; preserva bônus e rolls adicionais. */
export function improvedPoisonRolls(rolls: RollLike[]): RollLike[] {
    return rolls.map(roll => ({
        ...roll,
        parts: roll.parts?.map(part => {
            const copy = [...part];
            if (roll.type === "dano" && part[1] === "perda" && /^1d12$/i.test(part[0]?.trim() ?? "")) {
                copy[0] = "2d12";
            }
            return copy;
        }),
    }));
}

/**
 * O T20 oferece a Natureza Venenosa como um efeito opcional de ataque (ADD).
 * Clona apenas esse efeito, mantendo id, custo, seleção e comportamento nativos.
 * O outro efeito homônimo (+5 contra veneno) não é alterado.
 */
export function improvedPoisonEffects(effects: EffectLike[]): EffectLike[] {
    return effects.map(effect => {
        if (normalize(effect.name) !== "natureza venenosa"
            || !effect.flags?.tormenta20?.onuse || !effect.flags.tormenta20.attack) return effect;
        let changed = false;
        const changes = effect.changes.map(change => {
            if (change.key !== "dano" || change.mode !== 2 || !/^1d12(?:\[perda\])?$/i.test(change.value.trim())) return change;
            changed = true;
            return { ...change, value: change.value.replace(/1d12/i, "2d12") };
        });
        return changed ? effect.clone({ changes }, { keepId: true }) : effect;
    });
}

/** Instala os wrappers uma vez; exportado para verificar o fluxo de uso. */
export function installVenenoAprimorado(prototype: object): boolean {
    const proto = prototype as ItemPrototype;
    if (proto._t20VenenoAprimoradoPatched) return true;
    const originalRoll = proto.roll;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "validOnUseEffects");
    const originalEffects = descriptor?.get;
    if (typeof originalRoll !== "function" || !originalEffects || !descriptor?.configurable) return false;

    proto.roll = function (this: ItemLike, ...args: unknown[]): unknown {
        if (!isPower(this, "natureza venenosa") || !hasVenenoAprimorado(this.actor)) {
            return originalRoll.call(this, ...args);
        }
        const clone = this.clone({}, { keepId: true });
        clone.updateSource({ "system.rolls": improvedPoisonRolls(clone.system?.rolls ?? []) });
        return originalRoll.call(clone, ...args);
    };
    Object.defineProperty(proto, "validOnUseEffects", {
        ...descriptor,
        get(this: ItemLike): EffectLike[] {
            const effects = originalEffects.call(this) as EffectLike[];
            return this.type === "arma" && hasVenenoAprimorado(this.actor)
                ? improvedPoisonEffects(effects) : effects;
        },
    });
    proto._t20VenenoAprimoradoPatched = true;
    return true;
}

export function setupVenenoAprimorado(): void {
    Hooks.once("ready", () => {
        const proto = (CONFIG as unknown as { Item?: { documentClass?: { prototype: ItemPrototype } } })
            .Item?.documentClass?.prototype;
        if (!proto || !installVenenoAprimorado(proto)) {
            warn("Veneno Aprimorado: métodos de uso do ItemT20 não encontrados.");
            return;
        }
        log("Veneno Aprimorado: Natureza Venenosa causa perda de 2d12 PV para portadores do poder.");
    });
}
