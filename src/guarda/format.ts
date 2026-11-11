/** Guarda é passiva na Defesa e opcional somente no teste defensivo de manobra. */
export const GUARD_KEY = "guard";
export const GUARD_DESCRIPTION = "A arma possui uma proteção elaborada próxima à sua empunhadura, que fornece +1 na Defesa e em testes contra manobras. Só pode ser aplicada em armas corpo a corpo.";
export interface GuardItem {
    name?: string; type?: string;
    parts?: string[];
    system?: {
        proposito?: string; enableAutoUpgrades?: boolean; upgrades?: Record<string, unknown>;
        equipado?: unknown; equipado2?: { slot?: unknown };
        rolls?: Array<{ type?: string; parts?: string[][] }>;
    };
}
export interface GuardActor {
    type?: string;
    items?: { contents: GuardItem[] };
    system?: { attributes?: { defesa?: { bonus: string[] } } };
}
export function isMeleeGuardWeapon(item: GuardItem): boolean {
    // Manoplas recebem melhorias de arma pelo fluxo já existente do módulo.
    if (item.type === "equipamento") return /manopla/i.test(item.name ?? "");
    if (item.type !== "arma") return false;
    const purpose = item.system?.proposito;
    if (purpose) return ["corpo-a-corpo", "corpo-a-corpo-arremesso"].includes(purpose);
    return !!item.system?.rolls?.some(r => r.type === "ataque" && r.parts?.[1]?.[0] === "luta");
}
export function hasGuard(item: GuardItem): boolean {
    return isMeleeGuardWeapon(item) && item.system?.enableAutoUpgrades !== false
        && Object.entries(item.system?.upgrades ?? {}).some(([key, value]) => /^melhoria[1-4]$/.test(key) && value === GUARD_KEY);
}
function legacyEquipped(value: unknown): boolean { return value !== "false" && value !== "0" && !!value; }
export function guardBonus(actor: GuardActor | undefined, equipmentSlots: boolean): number {
    return actor?.items?.contents.some(item => hasGuard(item) && (equipmentSlots
        ? Number(item.system?.equipado2?.slot) > 0 || actor.type === "npc" && legacyEquipped(item.system?.equipado)
        : legacyEquipped(item.system?.equipado))) ? 1 : 0;
}
export function prepareGuardDefense(actor: GuardActor, equipmentSlots: boolean): void {
    const defense = actor.system?.attributes?.defesa;
    if (!defense) return;
    defense.bonus = defense.bonus.filter(b => b !== "1[Guarda]");
    if (guardBonus(actor, equipmentSlots)) defense.bonus.push("1[Guarda]");
}
export function canResistWithGuard(item: GuardItem): boolean {
    if (item.type === "pericia") return item.name?.toLocaleLowerCase("pt-BR") === "luta";
    return isMeleeGuardWeapon(item) && !!item.system?.rolls?.some(r => r.type === "ataque");
}
export interface GuardConfiguration { bonus?: string | number; parts?: string[]; t20GuardResistance?: boolean; [key: string]: unknown }
export function guardConfiguration(item: GuardItem, config: GuardConfiguration | null, bonus: number): GuardConfiguration | null {
    if (!config?.t20GuardResistance || !bonus || !canResistWithGuard(item)) return config;
    // O diálogo nativo já consumiu o campo bonus em item.parts para perícias.
    // Actor.rollPericia usa parts diretamente e não relê config.bonus.
    if (item.type === "pericia") return { ...config, parts: [...(config.parts ?? item.parts ?? []), String(bonus)] };
    const current = String(config.bonus ?? "").trim();
    return { ...config, bonus: !current || current === "0" ? String(bonus) : `(${current}) + ${bonus}` };
}
export function guardTemplate(): Record<string, unknown> {
    return {
        name: "Guarda", description: GUARD_DESCRIPTION, changes: [], transfer: false, disabled: false,
        flags: { tormenta20: { upgrade: GUARD_KEY, onuse: false, self: false } },
    };
}
