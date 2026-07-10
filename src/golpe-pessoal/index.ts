/**
 * Golpe Pessoal (guerreiro 5º) — automação completa.
 *
 * Fluxos:
 * 1. BUILD — ao adicionar o poder (createItem), no level-up e via botão GM na
 *    ficha do item: dialog de construção (build-dialog.ts) → flag no item.
 * 2. USO — patch em `AbilityUseDialog.create`: usar o PODER cancela o fluxo
 *    nativo (padrão Baforada) e roda `useGolpe`: gates (Perto da Morte, Golpe
 *    de Abertura, Truque Secreto, limite de PM/rodada, PM suficiente) →
 *    resolve a arma equipada do build → (Carregado: energizar/atacar) →
 *    debita PM (custo do golpe, mín 1) → arma.roll() abre o dialog NATIVO da
 *    arma (com Ataque Especial etc.). No submit, o wrapper injeta no CLONE:
 *    criticoM (Letal), criticoX (Destruidor), dados extras de dano (Brutal /
 *    Elemental / Carregado / Sequencial), rollKeeping khd20 (Preciso) e a
 *    entrada "Golpe Pessoal" na lista de efeitos do card. Cancelou o dialog →
 *    PM devolvidos.
 * 3. CARD — a 1ª mensagem de roll da arma após o submit é "reivindicada":
 *    ganha um card-suplemento com as notas informativas, a comparação do
 *    AMPLO (alvos marcados com T vs Defesa de cada um) e o botão do
 *    CONJURADOR ("Lançar <magia>" sem re-pagar o custo base — já entrou no
 *    custo do golpe).
 * 4. PÓS-DANO — o auto-damage embute `req.golpe` (getGolpePayloadForMessage)
 *    e chama handleGolpePostDamage ao aplicar: Penetrante (−10 RD), Sifão
 *    (PM temp), Atordoante (Fort vs CD For → atordoado 1 rodada, 1×/cena),
 *    Impactante (nota de empurrão), Sequencial/Truque Secreto (tracking).
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { norm } from "@/inspiracao/format";
import { getSocket, onSocketReady } from "@/socket/index";
import { registerExpectedCondition } from "@/duration-manager/index";
import {
    computeGolpeCost, hasEffect, letalMargemBonus, elementalDice, sequencialDie,
    pertoDaMorteOk, buildCardNotes, buildSummary, atordoanteCD,
    type GolpeBuild,
} from "./effects";
import { openGolpeBuildDialog, isGolpePessoalPower, actorLevel, GOLPE_FLAG } from "./build-dialog";

export const SOCKET_GOLPE_POST = "golpe-pessoal/post";

// ── Tipos mínimos ─────────────────────────────────────────────────────────────

interface ActorLike {
    id?: string;
    name?: string;
    uuid?: string;
    isOwner?: boolean;
    type?: string;
    items?: { get?: (id: string) => ItemLike | undefined; contents: ItemLike[] };
    system?: {
        attributes?: {
            pv?: { value?: number; max?: number };
            pm?: { value?: number; temp?: number; max?: number };
            nivel?: { value?: number };
        };
        atributos?: { for?: { value?: number } };
    };
    getFlag?: (scope: string, key: string) => unknown;
    setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
    unsetFlag?: (scope: string, key: string) => Promise<unknown>;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
    spendMana?: (amount: number, adjust?: number, recover?: boolean) => Promise<unknown>;
}

interface ItemLike {
    id?: string | null;
    name?: string;
    type?: string;
    actor?: ActorLike | null;
    system?: Record<string, unknown> & {
        equipado?: unknown;
        equipado2?: { slot?: number };
        ativacao?: { custo?: number | null };
        criticoM?: number;
        criticoX?: number;
        rolls?: Array<{ type?: string; key?: string; rd?: number; parts: Array<[string, string?, string?]> }>;
    };
    getFlag?: (scope: string, key: string) => unknown;
    roll?: (options?: Record<string, unknown>) => Promise<unknown>;
}

/** Payload embutido no AutoDamageRequest (consumido no cliente do alvo). */
export interface GolpePayload {
    attackerActorId: string;
    attackerTokenId?: string;
    attackerName: string;
    sceneId: string;
    nivel: number;
    penetrante?: boolean;
    impactante?: boolean;
    atordoante?: { cd: number };
    sifao?: boolean;
    sequencial?: boolean;
    truqueSecreto?: boolean;
}

// ── Estado do cliente ─────────────────────────────────────────────────────────

interface PendingUse {
    actorId: string;
    weaponId: string;
    weaponName: string;
    itemId: string;
    build: GolpeBuild;
    cost: number;
    carregadoConsumed: boolean;
    roundSpentRegistered: boolean;
    ts: number;
}

interface FiredUse extends PendingUse { payload: GolpePayload; notes: string[] }

let pendingUse: PendingUse | null = null;
let firedUse: FiredUse | null = null;
const claimedByMsg = new Map<string, { payload: GolpePayload; fired: FiredUse }>();
let pendingFreeSpell: { actorId: string; spellId: string; baseCost: number; ts: number } | null = null;

const FRESH_MS = 90_000;
const fresh = (ts: number): boolean => Date.now() - ts < FRESH_MS;

// ── Helpers de ator ───────────────────────────────────────────────────────────

const pmAvailable = (a: ActorLike): number =>
    (Number(a.system?.attributes?.pm?.value) || 0) + (Number(a.system?.attributes?.pm?.temp) || 0);

function equippedWeapons(actor: ActorLike): ItemLike[] {
    return (actor.items?.contents ?? []).filter((i) => {
        if (i.type !== "arma") return false;
        if (i.system?.equipado || (i.system?.equipado2?.slot ?? 0) > 0) return true;
        // Armas do Armamento Aberrante nascem desequipadas mas estão "na mão"
        // por construção (o poder as invoca) — contam para o golpe.
        return !!i.getFlag?.(MODULE_ID, "armamentoAberrante");
    });
}

function weaponsForBuild(actor: ActorLike, build: GolpeBuild): ItemLike[] {
    const eq = equippedWeapons(actor);
    if (hasEffect(build, "qualquer-arma")) return eq;
    const want = norm(build.weaponName);
    if (!want) return eq;
    return eq.filter((w) => {
        const n = norm(w.name);
        return n.includes(want) || want.includes(n);
    });
}

function sceneId(): string {
    return (canvas as unknown as { scene?: { id?: string } }).scene?.id ?? "";
}

interface TrackFlag { sceneId?: string; hits?: number; gained?: number; targets?: string[] }

function trackFlag(actor: ActorLike, key: string): TrackFlag {
    const f = (actor.getFlag?.(MODULE_ID, key) ?? {}) as TrackFlag;
    return f.sceneId === sceneId() ? f : {};
}

// ── Gates de uso ──────────────────────────────────────────────────────────────

interface CombatLike { started?: boolean; round?: number; id?: string }

function currentCombat(): CombatLike | null {
    return ((game as unknown as { combat?: CombatLike }).combat ?? null);
}

/** Retorna mensagem de erro ou null se pode usar. */
export function checkGates(opts: {
    build: GolpeBuild; cost: number; pv: number; pvMax: number; pm: number;
    combatRound: number | null; roundSpent: number; nivel: number;
    markedTargetKeys: string[]; truqueUsedKeys: string[];
}): string | null {
    const { build, cost } = opts;
    if (hasEffect(build, "perto-da-morte") && !pertoDaMorteOk(opts.pv, opts.pvMax)) {
        return `Perto da Morte: só com ¼ dos PV ou menos (${opts.pv}/${opts.pvMax}).`;
    }
    if (hasEffect(build, "golpe-de-abertura") && opts.combatRound !== null && opts.combatRound > 1) {
        return "Golpe de Abertura: só no seu primeiro turno do combate.";
    }
    if (opts.combatRound !== null && opts.nivel > 0 && opts.roundSpent + cost > opts.nivel) {
        return `Limite de PM por rodada em golpes pessoais: ${opts.roundSpent}+${cost} > ${opts.nivel}.`;
    }
    if (hasEffect(build, "truque-secreto") && opts.markedTargetKeys.length
        && opts.markedTargetKeys.every((k) => opts.truqueUsedKeys.includes(k))) {
        return "Truque Secreto: você já usou este golpe contra o(s) alvo(s) marcado(s) nesta cena.";
    }
    if (opts.pm < cost) return `PM insuficiente (${opts.pm}/${cost}).`;
    return null;
}

function markedTargetKeys(): string[] {
    const targets = (game.user as unknown as { targets?: Set<{ id?: string; actor?: { id?: string } }> })?.targets;
    return [...(targets ?? [])].map((t) => t.id || t.actor?.id || "").filter(Boolean);
}

// ── Uso do golpe ──────────────────────────────────────────────────────────────

interface RoundSpendFlag { combatId?: string; round?: number; spent?: number }

function roundSpent(actor: ActorLike): number {
    const c = currentCombat();
    if (!c?.started) return 0;
    const f = (actor.getFlag?.(MODULE_ID, "golpePmRound") ?? {}) as RoundSpendFlag;
    return f.combatId === c.id && f.round === c.round ? (Number(f.spent) || 0) : 0;
}

async function registerRoundSpend(actor: ActorLike, cost: number): Promise<void> {
    const c = currentCombat();
    if (!c?.started) return;
    await actor.setFlag?.(MODULE_ID, "golpePmRound", { combatId: c.id, round: c.round, spent: roundSpent(actor) + cost });
}

interface CarregadoFlag { ts?: number; combatId?: string; round?: number }

function hasValidCharge(actor: ActorLike): boolean {
    const f = (actor.getFlag?.(MODULE_ID, "golpeCarregado") ?? null) as CarregadoFlag | null;
    if (!f?.ts) return false;
    const c = currentCombat();
    if (c?.started && f.combatId === c.id) return (Number(f.round) || 0) + 1 >= (Number(c.round) || 0);
    return Date.now() - f.ts < 120_000;
}

async function promptCarregado(): Promise<"energizar" | "atacar" | null> {
    return new Promise((resolve) => {
        new Dialog({
            title: "Golpe Pessoal — Carregado",
            content: `<p>Seu golpe tem o efeito <b>Carregado</b> e não há carga ativa.</p>
                <p>Energizar gasta uma <b>ação padrão</b>; se você atacar até a próxima rodada, o golpe causa <b>+2d8</b> de dano.</p>`,
            buttons: {
                charge: { icon: '<i class="fas fa-bolt"></i>', label: "Energizar (ação padrão)", callback: () => resolve("energizar") },
                attack: { icon: '<i class="fas fa-hand-fist"></i>', label: "Atacar sem carga", callback: () => resolve("atacar") },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar", callback: () => resolve(null) },
            },
            default: "charge",
            close: () => resolve(null),
        }, { classes: ["dialog", "t20-dialog"] }).render(true);
    });
}

async function pickWeapon(weapons: ItemLike[]): Promise<ItemLike | null> {
    if (weapons.length === 1) return weapons[0];
    return new Promise((resolve) => {
        const opts = weapons.map((w, i) => `<option value="${i}">${w.name}</option>`).join("");
        new Dialog({
            title: "Golpe Pessoal — escolha a arma",
            content: `<div class="form-group"><label>Arma equipada:</label><select name="gp-pick">${opts}</select></div>`,
            buttons: {
                ok: {
                    label: "Atacar",
                    callback: (html: JQuery | HTMLElement) => {
                        const root = ((html as JQuery)[0] ?? html) as HTMLElement;
                        const i = Number(root.querySelector<HTMLSelectElement>('select[name="gp-pick"]')?.value) || 0;
                        resolve(weapons[i] ?? null);
                    },
                },
                cancel: { label: "Cancelar", callback: () => resolve(null) },
            },
            default: "ok",
            close: () => resolve(null),
        }, { classes: ["dialog", "t20-dialog"] }).render(true);
    });
}

function buildPayload(actor: ActorLike, build: GolpeBuild): GolpePayload {
    const nivel = actorLevel(actor as never);
    const forMod = Number(actor.system?.atributos?.for?.value) || 0;
    const tok = (canvas as unknown as { tokens?: { placeables?: Array<{ id: string; actor?: { id?: string } }> } })
        .tokens?.placeables?.find((t) => t.actor?.id === actor.id);
    return {
        attackerActorId: actor.id ?? "",
        attackerTokenId: tok?.id,
        attackerName: actor.name ?? "",
        sceneId: sceneId(),
        nivel,
        penetrante: hasEffect(build, "penetrante") || undefined,
        impactante: hasEffect(build, "impactante") || undefined,
        atordoante: hasEffect(build, "atordoante") ? { cd: atordoanteCD(nivel, forMod) } : undefined,
        sifao: hasEffect(build, "sifao") || undefined,
        sequencial: hasEffect(build, "sequencial") || undefined,
        truqueSecreto: hasEffect(build, "truque-secreto") || undefined,
    };
}

async function useGolpe(actor: ActorLike, item: ItemLike): Promise<void> {
    const build = (item.getFlag?.(MODULE_ID, GOLPE_FLAG) ?? null) as GolpeBuild | null;
    if (!build) {
        const ok = await openGolpeBuildDialog(actor as never, item as never, "novo");
        if (ok) ui.notifications?.info("Golpe construído — use o poder novamente para atacar.");
        return;
    }
    const cost = computeGolpeCost(build);
    const c = currentCombat();
    const gateErr = checkGates({
        build, cost,
        pv: Number(actor.system?.attributes?.pv?.value) || 0,
        pvMax: Number(actor.system?.attributes?.pv?.max) || 0,
        pm: pmAvailable(actor),
        combatRound: c?.started ? (Number(c.round) || 1) : null,
        roundSpent: roundSpent(actor),
        nivel: actorLevel(actor as never),
        markedTargetKeys: markedTargetKeys(),
        truqueUsedKeys: trackFlag(actor, "golpeTruque").targets ?? [],
    });
    if (gateErr) { ui.notifications?.warn(`Golpe Pessoal: ${gateErr}`); return; }

    const candidates = weaponsForBuild(actor, build);
    if (!candidates.length) {
        ui.notifications?.warn(`Golpe Pessoal: nenhuma arma equipada compatível${build.weaponName ? ` com "${build.weaponName}"` : ""}.`);
        return;
    }
    const weapon = await pickWeapon(candidates);
    if (!weapon) return;

    // Carregado: energizar OU atacar (com/sem carga)
    let carregadoConsumed = false;
    if (hasEffect(build, "carregado")) {
        if (hasValidCharge(actor)) {
            carregadoConsumed = true;
        } else {
            const choice = await promptCarregado();
            if (choice === null) return;
            if (choice === "energizar") {
                await actor.setFlag?.(MODULE_ID, "golpeCarregado", { ts: Date.now(), combatId: c?.id, round: c?.round });
                ui.notifications?.info("Golpe Pessoal: golpe energizado (ação padrão). Ataque até a próxima rodada para +2d8.");
                return;
            }
        }
    }

    // Débito do PM do golpe (spendMana consome temp primeiro)
    try { await actor.spendMana?.(cost); } catch (e) { warn("golpe-pessoal: spendMana falhou:", e); return; }
    await registerRoundSpend(actor, cost);

    pendingUse = {
        actorId: actor.id ?? "", weaponId: weapon.id ?? "", weaponName: weapon.name ?? "",
        itemId: item.id ?? "", build, cost, carregadoConsumed, roundSpentRegistered: true, ts: Date.now(),
    };
    try {
        await weapon.roll?.({});
    } catch (e) {
        warn("golpe-pessoal: weapon.roll falhou:", e);
        await refundPending(actor);
    }
}

async function refundPending(actor: ActorLike): Promise<void> {
    if (!pendingUse) return;
    const cost = pendingUse.cost;
    pendingUse = null;
    try {
        await actor.spendMana?.(cost, 0, true); // recover
        const c = currentCombat();
        if (c?.started) {
            const f = (actor.getFlag?.(MODULE_ID, "golpePmRound") ?? {}) as RoundSpendFlag;
            if (f.combatId === c.id && f.round === c.round) {
                await actor.setFlag?.(MODULE_ID, "golpePmRound", { ...f, spent: Math.max(0, (Number(f.spent) || 0) - cost) });
            }
        }
        ui.notifications?.info(`Golpe Pessoal cancelado — ${cost} PM devolvidos.`);
    } catch (e) { warn("golpe-pessoal: refund falhou:", e); }
}

// ── Injeção no clone da arma (submit do dialog nativo) ────────────────────────

function injectIntoWeaponClone(clone: ItemLike, result: Record<string, unknown>, p: PendingUse): void {
    const sys = clone.system;
    if (!sys) return;
    const build = p.build;
    // Crítico
    const margem = letalMargemBonus(build);
    if (margem) sys.criticoM = Math.max(2, (Number(sys.criticoM) || 20) - margem);
    if (hasEffect(build, "destruidor")) sys.criticoX = (Number(sys.criticoX) || 2) + 1;
    // Dados extras de dano
    const dano = sys.rolls?.find((r) => r.type === "dano");
    if (dano?.parts?.length) {
        const baseType = dano.parts[0][1] ?? "";
        const dieMatch = String(dano.parts[0][0] ?? "").match(/\d+d(\d+)/);
        if (hasEffect(build, "brutal") && dieMatch) dano.parts.push([`1d${dieMatch[1]}`, baseType]);
        for (const { dice, element } of elementalDice(build)) dano.parts.push([dice, element]);
        if (p.carregadoConsumed) dano.parts.push(["2d8", baseType]);
        if (hasEffect(build, "sequencial")) {
            const actor = clone.actor as ActorLike | null;
            const hits = actor ? (Number(trackFlag(actor, "golpeSequencial").hits) || 0) : 0;
            const passos = ((CONFIG as unknown as { T20?: { passosDano?: string[][] } }).T20?.passosDano) ?? [];
            dano.parts.push([sequencialDie(hits, passos), baseType]);
        }
        if (hasEffect(build, "penetrante")) { dano.rd = (Number(dano.rd) || 0) - 10; }
    }
    // Preciso: melhor de 2d20 — o d20Roll nativo lê `options.rollKeep` (mjs ~4819)
    const rk = result as { rollKeep?: string };
    if (hasEffect(build, "preciso") && !rk.rollKeep) rk.rollKeep = "khd20";
    // Entrada no card nativo
    const list = ((result as { onUseEffects?: Array<{ description: string; cost: unknown; qty: number }> }).onUseEffects ??= []);
    list.push({ description: `Golpe Pessoal (${p.cost} PM)`, cost: "", qty: 1 });
}

// ── Patch do AbilityUseDialog.create ──────────────────────────────────────────

function resolveRealGolpeItem(actor: ActorLike, clone: ItemLike): ItemLike | null {
    if (clone.id) {
        const byId = actor.items?.get?.(clone.id);
        if (byId) return byId;
    }
    const matches = (actor.items?.contents ?? []).filter((i) => isGolpePessoalPower(i as never) && i.name === clone.name);
    return matches[0] ?? null;
}

function patchAbilityUseDialog(): void {
    type DlgLike = { create: (item: unknown, ...a: unknown[]) => Promise<unknown>; _t20PatchedGolpePessoal?: boolean };
    const Dlg = (game as unknown as { tormenta20?: { applications?: { AbilityUseDialog?: DlgLike } } })
        .tormenta20?.applications?.AbilityUseDialog;
    if (!Dlg) { warn("golpe-pessoal: AbilityUseDialog não encontrado."); return; }
    if (Dlg._t20PatchedGolpePessoal) return;
    const orig = Dlg.create.bind(Dlg);
    Dlg.create = async function (item: unknown, ...args: unknown[]): Promise<unknown> {
        const clone = item as ItemLike;
        const actor = clone?.actor as ActorLike | null;

        // 1) Uso do PODER Golpe Pessoal → cancela o nativo e roda nosso fluxo.
        try {
            if (actor && isGolpePessoalPower(clone as never)) {
                const real = resolveRealGolpeItem(actor, clone);
                if (real) {
                    setTimeout(() => { void useGolpe(actor, real); }, 0);
                    return null;
                }
            }
        } catch (e) { warn("golpe-pessoal: detecção do poder falhou:", e); }

        // 2) Dialog da ARMA com golpe pendente → injeta modificadores no clone.
        const p = pendingUse;
        const isGolpeWeapon = !!(p && actor && clone?.type === "arma" && fresh(p.ts)
            && actor.id === p.actorId && (clone.id === p.weaponId || clone.name === p.weaponName));

        // 3) Magia do Conjurador → zera o custo base (já pago no golpe).
        const fs = pendingFreeSpell;
        const isFreeSpell = !!(fs && actor && clone?.type === "magia" && fresh(fs.ts)
            && actor.id === fs.actorId && (clone.id === fs.spellId || !clone.id));

        const result = await orig(item, ...args);

        if (isGolpeWeapon && p) {
            if (!result) { if (actor) void refundPending(actor); return result; }
            try {
                injectIntoWeaponClone(clone, result as Record<string, unknown>, p);
                // Sacrifício: −10 PV no uso (após confirmar o ataque)
                if (hasEffect(p.build, "sacrificio") && actor) {
                    const pv = actor.system?.attributes?.pv as { value?: number; min?: number } | undefined;
                    void actor.update?.({ "system.attributes.pv.value": Math.max((Number(pv?.min) || -99), (Number(pv?.value) || 0) - 10) });
                    ui.notifications?.info("Golpe Pessoal — Sacrifício: você perde 10 PV.");
                }
                if (p.carregadoConsumed && actor) void actor.unsetFlag?.(MODULE_ID, "golpeCarregado");
                firedUse = { ...p, payload: buildPayload(actor as ActorLike, p.build), notes: buildCardNotes(p.build) };
                pendingUse = null;
            } catch (e) { warn("golpe-pessoal: injeção no clone falhou:", e); }
        }

        if (isFreeSpell && fs && result) {
            try {
                const ativacao = clone.system?.ativacao;
                if (ativacao) {
                    const after = Number(ativacao.custo ?? 0);
                    const discount = Math.min(fs.baseCost, Math.max(0, after));
                    ativacao.custo = after - discount;
                    // Piso nativo cobra max(custo,1) — devolve 1 PM quando zerou.
                    if ((Number(ativacao.custo) || 0) < 1 && actor) {
                        setTimeout(() => { void actor.spendMana?.(1, 0, true); }, 1200);
                    }
                    ui.notifications?.info(`Golpe Pessoal — Conjurador: custo base da magia já pago (${discount} PM).`);
                }
            } catch (e) { warn("golpe-pessoal: free-spell falhou:", e); }
            pendingFreeSpell = null;
        }

        return result;
    };
    Dlg._t20PatchedGolpePessoal = true;
    log("Golpe Pessoal: AbilityUseDialog.create patcheado.");
}

// ── Card suplementar + claim da mensagem do ataque ────────────────────────────

interface MessageLike {
    id?: string;
    content?: string;
    speaker?: { actor?: string };
    author?: { id?: string };
    user?: { id?: string };
    rolls?: Array<{ total?: number; formula?: string; options?: { type?: string } }>;
}

function messageMatchesFired(message: MessageLike): boolean {
    if (!firedUse || !fresh(firedUse.ts)) return false;
    if (message.speaker?.actor !== firedUse.actorId) return false;
    const authorId = message.author?.id ?? message.user?.id;
    if (authorId && authorId !== game.user?.id) return false;
    if (!message.rolls?.length) return false;
    const content = message.content ?? "";
    return content.includes(`data-item-id="${firedUse.weaponId}"`) || content.includes(firedUse.weaponName);
}

/** Chamado pelo auto-damage (cliente do autor) ao montar o request. */
export function getGolpePayloadForMessage(message: unknown): GolpePayload | null {
    const m = message as MessageLike;
    const id = m?.id ?? "";
    const claimed = claimedByMsg.get(id);
    if (claimed) return claimed.payload;
    if (messageMatchesFired(m)) {
        claimGolpeMessage(m);
        return claimedByMsg.get(id)?.payload ?? null;
    }
    return null;
}

function attackTotalFromMessage(m: MessageLike): number | null {
    const atk = m.rolls?.find((r) => r.options?.type === "attack") ?? m.rolls?.find((r) => /d20/.test(r.formula ?? ""));
    return typeof atk?.total === "number" ? atk.total : null;
}

function claimGolpeMessage(m: MessageLike): void {
    if (!firedUse || !m.id) return;
    const fired = firedUse;
    claimedByMsg.set(m.id, { payload: fired.payload, fired });
    firedUse = null;
    // card suplementar (async, fora do hook)
    setTimeout(() => { void postGolpeCard(m, fired); }, 150);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function postGolpeCard(m: MessageLike, fired: FiredUse): Promise<void> {
    try {
        const parts: string[] = [];
        parts.push(`<div style="font-weight:bold;color:#c8a96e;">Golpe Pessoal — ${esc(fired.weaponName)} (${fired.cost} PM)</div>`);
        parts.push(`<div style="font-size:11px;color:#9a8e7a;">${esc(buildSummary(fired.build))}</div>`);
        if (fired.notes.length) {
            parts.push(`<ul style="margin:4px 0;padding-left:16px;font-size:12px;">${fired.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`);
        }
        // Amplo: compara o ataque com a Defesa de cada alvo marcado
        if (hasEffect(fired.build, "amplo")) {
            const atk = attackTotalFromMessage(m);
            const targets = [...((game.user as unknown as { targets?: Set<{ id?: string; name?: string; actor?: { name?: string; system?: { attributes?: { defesa?: { value?: number } } } } }> })?.targets ?? [])];
            if (atk !== null && targets.length) {
                const rows = targets.map((t) => {
                    const def = Number(t.actor?.system?.attributes?.defesa?.value) || 0;
                    const hit = atk >= def;
                    return `<li><b>${esc(t.name ?? t.actor?.name ?? "?")}</b> (Defesa ${def}): ${hit
                        ? '<span style="color:#6ecf7a;">ACERTOU</span>' : '<span style="color:#cc4444;">errou</span>'}</li>`;
                }).join("");
                parts.push(`<div style="margin-top:4px;"><b>Amplo</b> — ataque ${atk} vs alvos marcados:</div><ul style="margin:2px 0;padding-left:16px;">${rows}</ul>`);
            } else {
                parts.push(`<div style="margin-top:4px;color:#cc4444;font-size:12px;">Amplo: nenhum alvo marcado (T) no momento do ataque.</div>`);
            }
        }
        // Conjurador: botão de lançar a magia sem custo base
        const conj = fired.build.effects.find((e) => e.key === "conjurador");
        if (conj?.spellName) {
            parts.push(`<button type="button" class="t20-golpe-cast" data-actor-id="${esc(fired.actorId)}" data-spell-id="${esc(conj.spellId ?? "")}" data-spell-uuid="${esc(conj.spellUuid ?? "")}" data-spell-name="${esc(conj.spellName)}" data-spell-cost="${conj.spellCost ?? 0}" style="margin-top:6px;"><i class="fas fa-magic"></i> Lançar ${esc(conj.spellName)} (custo já pago)</button>`);
        }
        await (ChatMessage as unknown as { create: (d: Record<string, unknown>) => Promise<unknown> }).create({
            content: `<div class="t20-golpe-card" style="border:1px solid #c8a96e;border-radius:4px;padding:6px 8px;background:rgba(28,18,9,.35);">${parts.join("")}</div>`,
            speaker: { actor: fired.actorId },
        });
    } catch (e) { warn("golpe-pessoal: card suplementar falhou:", e); }
}

/**
 * Botão do Conjurador: resolve a magia na FICHA (id → nome); se veio de
 * compêndio e não está na ficha, IMPORTA (item marcado como temporário do
 * golpe, removido ~2 min depois) e lança sem o custo base.
 */
async function castGolpeSpell(btn: HTMLButtonElement): Promise<void> {
    const actorId = btn.dataset.actorId ?? "";
    const actor = (game.actors as unknown as { get: (id: string) => ActorLike | undefined }).get(actorId);
    if (!actor) return;
    if (!(actor.isOwner || game.user?.isGM)) {
        ui.notifications?.warn("Só o dono do personagem (ou o GM) pode lançar a magia do golpe.");
        return;
    }
    let spell = (btn.dataset.spellId ? actor.items?.get?.(btn.dataset.spellId) : null)
        ?? (actor.items?.contents ?? []).find((i) => i.type === "magia" && norm(i.name) === norm(btn.dataset.spellName));
    let importedId: string | null = null;
    if (!spell && btn.dataset.spellUuid) {
        try {
            const fromUuidFn = (globalThis as unknown as { fromUuid?: (u: string) => Promise<unknown> }).fromUuid;
            const src = await fromUuidFn?.(btn.dataset.spellUuid) as { toObject?: () => Record<string, unknown> } | null;
            const data = src?.toObject?.();
            if (data) {
                const flags = (data["flags"] ?? {}) as Record<string, Record<string, unknown>>;
                flags[MODULE_ID] = { ...(flags[MODULE_ID] ?? {}), golpeConjuradorTemp: true };
                data["flags"] = flags;
                const created = await (actor as unknown as { createEmbeddedDocuments: (t: string, d: unknown[]) => Promise<Array<{ id?: string }>> })
                    .createEmbeddedDocuments("Item", [data]);
                importedId = created?.[0]?.id ?? null;
                spell = importedId ? actor.items?.get?.(importedId) : undefined;
            }
        } catch (e) { warn("golpe-pessoal: import da magia do compêndio falhou:", e); }
    }
    if (!spell) { ui.notifications?.warn(`Magia "${btn.dataset.spellName}" não encontrada na ficha nem nos compêndios.`); return; }
    pendingFreeSpell = {
        actorId, spellId: spell.id ?? "", baseCost: Math.max(0, Number(btn.dataset.spellCost) || 0), ts: Date.now(),
    };
    try { await spell.roll?.({}); } finally {
        if (importedId) {
            // remove a cópia temporária depois do fluxo (o card já foi postado)
            setTimeout(() => {
                void (actor as unknown as { deleteEmbeddedDocuments?: (t: string, ids: string[]) => Promise<unknown> })
                    .deleteEmbeddedDocuments?.("Item", [importedId!])?.catch?.(() => { /* já removida */ });
            }, 120_000);
        }
    }
}

function setupChatHooks(): void {
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        try {
            const message = args[0] as MessageLike;
            if (messageMatchesFired(message)) claimGolpeMessage(message);
        } catch (e) { warn("golpe-pessoal: claim falhou:", e); }
    });
    Hooks.on("renderChatMessage", (...args: unknown[]) => {
        try {
            const html = args[1] as HTMLElement | JQuery;
            const root = ((html as JQuery)?.[0] ?? html) as HTMLElement;
            if (!root?.querySelector) return;
            root.querySelectorAll<HTMLButtonElement>(".t20-golpe-cast").forEach((btn) => {
                if ((btn as unknown as { _gpBound?: boolean })._gpBound) return;
                (btn as unknown as { _gpBound?: boolean })._gpBound = true;
                btn.addEventListener("click", () => { void castGolpeSpell(btn); });
            });
        } catch { /* render deve nunca quebrar */ }
    });
}

// ── Pós-dano (chamado pelo auto-damage no cliente do alvo) ────────────────────

export interface GolpePostDamageCtx {
    golpe: GolpePayload;
    targetActor: {
        id?: string; name?: string;
        system?: { pericias?: { fort?: { value?: number } } };
        getFlag?: (scope: string, key: string) => unknown;
        setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
        toggleStatusEffect?: (id: string, opts: { active: boolean }) => Promise<unknown>;
    } | null;
    targetTokenId: string;
    targetName: string;
    appliedDamage: number;
    rolledDamage: number;
}

/** Roda no cliente que APLICOU o dano (dono do alvo). */
export async function handleGolpePostDamage(ctx: GolpePostDamageCtx): Promise<void> {
    const g = ctx.golpe;
    const notes: string[] = [];
    try {
        // Impactante — nota com o empurrão
        if (g.impactante && ctx.appliedDamage > 0) {
            const push = Math.floor(ctx.appliedDamage / 10) * 1.5;
            if (push > 0) notes.push(`<b>Impactante:</b> empurra ${ctx.targetName} ${String(push).replace(".", ",")}m.`);
        }
        // Atordoante — Fort do alvo vs CD; 1×/cena por alvo
        if (g.atordoante && ctx.appliedDamage > 0 && ctx.targetActor) {
            const t = ctx.targetActor;
            const usedScene = (t.getFlag?.(MODULE_ID, "golpeAtordoadoScene") ?? "") as string;
            if (usedScene === g.sceneId) {
                notes.push(`<b>Atordoante:</b> ${ctx.targetName} já foi alvo nesta cena — imune.`);
            } else {
                const fortMod = Number(t.system?.pericias?.fort?.value) || 0;
                const roll = new Roll(`1d20 + ${fortMod}`);
                await roll.evaluate();
                const passed = (roll.total ?? 0) >= g.atordoante.cd;
                await t.setFlag?.(MODULE_ID, "golpeAtordoadoScene", g.sceneId);
                if (passed) {
                    notes.push(`<b>Atordoante:</b> Fortitude ${roll.total} vs CD ${g.atordoante.cd} — <span style="color:#6ecf7a;">resistiu</span>.`);
                } else {
                    notes.push(`<b>Atordoante:</b> Fortitude ${roll.total} vs CD ${g.atordoante.cd} — <span style="color:#cc4444;">atordoado por 1 rodada</span>.`);
                    try {
                        registerExpectedCondition(t.id ?? "", "atordoado", {
                            managed: true, kind: "rounds", rounds: 1, remaining: 1, source: "golpe-pessoal",
                        } as never);
                    } catch { /* duration-manager opcional */ }
                    await t.toggleStatusEffect?.("atordoado", { active: true });
                }
            }
        }
        // Sifão / Sequencial / Truque Secreto — atualizam o ATACANTE via GM
        if ((g.sifao && ctx.rolledDamage > 0) || (g.sequencial && ctx.appliedDamage >= 0) || g.truqueSecreto) {
            await getSocket()?.executeAsGM(SOCKET_GOLPE_POST, {
                attackerActorId: g.attackerActorId,
                sceneId: g.sceneId,
                nivel: g.nivel,
                sifaoRolled: g.sifao ? ctx.rolledDamage : 0,
                sequencialHit: !!g.sequencial && ctx.appliedDamage > 0,
                truqueTargetKey: g.truqueSecreto ? (ctx.targetTokenId || ctx.targetActor?.id || "") : "",
            });
        }
        if (notes.length) {
            await (ChatMessage as unknown as { create: (d: Record<string, unknown>) => Promise<unknown> }).create({
                content: `<div style="border:1px solid #c8a96e;border-radius:4px;padding:5px 8px;font-size:12px;">`
                    + `<div style="font-weight:bold;color:#c8a96e;">Golpe Pessoal — ${esc(g.attackerName)}</div>${notes.join("<br>")}</div>`,
            });
        }
    } catch (e) { warn("golpe-pessoal: pós-dano falhou:", e); }
}

interface GolpePostMsg {
    attackerActorId: string; sceneId: string; nivel: number;
    sifaoRolled: number; sequencialHit: boolean; truqueTargetKey: string;
}

/** Handler GM: credita Sifão e atualiza trackers do atacante. */
async function onGolpePostGM(data: GolpePostMsg): Promise<void> {
    const actor = (game.actors as unknown as { get: (id: string) => ActorLike | undefined }).get(data.attackerActorId);
    if (!actor) return;
    try {
        if (data.sifaoRolled > 0) {
            const f = (actor.getFlag?.(MODULE_ID, "golpeSifao") ?? {}) as TrackFlag;
            const gained = f.sceneId === data.sceneId ? (Number(f.gained) || 0) : 0;
            const cap = Math.max(0, (Number(data.nivel) || 0) - gained);
            const gain = Math.min(cap, Math.floor(data.sifaoRolled / 10));
            if (gain > 0) {
                const pm = actor.system?.attributes?.pm;
                await actor.update?.({ "system.attributes.pm.temp": (Number(pm?.temp) || 0) + gain });
                await actor.setFlag?.(MODULE_ID, "golpeSifao", { sceneId: data.sceneId, gained: gained + gain });
                ui.notifications?.info(`Sifão: ${actor.name} recebe +${gain} PM temporário(s).`);
            }
        }
        if (data.sequencialHit) {
            const f = (actor.getFlag?.(MODULE_ID, "golpeSequencial") ?? {}) as TrackFlag;
            const hits = f.sceneId === data.sceneId ? (Number(f.hits) || 0) : 0;
            await actor.setFlag?.(MODULE_ID, "golpeSequencial", { sceneId: data.sceneId, hits: hits + 1 });
        }
        if (data.truqueTargetKey) {
            const f = (actor.getFlag?.(MODULE_ID, "golpeTruque") ?? {}) as TrackFlag;
            const targets = f.sceneId === data.sceneId ? (f.targets ?? []) : [];
            if (!targets.includes(data.truqueTargetKey)) {
                await actor.setFlag?.(MODULE_ID, "golpeTruque", { sceneId: data.sceneId, targets: [...targets, data.truqueTargetKey] });
            }
        }
    } catch (e) { warn("golpe-pessoal: post GM falhou:", e); }
}

// ── Build: createItem / level-up / botão GM ───────────────────────────────────

function setupBuildHooks(): void {
    Hooks.on("createItem", (...args: unknown[]) => {
        try {
            const item = args[0] as ItemLike & { parent?: ActorLike | null };
            const userId = args[2] as string;
            if (userId !== game.user?.id) return;
            const actor = item.parent;
            if (!actor || actor.type !== "character") return;
            if (!isGolpePessoalPower(item as never)) return;
            if (item.getFlag?.(MODULE_ID, GOLPE_FLAG)) return; // já construído (drag de cópia)
            setTimeout(() => { void openGolpeBuildDialog(actor as never, item as never, "novo"); }, 250);
        } catch (e) { warn("golpe-pessoal: createItem falhou:", e); }
    });

    // Level-up: mudança em system.niveis de item classe → oferece reconstrução
    Hooks.on("updateItem", (...args: unknown[]) => {
        try {
            const item = args[0] as ItemLike & { parent?: ActorLike | null };
            const changes = args[1] as { system?: { niveis?: unknown } } | undefined;
            const userId = args[3] as string;
            if (userId !== game.user?.id) return;
            if (item.type !== "classe" || changes?.system?.niveis === undefined) return;
            const actor = item.parent;
            if (!actor || actor.type !== "character") return;
            const golpes = (actor.items?.contents ?? []).filter((i) =>
                isGolpePessoalPower(i as never) && i.getFlag?.(MODULE_ID, GOLPE_FLAG));
            if (!golpes.length) return;
            setTimeout(async () => {
                for (const g of golpes) {
                    await openGolpeBuildDialog(actor as never, g as never, "levelup");
                }
            }, 400);
        } catch (e) { warn("golpe-pessoal: level-up hook falhou:", e); }
    });

    // Botão GM na ficha do item do poder
    Hooks.on("renderItemSheet", (...args: unknown[]) => {
        try {
            const app = args[0] as { item?: ItemLike & { parent?: ActorLike | null } };
            const html = args[1] as HTMLElement | JQuery;
            const item = app.item;
            if (!item || !isGolpePessoalPower(item as never)) return;
            if (!game.user?.isGM) return;
            const actor = item.parent;
            if (!actor) return;
            const root = ((html as JQuery)?.[0] ?? html) as HTMLElement;
            if (!root?.querySelector || root.querySelector(".t20-golpe-gm-btn")) return;
            const header = root.querySelector(".sheet-header") ?? root.querySelector("form") ?? root;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "t20-golpe-gm-btn";
            btn.style.cssText = "margin:4px 0;font-size:12px;";
            btn.innerHTML = '<i class="fas fa-hammer"></i> Editar Golpe Pessoal (GM)';
            btn.addEventListener("click", () => { void openGolpeBuildDialog(actor as never, item as never, "gm"); });
            header.appendChild(btn);
        } catch { /* render nunca quebra */ }
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupGolpePessoal(): void {
    Hooks.once("ready", () => { patchAbilityUseDialog(); });
    setupChatHooks();
    setupBuildHooks();
    onSocketReady((socket) => {
        socket.register(SOCKET_GOLPE_POST, (data: unknown) => onGolpePostGM(data as GolpePostMsg));
    });
    log("Golpe Pessoal configurado.");
}
