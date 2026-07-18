/**
 * Linhagem Dracônica (Arcanista/Feiticeiro) — Básica, Aprimorada e Superior.
 *
 * As AEs do compêndio nativo são quebradas: a Básica tem key com placeholder
 * literal (`system.tracos.resistencias.???.bonus`) e `transfer:false` (nunca é
 * copiada pro ator — não aplica NADA); a Aprimorada tem 2 checkboxes onuse
 * separados (custo e dano +1 FLAT, nem é por dado); a Superior não tem effect.
 *
 * Automação:
 *  - Elemento (ácido/eletricidade/fogo/frio) escolhido UMA vez em modal —
 *    flag no ATOR (`linhagemDraconicaElement`) vincula as três versões.
 *  - `syncLinhagem(actor)` idempotente (padrão Herança Dracônica): recria as
 *    AEs nossas conforme os poderes presentes; remove as AEs nativas quebradas
 *    (item + cópias no ator).
 *  - Básica: +Car nos PV iniciais + RD 5 no elemento.
 *  - Aprimorada: UM effect onuse no ATOR (checkbox único no dialog de magia):
 *    flag custo "-1" (−1 PM, piso 1 nativo) + change `dano:<el>` `d*1`
 *    (+1 por dado, nativo — só nas parts do elemento).
 *  - Superior: 2×Car nos PV iniciais + imunidade ao elemento + PM temporários
 *    = círculo da magia ao reduzir ≥1 inimigo a 0 PV com magia do elemento
 *    (socket `linhagem-draconica/superior-kill`, disparado pelo modal de
 *    resistência ao aplicar dano letal; dedupe por messageId no GM).
 */

import { MODULE_ID } from "@/constants";
// ⚠️ NÃO importar de "@/spell-resistance/index" aqui — o spell-resistance importa
// notifySuperiorKillIfDead deste módulo (ciclo). `norm` é a mesma normalização.
import { norm as normalizeCondName } from "@/inspiracao/format";
import { getSocket, onSocketReady } from "@/socket";
import { log, warn } from "@/utils/logging";
import {
    LINHAGEM_ELEMENTS,
    type LinhagemElement,
    type LinhagemKind,
    isLinhagemElement,
    linhagemKindOf,
    buildBasicaChanges,
    buildSuperiorChanges,
    buildAprimoradaChanges,
    superiorTempPmForCircle,
    damageMatchesElement,
} from "./format";
import STYLES from "@/heranca-draconica/heranca-draconica.css?inline";

const STYLES_ID = "t20-linhagem-draconica-styles";
/** Flag no ATOR com o elemento escolhido (compartilhado pelas 3 versões). */
const ELEMENT_FLAG = "linhagemDraconicaElement";
/** Flag nas AEs que criamos. */
const AE_FLAG = "linhagemDraconica";

// ── CSS / helpers ─────────────────────────────────────────────────────────────

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

function elementLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { damageTypes?: Record<string, string> } }).T20?.damageTypes;
    return cfg?.[key] ?? key;
}

interface FlagActor extends FoundryActor {
    getFlag?: (scope: string, key: string) => unknown;
    setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
    unsetFlag?: (scope: string, key: string) => Promise<unknown>;
}

interface ItemWithEffects extends FoundryItem {
    deleteEmbeddedDocuments?: (type: string, ids: string[], options?: Record<string, unknown>) => Promise<unknown[]>;
}

// ── Detecção ──────────────────────────────────────────────────────────────────

export function linhagemKindOfItem(item: { type?: string; name?: string } | null | undefined): LinhagemKind | null {
    if (!item || item.type !== "poder") return null;
    return linhagemKindOf(normalizeCondName(item.name ?? ""));
}

function linhagemPowersOf(actor: FoundryActor): Map<LinhagemKind, FoundryItem> {
    const found = new Map<LinhagemKind, FoundryItem>();
    for (const it of actor.items?.contents ?? []) {
        const kind = linhagemKindOfItem(it);
        if (kind && !found.has(kind)) found.set(kind, it);
    }
    return found;
}

export function readLinhagemElement(actor: FoundryActor | null | undefined): LinhagemElement | null {
    if (!actor) return null;
    const v = (actor.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[ELEMENT_FLAG];
    return isLinhagemElement(typeof v === "string" ? v : null) ? (v as LinhagemElement) : null;
}

// ── Sincronização (core) ──────────────────────────────────────────────────────

/** Remove os effects NATIVOS quebrados do compêndio (no item e nas cópias do ator). */
async function cleanupNativeEffects(actor: FoundryActor, powers: Map<LinhagemKind, FoundryItem>): Promise<void> {
    for (const [kind, item] of powers) {
        const it = item as ItemWithEffects;
        const itemEffectIds = (it.effects?.contents ?? [])
            .filter((e) => !(e.flags?.[MODULE_ID] as { [AE_FLAG]?: boolean } | undefined)?.[AE_FLAG])
            .filter((e) => {
                if (kind === "basica") return e.changes?.some((c) => c.key.includes("???"));
                if (kind === "aprimorada") return true; // as 2 onuse nativas
                return false;
            })
            .map((e) => e.id)
            .filter(Boolean);
        if (itemEffectIds.length && it.deleteEmbeddedDocuments) {
            await it.deleteEmbeddedDocuments("ActiveEffect", itemEffectIds, { render: false });
        }
        // Cópias no ator (a Aprimorada nativa é transfer:true → copiada na criação).
        if (kind === "aprimorada") {
            const norm = normalizeCondName(item.name ?? "");
            const copyIds = (actor.effects?.contents ?? [])
                .filter((e) => !(e.flags?.[MODULE_ID] as { [AE_FLAG]?: boolean } | undefined)?.[AE_FLAG])
                .filter((e) => {
                    const sameOrigin = !!item.id && !!e.origin && e.origin.endsWith(`.${item.id}`);
                    const sameName = normalizeCondName(e.name ?? "").includes(norm);
                    return sameOrigin || sameName;
                })
                .map((e) => e.id)
                .filter(Boolean);
            if (copyIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", copyIds, { render: false });
        }
    }
}

/** Idempotente: apaga nossas AEs e recria conforme poderes presentes + elemento. */
export async function syncLinhagem(actor: FoundryActor): Promise<void> {
    if (actor.type !== "character") return;
    const powers = linhagemPowersOf(actor);
    const element = readLinhagemElement(actor);

    // Remove nossas AEs anteriores.
    const ourIds = (actor.effects?.contents ?? [])
        .filter((e) => (e.flags?.[MODULE_ID] as { [AE_FLAG]?: boolean } | undefined)?.[AE_FLAG])
        .map((e) => e.id)
        .filter((id): id is string => Boolean(id));
    if (ourIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ourIds, { render: false });

    if (!powers.size) {
        // Último poder Linhagem saiu — limpa a escolha de elemento.
        if (element) await (actor as FlagActor).unsetFlag?.(MODULE_ID, ELEMENT_FLAG);
        return;
    }

    await cleanupNativeEffects(actor, powers);
    if (!element) return; // sem elemento escolhido ainda — modal fará o sync depois

    const label = elementLabel(element);
    const toCreate: Record<string, unknown>[] = [];

    const basica = powers.get("basica");
    if (basica) {
        toCreate.push({
            name: `Linhagem Dracônica Básica (${label})`,
            icon: "icons/creatures/reptiles/dragon-horned-blue.webp",
            origin: basica.uuid,
            transfer: false,
            disabled: false,
            changes: buildBasicaChanges(element),
            flags: { [MODULE_ID]: { [AE_FLAG]: true, kind: "basica" } },
        });
    }

    const superior = powers.get("superior");
    if (superior) {
        toCreate.push({
            name: `Linhagem Dracônica Superior (${label})`,
            icon: "icons/creatures/reptiles/dragon-winged-blue.webp",
            origin: superior.uuid,
            transfer: false,
            disabled: false,
            changes: buildSuperiorChanges(element),
            flags: { [MODULE_ID]: { [AE_FLAG]: true, kind: "superior" } },
        });
    }

    const aprimorada = powers.get("aprimorada");
    if (aprimorada) {
        // Effect ONUSE — aparece como checkbox único no dialog de uso de magia.
        toCreate.push({
            name: `Linhagem Dracônica Aprimorada (${label}): −1 PM e +1 de dano por dado`,
            icon: "icons/magic/fire/beam-jet-stream-embers.webp",
            origin: aprimorada.uuid,
            transfer: false,
            disabled: true, // estado default do checkbox onuse
            changes: buildAprimoradaChanges(element),
            flags: {
                tormenta20: {
                    onuse: true,
                    spell: true,
                    custo: "-1",
                    self: false,
                    attack: false,
                    skill: false,
                    ability: false,
                    power: false,
                    consumable: false,
                    aumenta: false,
                    durationScene: false,
                    items: "",
                },
                [MODULE_ID]: { [AE_FLAG]: true, kind: "aprimorada" },
            },
        });
    }

    if (toCreate.length) await actor.createEmbeddedDocuments("ActiveEffect", toCreate, { render: false });
    log(`Linhagem Dracônica sincronizada (${[...powers.keys()].join("+") || "nenhuma"}, elemento=${element}).`);
}

// ── Modal de escolha do elemento ──────────────────────────────────────────────

let modalOpen = false;

function openLinhagemModal(actor: FoundryActor): void {
    if (modalOpen) return;
    modalOpen = true;
    ensureStyles();
    const current = readLinhagemElement(actor);
    const radios = LINHAGEM_ELEMENTS.map((k, i) => `
        <label class="drac-elem">
            <input type="radio" name="linhagem-element" value="${k}" ${(k === current || (!current && i === 0)) ? "checked" : ""}/>
            <span>${esc(elementLabel(k))}</span>
        </label>`).join("");

    const content = `
        <div class="drac-modal">
            <div class="drac-intro">
                <b>Linhagem Dracônica</b> — escolha o tipo de dano do seu antepassado dracônico.
                A escolha vale para as versões Básica, Aprimorada e Superior.
            </div>
            <div class="drac-elem-grid">${radios}</div>
        </div>`;

    const dlg = new Dialog({
        title: `Linhagem Dracônica — Elemento (${actor.name})`,
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-dragon"></i>',
                label: "Confirmar",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const chosen = root.querySelector<HTMLInputElement>('input[name="linhagem-element"]:checked')?.value;
                    if (!isLinhagemElement(chosen ?? null)) return;
                    void (async () => {
                        await (actor as FlagActor).setFlag?.(MODULE_ID, ELEMENT_FLAG, chosen);
                        await syncLinhagem(actor);
                        ui.notifications?.info(`Linhagem Dracônica: elemento ${elementLabel(chosen as string)}.`);
                    })();
                },
            },
        },
        default: "confirm",
        close: () => { modalOpen = false; },
    }, { classes: ["t20-dialog", "t20-draconico-dialog"], width: 420 });
    dlg.render(true);
}

// ── Superior: PM temporários ao reduzir inimigo a 0 PV ────────────────────────

/** Dedupe GM-side: 1 concessão por conjuração (messageId), TTL 10 min. */
const superiorGranted = new Map<string, number>();

interface SuperiorKillPayload {
    messageId: string;
    damageType?: string | null;
    targetName?: string;
}

/**
 * Chamado pelo modal de resistência (cliente do alvo) DEPOIS de aplicar dano.
 * Se o alvo ficou com PV ≤ 0, notifica o GM para conceder os PM temporários da
 * Linhagem Dracônica Superior ao conjurador (validação toda no GM).
 */
export function notifySuperiorKillIfDead(
    targetActor: FoundryActor | null,
    info: { messageId: string; damageType?: string | null; damageFormula?: string },
): void {
    try {
        const pv = targetActor?.system?.attributes?.pv;
        if (!targetActor || (pv?.value ?? 1) > 0) return;
        void getSocket()?.executeAsGM("linhagem-draconica/superior-kill", {
            messageId: info.messageId,
            damageType: info.damageType ?? null,
            targetName: targetActor.name,
        } satisfies SuperiorKillPayload);
    } catch (err) {
        warn("Linhagem Superior: falha ao notificar kill:", err);
    }
}

async function onSuperiorKill(payload: SuperiorKillPayload): Promise<void> {
    const now = Date.now();
    for (const [k, ts] of superiorGranted) if (now - ts > 600000) superiorGranted.delete(k);
    if (!payload?.messageId || superiorGranted.has(payload.messageId)) return;

    const msg = game.messages?.get(payload.messageId) as ChatMessage | undefined;
    if (!msg) return;
    const casterId = msg.speaker?.actor;
    const caster = casterId ? game.actors?.get(casterId) : null;
    if (!caster) return;

    const powers = linhagemPowersOf(caster);
    if (!powers.has("superior")) return;
    const element = readLinhagemElement(caster);
    if (!element) return;

    const t20 = msg.flags?.["tormenta20"] as { itemData?: { circulo?: number } } | undefined;
    const circle = superiorTempPmForCircle(t20?.itemData?.circulo ?? 0);
    if (!circle) return;

    // Fallback de fórmula: extrai do próprio roll de dano da mensagem.
    const damageRoll = (msg.rolls ?? []).find((r) => (r.options as { type?: string } | undefined)?.type === "damage");
    if (!damageMatchesElement(element, payload.damageType, damageRoll?.formula ?? null)) return;

    superiorGranted.set(payload.messageId, now);
    const pm = caster.system?.attributes?.pm;
    const curTemp = pm?.temp ?? 0;
    await caster.update({ "system.attributes.pm.temp": curTemp + circle });

    await ChatMessage.create({
        content: `
            <div class="t20-linhagem-kill" style="border-left:3px solid #c8a96e;padding:6px 10px;background:rgba(28,18,9,.55);color:#e8e0d0;">
                <b style="color:#c8a96e;">Linhagem Dracônica Superior</b><br/>
                ${esc(caster.name)} reduziu ${esc(payload.targetName ?? "um inimigo")} a 0 PV com uma magia de
                <b>${esc(elementLabel(element))}</b> — recebe <b>${circle} PM temporário${circle > 1 ? "s" : ""}</b> (círculo da magia).
            </div>`,
        speaker: ChatMessage.getSpeaker({ actor: caster }),
    });
    log(`Linhagem Superior: ${caster.name} +${circle} PM temp (msg ${payload.messageId}).`);
}

// ── Reconcile no ready (caso Lancry: poder já na ficha, AE nunca aplicada) ────

function isFirstActiveOwner(actor: FoundryActor): boolean {
    const myId = game.user?.id;
    if (!myId) return false;
    const OWNER = 3;
    const owners = (game.users?.contents ?? [])
        .filter((u) => u.active && ((u as { isGM?: boolean }).isGM || (actor.ownership?.[u.id] ?? actor.ownership?.["default"] ?? 0) >= OWNER))
        .map((u) => u.id)
        .sort();
    return owners[0] === myId;
}

async function reconcileActor(actor: FoundryActor): Promise<void> {
    const powers = linhagemPowersOf(actor);
    if (!powers.size) return;
    // Toda mutação do reconcile roda num ÚNICO cliente (primeiro owner ativo,
    // GMs contam) — evita corrida GM×player recriando as mesmas AEs no load.
    if (!isFirstActiveOwner(actor)) return;
    const element = readLinhagemElement(actor);
    if (element) {
        // Garante AEs em dia (idempotente; barato o suficiente pra rodar no load).
        const haveOurs = (actor.effects?.contents ?? [])
            .filter((e) => (e.flags?.[MODULE_ID] as { [AE_FLAG]?: boolean } | undefined)?.[AE_FLAG]).length;
        if (haveOurs !== powers.size) await syncLinhagem(actor);
    } else {
        openLinhagemModal(actor);
    }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function isMine(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

export function setupLinhagemDraconica(): void {
    onSocketReady((socket) => {
        socket.register("linhagem-draconica/superior-kill", (payload: unknown) =>
            onSuperiorKill(payload as SuperiorKillPayload));
    });

    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        if (!isMine(userId)) return;
        if (item.parent?.type !== "character") return;
        if (!linhagemKindOfItem(item)) return;
        const actor = item.parent as FoundryActor;
        void (async () => {
            try {
                if (readLinhagemElement(actor)) await syncLinhagem(actor);
                else openLinhagemModal(actor);
            } catch (err) {
                warn("Linhagem Dracônica: falha no createItem:", err);
            }
        })();
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        if (!isMine(userId)) return;
        const actor = item.parent as FoundryActor | null;
        if (!actor || actor.type !== "character") return;
        if (!linhagemKindOfItem(item)) return;
        setTimeout(() => void syncLinhagem(actor), 50);
    });

    Hooks.once("ready", () => {
        ensureStyles();
        void (async () => {
            for (const actor of (game.actors?.contents ?? []) as FoundryActor[]) {
                if (actor.type !== "character") continue;
                try {
                    await reconcileActor(actor);
                } catch (err) {
                    warn(`Linhagem Dracônica: reconcile falhou p/ ${actor.name}:`, err);
                }
            }
        })();
    });
}
