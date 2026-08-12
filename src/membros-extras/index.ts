/**
 * Membros Extras (poder da Tormenta) — duas armas naturais de patas insetoides.
 *
 * "Uma vez por rodada, quando usa a ação agredir para atacar com outra arma,
 * pode gastar 2 PM para fazer um ataque corpo a corpo extra com cada uma
 * (dano 1d4, crítico x2, corte)."
 *
 * Arquitetura (reaproveita ao máximo, mesmo padrão de `armamento-aberrante`/
 * `escudo-leve`): ao ganhar o poder, cria 2 armas REAIS embarcadas na ficha
 * ("Pata Inseto N") — 1d4 corte, crítico x2, espaço 0, sempre "equipadas"
 * (armas naturais). O trigger (`createChatMessage`, mesmo idioma de detecção
 * do `auto-damage`: mensagem com rolls `type:"attack"`+`type:"damage"`)
 * detecta um ataque com OUTRA arma (não a pata) de um ator com o poder,
 * ainda não ofertado nesta rodada, e abre um prompt (0/1/2 ataques extra,
 * 2 PM cada). Ao confirmar, `spendMana` + `weapon.roll()` na(s) pata(s)
 * escolhida(s) — como é uma arma NATIVA de verdade, o hook JÁ EXISTENTE de
 * `auto-damage/index.ts` cuida de tudo (RD, reações, aplicação de dano,
 * crítico x2 em 20 natural) sem código extra aqui.
 *
 * Fora de escopo (nota, igual outras exceções já documentadas no módulo):
 * variante com armas leves equipadas nas patas via Ambidestria/Estilo de
 * Duas Armas — só o caso base (dano fixo 1d4 cortante) foi automatizado.
 */

import { MODULE_ID } from "@/constants";
import { hookUserId } from "@/briga/index";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

const POWER_NAME = "membros extras";
const WEAPON_FLAG = "membrosExtrasWeapon";
const ROUND_FLAG = "membrosExtrasRound";
const PATA_IMG = `modules/${MODULE_ID}/assets/Items/pata-inseto.png`;
export const PM_COST = 2;
const MAX_LEGS = 2;

// ── Detecção / construção (puro, testável) ────────────────────────────────────

interface ItemLike {
    id?: string;
    name?: string;
    type?: string;
    flags?: Record<string, Record<string, unknown> | undefined>;
    roll?: (options?: Record<string, unknown>) => Promise<unknown>;
}

export function isMembrosExtrasPoder(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    return normalizeCondName(item.name ?? "").includes(POWER_NAME);
}

export function isPataWeapon(item: ItemLike | null | undefined): boolean {
    return !!item?.flags?.[MODULE_ID]?.[WEAPON_FLAG];
}

/** Quantas pernas dá pra pagar com `pm` disponível (0-2). Puro. */
export function computeMaxLegsByPm(pm: number, cost = PM_COST): number {
    if (!Number.isFinite(pm) || pm <= 0 || cost <= 0) return 0;
    return Math.min(MAX_LEGS, Math.floor(pm / cost));
}

/** Monta o item de arma da Pata Inseto (dano fixo 1d4 corte, crítico x2). Puro. */
export function buildPataWeaponData(index: 1 | 2): Record<string, unknown> {
    return {
        name: `Pata Inseto ${index} (Membros Extras)`,
        type: "arma",
        img: PATA_IMG,
        system: {
            proficiencia: "simples",
            proposito: "corpo-a-corpo",
            empunhadura: "leve",
            criticoM: 20,
            criticoX: 2,
            alcance: "toque",
            equipado: true,
            equipado2: { slot: 0, type: "hand" },
            espacos: 0,
            peso: 0,
            preco: 0,
            qtd: 1,
            description: {
                value: "<p>Arma natural do poder <strong>Membros Extras</strong> — ataque corpo a corpo extra "
                    + `(${PM_COST} PM, 1×/rodada ao usar Agredir com outra arma).</p>`,
                unidentified: "",
            },
            source: "Membros Extras",
            rolls: [
                { name: "Ataque", key: "ataque0", type: "ataque", parts: [["1d20"], ["luta"], ["0"]], adaptavel: "", versatil: "" },
                { name: "Dano", key: "dano1", type: "dano", parts: [["1d4", "corte", ""]], versatil: "", adaptavel: "" },
            ],
        },
        flags: { [MODULE_ID]: { [WEAPON_FLAG]: true } },
    };
}

// ── Runtime shapes ─────────────────────────────────────────────────────────────

interface WeaponItem extends ItemLike { id?: string; img?: string }
interface ActorLike {
    id?: string;
    name?: string;
    type?: string;
    isOwner?: boolean;
    items?: { contents?: WeaponItem[] } | WeaponItem[];
    system?: { attributes?: { pm?: { value?: number; temp?: number } } };
    getFlag?: (scope: string, key: string) => unknown;
    setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
    createEmbeddedDocuments?: (type: string, data: object[], ctx?: object) => Promise<unknown>;
    updateEmbeddedDocuments?: (type: string, data: object[], ctx?: object) => Promise<unknown>;
    deleteEmbeddedDocuments?: (type: string, ids: string[], ctx?: object) => Promise<unknown>;
    spendMana?: (amount: number, adjust?: number, recover?: boolean) => Promise<unknown>;
}

function actorItems(actor: ActorLike): WeaponItem[] {
    return Array.isArray(actor.items) ? actor.items : (actor.items?.contents ?? []);
}

function hasMembrosExtras(actor: ActorLike): boolean {
    return actorItems(actor).some(isMembrosExtrasPoder);
}

function findPataWeapons(actor: ActorLike): WeaponItem[] {
    return actorItems(actor).filter(isPataWeapon);
}

function pmAvailable(actor: ActorLike): number {
    const pm = actor.system?.attributes?.pm;
    return (Number(pm?.value) || 0) + (Number(pm?.temp) || 0);
}

// ── Criar/remover as patas junto com o poder ───────────────────────────────────

async function grantPatas(actor: ActorLike): Promise<void> {
    const existing = findPataWeapons(actor).length;
    if (existing >= MAX_LEGS) return;
    const data = Array.from({ length: MAX_LEGS - existing }, (_, i) => buildPataWeaponData((existing + i + 1) as 1 | 2));
    try {
        await actor.createEmbeddedDocuments?.("Item", data);
        log(`Membros Extras: ${data.length} pata(s) criada(s) em ${actor.name}.`);
    } catch (e) { warn("membros-extras: falha ao criar patas", e); }
}

async function removePatas(actor: ActorLike): Promise<void> {
    const ids = findPataWeapons(actor).map(w => w.id).filter((id): id is string => !!id);
    if (!ids.length) return;
    try {
        await actor.deleteEmbeddedDocuments?.("Item", ids);
        log(`Membros Extras removido: patas apagadas de ${actor.name}.`);
    } catch (e) { warn("membros-extras: falha ao remover patas", e); }
}

/** Corrige o ícone de Patas já existentes (criadas antes do ícone bundled). Idempotente. */
async function migratePataIcons(actor: ActorLike): Promise<void> {
    const stale = findPataWeapons(actor).filter(w => w.img !== PATA_IMG && w.id);
    if (!stale.length) return;
    const updates = stale.map(w => ({ _id: w.id, img: PATA_IMG }));
    try {
        await actor.updateEmbeddedDocuments?.("Item", updates);
        log(`Membros Extras: ícone atualizado em ${stale.length} pata(s) de ${actor.name}.`);
    } catch (e) { warn("membros-extras: falha ao migrar ícone das patas", e); }
}

function isMyUser(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

function actorOf(item: { parent?: unknown }): ActorLike | null {
    const p = item.parent as ActorLike | null;
    return p && p.type === "character" ? p : null;
}

// ── Uma vez por rodada (flag no ator, mesmo padrão de golpePmRound) ────────────

interface RoundFlag { combatId?: string; round?: number }

function currentCombat(): { id?: string; round?: number; started?: boolean } | null {
    return (game.combat as unknown as { id?: string; round?: number; started?: boolean } | null) ?? null;
}

function alreadyOfferedThisRound(actor: ActorLike): boolean {
    const c = currentCombat();
    if (!c?.started) return false;
    const f = (actor.getFlag?.(MODULE_ID, ROUND_FLAG) ?? {}) as RoundFlag;
    return f.combatId === c.id && f.round === c.round;
}

async function markOfferedThisRound(actor: ActorLike): Promise<void> {
    const c = currentCombat();
    if (!c?.started) return;
    await actor.setFlag?.(MODULE_ID, ROUND_FLAG, { combatId: c.id, round: c.round });
}

// ── Rolagem "limpa" (sem modificadores de outras armas) ────────────────────────

interface RollableWeapon extends ItemLike {
    id?: string;
    system?: Record<string, unknown>;
    clone?: (data?: Record<string, unknown>) => RollableWeapon;
    rollAttack?: (opts: { options: Record<string, unknown> }) => Promise<unknown>;
    rollDamage?: (opts: { options: Record<string, unknown> }) => Promise<unknown>;
    displayCard?: (opts: { options: Record<string, unknown>; rollMode?: string; createMessage?: boolean }) => Promise<unknown>;
}

/**
 * Rola o ataque da Pata sem passar por `Item.roll()` — nem com dialog nem
 * com `configureDialog:false`. ⚠️ Achado lendo o `tormenta20.mjs`: os DOIS
 * caminhos nativos de `roll()` juntam `item.actor.effects.filter(ae =>
 * ae.getFlag("tormenta20","onuse") && ae.flags.tormenta20[tipo])` SEM checar
 * `ae.origin === item.uuid` — ao contrário da Manopla (que filtra por
 * `origin` manualmente, `t20-fixes/manopla-upgrades.ts`). Isso deixa QUALQUER
 * aprimoramento onuse "self"/"attack" de OUTRA arma equipada (ex.: "Certeira"
 * de uma Manopla Certeira) disponível/ativo em TODO ataque do ator, inclusive
 * o da Pata Inseto — bug real reportado (dano/acerto da Pata incorporando
 * bônus que não são dela). `rollAttack`/`rollDamage`/`displayCard` são os
 * métodos internos que `Item.roll()` chama por baixo — nenhum dos três lê
 * `actor.effects`; usam só `itemData.rolls` (a fórmula fixa da própria Pata:
 * 1d20+luta / 1d4 corte) + o `options` que passarmos (vazio aqui). Chamando-
 * os direto, ignoramos o dialog E o vazamento — sem perder o card de chat
 * nativo (`displayCard` monta o MESMO template + `flags.tormenta20.itemData`
 * que `auto-damage` já sabe processar).
 */
async function rollPataAttackClean(weapon: RollableWeapon): Promise<void> {
    const clone = weapon.clone?.({ keepId: true } as unknown as Record<string, unknown>);
    if (!clone?.rollAttack || !clone.rollDamage || !clone.displayCard) {
        warn("membros-extras: clone da Pata sem os métodos esperados — fallback pro roll nativo.");
        await (weapon as unknown as { roll?: (o?: object) => Promise<unknown> }).roll?.({ configureDialog: false });
        return;
    }
    // `roll()` nativo faz isso antes de chamar rollAttack/rollDamage (`item.system.rolled = {}`)
    // — sem isso, `rollAttack` lança ao tentar `itemData.rolled[r.name] = roll` num objeto
    // undefined (achado ao vivo: "Cannot set properties of undefined (setting 'Ataque')").
    if (clone.system) clone.system["rolled"] = {};
    const options: Record<string, unknown> = {};
    await clone.rollAttack({ options });
    await clone.rollDamage({ options });
    options["itemId"] = weapon.id;
    await clone.displayCard({
        options,
        rollMode: game.settings?.get("core", "rollMode") as string | undefined,
        createMessage: true,
    });
}

// ── Prompt + execução dos ataques extras ────────────────────────────────────────

function escHtml(s: string): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function promptLegs(actorName: string, maxLegs: number): Promise<number | null> {
    return new Promise((resolve) => {
        const buttons: Record<string, { label: string; callback: () => void }> = {
            none: { label: "Não atacar", callback: () => resolve(0) },
        };
        for (let n = 1; n <= maxLegs; n++) {
            buttons[`legs${n}`] = {
                label: `${n} ataque${n > 1 ? "s" : ""} extra${n > 1 ? "s" : ""} (${n * PM_COST} PM)`,
                callback: () => resolve(n),
            };
        }
        new Dialog({
            title: "Membros Extras",
            content: `<p>${escHtml(actorName)} usou Agredir com outra arma. Fazer ataque(s) extra com as patas insetoides?</p>`,
            buttons,
            default: "none",
            close: () => resolve(null),
        }, { classes: ["dialog", "t20-dialog"] }).render(true);
    });
}

async function offerExtraAttacks(actor: ActorLike): Promise<void> {
    await markOfferedThisRound(actor);
    const patas = findPataWeapons(actor);
    if (patas.length < MAX_LEGS) { warn(`membros-extras: patas ausentes em ${actor.name} — reabra a ficha ou reaplique o poder.`); return; }

    const maxLegs = computeMaxLegsByPm(pmAvailable(actor));
    if (maxLegs <= 0) return; // sem PM suficiente — nem oferece

    const choice = await promptLegs(actor.name ?? "Personagem", maxLegs);
    if (!choice || choice <= 0) return;

    for (let i = 0; i < choice; i++) {
        const weapon = patas[i];
        try {
            await actor.spendMana?.(PM_COST);
            await rollPataAttackClean(weapon as RollableWeapon);
        } catch (e) { warn("membros-extras: falha no ataque extra:", e); }
    }
}

// ── Trigger: detecta um ataque (attack+damage rolls) com OUTRA arma ────────────

interface RollLike { options?: Record<string, unknown> }
interface MessageLike {
    rolls?: RollLike[];
    speaker?: { token?: string; actor?: string };
    content?: string;
    author?: { id?: string };
    user?: { id?: string } | string;
}

function setupTrigger(): void {
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        try {
            const message = args[0] as MessageLike;
            const rolls = message.rolls;
            if (!rolls?.length) return;
            const hasAttack = rolls.some(r => r.options?.["type"] === "attack");
            const hasDamage = rolls.some(r => r.options?.["type"] === "damage");
            if (!hasAttack || !hasDamage) return;

            const authorId = message.author?.id ?? (typeof message.user === "object" ? message.user?.id : message.user);
            if (authorId !== game.user?.id) return; // só o autor processa (targets de quem rolou)

            const tokenId = message.speaker?.token;
            const speakerActorId = message.speaker?.actor;
            type CanvasTok = { get(id: string): { actor: ActorLike | null } | undefined };
            const tok = tokenId ? (canvas as unknown as { tokens?: CanvasTok }).tokens?.get(tokenId) : undefined;
            const actor = (tok?.actor ?? game.actors?.get(speakerActorId ?? "")) as ActorLike | null | undefined;
            if (!actor || !hasMembrosExtras(actor)) return;
            if (alreadyOfferedThisRound(actor)) return;

            const itemId = (message.content ?? "").match(/data-item-id="([^"]+)"/)?.[1];
            const weapon = itemId ? actorItems(actor).find(w => w.id === itemId) : undefined;
            if (weapon && isPataWeapon(weapon)) return; // é o próprio ataque da pata — não re-oferece

            void offerExtraAttacks(actor);
        } catch (err) { warn("membros-extras: hook falhou:", err); }
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupMembrosExtras(): void {
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isMyUser(hookUserId(args))) return;
        const actor = actorOf(item);
        if (!actor) return;
        if (isMembrosExtrasPoder(item)) void grantPatas(actor);
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        if (!isMyUser(hookUserId(args))) return;
        const actor = actorOf(item);
        if (!actor) return;
        if (isMembrosExtrasPoder(item)) void removePatas(actor);
    });

    setupTrigger();

    // Migração do ícone (patas criadas antes do ícone bundled) — só nos atores que o cliente possui.
    Hooks.once("ready", () => {
        const actors = (game.actors?.contents ?? []) as Array<ActorLike & { type?: string; isOwner?: boolean }>;
        for (const a of actors) {
            if (a.type === "character" && a.isOwner) void migratePataIcons(a);
        }
    });

    log("Membros Extras configurado (2 ataques extras de patas insetoides, 2 PM cada, 1x/rodada).");
    void MODULE_ID;
}
