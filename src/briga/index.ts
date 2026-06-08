/**
 * Briga — poder de Lutador (dano desarmado escalável).
 *
 * "Seus ataques desarmados causam 1d6 pontos de dano… A cada quatro níveis, seu
 * dano desarmado aumenta, conforme a tabela. O dano na tabela é para criaturas
 * Pequenas e Médias. Minúsculas diminuem um passo, Grandes/Enormes aumentam um
 * passo e Colossais aumentam dois passos."
 *
 * Tabela oficial (nível na classe Lutador):
 *   1º 1d6 · 5º 1d8 · 9º 1d10 · 13º 2d6 · 17º 2d8 · 20º 2d10 (Dono da Rua)
 *
 * Ao adicionar Briga ao personagem, melhoramos automaticamente a arma "Ataque
 * desarmado" (troca o dado de dano base 1d3 → o dado da tabela, ajustado pelo
 * tamanho), guardando o dado original num flag para restaurar quando o poder for
 * removido. Re-aplica sozinho quando o nível de Lutador ou o tamanho mudam.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log } from "@/utils/logging";

const FLAG_ORIGINAL = "brigaOriginalDie";
const FLAG_APPLIED = "brigaApplied";

/** Cadeia padrão T20 de progressão de dados de dano (para passos de tamanho). */
export const STEP_CHAIN = [
    "1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "1d12",
    "2d6", "2d8", "2d10", "2d12", "4d6", "4d8", "4d10",
] as const;

// ── Cálculo (puro / testável) ─────────────────────────────────────────────────

/** Dado base de dano desarmado pela tabela do Lutador (criaturas Pequenas/Médias). */
export function brigaBaseDie(lutadorLevel: number): string {
    const lvl = Number.isFinite(lutadorLevel) ? lutadorLevel : 0;
    if (lvl >= 20) return "2d10";
    if (lvl >= 17) return "2d8";
    if (lvl >= 13) return "2d6";
    if (lvl >= 9)  return "1d10";
    if (lvl >= 5)  return "1d8";
    return "1d6";
}

/** Passos de ajuste por tamanho (códigos T20: min/peq/med/gra/eno/col). */
export function sizeStep(size: string | null | undefined): number {
    switch (normalizeCondName(size ?? "")) {
        case "min": return -1;             // Minúsculo
        case "gra": case "eno": return 1;  // Grande / Enorme
        case "col": return 2;              // Colossal
        default: return 0;                 // Pequeno / Médio / desconhecido
    }
}

/** Dado de dano desarmado final = base pela tabela, ajustado pelo tamanho. */
export function computeUnarmedDie(lutadorLevel: number, size: string | null | undefined): string {
    const base = brigaBaseDie(lutadorLevel);
    const idx = STEP_CHAIN.indexOf(base as typeof STEP_CHAIN[number]);
    if (idx < 0) return base;
    const adj = Math.max(0, Math.min(STEP_CHAIN.length - 1, idx + sizeStep(size)));
    return STEP_CHAIN[adj];
}

// ── Detecção (puro) ───────────────────────────────────────────────────────────

interface ItemLike { type?: string; name?: string }

export function isBrigaPoder(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    return normalizeCondName(item.name ?? "").includes("briga");
}

export function isLutadorClasse(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "classe") return false;
    return normalizeCondName(item.name ?? "").includes("lutador");
}

export function isUnarmedWeapon(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "arma") return false;
    return normalizeCondName(item.name ?? "").includes("desarmado");
}

// ── Aplicação no ator ─────────────────────────────────────────────────────────

interface WeaponRoll { type?: string; parts?: string[][] }

/** Clona os rolls (dados planos: arrays de strings) sem depender de foundry.utils. */
function cloneRolls(rolls: WeaponRoll[]): WeaponRoll[] {
    return JSON.parse(JSON.stringify(rolls)) as WeaponRoll[];
}
interface WeaponItem {
    id?: string | null;
    name?: string;
    type?: string;
    system?: { rolls?: WeaponRoll[] };
    flags?: Record<string, Record<string, unknown> | undefined>;
    update?: (data: object) => Promise<unknown>;
}
interface ActorLike {
    type?: string;
    system?: { tracos?: { tamanho?: string } };
    items?: { find?: (fn: (i: unknown) => boolean) => unknown; filter?: (fn: (i: unknown) => boolean) => unknown[] } & Iterable<unknown>;
}

function isDicePart(p: string[] | undefined): boolean {
    return /^\s*\d*d\d+\s*$/i.test((p?.[0] ?? "").trim());
}

function getLutadorLevel(actor: ActorLike): number {
    // T20 guarda o nível da classe em `system.niveis` (número), NÃO em system.nivel.value.
    const items = [...(actor.items ?? [])] as Array<ItemLike & { system?: { niveis?: number } }>;
    const cls = items.find(i => isLutadorClasse(i));
    return cls?.system?.niveis ?? 0;
}

function hasBriga(actor: ActorLike): boolean {
    return [...(actor.items ?? [])].some(i => isBrigaPoder(i as ItemLike));
}

function findUnarmedWeapons(actor: ActorLike): WeaponItem[] {
    return [...(actor.items ?? [])].filter(i => isUnarmedWeapon(i as ItemLike)) as WeaponItem[];
}

/** Aplica o dado calculado na arma desarmada, guardando o dado original. */
async function setUnarmedDie(weapon: WeaponItem, die: string): Promise<void> {
    const rolls = cloneRolls(weapon.system?.rolls ?? []);
    const dano = rolls.find(r => r.type === "dano");
    const dicePart = dano?.parts?.find(p => isDicePart(p));
    if (!dicePart) return;

    const stored = weapon.flags?.[MODULE_ID]?.[FLAG_ORIGINAL] as string | undefined;
    const original = stored ?? dicePart[0];
    if (dicePart[0] === die && stored) return; // já aplicado e sem mudança

    dicePart[0] = die;
    await weapon.update?.({
        "system.rolls": rolls,
        [`flags.${MODULE_ID}.${FLAG_ORIGINAL}`]: original,
        [`flags.${MODULE_ID}.${FLAG_APPLIED}`]: true,
    });
}

/** Restaura o dado original da arma desarmada e limpa os flags. */
async function restoreUnarmedDie(weapon: WeaponItem): Promise<void> {
    const original = weapon.flags?.[MODULE_ID]?.[FLAG_ORIGINAL] as string | undefined;
    if (!original) return;
    const rolls = cloneRolls(weapon.system?.rolls ?? []);
    const dano = rolls.find(r => r.type === "dano");
    const dicePart = dano?.parts?.find(p => isDicePart(p));
    if (dicePart) dicePart[0] = original;
    await weapon.update?.({
        "system.rolls": rolls,
        [`flags.${MODULE_ID}.-=${FLAG_ORIGINAL}`]: null,
        [`flags.${MODULE_ID}.-=${FLAG_APPLIED}`]: null,
    });
}

async function applyBrigaToActor(actor: ActorLike): Promise<void> {
    const level = getLutadorLevel(actor);
    const size = actor.system?.tracos?.tamanho ?? "med";
    const die = computeUnarmedDie(level, size);
    const weapons = findUnarmedWeapons(actor);
    for (const w of weapons) await setUnarmedDie(w, die);
    if (weapons.length) log(`Briga: ataque desarmado → ${die} (Lutador nv ${level}, tam ${size}).`);
}

async function restoreBrigaOnActor(actor: ActorLike): Promise<void> {
    for (const w of findUnarmedWeapons(actor)) await restoreUnarmedDie(w);
    log("Briga removida: ataque desarmado restaurado.");
}

// ── Setup / hooks ─────────────────────────────────────────────────────────────

function isMyUser(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

function actorOf(item: { parent?: unknown }): (ActorLike & { type?: string }) | null {
    const p = item.parent as (ActorLike & { type?: string }) | null;
    return p && p.type === "character" ? p : null;
}

export function setupBriga(): void {
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isMyUser(args[2] as string | undefined)) return;
        const actor = actorOf(item);
        if (!actor) return;
        // Briga adicionada → aplica. Lutador/arma desarmada adicionada com Briga já presente → aplica.
        if (isBrigaPoder(item) || ((isLutadorClasse(item) || isUnarmedWeapon(item)) && hasBriga(actor))) {
            void applyBrigaToActor(actor);
        }
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isMyUser(args[2] as string | undefined)) return;
        const actor = actorOf(item);
        if (!actor) return;
        if (isBrigaPoder(item)) void restoreBrigaOnActor(actor);
        else if (isLutadorClasse(item) && hasBriga(actor)) void applyBrigaToActor(actor); // nível caiu
    });

    Hooks.on("updateItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        const changes = args[1] as { system?: { niveis?: unknown } } | undefined;
        if (!isMyUser(args[2] as string | undefined)) return;
        if (!isLutadorClasse(item)) return;
        if (changes?.system?.niveis === undefined) return; // só quando o nível (niveis) muda
        const actor = actorOf(item);
        if (actor && hasBriga(actor)) void applyBrigaToActor(actor);
    });

    Hooks.on("updateActor", (...args: unknown[]) => {
        const actor = args[0] as ActorLike & { type?: string };
        const changes = args[1] as { system?: { tracos?: { tamanho?: unknown } } } | undefined;
        if (!isMyUser(args[2] as string | undefined)) return;
        if (actor.type !== "character") return;
        if (changes?.system?.tracos?.tamanho === undefined) return; // só quando o tamanho muda
        if (hasBriga(actor)) void applyBrigaToActor(actor);
    });
}
