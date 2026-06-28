/**
 * Adamante Esotérico — "ao lançar uma magia que causa dano, você pode pagar +1 PM
 * para rolar novamente qualquer resultado 1 na rolagem de dano dela".
 *
 * Integra ao fluxo do conjurador em `spell-resistance` (processSpellMessage):
 * antes de despachar o dano aos alvos, se o conjurador tem um esotérico
 * **equipado** com material Adamante e a rolagem de dano tem algum `1` nos
 * dados, oferece pagar 1 PM e rolar novamente esses 1s; o novo total passa a ser
 * o dano aplicado.
 *
 * O reroll é lógica custom (não é expressável por Active Effect) — daí o
 * marcador `esoteric.adamant` em `adamante/index.ts` ser vazio.
 */

import { ADAMANTE_KEY } from "@/adamante/index";
import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";

// ── Interfaces mínimas (desacopladas dos tipos globais, p/ testabilidade) ───────

interface DieResult { result: number; active?: boolean }
interface DieTermLike { faces?: number; results?: DieResult[] }
interface RollLike { dice?: DieTermLike[]; total?: number }

interface ItemLike {
    type?: string;
    name?: string;
    system?: {
        tipo?: string;
        equipado?: unknown;
        equipado2?: { slot?: unknown };
        upgrades?: { material?: string };
    };
}
interface ActorLike {
    items?: Iterable<ItemLike>;
    system?: { attributes?: { pm?: { value?: number } } };
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}

// ── Funções puras (testáveis) ───────────────────────────────────────────────────

/**
 * Coleta as FACES de cada dado ATIVO que rolou 1 na rolagem. Um array com um
 * item por dado a rerolar (ex.: dois d6 com 1 → `[6, 6]`).
 */
export function collectActiveOnes(roll: RollLike | null | undefined): number[] {
    const out: number[] = [];
    for (const d of roll?.dice ?? []) {
        const faces = Number(d.faces ?? 0);
        if (!faces) continue;
        for (const r of d.results ?? []) {
            if ((r.active ?? true) && r.result === 1) out.push(faces);
        }
    }
    return out;
}

/**
 * Delta de dano ao rerolar os 1s: cada novo valor substitui um dado que valia 1,
 * então o ganho é `Σ(novo - 1)`. Nunca negativo (novo ≥ 1).
 */
export function computeRerollDelta(newValues: number[]): number {
    return newValues.reduce((s, v) => s + (Math.max(1, v) - 1), 0);
}

/** Item equipado? (legacy `system.equipado` OU slot `equipado2.slot > 0`). */
export function isEsotericoEquipped(item: ItemLike | null | undefined): boolean {
    const sys = item?.system;
    const eq = sys?.equipado;
    let legacy = false;
    if (typeof eq === "number") legacy = eq > 0;
    else if (typeof eq === "boolean") legacy = eq;
    else if (typeof eq === "string") legacy = eq !== "" && eq !== "0" && eq !== "false";
    else legacy = Boolean(eq);
    const slot = Number(sys?.equipado2?.slot ?? 0);
    return legacy || slot > 0;
}

/** Acha um esotérico EQUIPADO com material Adamante no ator (ou null). */
export function findAdamanteEsoteric(actor: ActorLike | null | undefined): ItemLike | null {
    for (const it of actor?.items ?? []) {
        if (it.type !== "equipamento") continue;
        if (it.system?.tipo !== "esoterico") continue;
        if (it.system?.upgrades?.material !== ADAMANTE_KEY) continue;
        if (!isEsotericoEquipped(it)) continue;
        return it;
    }
    return null;
}

// ── Orquestração (efeitos colaterais) ───────────────────────────────────────────

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Diálogo: pagar 1 PM e rolar novamente os 1s? Resolve false se fechar/cancelar. */
function promptAdamanteReroll(count: number, casterName: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const plural = count === 1 ? "um resultado 1" : `${count} resultados 1`;
        new Dialog({
            title: "Adamante — Esotérico",
            content:
                `<div class="t20-adamante-eso" style="padding:4px 2px;line-height:1.5">` +
                `<p><b>${esc(casterName)}</b> tirou <b>${plural}</b> na rolagem de dano da magia.</p>` +
                `<p>Pagar <b>+1 PM</b> e rolar novamente ${count === 1 ? "esse dado" : "esses dados"}?</p>` +
                `</div>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: "Pagar 1 PM e rerolar",
                    callback: () => resolve(true),
                },
                no: {
                    icon: '<i class="fas fa-xmark"></i>',
                    label: "Não",
                    callback: () => resolve(false),
                },
            },
            default: "yes",
            close: () => resolve(false),
        }).render(true);
    });
}

interface SpeakerLike { actor?: string; alias?: string; token?: string; scene?: string }

interface AdamanteEsotericArgs {
    casterActor: ActorLike | null | undefined;
    damageRoll: RollLike | null | undefined;
    currentDamage: number;
    casterName: string;
    spellName: string;
    speaker?: SpeakerLike;
}

/**
 * Se elegível, oferece o reroll do Adamante esotérico e retorna o dano
 * (possivelmente aumentado). No-op (retorna `currentDamage`) se não houver
 * esotérico Adamante equipado, nenhum 1 nos dados, PM insuficiente, ou o
 * conjurador recusar.
 */
export async function maybeApplyAdamanteEsoteric(args: AdamanteEsotericArgs): Promise<number> {
    const { casterActor, damageRoll, currentDamage, casterName, spellName, speaker } = args;
    if (!casterActor || !damageRoll) return currentDamage;

    const eso = findAdamanteEsoteric(casterActor);
    if (!eso) return currentDamage;

    const ones = collectActiveOnes(damageRoll);
    if (ones.length === 0) return currentDamage;

    const pm = Number(casterActor.system?.attributes?.pm?.value ?? 0);
    if (pm < 1) {
        ui.notifications.warn(`Adamante (${esc(eso.name ?? "Esotérico")}): PM insuficiente para rolar novamente os 1s.`);
        return currentDamage;
    }

    const ok = await promptAdamanteReroll(ones.length, casterName);
    if (!ok) return currentDamage;

    // Rola um novo dado por 1 encontrado, com as mesmas faces.
    const newValues: number[] = [];
    for (const faces of ones) {
        try {
            const r = new Roll(`1d${faces}`);
            await r.evaluate({ async: true } as never);
            newValues.push(Number(r.total ?? 1));
        } catch (err) {
            warn(`adamante-esoteric: falha ao rolar 1d${faces}:`, err);
            newValues.push(1);
        }
    }

    const delta = computeRerollDelta(newValues);

    try {
        await casterActor.update?.({ "system.attributes.pm.value": Math.max(0, pm - 1) });
    } catch (err) {
        warn(`adamante-esoteric: falha ao debitar 1 PM:`, err);
    }

    const newDamage = currentDamage + delta;
    await postAdamanteCard({ casterName, spellName, ones, newValues, delta, newDamage, speaker });
    log(`Adamante esotérico: rerolou ${ones.length} resultado(s) 1 (+${delta} de dano) por 1 PM.`);
    return newDamage;
}

async function postAdamanteCard(p: {
    casterName: string;
    spellName: string;
    ones: number[];
    newValues: number[];
    delta: number;
    newDamage: number;
    speaker?: SpeakerLike;
}): Promise<void> {
    const rerolls = p.newValues
        .map((v, i) => `<span class="t20-adamante-die">d${p.ones[i]}: 1 → <b>${v}</b></span>`)
        .join("");
    const content =
        `<div class="t20-reaction-block" style="border-left:3px solid ${"#7d7f8c"}">` +
        `<div class="t20-reac-title"><i class="fa-solid fa-gem"></i> Adamante — Esotérico</div>` +
        `<div class="t20-reac-line"><b>${esc(p.casterName)}</b> pagou <b>1 PM</b> e rolou novamente os 1s de <b>${esc(p.spellName)}</b>.</div>` +
        `<div class="t20-reac-line" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px">${rerolls}</div>` +
        `<div class="t20-reac-line" style="margin-top:2px">Dano: <b>+${p.delta}</b> → total <b>${p.newDamage}</b>.</div>` +
        `</div>`;
    try {
        await ChatMessage.create({
            content,
            speaker: p.speaker ?? undefined,
            flags: { [MODULE_ID]: { adamanteEsoteric: true } },
        });
    } catch (err) {
        warn(`adamante-esoteric: falha ao postar card:`, err);
    }
}
