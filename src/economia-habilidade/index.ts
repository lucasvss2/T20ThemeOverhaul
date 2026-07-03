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

interface ItemLike {
    id?: string | null;
    type?: string;
    name?: string;
    system?: { ativacao?: { custo?: number | null } };
    flags?: Record<string, Record<string, unknown> | undefined>;
}
interface EconLink { linkedItemId: string; originalCusto: number; reducedCusto: number }

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
function econLink(it: ItemLike): EconLink | undefined {
    return (it.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG] as EconLink | undefined;
}

/**
 * Um poder é candidato a receber a economia? Poder não-mágico (type poder),
 * custa 2+ PM (senão −1 zeraria), não é outro Economia de Habilidade, e ainda
 * não foi vinculado por outro Economia.
 */
export function isEligibleTarget(it: ItemLike, linkedIds: Set<string>): boolean {
    if (it?.type !== "poder") return false;
    if (isEconomiaPower(it)) return false;
    if (powerCusto(it) < 2) return false;
    if (it.id && linkedIds.has(it.id)) return false;
    return true;
}

// ── Runtime shapes ─────────────────────────────────────────────────────────────

interface ActorLike {
    id?: string;
    type?: string;
    items?: { contents?: ItemLikeRT[]; get?(id: string): ItemLikeRT | undefined } | ItemLikeRT[];
}
interface ItemLikeRT extends ItemLike {
    parent?: ActorLike | null;
    update?(data: object, ctx?: object): Promise<unknown>;
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

async function applyLink(econItem: ItemLikeRT, target: ItemLikeRT): Promise<void> {
    const original = powerCusto(target);
    const reduced = computeReducedCusto(original);
    try {
        await target.update?.({ "system.ativacao.custo": reduced });
        // Renomeia SÓ esta instância (pode haver várias, cada uma p/ um poder).
        await econItem.update?.({
            name: economiaDisplayName(target.name ?? ""),
            [`flags.${MODULE_ID}.${FLAG}`]: { linkedItemId: target.id, originalCusto: original, reducedCusto: reduced },
        });
        ui.notifications?.info(`Economia de Habilidade: "${target.name}" agora custa ${reduced} PM (era ${original}).`);
        log(`Economia de Habilidade: ${target.name} ${original}→${reduced} PM.`);
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
    // Só restaura se ainda está no valor que reduzimos (não sobrescreve edição manual).
    if (powerCusto(target) !== link.reducedCusto) return;
    try {
        await target.update?.({ "system.ativacao.custo": link.originalCusto });
        log(`Economia de Habilidade: restaurado "${target.name}" para ${link.originalCusto} PM.`);
    } catch (e) {
        warn("economia-habilidade: falha ao restaurar", e);
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
        const c = powerCusto(t);
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

    log("Economia de Habilidade: redução de custo de PM por habilidade ativa.");
}
