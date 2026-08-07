/**
 * Essência de Mana — consumível alquímico que "recupera 1d4 pontos de mana".
 *
 * Nativamente o item (`consumivel`, `system.rolls` = 1d4 tipo dano) NÃO
 * recupera PM ao ser usado — só posta um card vazio. Automatizamos: ao usar
 * o item (createChatMessage do card), rolamos 1d4, devolvemos esse PM ao ator
 * (respeitando o máximo) e consumimos 1 dose (`system.qtd -= 1`; some quando
 * chega a 0). Detecção por NOME (funciona em instalação limpa — o item vem do
 * conteúdo do usuário, nós só damos comportamento).
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { norm } from "@/inspiracao/format";

const ESSENCIA_NAME = "essencia de mana";
const RECOVER_FORMULA = "1d4";

// Debounce — o T20 pode postar mais de uma mensagem por uso.
const _recent = new Map<string, number>();
function debounced(key: string, ms = 1500): boolean {
    const now = Date.now();
    const last = _recent.get(key) ?? 0;
    if (now - last < ms) return true;
    _recent.set(key, now);
    return false;
}

interface ItemLike {
    id?: string;
    name?: string;
    type?: string;
    system?: { qtd?: number };
    update?: (data: Record<string, unknown>) => Promise<unknown>;
    delete?: () => Promise<unknown>;
}
interface ActorLike {
    id?: string;
    name?: string;
    items?: { get?: (id: string) => ItemLike | undefined; contents: ItemLike[] };
    system?: { attributes?: { pm?: { value?: number; max?: number } } };
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}

/** É a Essência de Mana? (consumível cujo nome normalizado casa) */
export function isEssenciaDeMana(item: { type?: string; name?: string } | null | undefined): boolean {
    return !!item && item.type === "consumivel" && norm(item.name).includes(ESSENCIA_NAME);
}

/** PM recuperado, respeitando o máximo. Puro/testável. */
export function computeRecoveredPm(current: number, max: number, rolled: number): number {
    const cur = Number(current) || 0;
    const mx = Number(max) || 0;
    return Math.max(0, Math.min(mx, cur + Math.max(0, rolled)) - cur);
}

function extractItemId(content: string): string | null {
    return (content ?? "").match(/data-item-id="([^"]+)"/)?.[1] ?? null;
}

async function onEssenciaUse(message: MessageLike): Promise<void> {
    const actor = game.actors?.get(message.speaker?.actor ?? "") as ActorLike | undefined;
    if (!actor) return;
    const itemId = extractItemId(message.content ?? "");
    // Só age se a mensagem é do PRÓPRIO item Essência de Mana. NÃO usar fallback
    // por nome — o card de outra habilidade (ex.: uma magia) também tem
    // data-item-id e dispararia a essência erroneamente.
    const resolved = itemId ? actor.items?.get?.(itemId) : undefined;
    if (!resolved || !isEssenciaDeMana(resolved)) return;
    if (debounced(`${actor.id}:${resolved.id}`)) return;

    try {
        const roll = new Roll(RECOVER_FORMULA);
        await roll.evaluate();
        const rolled = roll.total ?? 0;
        const pm = actor.system?.attributes?.pm;
        const cur = Number(pm?.value) || 0;
        const max = Number(pm?.max) || 0;
        const gained = computeRecoveredPm(cur, max, rolled);

        if (gained > 0) await actor.update?.({ "system.attributes.pm.value": cur + gained });
        // O consumo de 1 dose (system.qtd) é feito pelo próprio T20 ao usar o
        // consumível via o dialog — NÃO decrementamos aqui (dobraria o gasto).

        await (ChatMessage as unknown as { create: (d: Record<string, unknown>) => Promise<unknown> }).create({
            content:
                `<div class="t20-essencia-mana" style="border:1px solid #6aa0c8;border-radius:4px;padding:6px 8px;background:rgba(20,30,45,.35);">` +
                `<div style="font-weight:bold;color:#6aa0c8;"><i class="fas fa-flask"></i> Essência de Mana — ${esc(actor.name ?? "")}</div>` +
                `<div style="font-size:12px;color:#cfe0f0;">Recuperou <b>${gained}</b> PM (rolagem ${RECOVER_FORMULA}: ${rolled}). ` +
                `PM: ${cur + gained}/${max}.` +
                (gained < rolled ? ` <span style="color:#9a8e7a;">(limitado pelo máximo)</span>` : "") +
                `</div></div>`,
            speaker: { alias: actor.name ?? "" } as never,
            rolls: [roll] as never,
        });
        log(`Essência de Mana: ${actor.name} recuperou ${gained} PM (${RECOVER_FORMULA}=${rolled}).`);

        // O item nativo (`system.rolls`: 1d4 "curapm") já posta SUA PRÓPRIA
        // mensagem com um d4 (sem efeito — não é lida em lugar nenhum) ao ser
        // usado. Isso duplicava o dado no chat, confundindo qual rolagem vale.
        // Deleta a mensagem nativa (a que disparou este hook) — só a rolagem
        // do módulo (a que de fato restaurou PM) fica visível. `deleteChatMessage`
        // não re-dispara este hook (que só escuta `createChatMessage`).
        try { await message.delete?.(); } catch (err) { warn("essencia-mana: falha ao remover a mensagem nativa duplicada:", err); }
    } catch (err) {
        warn("essencia-mana: falha ao recuperar PM:", err);
    }
}

interface MessageLike {
    id?: string;
    content?: string;
    speaker?: { actor?: string };
    author?: { id?: string };
    user?: { id?: string } | string;
    getFlag?: (scope: string, key: string) => unknown;
    delete?: () => Promise<unknown>;
}

function esc(s: string): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function setupEssenciaMana(): void {
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        try {
            const message = args[0] as MessageLike;
            // marca nossa própria mensagem para não reprocessar
            const authorId = (message.author?.id)
                ?? (typeof message.user === "object" ? message.user?.id : message.user);
            if (authorId !== game.user?.id) return;
            const content = message.content ?? "";
            if (!/data-item-id=/.test(content)) return;
            if (content.includes("t20-essencia-mana")) return;
            void onEssenciaUse(message);
        } catch (err) { warn("essencia-mana: hook falhou:", err); }
    });
    log("Essência de Mana configurada (recupera 1d4 PM ao usar).");
    void MODULE_ID;
}
