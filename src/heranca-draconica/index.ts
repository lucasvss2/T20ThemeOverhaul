/**
 * Herança Dracônica + Escamas Elementais — poderes raciais dracônicos.
 *
 * Herança Dracônica: ao adicionar, abre um modal para escolher o elemento
 * (ácido, eletricidade, fogo, frio, luz, trevas). Aplica no ATOR uma AE com
 * RD 5 contra o elemento (via `tracos.resistencias.<el>.bonus`, que o T20 deriva
 * em `.value`) + define `detalhes.tipo = "mon"` (criatura do tipo monstro).
 *
 * Escamas Elementais: +2 na Defesa e aumenta a RD da Herança Dracônica para 10.
 * Não tem modal próprio — re-sincroniza a partir do elemento já escolhido na
 * Herança.
 *
 * Toda a aplicação passa por `syncDraconico(actor)`, idempotente: remove as AEs
 * que criamos e recria conforme os poderes presentes + o elemento escolhido.
 * Roda no cliente que disparou a mudança (dono do PC).
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";
import {
    ELEMENT_KEYS,
    HERANCA_NAME,
    ESCAMAS_NAME,
    isElementKey,
    computeHerancaRd,
    buildHerancaChanges,
    type ElementKey,
} from "./format";
import STYLES from "./heranca-draconica.css?inline";

const STYLES_ID = "t20-draconico-styles";
const ELEMENT_FLAG = "draconicoElement";

// ── CSS ───────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Detecção ────────────────────────────────────────────────────────────────

interface ItemLike {
    type?: string;
    name?: string;
    id?: string | null;
    uuid?: string;
    flags?: Record<string, Record<string, unknown>>;
    parent?: FoundryActor | null;
    getFlag?(scope: string, key: string): unknown;
    setFlag?(scope: string, key: string, value: unknown): Promise<unknown>;
}

export function isHerancaDraconica(item: ItemLike | null | undefined): boolean {
    return !!item && item.type === "poder" && normalizeCondName(item.name ?? "").includes(HERANCA_NAME);
}

export function isEscamasElementais(item: ItemLike | null | undefined): boolean {
    return !!item && item.type === "poder" && normalizeCondName(item.name ?? "").includes(ESCAMAS_NAME);
}

function elementLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { damageTypes?: Record<string, string> } }).T20?.damageTypes;
    return cfg?.[key] ?? key;
}

// ── Sincronização (core) ───────────────────────────────────────────────────────

interface DraconicoActor extends FoundryActor {
    items?: { contents: FoundryItem[]; get(id: string): FoundryItem | null };
}

function findItem(actor: DraconicoActor, pred: (i: ItemLike) => boolean): FoundryItem | null {
    return (actor.items?.contents ?? []).find((i) => pred(i as ItemLike)) ?? null;
}

function readElement(item: FoundryItem | null): ElementKey | null {
    if (!item) return null;
    const v = (item.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ELEMENT_FLAG];
    return isElementKey(typeof v === "string" ? v : null) ? (v as ElementKey) : null;
}

/** Remove as AEs que criamos e recria conforme estado atual dos poderes. */
async function syncDraconico(actor: DraconicoActor): Promise<void> {
    if (actor.type !== "character") return;

    // Prefere a Herança que JÁ tem o elemento escolhido (robustez se houver
    // duplicatas), senão a primeira encontrada.
    const herancas = (actor.items?.contents ?? []).filter((i) => isHerancaDraconica(i as ItemLike));
    const heranca = herancas.find((i) => readElement(i)) ?? herancas[0] ?? null;
    const escamas = findItem(actor, isEscamasElementais);

    // Remove nossas AEs anteriores.
    const ourIds = (actor.effects?.contents ?? [])
        .filter((e) => (e.flags?.[MODULE_ID] as { draconico?: boolean } | undefined)?.draconico)
        .map((e) => e.id)
        .filter((id): id is string => Boolean(id));
    if (ourIds.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", ourIds, { render: false });

    const toCreate: Record<string, unknown>[] = [];
    const rd = computeHerancaRd(!!escamas);

    if (heranca) {
        const element = readElement(heranca);
        if (element) {
            toCreate.push({
                name: `Herança Dracônica — RD ${rd} (${elementLabel(element)})`,
                icon: "icons/magic/fire/flame-burning-creature-skull.webp",
                origin: heranca.uuid,
                transfer: false,
                disabled: false,
                changes: buildHerancaChanges(element, rd),
                flags: { [MODULE_ID]: { draconico: true, kind: "heranca" } },
            });
        }
    }

    // NÃO criamos AE de +2 Defesa para Escamas Elementais: o item do compêndio
    // já carrega uma AE nativa (transfer:true) com esse bônus. Nosso papel para
    // Escamas é só elevar a RD da Herança para 10 (feito acima via computeHerancaRd).

    if (toCreate.length) {
        await actor.createEmbeddedDocuments?.("ActiveEffect", toCreate, { render: false });
    }
    log(`Dracônico sincronizado (heranca=${!!heranca}, escamas=${!!escamas}, rd=${rd}).`);
}

// ── Modal de escolha do elemento ───────────────────────────────────────────────

function openElementModal(item: ItemLike): void {
    ensureStyles();
    const current = (item.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ELEMENT_FLAG];
    const radios = ELEMENT_KEYS.map((k, i) => `
        <label class="drac-elem">
            <input type="radio" name="drac-element" value="${k}" ${(k === current || (!current && i === 0)) ? "checked" : ""}/>
            <span>${esc(elementLabel(k))}</span>
        </label>`).join("");

    const content = `
        <div class="drac-modal">
            <div class="drac-intro">Escolha o tipo de dano contra o qual você recebe <b>redução</b> dracônica:</div>
            <div class="drac-elem-grid">${radios}</div>
        </div>`;

    const dlg = new Dialog({
        title: "Herança Dracônica — Elemento",
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-dragon"></i>',
                label: "Confirmar",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const chosen = root.querySelector<HTMLInputElement>('input[name="drac-element"]:checked')?.value;
                    if (!isElementKey(chosen ?? null)) return;
                    void applyElementChoice(item, chosen as ElementKey);
                },
            },
        },
        default: "confirm",
    }, { classes: ["t20-dialog", "t20-draconico-dialog"], width: 420 });
    dlg.render(true);
}

async function applyElementChoice(item: ItemLike, element: ElementKey): Promise<void> {
    await item.setFlag?.(MODULE_ID, ELEMENT_FLAG, element);
    const actor = item.parent as DraconicoActor | null;
    if (actor) await syncDraconico(actor);
    ui.notifications?.info(`Herança Dracônica: RD contra ${elementLabel(element)}.`);
}

// ── Sequência com modal de atributos da raça (robustez) ────────────────────────

function attributeDialogOpen(): boolean {
    const instances = (foundry as unknown as { applications?: { instances?: Map<string, { title?: string }> } })
        .applications?.instances;
    for (const app of instances?.values?.() ?? []) {
        if (/atributos\s*din[âa]micos/i.test(app.title ?? "")) return true;
    }
    return false;
}

async function waitForAttributeDialog(): Promise<void> {
    if (!attributeDialogOpen()) return;
    const start = Date.now();
    await new Promise<void>((resolve) => {
        const check = (): void => {
            if (!attributeDialogOpen() || Date.now() - start > 60000) resolve();
            else setTimeout(check, 200);
        };
        setTimeout(check, 200);
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function isMine(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

export function setupHerancaDraconica(): void {
    Hooks.once("ready", () => ensureStyles());

    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike;
        const userId = args[2] as string | undefined;
        if (!isMine(userId)) return;
        if (item.parent?.type !== "character") return;

        if (isHerancaDraconica(item)) {
            void (async () => {
                try {
                    await waitForAttributeDialog();
                    const existing = (item.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ELEMENT_FLAG];
                    if (isElementKey(typeof existing === "string" ? existing : null)) {
                        await syncDraconico(item.parent as DraconicoActor);
                    } else {
                        openElementModal(item);
                    }
                } catch (err) {
                    warn("Herança Dracônica: falha ao abrir modal:", err);
                }
            })();
        } else if (isEscamasElementais(item)) {
            void syncDraconico(item.parent as DraconicoActor);
        }
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike;
        const userId = args[2] as string | undefined;
        if (!isMine(userId)) return;
        const actor = item.parent as DraconicoActor | null;
        if (!actor || actor.type !== "character") return;
        if (isHerancaDraconica(item) || isEscamasElementais(item)) {
            // Aguarda o item sair da coleção antes de re-sincronizar.
            setTimeout(() => void syncDraconico(actor), 50);
        }
    });
}
