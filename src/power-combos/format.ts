/** Combinações explícitas do Jogo do Ano (pp. 21, 28, 47 e 68).
 * As fontes continuam sendo documentos independentes; apenas seu uso é unificado.
 */
export interface Power {
    id?: string; name?: string; type?: string;
    system?: { subtipo?: unknown; tipo?: unknown; ativacao?: { custo?: unknown } };
    effects?: { contents?: PowerEffect[] };
}
export interface PowerActor { items?: { contents?: Power[] } }
export interface PowerEffect {
    id?: string; name?: string; origin?: string; disabled?: boolean;
    changes?: Array<{ key: string; value: string; mode: number; priority?: number | null }>;
    flags?: Record<string, Record<string, unknown>>;
    clone?(data: object, options: { keepId: boolean }): PowerEffect;
}
export function norm(value: unknown): string {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
export function powerFamily(item: Power): string {
    if (item.type !== "poder") return "";
    const name = norm(item.name).replace(/\s*\([^)]*\)\s*$/, "");
    return ["engenhosidade", "empatia selvagem", "surto heroico", "aventureiro avido"].includes(name) ? name : "";
}
export function sourceOf(item: Power): string {
    return norm(item.system?.subtipo || item.name?.match(/\(([^)]+)\)$/)?.[1] || item.system?.tipo);
}
export function familyItems(actor: PowerActor, family: string): Power[] {
    return (actor.items?.contents ?? []).filter(i => powerFamily(i) === family);
}
function repeatedRacial(actor: PowerActor, family: string, race: string): boolean {
    const sources = new Set(familyItems(actor, family).map(sourceOf).filter(Boolean));
    return sources.has(race) && sources.size > 1;
}
export function ingenuityCombo(actor: PowerActor): boolean { return repeatedRacial(actor, "engenhosidade", "kliren"); }
export function empathyBonus(actor: PowerActor): number { return repeatedRacial(actor, "empatia selvagem", "dahllan") ? 2 : 0; }
export function heroicCombo(actor: PowerActor): boolean {
    return !!familyItems(actor, "surto heroico").length && !!familyItems(actor, "aventureiro avido").length;
}
export function effectivePowerCost(actor: PowerActor, item: Power, base: unknown = item.system?.ativacao?.custo): number {
    const cost = Number(base) || 0;
    const family = powerFamily(item);
    if (family === "empatia selvagem") return 0;
    const discount = family === "engenhosidade" && ingenuityCombo(actor) ? 1
        : ["surto heroico", "aventureiro avido"].includes(family) && heroicCombo(actor) ? 2 : 0;
    return discount ? Math.max(1, cost - discount) : cost;
}
/** Somente famílias conhecidas. Poderes diferentes (Audácia, por exemplo) permanecem separados. */
export function visiblePowerItems<T extends Power>(actor: PowerActor, items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter(i => {
        const family = powerFamily(i);
        if (heroicCombo(actor) && family === "aventureiro avido") return false;
        if (!family) return true;
        if (seen.has(family)) return false;
        seen.add(family);
        return true;
    });
}
export function comboSources(actor: PowerActor, item: Power): Power[] {
    const family = powerFamily(item);
    return heroicCombo(actor) && ["surto heroico", "aventureiro avido"].includes(family)
        ? (actor.items?.contents ?? []).filter(i => ["surto heroico", "aventureiro avido"].includes(powerFamily(i)))
        : family ? familyItems(actor, family) : [item];
}
export function powerLabel(actor: PowerActor, item: Power): string {
    const sources = comboSources(actor, item);
    if (sources.length < 2) return item.name ?? "";
    if (powerFamily(item) === "surto heroico") return "Surto Heroico + Aventureiro Ávido";
    return `${powerFamily(item) === "engenhosidade" ? "Engenhosidade" : "Empatia Selvagem"} (${[...new Set(sources.map(i => String(i.system?.subtipo || i.name?.match(/\(([^)]+)\)$/)?.[1] || "Fonte")))].join(" + ")})`;
}
function effectItem(actor: PowerActor, effect: PowerEffect): Power | undefined {
    return (actor.items?.contents ?? []).find(i => (i.id && effect.origin?.endsWith(`.Item.${i.id}`))
        || i.effects?.contents?.some(e => e === effect || e.id === effect.id));
}
function copyEffect<T extends PowerEffect>(effect: T, flags: Record<string, Record<string, unknown>>): T {
    return (effect.clone?.({ flags }, { keepId: true }) ?? { ...effect, flags }) as T;
}
/** Utilizado pelo filtro nativo de AEs e pelos seletores próprios do módulo.
 * Clones mantêm o ID usado pelo formulário; nenhum documento/PM é alterado aqui.
 */
export function resolvePowerEffects<T extends PowerEffect>(actor: PowerActor, effects: T[]): T[] {
    const seen = new Set<string>();
    return effects.flatMap(effect => {
        if (!effect.flags?.tormenta20?.onuse) return [effect];
        const item = effectItem(actor, effect);
        const family = item && powerFamily(item);
        // O legacy transferral pode deixar a cópia no ator após excluir o
        // item. Ela não é uma terceira fonte nem deve voltar ao seletor.
        if (!item && /(?:^|\.)Actor\.[^.]+\.Item\.[^.]+$/.test(effect.origin ?? "")
            && ["engenhosidade", "empatia selvagem"].includes(norm(effect.name))) return [];
        // O +2 de Adestramento é passivo e existe apenas com a segunda fonte.
        if (family === "empatia selvagem" && norm(effect.name) === "empatia selvagem") return [];
        if (family !== "engenhosidade" || norm(effect.name).replace(/\s*\([^)]*\)$/, "") !== "engenhosidade") return [effect];
        if (seen.has(family)) return [];
        seen.add(family);
        return [copyEffect(effect, { ...effect.flags, tormenta20: {
            ...effect.flags.tormenta20,
            custo: String(effectivePowerCost(actor, item!, effect.flags.tormenta20.custo)),
            skill: true, attack: false, ability: false, self: false,
        } })];
    });
}
