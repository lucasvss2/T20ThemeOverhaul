/**
 * Coragem Líquida (poder Bucaneiro) — automação.
 *
 * "No início do seu turno, em cenas envolvendo qualquer risco ou perigo, role
 *  1d4. Em um resultado 1, você precisa gastar uma ação de movimento para tomar
 *  um gole de bebida. Se você não tiver, fica pasmo pela rodada (mesmo se for
 *  imune). Hic!"
 *
 * Fluxo: no início do turno do portador em combate (`combatTurnChange`, GM
 * eleito), rola 1d4. Resultado ≠1 → silêncio (sem spam). Resultado 1 → posta
 * card com o roll e abre um popup no cliente do DONO (socket `executeAsUser`)
 * listando os consumíveis do personagem:
 *  - "Beber" → decrementa 1 da quantidade do item escolhido + card ("gasta uma
 *    ação de movimento" é informativo — economia de ações não é rastreada).
 *  - "Sem bebida" / fechar → Pasmo por 1 rodada (via duration-manager) —
 *    aplicado incondicionalmente ("mesmo se for imune").
 */

import { norm } from "@/inspiracao/format";
import { getSocket, onSocketReady } from "@/socket";
import { isActiveGM, escHtml } from "@/_shared";
import { registerExpectedCondition } from "@/duration-manager/index";
import { getTargetUserId } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

const POWER_NAME = "coragem liquida";
const SOCKET_PROMPT = "coragem-liquida/prompt";

// ── Detecção / helpers puros ──────────────────────────────────────────────────

export function hasCoragemLiquida(actor: FoundryActor | null | undefined): boolean {
    return !!actor && (actor.items?.contents ?? []).some(
        (i) => i.type === "poder" && norm(i.name).includes(POWER_NAME));
}

export interface DrinkOption {
    id: string;
    name: string;
    img?: string;
    qtd: number;
}

/** Consumíveis com pelo menos 1 dose — candidatos a "bebida" (o jogador escolhe). */
export function listConsumables(items: Array<{ id?: string | null; type?: string; name?: string; img?: string; system?: Record<string, unknown> }>): DrinkOption[] {
    const out: DrinkOption[] = [];
    for (const it of items) {
        if (it.type !== "consumivel" || !it.id) continue;
        const qtd = Number((it.system as { qtd?: unknown } | undefined)?.qtd ?? 0);
        if (!Number.isFinite(qtd) || qtd < 1) continue;
        out.push({ id: it.id, name: it.name ?? "?", img: it.img, qtd });
    }
    return out;
}

// ── Aplicação ─────────────────────────────────────────────────────────────────

interface PromptPayload {
    actorUuid: string;
    actorId: string;
    actorName: string;
}

function resolvePromptActor(p: PromptPayload): FoundryActor | null {
    const byUuid = p.actorUuid ? (fromUuidSync(p.actorUuid) as FoundryActor | null) : null;
    return byUuid ?? game.actors?.get(p.actorId) ?? null;
}

async function applyPasmo(actor: FoundryActor): Promise<void> {
    registerExpectedCondition(actor.id ?? "", "pasmo", {
        managed: true,
        kind: "rounds",
        rounds: 1,
        source: "power",
        label: "Pasmo",
    } as never);
    await actor.toggleStatusEffect?.("pasmo", { active: true });
    await ChatMessage.create({
        content: `
            <div style="border-left:3px solid #cc4444;padding:6px 10px;background:rgba(28,18,9,.55);color:#e8e0d0;">
                <b style="color:#cc4444;">Coragem Líquida</b><br/>
                ${escHtml(actor.name)} não tem bebida à mão — fica <b>Pasmo</b> por 1 rodada. Hic!
            </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
    });
}

async function drink(actor: FoundryActor, itemId: string): Promise<void> {
    const item = actor.items?.get(itemId);
    if (!item) return;
    const qtd = Number((item.system as { qtd?: unknown } | undefined)?.qtd ?? 0);
    await (item as unknown as { update(d: Record<string, unknown>): Promise<unknown> })
        .update({ "system.qtd": Math.max(0, qtd - 1) });
    await ChatMessage.create({
        content: `
            <div style="border-left:3px solid #c8a96e;padding:6px 10px;background:rgba(28,18,9,.55);color:#e8e0d0;">
                <b style="color:#c8a96e;">Coragem Líquida</b><br/>
                ${escHtml(actor.name)} gasta uma ação de movimento para tomar um gole de
                <b>${escHtml(item.name)}</b> (${Math.max(0, qtd - 1)} restante${qtd - 1 === 1 ? "" : "s"}). Hic!
            </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
    });
}

// ── Popup no cliente do dono ──────────────────────────────────────────────────

function openDrinkPrompt(payload: PromptPayload): void {
    const actor = resolvePromptActor(payload);
    if (!actor) return;
    const drinks = listConsumables((actor.items?.contents ?? []) as never);
    if (!drinks.length) {
        void applyPasmo(actor);
        ui.notifications?.warn(`${actor.name} não tem consumíveis — Pasmo por 1 rodada (Coragem Líquida).`);
        return;
    }

    let resolved = false;
    const rows = drinks.map((d, i) => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid rgba(200,169,110,.35);border-radius:6px;background:rgba(28,18,9,.5);cursor:pointer;">
            <input type="radio" name="cl-drink" value="${escHtml(d.id)}" ${i === 0 ? "checked" : ""} style="accent-color:#c8a96e;"/>
            <img src="${escHtml(d.img ?? "")}" style="width:24px;height:24px;border:none;flex:0 0 auto;"/>
            <span style="flex:1;">${escHtml(d.name)}</span>
            <span style="opacity:.7;">×${d.qtd}</span>
        </label>`).join("");

    const content = `
        <div style="display:flex;flex-direction:column;gap:10px;color:#e8e0d0;padding:4px 2px;">
            <div>Rolou <b>1</b> no d4 da <b>Coragem Líquida</b> — você precisa gastar uma
            <b>ação de movimento</b> para tomar um gole de bebida, ou fica <b>Pasmo</b> pela rodada.</div>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:40vh;overflow-y:auto;">${rows}</div>
        </div>`;

    const dlg = new Dialog({
        title: `Coragem Líquida — ${payload.actorName}`,
        content,
        buttons: {
            beber: {
                icon: '<i class="fas fa-wine-bottle"></i>',
                label: "Beber (ação de movimento)",
                callback: ($html: JQuery) => {
                    resolved = true;
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const id = root.querySelector<HTMLInputElement>('input[name="cl-drink"]:checked')?.value;
                    if (id) void drink(actor, id);
                    else void applyPasmo(actor);
                },
            },
            pasmo: {
                icon: '<i class="fas fa-dizzy"></i>',
                label: "Sem bebida — ficar Pasmo",
                callback: () => {
                    resolved = true;
                    void applyPasmo(actor);
                },
            },
        },
        default: "beber",
        close: () => {
            // Fechar sem escolher = não bebeu → Pasmo.
            if (!resolved) void applyPasmo(actor);
        },
    }, { classes: ["t20-dialog"], width: 420 });
    dlg.render(true);
}

// ── Tick de turno (GM eleito) ─────────────────────────────────────────────────

async function onTurnStart(actor: FoundryActor): Promise<void> {
    const roll = new Roll("1d4");
    await roll.evaluate();
    if ((roll.total ?? 0) !== 1) return;

    await ChatMessage.create({
        content: `
            <div style="border-left:3px solid #c8a96e;padding:6px 10px;background:rgba(28,18,9,.55);color:#e8e0d0;">
                <b style="color:#c8a96e;">Coragem Líquida</b> — 1d4 = <b>1</b><br/>
                ${escHtml(actor.name)} sente a garganta seca…
            </div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
        rolls: [roll] as never,
    } as never);

    const payload: PromptPayload = {
        actorUuid: actor.uuid ?? "",
        actorId: actor.id ?? "",
        actorName: actor.name,
    };
    const targetUserId = getTargetUserId(actor);
    if (!targetUserId || targetUserId === game.user?.id) openDrinkPrompt(payload);
    else void getSocket()?.executeAsUser(SOCKET_PROMPT, targetUserId, payload);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupCoragemLiquida(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_PROMPT, (payload: unknown) => openDrinkPrompt(payload as PromptPayload));
    });

    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const combat = args[0] as { combatant?: { tokenId?: string; actor?: FoundryActor | null } | null };
        const c = combat?.combatant;
        if (!c) return;
        // Unlinked-safe: prefere o synthetic actor do token.
        const tok = c.tokenId
            ? (canvas as unknown as { tokens?: { get(id: string): { actor?: FoundryActor | null } | undefined } }).tokens?.get(c.tokenId)
            : null;
        const actor = tok?.actor ?? c.actor ?? null;
        if (!actor || !hasCoragemLiquida(actor)) return;
        onTurnStart(actor).catch((err) => warn("Coragem Líquida: tick falhou:", err));
    });

    log("Coragem Líquida ativa (1d4 no início do turno em combate).");
}
