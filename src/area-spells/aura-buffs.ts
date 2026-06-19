/**
 * Aura Sagrada — public buff API: Aura Antimagia (resistance re-roll context)
 * and Aura de Invencibilidade (ignore-first-hit context + usage marker).
 * Extracted from aura-sagrada.ts (Phase 4); re-exported by the main module so
 * the @/area-spells/aura-sagrada import path stays stable for other features.
 */
import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import {
    findTokenForActor, getTokenDisposition, isAuraTarget, isTokenInsideTemplate, escHtml,
} from "@/_shared";
import { warn } from "@/utils/logging";
import {
    FLAG_CASTER, FLAG_CASTER_AID, ANTIMAGIC_AURA_NORMALIZED,
    INVINCIBILITY_AURA_NORMALIZED, FLAG_INVENC_USED_SCENE, getAuraTemplates,
} from "./aura-shared";

// ── API pública: detecção de aprimoramentos pra outros sistemas ──────────────
//
// Outros módulos (ex.: spell-resistance) precisam saber "este ator é elegível
// pra Aura Antimagia agora?" pra renderizar UI condicional. Expomos uma API
// pequena que encapsula a lógica de "ator dentro de uma aura sagrada cujo
// caster tem o aprimoramento X". Mantém spell-resistance sem ler flags
// internos do nosso template.

/** True se o ator tem o item "Aura Antimagia" entre seus poderes. */
export function hasAuraAntimagia(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === ANTIMAGIC_AURA_NORMALIZED);
}

/**
 * Se o ator está dentro de UMA OU MAIS auras sagradas ativas cujo caster tem
 * Aura Antimagia, retorna a lista de casters elegíveis. Vazio se não há.
 * Considera disposition (mesma do caster = aliado), igual ao tick.
 */
export function getAuraAntimagiaContextForActor(actorId: string): Array<{
    casterName: string;
    casterActorId: string;
}> {
    if (!actorId) return [];
    const auras = getAuraTemplates();
    if (auras.length === 0) return [];
    const targetToken = findTokenForActor(actorId);
    if (!targetToken) return [];

    const out: Array<{ casterName: string; casterActorId: string }> = [];
    const seenCasters = new Set<string>();
    for (const tpl of auras) {
        const casterAid = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined;
        const casterTid = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER]     as string | undefined;
        if (!casterAid || !casterTid || seenCasters.has(casterAid)) continue;
        const casterActor = game.actors?.get(casterAid);
        if (!casterActor) continue;
        if (!hasAuraAntimagia(casterActor)) continue;

        const casterToken = findTokenForActor(casterAid);
        const casterDisp  = casterToken ? getTokenDisposition(casterToken) : 0;
        if (!isAuraTarget(targetToken, casterTid, casterDisp)) continue;
        if (!isTokenInsideTemplate(targetToken, tpl)) continue;

        out.push({
            casterName:    (tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? casterActor.name ?? "Paladino",
            casterActorId: casterAid,
        });
        seenCasters.add(casterAid);
    }
    return out;
}

// ── Aura de Invencibilidade ───────────────────────────────────────────────────
//
// Aprimoramento: você e cada aliado dentro da aura ignoram o PRIMEIRO dano que
// sofrerem na cena. Tracking via flag no ator: `auraInvencibilidadeUsedSceneId
// = sceneId`. Quando a cena muda, comparar contra o novo sceneId naturalmente
// invalida — não precisa cleanup explícito.

/** True se o ator (caster) tem o item "Aura de Invencibilidade" nos poderes. */
export function hasAuraInvencibilidade(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === INVINCIBILITY_AURA_NORMALIZED);
}

export function getCurrentSceneId(): string {
    return canvas?.scene?.id ?? "";
}

/**
 * Se o ator está dentro de UMA OU MAIS auras sagradas ativas cujo caster tem
 * Aura de Invencibilidade, retorna a lista de casters elegíveis. Vazio se não
 * há ou se o ator já usou a imunidade nesta cena. Considera disposition.
 *
 * Resolução do token: prefere `canvas.tokens.get(tokenId)` quando disponível
 * (para NPCs unlinked, onde múltiplos tokens compartilham actor.id).
 */
export function getAuraInvencibilidadeContextForActor(
    actorId: string,
    tokenId?: string,
): Array<{ casterName: string; casterActorId: string }> {
    if (!actorId) return [];
    const auras = getAuraTemplates();
    if (auras.length === 0) return [];

    // Resolve token específico (preferindo o passado por id, pra unlinked)
    const targetToken = (tokenId ? canvas?.tokens?.get(tokenId) : null) ?? findTokenForActor(actorId);
    if (!targetToken) return [];

    // Já usou nesta cena?
    const targetActor = targetToken.actor ?? null;
    const sceneId = getCurrentSceneId();
    const usedScene = targetActor?.flags?.[MODULE_ID]?.[FLAG_INVENC_USED_SCENE];
    if (usedScene && usedScene === sceneId) return [];

    const out: Array<{ casterName: string; casterActorId: string }> = [];
    const seenCasters = new Set<string>();
    for (const tpl of auras) {
        const casterAid = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined;
        const casterTid = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER]     as string | undefined;
        if (!casterAid || !casterTid || seenCasters.has(casterAid)) continue;
        const casterActor = game.actors?.get(casterAid);
        if (!casterActor) continue;
        if (!hasAuraInvencibilidade(casterActor)) continue;

        const casterToken = findTokenForActor(casterAid);
        const casterDisp  = casterToken ? getTokenDisposition(casterToken) : 0;
        if (!isAuraTarget(targetToken, casterTid, casterDisp)) continue;
        if (!isTokenInsideTemplate(targetToken, tpl)) continue;

        out.push({
            casterName:    (tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? casterActor.name ?? "Paladino",
            casterActorId: casterAid,
        });
        seenCasters.add(casterAid);
    }
    return out;
}

/**
 * Marca o ator como "já usou Aura de Invencibilidade nesta cena" e posta um
 * chat card descritivo. Aceita tokenId pra resolver o ator SYNTHETIC correto
 * em NPCs unlinked.
 */
export async function markAuraInvencibilidadeUsed(opts: {
    actorId: string;
    tokenId?: string;
    casterName: string;
    targetName: string;
    damageIgnored: number;
}): Promise<void> {
    const { actorId, tokenId, casterName, targetName, damageIgnored } = opts;
    const tok = tokenId ? canvas?.tokens?.get(tokenId) : null;
    const actor = tok?.actor
        ?? game.actors?.get(actorId)
        ?? null;
    if (!actor) return;

    const sceneId = getCurrentSceneId();
    try {
        await (actor as FoundryActor & { setFlag(s: string, k: string, v: unknown): Promise<unknown> })
            .setFlag(MODULE_ID, FLAG_INVENC_USED_SCENE, sceneId);
    } catch (err) {
        warn(`Aura de Invencibilidade: falha ao marcar uso:`, err);
    }

    try {
        await ChatMessage.create({
            content: `
                <div class="tormenta20 chat-card item-card" style="border-color:var(--t20-accent);">
                    <header class="card-header flexrow">
                        <h3 class="item-name"><div>Aura de Invencibilidade — ${escHtml(casterName)}</div></h3>
                    </header>
                    <div class="card-content" style="padding:6px 10px;color:var(--t20-text-primary);">
                        <p style="margin:0;">
                            <b>${escHtml(targetName)}</b> ignora <b>${damageIgnored}</b> de dano
                            (primeira vez nesta cena).
                        </p>
                    </div>
                </div>`,
            speaker: { alias: casterName },
        });
    } catch { /* ignore */ }
}
