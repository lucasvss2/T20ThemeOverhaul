import { MODULE_ID } from "@/constants";
export interface DwarfItem {
    id?: string; name?: string; type?: string;
    _t20DwarfSourceId?: string;
    flags?: Record<string, Record<string, unknown>>;
    system?: {
        tipo?: string; subtipo?: string; niveis?: number; equipado?: unknown; equipado2?: { slot?: number };
        proficiencia?: string; proposito?: string; armadura?: { penalidade: number; maxAtr?: number };
        rolls?: Array<{ type: string; parts: string[][] }>;
    };
    actor?: DwarfActor | null;
}
export interface DwarfActor {
    type?: string; items?: { contents: DwarfItem[] };
    flags?: Record<string, Record<string, unknown>>;
    system?: {
        atributos?: Record<string, { value: number }>;
        attributes?: { nivel?: { value: number }; defesa?: { value: number; atributo: string; bonus: string[] }; pv?: { bonus: { total: string[] } }; sentidos?: { value: Set<string> }; movement?: { walk: { base: number }; tags: Set<string> } };
        tracos?: { ic?: { value: Set<string> }; profArmas?: { value: string[] } };
    };
}
export function norm(value: unknown): string { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
export function dwarfPowerName(item: DwarfItem): string {
    const name = norm(item.name).replace(/\s*\([^)]*\)$/, "");
    return name === "tradicao" && norm(item.system?.subtipo) === "anao" ? "tradicao de heredrimm" : name;
}
export function hasDwarfPower(actor: DwarfActor | null | undefined, name: string): boolean {
    return !!actor?.items?.contents.some(i => i.type === "poder" && dwarfPowerName(i) === name);
}
export function isTraditionalWeapon(item: DwarfItem): boolean { return /machado|martelo|marreta|picareta/.test(norm(item.name)); }
export function equipped(item: DwarfItem, slots: boolean): boolean { return slots ? !!item.system?.equipado2?.slot : !!item.system?.equipado; }
export function isDwarfArmor(item: DwarfItem): boolean {
    return item.type === "equipamento" && ["leve", "pesada"].includes(item.system?.tipo ?? "");
}
export function heavyArmor(actor: DwarfActor, slots: boolean): DwarfItem | undefined {
    // O compêndio legado usa "leve" na Armadura de Pedra para calcular seu
    // deslocamento especial. Ela continua pesada para os poderes de anão.
    return actor.items?.contents.find(i => isDwarfArmor(i) && equipped(i, slots)
        && (i.system?.tipo === "pesada" || /^armadura de pedra(?:$|\s)/.test(norm(i.name))));
}
export interface DwarfEffectChange { key: string; mode: number; value: string; priority?: number | null }
/** Upgrades como Reforçada somam pda no ator, fora da penalidade do item.
 * Ignora apenas essa parcela de armaduras; preserva Defesa e escudos. */
export function dwarfArmorEffectChanges(actor: DwarfActor, effect: {
    origin?: string; parent?: DwarfItem; changes: DwarfEffectChange[];
}): DwarfEffectChange[] {
    if (!hasDwarfPower(actor, "conforto do aco")) return effect.changes;
    const itemId = effect.origin?.match(/(?:^|\.)Item\.([^.]+)$/)?.[1];
    const owner = effect.parent?.type === "equipamento" ? effect.parent
        : itemId ? actor.items?.contents.find(i => i.id === itemId) : undefined;
    if (!owner || !isDwarfArmor(owner)) return effect.changes;
    return effect.changes.filter(c => c.key !== "system.attributes.defesa.pda");
}
export function isBelovedWeapon(actor: DwarfActor, item: DwarfItem): boolean {
    return !!actor.items?.contents.some(power => power.type === "poder" && dwarfPowerName(power) === "arma amada" && typeof power.flags?.[MODULE_ID]?.armaAmadaId === "string"
        && (power.flags?.[MODULE_ID]?.armaAmadaId === (item._t20DwarfSourceId ?? item.id)
            || power.flags?.[MODULE_ID]?.armaAmadaId === `gift:${(item.flags?.[MODULE_ID]?.presenteTemporario as { powerId?: string })?.powerId}`));
}
export function isFirearm(item: DwarfItem): boolean { return item.type === "arma" && item.system?.proficiencia === "fogo"; }
export function dwarfAttackBonus(actor: DwarfActor, item: DwarfItem): number {
    return (hasDwarfPower(actor, "tradicao de heredrimm") && isTraditionalWeapon(item) ? 2 : 0)
        + (hasDwarfPower(actor, "atracao pela polvora") && isFirearm(item) ? 1 : 0);
}
export function usesAyrelynn(actor: DwarfActor, item: DwarfItem): boolean {
    return isFirearm(item) && hasDwarfPower(actor, "tradicao de ayrelynn")
        && (actor.system?.atributos?.sab?.value ?? 0) > (actor.system?.atributos?.des?.value ?? 0);
}
/** Aplica apenas a escolha de atributo; perícia, treino e demais bônus continuam nativos. */
export function prepareDwarfWeapon(item: DwarfItem): void {
    const actor = item.actor;
    if (!actor) return;
    const rolls = item.system?.rolls ?? [];
    const style = !!actor.flags?.tormenta20?.estiloDisparo || hasDwarfPower(actor, "estilo de disparo");
    for (const roll of rolls) {
        if (roll.type === "ataque" && usesAyrelynn(actor, item) && roll.parts[1]) roll.parts[1][1] = "sab";
        if (roll.type !== "dano") continue;
        roll.parts = roll.parts.filter(p => !p[2]?.startsWith("anao:"));
        if (roll.parts.some(p => ["curapv", "curapm", "perda"].includes(p[1]))) continue;
        const flat = (isBelovedWeapon(actor, item) ? 2 : 0) + (isFirearm(item) && hasDwarfPower(actor, "atracao pela polvora") ? 2 : 0);
        if (flat) roll.parts.push([String(flat), roll.parts[0]?.[1] ?? "", "anao:dano"]);
        if (hasDwarfPower(actor, "atracao pela polvora") && item.type === "consumivel"
            && (/^bomba(?:$|\s*\()/.test(norm(item.name)) || /polvora/.test(norm(item.name)))) {
            const dice = roll.parts.reduce((n, p) => n + [...p[0].matchAll(/\b(\d*)d\d+/gi)].reduce((sum, m) => sum + Number(m[1] || 1), 0), 0);
            if (dice) roll.parts.push([String(dice), roll.parts[0]?.[1] ?? "", "anao:polvora"]);
        }
        if (usesAyrelynn(actor, item) && style) {
            // Remove o atributo padrão de Estilo; mantém dano próprio como Força do arco.
            roll.parts = roll.parts.filter(p => !["padrao", "@des"].includes(p[0]));
            roll.parts.push(["@sab", "", "anao:ayrelynn"]);
        }
    }
}
/** Passivos derivados: os documentos e recursos atuais permanecem intactos. */
export function prepareDwarfActor(actor: DwarfActor, slots: boolean): void {
    if (hasDwarfPower(actor, "conhecimento das rochas")) actor.system?.attributes?.sentidos?.value.add("escuro");
    const hp = actor.system?.attributes?.pv?.bonus;
    if (hp) {
        hp.total = hp.total.filter(b => !b.endsWith("[Coração de Pedra]") && !b.endsWith("[Duro como Pedra]"));
        const level = actor.system?.attributes?.nivel?.value ?? 0;
        if (hasDwarfPower(actor, "coracao de pedra")) hp.total.push(`${level}[Coração de Pedra]`);
        if (hasDwarfPower(actor, "duro como pedra")) hp.total.push(`${level + 2}[Duro como Pedra]`);
    }
    if (hasDwarfPower(actor, "devagar e sempre")) {
        const movement = actor.system?.attributes?.movement;
        if (movement) { movement.walk.base = 6; movement.tags.add("ignora-armadura"); movement.tags.add("ignora-carga"); }
    }
    const defense = actor.system?.attributes?.defesa;
    if (defense) {
        defense.bonus = defense.bonus.filter(b => b !== "2[Conforto do Aço]");
        if (hasDwarfPower(actor, "conforto do aco") && heavyArmor(actor, slots)) defense.bonus.push("2[Conforto do Aço]");
    }
    if (hasDwarfPower(actor, "coracao de pedra")) {
        actor.system?.tracos?.ic?.value.add("petrificado");
    }
    if (hasDwarfPower(actor, "tradicao de ayrelynn")) {
        const profs = actor.system?.tracos?.profArmas?.value;
        if (profs && !profs.includes("fogo")) profs.push("fogo");
    }
}
export function applyDuroComoAco(actor: DwarfActor, slots: boolean): void {
    const armor = heavyArmor(actor, slots), defense = actor.system?.attributes?.defesa;
    if (!armor || !defense || !hasDwarfPower(actor, "duro como aco") || (actor.system?.attributes?.nivel?.value ?? 0) < 11) return;
    const con = Math.max(0, actor.system?.atributos?.con?.value ?? 0);
    const previous = Math.max(0, Math.min(actor.system?.atributos?.[defense.atributo]?.value ?? 0, armor.system?.armadura?.maxAtr ?? 0));
    if (con > previous) { defense.value += con - previous; defense.atributo = "con"; }
}
