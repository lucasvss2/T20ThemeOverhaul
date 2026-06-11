/**
 * Velocidade — magia sustentada (Arcana 2, Transmutação).
 *
 * "Duração: sustentada" — o conjurador paga 1 PM no início de CADA turno seu
 * para manter a magia ativa. O custo inicial de lançamento NÃO muda (o T20
 * nativo já debita via automaticManaSpend). Este módulo automatiza apenas o
 * SUSTAIN:
 *  - detecta o cast (createChatMessage) e marca o conjurador com uma flag;
 *  - a cada início de turno do conjurador em combate (combatTurnChange),
 *    debita 1 PM (com origin para o sheet-log); sem PM → cancela sozinha
 *    (chat card vermelho + aviso);
 *  - botão no skills-menu permite ao conjurador (ou GM) cancelar a sustentação
 *    a qualquer momento.
 *
 * Aprimoramento "+0 PM: muda a duração para cena" → NÃO há sustain (detectado
 * via flags.tormenta20.onUseEffects no cast).
 *
 * A flag persiste no ator (sobrevive a reload); fora de combate não há turnos,
 * logo não há débito — cancela manualmente quando a magia acabar.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { extractSpellName, normalizeCondName } from "@/spell-resistance/index";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { getSocket, onSocketReady } from "@/socket";

const SPELL_NAME = "velocidade";
const SUSTAIN_FLAG = "velocidadeSustain";
const SUSTAIN_COST = 1;
const SOCKET_REMOVE_BUFFS = "velocidade/remove-buffs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter((u) => u.isGM && u.active)
        .map((u) => u.id)
        .sort();
    return activeGMs[0] === myId;
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hasSustain(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    return Boolean((actor.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[SUSTAIN_FLAG]);
}

function currentPm(actor: FoundryActor): number {
    return Number((actor.system?.attributes as { pm?: { value?: number } } | undefined)?.pm?.value ?? 0);
}

/** Detecta o aprimoramento "+0 PM: muda a duração para cena" no cast. */
export function hasCenaImprovement(onUseEffects: unknown): boolean {
    if (!Array.isArray(onUseEffects)) return false;
    return onUseEffects.some((e) => {
        const entry = e as { description?: unknown; qty?: unknown };
        const desc = String(entry.description ?? "");
        const qty = Number(entry.qty ?? 0);
        return qty >= 1 && /dura[cç][aã]o\s+para\s+cena/i.test(desc);
    });
}

// ── Cast detection ────────────────────────────────────────────────────────────

function resolveCaster(message: ChatMessage): FoundryActor | null {
    const spk = message.speaker as { token?: string; actor?: string } | undefined;
    type Lyr = { get(id: string): { actor: FoundryActor | null } | undefined };
    const tokenLyr = (canvas as unknown as { tokens?: Lyr }).tokens;
    return (spk?.token ? tokenLyr?.get(spk.token)?.actor ?? null : null)
        ?? (spk?.actor ? game.actors?.get(spk.actor) ?? null : null);
}

function messageAuthorId(message: ChatMessage): string | undefined {
    return (message as { author?: { id?: string }; user?: string | { id?: string } }).author?.id
        ?? (typeof message.user === "string" ? message.user : message.user?.id);
}

async function onVelocidadeCast(message: ChatMessage, actor: FoundryActor): Promise<void> {
    const onUse = (message.flags?.["tormenta20"] as { onUseEffects?: unknown } | undefined)?.onUseEffects;
    if (hasCenaImprovement(onUse)) {
        log("Velocidade: aprimoramento 'duração cena' — sem sustain.");
        return;
    }
    // Guarda os ALVOS do cast (uuids) — ao cancelar a sustentação, o buff
    // "Velocidade" é removido automaticamente deles.
    const targetUuids = (Array.from(game.user?.targets ?? []) as FoundryToken[])
        .map((t) => t.actor?.uuid)
        .filter((u): u is string => Boolean(u));
    await actor.update(
        { [`flags.${MODULE_ID}.${SUSTAIN_FLAG}`]: { since: game.time?.worldTime ?? 0, targets: targetUuids } },
        { render: false },
    );
    ui.notifications?.info(`Velocidade sustentada: ${actor.name} pagará ${SUSTAIN_COST} PM por turno (cancele pelo menu de skills).`);
    refreshSkillsMenu();
    log(`Velocidade: sustain registrado em ${actor.name} (${targetUuids.length} alvo(s)).`);
}

// ── Sustain / cancel ──────────────────────────────────────────────────────────

/**
 * Remove a AE "Velocidade" dos atores (uuids). Roda no cliente com permissão:
 * GM direto; player → roteado via executeAsGM.
 */
async function removeVelocidadeBuffs(uuids: string[]): Promise<void> {
    for (const uuid of uuids) {
        try {
            const doc = fromUuidSync(uuid) as unknown;
            const actor = ((doc as { actor?: FoundryActor | null })?.actor ?? (doc as FoundryActor)) || null;
            if (!actor?.effects) continue;
            const ids = (actor.effects.contents ?? [])
                .filter((e) => normalizeCondName(e.name ?? "") === SPELL_NAME)
                .map((e) => e.id)
                .filter((id): id is string => Boolean(id));
            if (ids.length) {
                await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
                log(`Velocidade: buff removido de ${actor.name}.`);
            }
        } catch (e) {
            warn(`Velocidade: falha ao remover buff de ${uuid}:`, e);
        }
    }
}

async function cancelSustain(actor: FoundryActor, reason: "manual" | "sem-pm"): Promise<void> {
    // Alvos salvos no cast → remove o buff "Velocidade" deles automaticamente.
    const flag = (actor.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[SUSTAIN_FLAG] as
        | { targets?: string[] } | undefined;
    const targets = Array.isArray(flag?.targets) ? flag.targets : [];

    await actor.update({ [`flags.${MODULE_ID}.-=${SUSTAIN_FLAG}`]: null }, { render: false });

    if (targets.length) {
        if (game.user?.isGM) await removeVelocidadeBuffs(targets);
        else await getSocket()?.executeAsGM(SOCKET_REMOVE_BUFFS, targets);
    }

    const title = reason === "sem-pm" ? "Velocidade cancelada — sem PM" : "Velocidade encerrada";
    const color = reason === "sem-pm" ? "#cc4444" : "#c8a96e";
    await ChatMessage.create({
        speaker: { alias: actor.name },
        content:
            `<div style="border-left:3px solid ${color};padding:6px 10px;">` +
            `<div style="color:${color};font-weight:700;letter-spacing:0.06em;">⏱️ ${esc(title)}</div>` +
            `<div style="color:#9a8e7a;font-size:0.85em;">${esc(actor.name)} parou de sustentar a magia` +
            `${targets.length ? " — buff removido do(s) alvo(s)" : ""}.</div>` +
            `</div>`,
    });
    refreshSkillsMenu();
    log(`Velocidade: sustain cancelado (${reason}) em ${actor.name}.`);
}

async function paySustain(actor: FoundryActor): Promise<void> {
    const pm = currentPm(actor);
    if (pm < SUSTAIN_COST) {
        ui.notifications?.warn(`Velocidade: ${actor.name} sem PM para sustentar — magia cancelada.`);
        await cancelSustain(actor, "sem-pm");
        return;
    }
    await actor.update(
        { "system.attributes.pm.value": pm - SUSTAIN_COST },
        { [MODULE_ID]: { origin: { kind: "pm-cost", source: "Sustentar Velocidade" } } },
    );
    log(`Velocidade: ${actor.name} pagou ${SUSTAIN_COST} PM de sustain (${pm} → ${pm - SUSTAIN_COST}).`);
}

// ── Skills-menu ───────────────────────────────────────────────────────────────

/** Atores com sustain ativo que o usuário atual pode controlar (GM vê todos). */
function controllableSustainers(): FoundryActor[] {
    const all = (game.actors?.contents ?? []).filter((a) => hasSustain(a));
    if (game.user?.isGM) return all;
    const myId = game.user?.id ?? "";
    return all.filter((a) => (a.ownership?.[myId] ?? 0) >= 3);
}

function openCancelDialog(): void {
    const targets = controllableSustainers();
    if (!targets.length) return;
    if (targets.length === 1) {
        const a = targets[0];
        new Dialog({
            title: "Cancelar Velocidade",
            content: `<p>Parar de sustentar <b>${esc(a.name)}</b>? (deixa de custar 1 PM/turno)</p>`,
            buttons: {
                yes: { icon: '<i class="fas fa-check"></i>', label: "Cancelar magia", callback: () => void cancelSustain(a, "manual") },
                no: { icon: '<i class="fas fa-times"></i>', label: "Manter" },
            },
            default: "no",
        }, { classes: ["bg3-dialog"], width: 380 }).render(true);
        return;
    }
    const rows = targets.map((a) =>
        `<label style="display:flex;gap:8px;align-items:center;padding:4px 0;">` +
        `<input type="checkbox" name="vel-cancel" value="${esc(a.id)}" checked/> ${esc(a.name)}</label>`).join("");
    new Dialog({
        title: "Cancelar Velocidade",
        content: `<div><p>Escolha quem para de sustentar:</p>${rows}</div>`,
        buttons: {
            yes: {
                icon: '<i class="fas fa-check"></i>', label: "Cancelar selecionadas",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    root.querySelectorAll<HTMLInputElement>('input[name="vel-cancel"]:checked').forEach((cb) => {
                        const a = game.actors?.get(cb.value);
                        if (a) void cancelSustain(a, "manual");
                    });
                },
            },
            no: { icon: '<i class="fas fa-times"></i>', label: "Voltar" },
        },
        default: "no",
    }, { classes: ["bg3-dialog"], width: 400 }).render(true);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupVelocidade(): void {
    // Remoção de buffs roteada pro GM (players não têm permissão em atores alheios).
    onSocketReady((socket) => {
        socket.register(SOCKET_REMOVE_BUFFS, (uuids: unknown) => {
            if (Array.isArray(uuids)) void removeVelocidadeBuffs(uuids as string[]);
        });
    });

    // Cast: só o autor da mensagem registra (evita duplicação multi-cliente).
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        if (messageAuthorId(message) !== game.user?.id) return;
        const itemData = message.getFlag?.("tormenta20", "itemData") as { duracao?: unknown } | undefined;
        if (!itemData) return;
        const name = normalizeCondName(extractSpellName(message));
        if (name !== SPELL_NAME) return;
        const actor = resolveCaster(message);
        if (!actor) return;
        void onVelocidadeCast(message, actor);
    });

    // Sustain: início do turno do conjurador (apenas o GM ativo processa).
    type CombatLike = { combatant?: { actor?: FoundryActor | null } | null };
    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const combat = args[0] as CombatLike | undefined;
        const actor = combat?.combatant?.actor ?? null;
        if (!actor || !hasSustain(actor)) return;
        void paySustain(actor);
    });

    // Botão de cancelar no skills-menu.
    registerSkillAction({
        id: "velocidade-cancel",
        label: "Cancelar Velocidade",
        icon: "fa-person-running",
        color: "#7ec8ff",
        isVisible: () => controllableSustainers().length > 0,
        onClick: () => openCancelDialog(),
    });

    Hooks.once("ready", () => refreshSkillsMenu());
    log("Velocidade (sustain automático) instalada.");
}
