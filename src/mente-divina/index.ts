/**
 * Mente Divina — Divina 2 (Adivinhação), duração cena.
 *
 * "O alvo recebe +2 em Inteligência, Sabedoria ou Carisma, a sua escolha."
 * A escolha é do ALVO: ao lançar a magia, cada alvo recebe um pop-up (no
 * cliente do dono do ator; NPCs → GM) para escolher o atributo. A AE é
 * aplicada localmente por quem escolheu (tem permissão sobre o próprio ator).
 *
 * Aprimoramentos (detectados em flags.tormenta20.onUseEffects):
 *  - +3 PM "alcance curto / criaturas escolhidas" → já coberto (usamos todos
 *    os alvos selecionados no cast).
 *  - +3 PM "+2 nos três atributos mentais"  → aplica DIRETO (sem pop-up).
 *  - +7 PM "+4 no atributo escolhido"       → pop-up com +4.
 *  - +12 PM "+4 nos três atributos mentais" → aplica DIRETO com +4.
 *
 * Obs.: o aumento é o bônus temporário simples (system.atributos.X.bonus,
 * durationScene) — espelha a AE nativa do item do T20.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { extractSpellName, normalizeCondName, getTargetUserId } from "@/spell-resistance/index";
import { getSocket, onSocketReady } from "@/socket";

const SPELL_NAME = "mente divina";
const SOCKET_CHOOSE = "mente-divina/apply";
const AE_FLAG = "menteDivina";

export const MENTAL_ATTRS = [
    { key: "int", label: "Inteligência" },
    { key: "sab", label: "Sabedoria" },
    { key: "car", label: "Carisma" },
] as const;

// ── Parse dos aprimoramentos (puro, testável) ──────────────────────────────────

export interface MenteDivinaMode {
    /** true = bônus nos três atributos mentais (aplica direto, sem pop-up). */
    allThree: boolean;
    /** Valor do bônus: 2 (base) ou 4 (aprimoramentos de +4). */
    bonus: 2 | 4;
}

export function parseMenteDivinaMode(onUseEffects: unknown): MenteDivinaMode {
    const entries = Array.isArray(onUseEffects) ? onUseEffects : [];
    let allThree = false;
    let bonus: 2 | 4 = 2;
    for (const e of entries) {
        const d = String((e as { description?: unknown }).description ?? "");
        const qty = Number((e as { qty?: unknown }).qty ?? 0);
        if (qty < 1) continue;
        if (/\+4\s+nos\s+tr[êe]s\s+atributos/i.test(d)) { allThree = true; bonus = 4; }
        else if (/\+2\s+nos\s+tr[êe]s\s+atributos/i.test(d)) { allThree = true; }
        else if (/\+4\s+no\s+atributo\s+escolhido/i.test(d)) { bonus = 4; }
    }
    return { allThree, bonus };
}

// ── AE ────────────────────────────────────────────────────────────────────────

function buildMenteDivinaAE(attrs: readonly string[], bonus: number, casterName: string): Record<string, unknown> {
    const labels = attrs.map((k) => MENTAL_ATTRS.find((a) => a.key === k)?.label ?? k).join(", ");
    return {
        name: `Mente Divina (+${bonus} ${labels})`,
        icon: "systems/tormenta20/icons/magia/mente-divina.webp",
        transfer: false,
        disabled: false,
        changes: attrs.map((k) => ({
            key: `system.atributos.${k}.bonus`, value: String(bonus), mode: 2, priority: 20,
        })),
        flags: {
            [MODULE_ID]: { [AE_FLAG]: true, casterName },
            tormenta20: { durationScene: true },
        },
    };
}

// ── Aplicação (roda no cliente do dono do alvo) ────────────────────────────────

interface ApplyRequest {
    targetActorUuid: string;
    targetName: string;
    casterName: string;
    bonus: 2 | 4;
    /** true = três atributos, aplica direto sem pop-up. */
    allThree: boolean;
}

function resolveTarget(uuid: string): FoundryActor | null {
    const doc = fromUuidSync(uuid) as unknown;
    if (!doc) return null;
    // uuid pode apontar pro TokenDocument ou pro Actor — normaliza.
    const maybe = doc as { actor?: FoundryActor | null; documentName?: string };
    return (maybe.actor ?? (doc as FoundryActor)) || null;
}

async function removePreviousMenteDivina(actor: FoundryActor): Promise<void> {
    const old = (actor.effects?.contents ?? [])
        .filter((e) => (e.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[AE_FLAG])
        .map((e) => e.id)
        .filter((id): id is string => Boolean(id));
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old, { render: false });
}

async function applyToActor(actor: FoundryActor, attrs: readonly string[], req: ApplyRequest): Promise<void> {
    await removePreviousMenteDivina(actor); // recast substitui (não acumula)
    await actor.createEmbeddedDocuments("ActiveEffect", [buildMenteDivinaAE(attrs, req.bonus, req.casterName)], { render: false });
    const labels = attrs.map((k) => MENTAL_ATTRS.find((a) => a.key === k)?.label ?? k).join(", ");
    ui.notifications?.info(`Mente Divina: +${req.bonus} em ${labels} (${actor.name}).`);
    log(`Mente Divina aplicada em ${actor.name}: +${req.bonus} [${attrs.join(",")}].`);
}

function handleApplyRequest(req: ApplyRequest): void {
    const actor = resolveTarget(req.targetActorUuid);
    if (!actor) { warn(`Mente Divina: alvo ${req.targetActorUuid} não resolvido.`); return; }

    if (req.allThree) {
        void applyToActor(actor, MENTAL_ATTRS.map((a) => a.key), req);
        return;
    }

    const radios = MENTAL_ATTRS.map((a, i) => `
        <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid rgba(200,169,110,0.35);border-radius:6px;background:rgba(28,18,9,0.5);cursor:pointer;">
            <input type="radio" name="md-attr" value="${a.key}" ${i === 0 ? "checked" : ""} style="accent-color:#c8a96e;"/>
            <span style="font-weight:600;">${a.label} <span style="color:#6ecf7a;">+${req.bonus}</span></span>
        </label>`).join("");

    new Dialog({
        title: `Mente Divina — ${req.targetName}`,
        content: `
            <div style="display:flex;flex-direction:column;gap:8px;padding:4px 2px;color:#e8e0d0;">
                <div><b>${req.casterName}</b> fortaleceu sua mente! Escolha o atributo que recebe <b>+${req.bonus}</b> (duração: cena):</div>
                ${radios}
            </div>`,
        buttons: {
            ok: {
                icon: '<i class="fas fa-brain"></i>',
                label: "Receber bônus",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const k = root.querySelector<HTMLInputElement>('input[name="md-attr"]:checked')?.value ?? "int";
                    void applyToActor(actor, [k], req);
                },
            },
        },
        default: "ok",
    }, { classes: ["t20-dialog"], width: 400 }).render(true);
}

// ── Cast detection (cliente do conjurador) ─────────────────────────────────────

function messageAuthorId(message: ChatMessage): string | undefined {
    return (message as { author?: { id?: string }; user?: string | { id?: string } }).author?.id
        ?? (typeof message.user === "string" ? message.user : message.user?.id);
}

function onMenteDivinaCast(message: ChatMessage): void {
    const onUse = (message.flags?.["tormenta20"] as { onUseEffects?: unknown } | undefined)?.onUseEffects;
    const mode = parseMenteDivinaMode(onUse);
    const casterName = message.speaker?.alias ?? "Conjurador";

    const targets = Array.from(game.user?.targets ?? []) as FoundryToken[];
    if (!targets.length) {
        ui.notifications?.warn("Mente Divina: selecione o(s) alvo(s) (target) antes de lançar.");
        return;
    }

    for (const token of targets) {
        const actor = token.actor;
        if (!actor) continue;
        const targetUserId = getTargetUserId(actor);
        if (!targetUserId) {
            ui.notifications?.warn(`Mente Divina: nenhum usuário ativo para ${actor.name}.`);
            continue;
        }
        const req: ApplyRequest = {
            targetActorUuid: actor.uuid,
            targetName: actor.name,
            casterName,
            bonus: mode.bonus,
            allThree: mode.allThree,
        };
        if (targetUserId === game.user?.id) handleApplyRequest(req);
        else void getSocket()?.executeAsUser(SOCKET_CHOOSE, targetUserId, req);
    }
    log(`Mente Divina: ${targets.length} alvo(s), bonus +${mode.bonus}, allThree=${mode.allThree}.`);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupMenteDivina(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_CHOOSE, (req: unknown) => handleApplyRequest(req as ApplyRequest));
    });

    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        if (messageAuthorId(message) !== game.user?.id) return;
        if (!message.getFlag?.("tormenta20", "itemData")) return;
        if (normalizeCondName(extractSpellName(message)) !== SPELL_NAME) return;
        onMenteDivinaCast(message);
    });

    log("Mente Divina (escolha de atributo pelo alvo) instalada.");
}
