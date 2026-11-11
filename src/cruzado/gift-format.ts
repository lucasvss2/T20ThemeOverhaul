import { MODULE_ID } from "@/constants";
export const GIFT_CONFIG = "presenteConfig";
export const SUMMONED_GIFT = "presenteTemporario";
export const GIFT_LEVELS = [1, 5, 8, 9, 11, 14, 18] as const;
export interface GiftClassActor { items?: Iterable<{ type?: string; name?: string; system?: { niveis?: number } }> }
export function cruzadoLevel(actor?: GiftClassActor | null): number {
    return Math.max(0, ...[...(actor?.items ?? [])].filter(i => i.type === "classe" && i.name?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "cruzado").map(i => Number(i.system?.niveis) || 0));
}
export function giftBudget(level: number): { improvements: number; enchantments: number; milestone: number } {
    return {
        improvements: level >= 11 ? 4 : level >= 8 ? 3 : level >= 5 ? 2 : level >= 1 ? 1 : 0,
        enchantments: level >= 18 ? 3 : level >= 14 ? 2 : level >= 9 ? 1 : 0,
        milestone: [...GIFT_LEVELS].reverse().find(n => level >= n) ?? 0,
    };
}
export interface GiftPlan { weapon: Record<string, unknown>; improvements: string[]; enchantments: string[]; milestone: number }
export function validateGiftPlan(plan: GiftPlan, level: number, allowedImprovements: string[], allowedEnchantments: string[]): string | null {
    const budget = giftBudget(level);
    if (!budget.improvements) return "Adicione a classe Cruzado antes de configurar o presente.";
    if (plan.weapon.type !== "arma") return "Escolha uma arma válida.";
    const price = Number((plan.weapon.system as { preco?: number })?.preco);
    // O limite inicial vale para a arma com a primeira melhoria (T$ 300),
    // não para as melhorias e encantos recebidos nos níveis seguintes.
    if (!Number.isFinite(price) || price + 300 > 500) return "A arma com sua primeira melhoria deve custar até T$ 500 (arma base até T$ 200).";
    if (plan.improvements.length !== budget.improvements || plan.enchantments.length !== budget.enchantments) return "Preencha todas as melhorias e encantos concedidos pelo seu nível de Cruzado.";
    if (new Set(plan.improvements).size !== plan.improvements.length || new Set(plan.enchantments).size !== plan.enchantments.length) return "Cada melhoria ou encanto só pode ser escolhido uma vez.";
    if (plan.improvements.some(k => !allowedImprovements.includes(k) || k === "specialmaterial") || plan.enchantments.some(k => !allowedEnchantments.includes(k))) return "Há uma melhoria ou encanto inválido.";
    if (plan.improvements.includes("massive") && plan.improvements.includes("precise")) return "Maciça e Precisa não podem ser combinadas.";
    if (plan.improvements.includes("pungent") && !plan.improvements.includes("accurate")) return "Pungente exige Certeira.";
    if (plan.improvements.includes("atrocious") && !plan.improvements.includes("cruel")) return "Atroz exige Cruel.";
    if (plan.enchantments.includes("magnificent") && !plan.enchantments.includes("formidable")) return "Magnífica exige Formidável.";
    return null;
}
export function summonedGiftData(plan: GiftPlan, powerId: string, sceneId: string, effects: object[]): Record<string, unknown> {
    const weapon = structuredClone(plan.weapon);
    delete weapon._id; delete weapon._key; delete weapon.folder; delete weapon._stats; delete weapon.ownership;
    const system = weapon.system as Record<string, unknown>;
    weapon.name = `${weapon.name} (Presente dos Deuses)`;
    weapon.effects = effects;
    system.espacos = 0; system.peso = 0; system.preco = 0; system.qtd = 1;
    system.carregado = true; system.equipado = true;
    system.equipado2 = { slot: 1.1, type: "hand" };
    system.enableAutoUpgrades = true;
    system.upgrades = Object.fromEntries([
        ...plan.improvements.map((key, i) => [`melhoria${i + 1}`, key]),
        ...plan.enchantments.map((key, i) => [`encanto${i + 1}`, key]),
    ]);
    weapon.flags = { [MODULE_ID]: { presenteDosDeuses: true, [SUMMONED_GIFT]: { powerId, sceneId } } };
    return weapon;
}
