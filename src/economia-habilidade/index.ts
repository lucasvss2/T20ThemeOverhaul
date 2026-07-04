/**
 * Economia de Habilidade — poder (v1.75.0)
 *
 * "Escolha uma habilidade não mágica. Esta habilidade tem seu custo em PM
 * reduzido em –1. Você pode escolher este poder outras vezes para habilidades
 * diferentes. Pré-requisito: treinado em Luta ou Pontaria."
 *
 * Como funciona:
 *   1. Ao ADICIONAR o poder a um personagem, abre um modal listando os poderes
 *      dele que custam 2+ PM (candidatos — reduzir 1 nunca pode zerar o custo).
 *      O usuário escolhe qual poder fica vinculado.
 *   2. O poder vinculado tem `system.ativacao.custo` reduzido em 1 (mín. 1). O
 *      `Economia de Habilidade` guarda `{linkedItemId, originalCusto}` numa flag.
 *   3. Ao REMOVER o Economia de Habilidade, o custo do poder vinculado volta ao
 *      original (só se ainda estiver no valor que reduzimos — não sobrescreve
 *      edição manual).
 *   4. Escolher o poder várias vezes → cada instância vincula um poder DIFERENTE
 *      (poderes já vinculados são excluídos da lista).
 *
 * ⚠️ Reduz o `ativacao.custo` do próprio poder-alvo (é o que o T20 debita) — sem
 * Active Effects, então não interfere em passivos/atributos de outros poderes.
 * Nunca reduz abaixo de 1 PM.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

const POWER_NAME = "economia de habilidade";
const FLAG = "economiaHabilidade";

// ── Detecção / regras (puras, testáveis) ──────────────────────────────────────

interface EffectLike {
    id?: string | null;
    flags?: { tormenta20?: { custo?: unknown; onuse?: unknown } };
}
interface ItemLike {
    id?: string | null;
    type?: string;
    name?: string;
    system?: { ativacao?: { custo?: number | null } };
    effects?: { contents?: EffectLike[] } | EffectLike[];
    flags?: Record<string, Record<string, unknown> | undefined>;
}
interface EffectCustoChange { effectId: string; original: string; reduced: string; where?: "item" | "actor" }
interface EconLink {
    linkedItemId: string;
    originalCusto: number;
    reducedCusto: number;
    effectCustos?: EffectCustoChange[];
}

export function isEconomiaPower(item: ItemLike | null | undefined): boolean {
    return item?.type === "poder" && normalizeCondName(item.name ?? "").includes(POWER_NAME);
}

/** Custo reduzido: −1, nunca abaixo de 1 (não é possível custar 0). */
export function computeReducedCusto(original: number): number {
    return Math.max(1, (Number(original) || 0) - 1);
}

function powerCusto(it: ItemLike): number {
    return Number(it?.system?.ativacao?.custo ?? 0) || 0;
}
function powerEffects(it: ItemLike): EffectLike[] {
    const e = it?.effects;
    return Array.isArray(e) ? e : (e?.contents ?? []);
}
function effectCusto(e: EffectLike): number {
    return Number(e.flags?.tormenta20?.custo ?? 0) || 0;
}
/**
 * Custo EFETIVO do poder = maior entre `ativacao.custo` e o custo dos "Efeitos de
 * Uso" (`flags.tormenta20.custo`). Poderes de perícia/ataque (ex.: Audácia)
 * cobram o PM pelo EFEITO, não pelo `ativacao.custo` — é o que os modais de teste
 * mostram. Por isso a economia precisa reduzir os dois.
 */
export function powerEffectiveCusto(it: ItemLike): number {
    let max = powerCusto(it);
    for (const e of powerEffects(it)) max = Math.max(max, effectCusto(e));
    return max;
}
function econLink(it: ItemLike): EconLink | undefined {
    return (it.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG] as EconLink | undefined;
}

/**
 * Um poder é candidato a receber a economia? Poder não-mágico (type poder), com
 * custo EFETIVO 2+ PM (senão −1 zeraria), não é outro Economia de Habilidade, e
 * ainda não foi vinculado por outro Economia.
 */
export function isEligibleTarget(it: ItemLike, linkedIds: Set<string>): boolean {
    if (it?.type !== "poder") return false;
    if (isEconomiaPower(it)) return false;
    if (powerEffectiveCusto(it) < 2) return false;
    if (it.id && linkedIds.has(it.id)) return false;
    return true;
}

// ── Runtime shapes ─────────────────────────────────────────────────────────────

interface ActorEffectLike extends EffectLike { origin?: string | null }
interface ActorLike {
    id?: string;
    type?: string;
    items?: { contents?: ItemLikeRT[]; get?(id: string): ItemLikeRT | undefined } | ItemLikeRT[];
    effects?: { contents?: ActorEffectLike[] } | ActorEffectLike[];
    updateEmbeddedDocuments?(type: string, updates: object[], ctx?: object): Promise<unknown>;
}
interface ItemLikeRT extends ItemLike {
    parent?: ActorLike | null;
    update?(data: object, ctx?: object): Promise<unknown>;
    updateEmbeddedDocuments?(type: string, updates: object[], ctx?: object): Promise<unknown>;
}

function actorEffects(actor: ActorLike): ActorEffectLike[] {
    const e = actor.effects;
    return Array.isArray(e) ? e : (e?.contents ?? []);
}

function actorItems(actor: ActorLike): ItemLikeRT[] {
    return Array.isArray(actor.items) ? actor.items : (actor.items?.contents ?? []);
}
function getItem(actor: ActorLike, id: string): ItemLikeRT | undefined {
    if (!Array.isArray(actor.items) && actor.items?.get) return actor.items.get(id);
    return actorItems(actor).find(i => i.id === id);
}

/** IDs de poderes já vinculados por algum Economia de Habilidade no ator. */
function linkedItemIds(actor: ActorLike): Set<string> {
    const out = new Set<string>();
    for (const it of actorItems(actor)) {
        if (!isEconomiaPower(it)) continue;
        const link = econLink(it);
        if (link?.linkedItemId) out.add(link.linkedItemId);
    }
    return out;
}

function eligibleTargets(actor: ActorLike): ItemLikeRT[] {
    const linked = linkedItemIds(actor);
    return actorItems(actor).filter(it => isEligibleTarget(it, linked));
}

// ── Aplicar / restaurar ───────────────────────────────────────────────────────

/** Nome desta instância do poder, marcando a habilidade que ela afeta. */
export function economiaDisplayName(targetName: string): string {
    return `Economia de Habilidade (${targetName})`;
}

/**
 * Coleta as reduções de custo dos "Efeitos de Uso" (custo 2+) do poder, em DUAS
 * fontes:
 *   - `item` — os efeitos do próprio poder (o que nosso teste secreto lê);
 *   - `actor` — as CÓPIAS que o T20 põe em `actor.effects` (legacyTransferral,
 *     origin apontando pro item). ⚠️ O modal NATIVO de uso de perícia lê o custo
 *     DESSAS cópias (T20 usa `item.actor.effects` p/ perícia), por isso as duas
 *     precisam ser reduzidas.
 */
export function collectEffectReductions(target: ItemLikeRT, actor: ActorLike): {
    itemUpdates: object[]; actorUpdates: object[]; changes: EffectCustoChange[];
} {
    const itemUpdates: object[] = [];
    const actorUpdates: object[] = [];
    const changes: EffectCustoChange[] = [];
    for (const e of powerEffects(target)) {
        const c = effectCusto(e);
        if (c < 2 || !e.id) continue;
        const rc = Math.max(1, c - 1);
        itemUpdates.push({ _id: e.id, "flags.tormenta20.custo": String(rc) });
        changes.push({ effectId: e.id, original: String(c), reduced: String(rc), where: "item" });
    }
    const tid = target.id ?? "";
    for (const e of actorEffects(actor)) {
        if (!e.id || !tid) continue;
        if (!String(e.origin ?? "").includes(tid)) continue; // cópia deste poder
        const c = effectCusto(e);
        if (c < 2) continue;
        const rc = Math.max(1, c - 1);
        actorUpdates.push({ _id: e.id, "flags.tormenta20.custo": String(rc) });
        changes.push({ effectId: e.id, original: String(c), reduced: String(rc), where: "actor" });
    }
    return { itemUpdates, actorUpdates, changes };
}

/** Aplica a redução no poder (ativacao.custo + custo dos Efeitos de Uso item/actor). */
async function reduceTarget(target: ItemLikeRT, actor: ActorLike): Promise<EconLink> {
    const original = powerCusto(target);
    const reduced = original >= 2 ? computeReducedCusto(original) : original;
    if (original >= 2) await target.update?.({ "system.ativacao.custo": reduced });
    const { itemUpdates, actorUpdates, changes } = collectEffectReductions(target, actor);
    if (itemUpdates.length) await target.updateEmbeddedDocuments?.("ActiveEffect", itemUpdates, { render: false });
    if (actorUpdates.length) await actor.updateEmbeddedDocuments?.("ActiveEffect", actorUpdates, { render: false });
    return { linkedItemId: target.id ?? "", originalCusto: original, reducedCusto: reduced, effectCustos: changes };
}

async function applyLink(econItem: ItemLikeRT, target: ItemLikeRT): Promise<void> {
    const actor = econItem.parent ?? target.parent;
    if (!actor) return;
    try {
        const link = await reduceTarget(target, actor);
        // Renomeia SÓ esta instância (pode haver várias, cada uma p/ um poder).
        await econItem.update?.({
            name: economiaDisplayName(target.name ?? ""),
            [`flags.${MODULE_ID}.${FLAG}`]: link,
        });
        const eff = powerEffectiveCusto(target);
        ui.notifications?.info(`Economia de Habilidade: "${target.name}" agora custa ${Math.max(1, eff - 1)} PM (era ${eff}).`);
        log(`Economia de Habilidade: ${target.name} custo efetivo ${eff}→${Math.max(1, eff - 1)}.`);
    } catch (e) {
        warn("economia-habilidade: falha ao aplicar", e);
    }
}

async function restoreLink(econItem: ItemLikeRT): Promise<void> {
    const actor = econItem.parent;
    const link = econLink(econItem);
    if (!actor || !link?.linkedItemId) return;
    const target = getItem(actor, link.linkedItemId);
    if (!target) return;
    try {
        // ativacao.custo — só restaura se ainda está no valor reduzido (não sobrescreve edição manual).
        if (link.reducedCusto !== link.originalCusto && powerCusto(target) === link.reducedCusto) {
            await target.update?.({ "system.ativacao.custo": link.originalCusto });
        }
        // Efeitos de Uso — restaura os custos reduzidos (item E cópias no ator).
        const itemUpd: object[] = [];
        const actorUpd: object[] = [];
        for (const ec of link.effectCustos ?? []) {
            const where = ec.where ?? "item";
            const pool = where === "actor" ? actorEffects(actor) : powerEffects(target);
            const e = pool.find(x => x.id === ec.effectId);
            if (e && String(effectCusto(e)) === ec.reduced) {
                (where === "actor" ? actorUpd : itemUpd).push({ _id: ec.effectId, "flags.tormenta20.custo": ec.original });
            }
        }
        if (itemUpd.length) await target.updateEmbeddedDocuments?.("ActiveEffect", itemUpd, { render: false });
        if (actorUpd.length) await actor.updateEmbeddedDocuments?.("ActiveEffect", actorUpd, { render: false });
        log(`Economia de Habilidade: restaurado "${target.name}".`);
    } catch (e) {
        warn("economia-habilidade: falha ao restaurar", e);
    }
}

/**
 * Reconcilia vínculos existentes cujo custo de Efeito de Uso ainda não foi
 * reduzido (links criados antes de v1.75.2). Idempotente. Roda no `ready` p/
 * cada ator que o usuário possui.
 */
async function reconcileActor(actor: ActorLike & { isOwner?: boolean }): Promise<void> {
    if (actor.type !== "character" || !actor.isOwner) return;
    for (const econ of actorItems(actor)) {
        if (!isEconomiaPower(econ)) continue;
        const link = econLink(econ);
        if (!link?.linkedItemId) continue;
        const target = getItem(actor, link.linkedItemId);
        if (!target) continue;
        // Re-deriva o que AINDA está com custo 2+ (item e/ou cópia no ator) e reduz.
        const { itemUpdates, actorUpdates, changes } = collectEffectReductions(target, actor);
        if (!changes.length) continue; // já tudo reduzido
        try {
            if (itemUpdates.length) await target.updateEmbeddedDocuments?.("ActiveEffect", itemUpdates, { render: false });
            if (actorUpdates.length) await actor.updateEmbeddedDocuments?.("ActiveEffect", actorUpdates, { render: false });
            // Mescla no flag (dedup por effectId) p/ a restauração cobrir tudo.
            const merged = [...(link.effectCustos ?? [])];
            for (const c of changes) if (!merged.some(m => m.effectId === c.effectId)) merged.push(c);
            await (econ as ItemLikeRT).update?.({ [`flags.${MODULE_ID}.${FLAG}.effectCustos`]: merged });
            log(`Economia de Habilidade: reconciliado custo de efeito de "${target.name}".`);
        } catch (e) {
            warn("economia-habilidade: falha ao reconciliar", e);
        }
    }
}

// ── Modal de escolha ──────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function openTargetModal(econItem: ItemLikeRT): void {
    const actor = econItem.parent;
    if (!actor) return;
    const targets = eligibleTargets(actor);
    if (targets.length === 0) {
        ui.notifications?.warn("Economia de Habilidade: nenhuma habilidade elegível (é preciso um poder que custe 2+ PM ainda não reduzido). Adicione o poder-alvo e re-adicione este poder para vinculá-lo.");
        return;
    }
    const options = targets.map(t => {
        const c = powerEffectiveCusto(t);
        return `<option value="${esc(t.id ?? "")}">${esc(t.name ?? "")} — ${c} → ${computeReducedCusto(c)} PM</option>`;
    }).join("");
    const content = `
        <div style="padding:4px 2px;line-height:1.5">
            <p>Escolha a habilidade não mágica que terá o custo em PM <b>reduzido em 1</b> (mín. 1):</p>
            <div class="form-group">
                <label for="econ-target">Habilidade</label>
                <select id="econ-target" name="econ-target" style="width:100%">${options}</select>
            </div>
        </div>`;
    const dlg = new Dialog({
        title: "Economia de Habilidade — Escolha a Habilidade",
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-check"></i>',
                label: "Vincular",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const id = root.querySelector<HTMLSelectElement>('select[name="econ-target"]')?.value;
                    const target = id ? getItem(actor, id) : undefined;
                    if (target) void applyLink(econItem, target);
                },
            },
        },
        default: "confirm",
    }, { classes: ["t20-dialog", "t20-economia-dialog"], width: 420 });
    dlg.render(true);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function hookUserId(args: unknown[]): string | undefined {
    for (let i = args.length - 1; i >= 0; i--) if (typeof args[i] === "string") return args[i] as string;
    return undefined;
}

export function setupEconomiaHabilidade(): void {
    // Adicionar o poder → abre o modal de escolha (só no cliente que adicionou).
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLikeRT;
        if (hookUserId(args) !== game.user?.id) return;
        if (!isEconomiaPower(item)) return;
        if ((item.parent as ActorLike | null)?.type !== "character") return;
        setTimeout(() => { try { openTargetModal(item); } catch (e) { warn("economia-habilidade: modal falhou", e); } }, 200);
    });

    // Remover o poder → restaura o custo do poder vinculado.
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLikeRT;
        if (hookUserId(args) !== game.user?.id) return;
        if (!isEconomiaPower(item)) return;
        void restoreLink(item);
    });

    // Reconcilia vínculos antigos (que só reduziram ativacao.custo, não o Efeito de Uso).
    Hooks.once("ready", () => {
        const actors = (game.actors?.contents ?? []) as Array<ActorLike & { isOwner?: boolean }>;
        for (const a of actors) void reconcileActor(a);
    });

    log("Economia de Habilidade: redução de custo de PM por habilidade ativa.");
}
