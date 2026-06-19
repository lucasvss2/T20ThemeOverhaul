/**
 * Aura Sagrada (Paladino, T20) — Fase 1
 *
 * Diferenças cruciais em relação ao Consagrar:
 *  - A "área" é uma aura emitida pelo TOKEN do paladino, não um
 *    MeasuredTemplate fixo no canvas. Quando o caster se move, a aura
 *    o acompanha — re-sincronizando todos os tokens da cena.
 *  - Não há grid clicável: criamos um MeasuredTemplate "ghost" (visual-only)
 *    centrado no token do caster, atualizado a cada `updateToken` do caster.
 *  - Aliado vs inimigo importa: o AE só vai pro caster e tokens com a MESMA
 *    `disposition` do token-caster (FRIENDLY-FRIENDLY etc.). Hostis nunca
 *    recebem o bônus.
 *  - Aprimoramento "Aura Poderosa" não vem em `onUseEffects` (Aura Sagrada é
 *    `type: "poder"`, não magia). Detectamos pela PRESENÇA de um item chamado
 *    "Aura Poderosa" entre os poderes do caster → raio 30 m em vez de 9 m.
 *  - Duração sustentada: não auto-cancela. O paladino cancela manualmente
 *    pelo mesmo botão flutuante do Consagrar (que ranqueia múltiplas áreas).
 *
 * Aprimoramentos das fases seguintes (não nesta fase):
 *  - Aura Antimagia (re-roll de resistência contra magia)
 *  - Aura Ardente (dano por turno a mortos-vivos/espíritos escolhidos)
 *  - Aura de Cura (cura por turno em aliados escolhidos)
 *  - Aura de Invencibilidade (ignora 1º dano da cena)
 *  - Aura Poderosa (já implementada nesta fase — só altera o raio)
 */

import { MODULE_ID } from "@/constants";
import { extractSpellName, normalizeCondName, getMsgAuthorId } from "@/spell-resistance/index";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import {
    isActiveGM, escHtml, extractBaseEffectData,
    getTokenCenterPx, isTokenInsideTemplate, findTokenForActor,
    getTokenDisposition, isAuraTarget,
} from "@/_shared";
import { setupChaDynamicAura } from "./_cha-dynamic";
import {
    SPELL_NAME_NORMALIZED, SPELL_KEY, FLAG_SPELL, FLAG_ORIGIN, FLAG_CASTER, FLAG_CASTER_AID,
    POWERFUL_AURA_NORMALIZED,
    RAIO_PADRAO_M, RAIO_PODEROSA_M, getAuraTemplates, type AuraTpl,
} from "./aura-shared";
import {
    hasAuraDeCura, hasAuraArdente, getCasterChaFromTemplate, isUndeadOrSpirit,
    listHealCandidates, applyHealsAndPostCard, pickHealTargetsDialog,
    listBurnCandidates, applyBurnsAndPostCard, pickBurnTargetsDialog,
    type HealCandidate, type BurnCandidate,
} from "./aura-ticks";
import { hasAuraAntimagia } from "./aura-buffs";
// Re-export the public buff API so other features keep importing from
// "@/area-spells/aura-sagrada" (path unchanged after the Phase 4 split).
export {
    getAuraAntimagiaContextForActor,
    getAuraInvencibilidadeContextForActor,
    markAuraInvencibilidadeUsed,
} from "./aura-buffs";
import AURA_STYLES from "./aura-sagrada.css?inline";
import { log, warn } from "@/utils/logging";

// ── Helpers genéricos ─────────────────────────────────────────────────────────

/** True se o ator (caster) tem o aprimoramento "Aura Poderosa" entre seus poderes. */
function hasAuraPoderosa(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === POWERFUL_AURA_NORMALIZED);
}

// ── Detecção do cast ─────────────────────────────────────────────────────────

/**
 * `extractSpellName` resolve o nome do item via `data-item-id` no content
 * (`game.actors.get(actorId).items.get(itemId).name`) — funciona pra poderes
 * tanto quanto pra magias. NÃO confiar em `flags.tormenta20.itemData.name`:
 * em poderes do T20 o `itemData` é só o `.system` (sem `name` top-level).
 */
function isAuraSagradaMessage(message: ChatMessage): boolean {
    const name = extractSpellName(message);
    return normalizeCondName(name) === SPELL_NAME_NORMALIZED;
}

// ── Template ghost: criação / sync ───────────────────────────────────────────

function buildAuraFlags(meta: {
    casterActorId: string; casterTokenId: string; casterName: string; raioM: number;
}): Record<string, unknown> {
    return {
        [FLAG_SPELL]:       SPELL_KEY,
        [FLAG_CASTER]:      meta.casterTokenId,
        [FLAG_CASTER_AID]:  meta.casterActorId,
        casterName:         meta.casterName,
        raioM:              meta.raioM,
        creatorUserId:      game.user?.id ?? "",
        createdAtGameTime:  game.time?.worldTime ?? 0,
    };
}

async function createGhostTemplate(opts: {
    casterToken: FoundryToken;
    casterActorId: string;
    casterName: string;
    raioM: number;
}): Promise<string | null> {
    const scene = canvas?.scene;
    if (!scene) return null;

    const center = getTokenCenterPx(opts.casterToken);
    const tokenId = opts.casterToken.id;

    const data = {
        t: "circle",
        user: game.user?.id,
        distance: opts.raioM,
        direction: 0,
        angle: 0,
        x: center.x,
        y: center.y,
        // Dourado mais claro/quente que o Consagrar (`#ffd86b`), pra distinguir
        // visualmente e refletir "luz dourada e agradável" do texto da skill.
        fillColor:  "#ffe89a",
        borderColor: "#c9a76a",
        flags: { [MODULE_ID]: buildAuraFlags({
            casterActorId: opts.casterActorId,
            casterTokenId: tokenId,
            casterName:    opts.casterName,
            raioM:         opts.raioM,
        }) },
    };

    try {
        const created = await scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
        const tpl = created?.[0] as { id?: string } | undefined;
        return tpl?.id ?? null;
    } catch (err) {
        warn(`Aura Sagrada: falha ao criar template:`, err);
        return null;
    }
}

/** Templates emitidos por este caster (token ID). Substituiremos se ele recastar. */
function getCasterTemplates(casterTokenId: string): AuraTpl[] {
    return getAuraTemplates().filter(t =>
        t.flags?.[MODULE_ID]?.[FLAG_CASTER] === casterTokenId
    );
}

// ── AE apply / remove ────────────────────────────────────────────────────────

const _applyInProgress = new Set<string>();

function tokenHasAuraEffectFrom(actor: FoundryActor, templateId: string): boolean {
    return (actor.effects?.contents ?? []).some(e =>
        (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_ORIGIN] === templateId
    );
}

function buildEffectDataFromTemplate(template: AuraTpl): Record<string, unknown> | null {
    const baseRaw = template.flags?.[MODULE_ID]?.["baseEffectData"];
    if (!baseRaw) return null;
    const base = baseRaw as Record<string, unknown>;
    // Clona e injeta a flag de origem do nosso template
    const cloned: Record<string, unknown> = JSON.parse(JSON.stringify(base));
    // Reset metadados de identidade pra que cada AE seja documento novo
    delete (cloned as Record<string, unknown>)["_id"];
    delete (cloned as Record<string, unknown>)["_stats"];
    cloned["origin"] = template.uuid;
    cloned["transfer"] = false;
    const flags = (cloned["flags"] as Record<string, Record<string, unknown>> | undefined) ?? {};
    flags[MODULE_ID] = { ...(flags[MODULE_ID] ?? {}), [FLAG_ORIGIN]: template.id };
    cloned["flags"] = flags;
    // Nome fica "Aura Sagrada" — já vem do baseEffectData
    return cloned;
}

async function applyAuraToToken(token: FoundryToken, template: AuraTpl): Promise<boolean> {
    const actor = token.actor;
    if (!actor) return false;
    const actorId = actor.id;
    const lockKey = `${actorId}::${template.id}`;
    if (_applyInProgress.has(lockKey)) return false;
    if (tokenHasAuraEffectFrom(actor, template.id)) return false;
    _applyInProgress.add(lockKey);
    try {
        if (tokenHasAuraEffectFrom(actor, template.id)) return false;
        const data = buildEffectDataFromTemplate(template);
        if (!data) return false;
        await (actor as FoundryActor & {
            createEmbeddedDocuments(t: string, data: unknown[]): Promise<unknown>;
        }).createEmbeddedDocuments("ActiveEffect", [data]);
        return true;
    } catch (err) {
        warn(`Aura Sagrada apply em ${actor.name}:`, err);
        return false;
    } finally {
        _applyInProgress.delete(lockKey);
    }
}

async function removeAuraFromToken(token: FoundryToken, templateId: string): Promise<boolean> {
    const actor = token.actor;
    if (!actor) return false;
    const ours = (actor.effects?.contents ?? []).filter(e =>
        (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_ORIGIN] === templateId
    );
    if (ours.length === 0) return false;
    try {
        await (actor as FoundryActor & {
            deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
        }).deleteEmbeddedDocuments("ActiveEffect", ours.map(e => e.id));
        return true;
    } catch (err) {
        warn(`Aura Sagrada remove em ${actor.name}:`, err);
        return false;
    }
}

/**
 * Re-sincroniza UM token contra todos os templates Aura Sagrada da cena,
 * respeitando disposition (só caster + aliados com mesma disposition recebem).
 */
const _syncInProgress = new Set<string>();
type PendingSync = { token: FoundryToken; overrideXY?: { x?: number; y?: number } };
const _syncPending = new Map<string, PendingSync>();

async function syncTokenWithAuras(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): Promise<void> {
    if (!isActiveGM()) return;
    if (!token.actor) return;
    const tokenId = token.id;
    if (!tokenId) return;

    if (_syncInProgress.has(tokenId)) {
        _syncPending.set(tokenId, { token, overrideXY });
        return;
    }
    _syncInProgress.add(tokenId);
    try {
        const templates = getAuraTemplates();
        if (templates.length === 0) {
            // Sem auras ativas — limpa AEs órfãs deste sistema
            const orphans = (token.actor.effects?.contents ?? []).filter(e =>
                (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_ORIGIN] != null
            );
            if (orphans.length > 0) {
                try {
                    await (token.actor as FoundryActor & {
                        deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
                    }).deleteEmbeddedDocuments("ActiveEffect", orphans.map(e => e.id));
                } catch { /* ignore */ }
            }
            return;
        }
        for (const tpl of templates) {
            const casterTokenId   = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER] as string | undefined;
            if (!casterTokenId) continue;
            const casterToken     = findTokenForActor(
                (tpl.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined) ?? ""
            );
            const casterDisp      = casterToken ? getTokenDisposition(casterToken) : 0;
            const eligible        = isAuraTarget(token, casterTokenId, casterDisp);
            const inside          = isTokenInsideTemplate(token, tpl, overrideXY);
            const has             = tokenHasAuraEffectFrom(token.actor, tpl.id);

            if (eligible && inside && !has)            await applyAuraToToken(token, tpl);
            if ((!eligible || !inside) && has)         await removeAuraFromToken(token, tpl.id);
        }
    } finally {
        _syncInProgress.delete(tokenId);
        const pending = _syncPending.get(tokenId);
        if (pending) {
            _syncPending.delete(tokenId);
            void syncTokenWithAuras(pending.token, pending.overrideXY);
        }
    }
}

/** Re-sync de TODOS os tokens — usado quando o caster se move ou o template muda. */
async function resyncAllTokens(overrideForToken?: {
    tokenId: string; xy: { x?: number; y?: number };
}): Promise<void> {
    if (!isActiveGM()) return;
    const tokens = canvas?.tokens?.placeables ?? [];
    for (const tk of tokens) {
        if (!tk.actor) continue;
        const tid = tk.id;
        const ov  = (overrideForToken && overrideForToken.tokenId === tid)
            ? overrideForToken.xy
            : undefined;
        await syncTokenWithAuras(tk, ov);
    }
}

/** Remove TODOS os AEs criados por este template (usado no delete do template). */
async function cleanupAEsForTemplate(templateId: string): Promise<void> {
    if (!isActiveGM()) return;
    const actorsSet = new Set<FoundryActor>();
    for (const a of (game.actors?.contents ?? [])) {
        if (a) actorsSet.add(a);
    }
    for (const tk of (canvas?.tokens?.placeables ?? [])) {
        if (tk.actor) actorsSet.add(tk.actor);
    }
    let removed = 0;
    for (const actor of actorsSet) {
        const ours = (actor.effects?.contents ?? []).filter(e =>
            (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_ORIGIN] === templateId
        );
        if (ours.length === 0) continue;
        try {
            await actor.deleteEmbeddedDocuments("ActiveEffect", ours.map(e => e.id));
            removed += ours.length;
        } catch (err) {
            warn(`Aura Sagrada cleanup em ${actor.name}:`, err);
        }
    }
    if (removed > 0) {
        ui.notifications?.info(`Aura Sagrada: ${removed} efeito(s) removido(s)`);
    }
}

// ── Sequencer (animação persistente do autoanimations) ──────────────────────
//
// Quando o usuário lança "Aura Sagrada", o módulo `autoanimations` (via
// Sequencer) cria 1 ou mais efeitos visuais PERSISTENTES anexados ao TOKEN
// do caster (não ao MeasuredTemplate). Deletar o template NÃO encerra a
// animação — ela continua até alguém chamar `Sequencer.EffectManager.endEffects`.
//
// Estratégia: capturamos a LISTA de IDs de efeitos do Sequencer atrelados
// ao caster ANTES e DEPOIS do cast (com pequeno delay pro autoanim disparar).
// Os IDs NOVOS são os efeitos da aura — guardamos no flag do template.
// Quando a aura cai (delete via botão OU sem PM), terminamos esses IDs
// especificamente via `endEffects({ effects: <objetos> })`.

type SequencerEffectManager = {
    effects: Iterable<{ id: string; data?: { source?: unknown; file?: string } }>;
    // `effects` em endEffects DEVE ser string[] (IDs) ou CanvasEffect[];
    // passar [{ id }] dá: "collections in inFilter.effects must be of type
    // string or CanvasEffect".
    endEffects(filter: { effects: string[] }): Promise<unknown> | unknown;
};

function getSequencerManager(): SequencerEffectManager | null {
    const g = globalThis as unknown as { Sequencer?: { EffectManager?: SequencerEffectManager } };
    return g.Sequencer?.EffectManager ?? null;
}

/** Lista IDs de efeitos do Sequencer cuja `source` (string) inclui o tokenId. */
function getSequencerEffectIdsForToken(tokenId: string): string[] {
    if (!tokenId) return [];
    const sm = getSequencerManager();
    if (!sm) return [];
    const out: string[] = [];
    for (const e of sm.effects) {
        const src = e.data?.source;
        const srcStr = typeof src === "string" ? src : "";
        if (srcStr.includes(tokenId)) out.push(e.id);
    }
    return out;
}

/**
 * Termina (com cleanup visual) os efeitos do Sequencer cujos IDs estão na
 * lista. Aceita IDs que possivelmente já não existem mais — silent.
 */
async function endSequencerEffectsByIds(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const sm = getSequencerManager();
    if (!sm) return;
    const liveIds = new Set<string>();
    for (const e of sm.effects) liveIds.add(e.id);
    const toEnd = ids.filter(id => liveIds.has(id));
    if (toEnd.length === 0) return;
    try {
        // API quer string[] (IDs); passar [{id}] objeto plain quebra.
        await sm.endEffects({ effects: toEnd });
    } catch (err) {
        warn(`Aura Sagrada: falha ao encerrar efeitos do Sequencer:`, err);
    }
}

/**
 * Termina efeitos do autoanimations atrelados ao caster token cujo arquivo
 * sugere ser uma animação de magia. Usado como FALLBACK quando o flag
 * `sequencerEffectIds` está vazio (race no cast).
 */
async function endAutoanimSpellEffectsForCasterToken(casterTokenId: string): Promise<void> {
    if (!casterTokenId) return;
    const sm = getSequencerManager();
    if (!sm) return;
    const matchIds: string[] = [];
    for (const e of sm.effects) {
        const src = e.data?.source;
        const srcStr = typeof src === "string" ? src : "";
        if (!srcStr.includes(casterTokenId)) continue;
        const file = e.data?.file ?? "";
        // Pattern do autoanim pra spells/auras (cobre detectmagic, aura, etc.)
        if (!/autoanimations.*\.(spell|aura)\./i.test(file)) continue;
        matchIds.push(e.id);
    }
    if (matchIds.length === 0) return;
    try {
        await sm.endEffects({ effects: matchIds });
    } catch (err) {
        warn(`Aura Sagrada: fallback endEffects falhou:`, err);
    }
}

/**
 * Estratégia dupla pra encerrar a animação visual da aura:
 *  1. Primeiro pelos IDs salvos no flag (preciso — só esses)
 *  2. Depois, se nada foi terminado, fallback por casterTokenId + filtro de file
 */
async function endAuraAnimationsForCaster(casterTokenId: string, savedIds: string[]): Promise<void> {
    const sm = getSequencerManager();
    if (!sm) return;
    const liveBefore = new Set<string>();
    for (const e of sm.effects) liveBefore.add(e.id);

    if (savedIds && savedIds.length > 0) {
        await endSequencerEffectsByIds(savedIds);
    }

    // Espera o end propagar
    await new Promise(r => setTimeout(r, 100));

    // Se ainda há efeitos do tipo spell/aura atrelados ao caster, fallback
    if (casterTokenId) {
        await endAutoanimSpellEffectsForCasterToken(casterTokenId);
    }
}

// ── Pipeline de cast ─────────────────────────────────────────────────────────

/**
 * Dispara após detectar o card de Aura Sagrada no chat. Cria/recria o template
 * ghost no centro do token-caster e aplica os AEs aos elegíveis na cena.
 *
 * Regra "1 aura por caster": se o caster já tem aura ativa, ela é removida
 * primeiro (que limpa os AEs antigos) antes da nova ser criada.
 */
async function onAuraSagradaCast(message: ChatMessage): Promise<void> {
    const casterActorId = message.speaker?.actor;
    if (!casterActorId) return;
    const casterActor = game.actors?.get(casterActorId);
    if (!casterActor) return;
    const casterToken = findTokenForActor(casterActorId);
    if (!casterToken) {
        ui.notifications?.warn(
            "Aura Sagrada: token do paladino não encontrado na cena. Coloque o token e tente de novo.",
            { permanent: false }
        );
        return;
    }
    const casterTokenId = casterToken.id;

    // SNAPSHOT: efeitos do Sequencer já atrelados ao caster ANTES do cast.
    // Capturamos imediatamente (antes de qualquer outra coisa) pra não competir
    // com o autoanimations que também escuta `createChatMessage`.
    const seqIdsBefore = new Set(getSequencerEffectIdsForToken(casterTokenId));

    const baseEffect = extractBaseEffectData(message);
    if (!baseEffect) {
        warn(`Aura Sagrada: mensagem sem effects[0][0] — abortando.`);
        return;
    }

    const raioM = hasAuraPoderosa(casterActor) ? RAIO_PODEROSA_M : RAIO_PADRAO_M;

    const scene = canvas?.scene;

    // 1. Limpa auras anteriores do mesmo caster (deletar template dispara cleanup dos AEs)
    const previas = getCasterTemplates(casterTokenId);
    if (previas.length > 0 && scene?.deleteEmbeddedDocuments) {
        try {
            await scene.deleteEmbeddedDocuments("MeasuredTemplate", previas.map(t => t.id));
        } catch { /* ignore */ }
    }

    // 2. Cria template ghost
    const newTplId = await createGhostTemplate({
        casterToken,
        casterActorId,
        casterName: message.speaker?.alias ?? casterActor.name ?? "Paladino",
        raioM,
    });
    if (!newTplId) return;

    // 3. Anexa o baseEffectData ao flag do template (depois usamos pra criar AEs)
    //    Fazemos via update porque createEmbeddedDocuments não retorna o doc com
    //    todos os helpers; pegamos pela cena.
    const tplDoc = getAuraTemplates().find(t => t.id === newTplId);
    if (!tplDoc) return;
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}.baseEffectData`]: baseEffect });
    } catch (err) {
        warn(`Aura Sagrada: falha ao anexar baseEffectData:`, err);
        return;
    }

    // 4. Aplica AEs em todos os elegíveis (caster + aliados dentro)
    //    NB: o `updateMeasuredTemplate` resultante do passo 3 já chama resync;
    //    forçamos aqui também por garantia (caso GM não esteja com sync ativo).
    if (isActiveGM()) await resyncAllTokens();

    // 5. Após delay, captura efeitos NOVOS do Sequencer (atrelados ao caster)
    //    — esses são os que o autoanim criou pra animar a aura. Salvamos os IDs
    //    no flag pro hook deleteMeasuredTemplate encerrar visualmente depois.
    void (async () => {
        await new Promise(r => setTimeout(r, 1500));
        const afterIds = getSequencerEffectIdsForToken(casterTokenId);
        const newIds = afterIds.filter(id => !seqIdsBefore.has(id));
        if (newIds.length === 0) return;
        try {
            await tplDoc.update({ [`flags.${MODULE_ID}.sequencerEffectIds`]: newIds });
        } catch (err) {
            warn(`Aura Sagrada: falha ao salvar sequencerEffectIds:`, err);
        }
    })();

    ui.notifications?.info(
        `Aura Sagrada ativada (raio ${raioM}m${raioM === RAIO_PODEROSA_M ? " — Aura Poderosa" : ""}).`
    );
}

// ── Sync no movimento do caster ──────────────────────────────────────────────
//
// Quando o caster move, atualizamos o `x/y` do template ghost pra acompanhar.
// Usamos destX/destY do `changes` (quirk v13) e disparamos resync de todos os
// tokens — porque mover o caster pode fazer outros tokens entrarem/saírem da
// área, mesmo que esses tokens estejam parados.

async function moveAuraWithCaster(
    casterToken: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): Promise<void> {
    const casterTokenId = casterToken.id;
    if (!casterTokenId) return;
    const mine = getCasterTemplates(casterTokenId);
    if (mine.length === 0) return;

    const newCenter = getTokenCenterPx(casterToken, overrideXY);
    for (const tpl of mine) {
        if (Math.abs(tpl.x - newCenter.x) < 1 && Math.abs(tpl.y - newCenter.y) < 1) continue;
        try {
            await tpl.update({ x: newCenter.x, y: newCenter.y });
        } catch (err) {
            warn(`Aura Sagrada: falha ao mover template:`, err);
        }
    }
    // O `updateMeasuredTemplate` resultante do .update vai disparar resync.
    // Mas pra cobrir o caso de tokens parados que ENTRAM/SAEM, garantimos aqui:
    if (isActiveGM()) {
        await resyncAllTokens({ tokenId: casterTokenId, xy: overrideXY ?? {} });
    }
}

// ── Cancelar aura (skills-menu) ──────────────────────────────────────────────
//
// Visibilidade: o GM vê todas as auras ativas. O jogador só vê as auras que
// ELE lançou (creatorUserId). Comportamento idêntico ao do Consagrar:
//   - 1 aura → dialog de confirmação
//   - 2+      → dialog picker com checkboxes

/** Templates Aura Sagrada visíveis pra cancelamento pelo usuário atual. */
function getMyAuras(): AuraTpl[] {
    const all = getAuraTemplates();
    if (game.user?.isGM) return all;
    const uid = game.user?.id;
    if (!uid) return [];
    return all.filter(t => t.flags?.[MODULE_ID]?.["creatorUserId"] === uid);
}

async function onClickCancelAura(): Promise<void> {
    const mine = getMyAuras();
    if (mine.length === 0) {
        ui.notifications?.info("Nenhuma aura sagrada ativa para cancelar.");
        refreshSkillsMenu();
        return;
    }
    const scene = canvas?.scene;
    if (!scene?.deleteEmbeddedDocuments) {
        ui.notifications?.warn("Cena não disponível.");
        return;
    }
    const idsToRemove = mine.length === 1
        ? await confirmCancelAura(mine[0])
        : await pickAurasDialog(mine);
    if (!idsToRemove || idsToRemove.length === 0) return;
    try {
        await scene.deleteEmbeddedDocuments("MeasuredTemplate", idsToRemove);
    } catch (err) {
        warn(`Aura Sagrada: falha ao cancelar:`, err);
        ui.notifications?.error("Falha ao cancelar aura (veja console).");
    }
}

function confirmCancelAura(tpl: AuraTpl): Promise<string[] | null> {
    const caster = escHtml((tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Paladino");
    return new Promise<string[] | null>((resolve) => {
        new Dialog({
            title: "Cancelar Aura Sagrada",
            content: `
                <div class="t20-aura-cancel">
                    <p>Cancelar a aura sagrada de <b>${caster}</b>?</p>
                    <p class="hint">Os efeitos aplicados aos aliados dentro da aura serão removidos.</p>
                </div>`,
            buttons: {
                cancel: {
                    icon:  '<i class="fas fa-circle-xmark"></i>',
                    label: "Cancelar aura",
                    callback: () => resolve([tpl.id]),
                },
                back: {
                    icon:  '<i class="fas fa-times"></i>',
                    label: "Voltar",
                    callback: () => resolve(null),
                },
            },
            default: "cancel",
            close:   () => resolve(null),
        }, { classes: ["t20-dialog"] }).render(true);
    });
}

function pickAurasDialog(templates: AuraTpl[]): Promise<string[] | null> {
    return new Promise<string[] | null>((resolve) => {
        const rows = templates.map((t, i) => {
            const caster = escHtml((t.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Paladino");
            return `
                <label class="picker-row">
                    <input type="checkbox" data-tid="${t.id}" checked />
                    <span class="row-idx">Aura #${i + 1}</span>
                    <span class="row-name"><b>${caster}</b></span>
                </label>`;
        }).join("");
        new Dialog({
            title: "Cancelar auras sagradas",
            content: `
                <div class="t20-aura-picker">
                    <p class="picker-intro">Selecione as auras a cancelar</p>
                    ${rows}
                </div>`,
            buttons: {
                cancel: {
                    icon:  '<i class="fas fa-circle-xmark"></i>',
                    label: "Cancelar selecionadas",
                    callback: ($html: JQuery) => {
                        const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                        const ids = Array.from(
                            (root as HTMLElement).querySelectorAll("input[data-tid]:checked")
                        ).map(el => el.getAttribute("data-tid") ?? "").filter(Boolean);
                        resolve(ids.length > 0 ? ids : null);
                    },
                },
                back: {
                    icon:  '<i class="fas fa-times"></i>',
                    label: "Voltar",
                    callback: () => resolve(null),
                },
            },
            default: "cancel",
            close:   () => resolve(null),
        }, { classes: ["t20-dialog"] }).render(true);
    });
}

// Pequeno suplemento CSS pros dialogs de aura

const AURA_STYLES_ID = "t20-aura-sagrada-styles";

function ensureAuraStyles(): void {
    if (document.getElementById(AURA_STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = AURA_STYLES_ID;
    el.textContent = AURA_STYLES;
    document.head.appendChild(el);
}

// ── Sustentar (1 PM por turno do caster) ─────────────────────────────────────
//
// Aura Sagrada tem "duração sustentada" no T20: o caster gasta 1 PM toda vez
// que o turno volta a ele, ou a aura cai. Se NÃO tiver 1 PM disponível na hora
// de pagar, a aura é cancelada automaticamente (delete template → cleanup AEs).

async function spendSustainPM(caster: FoundryActor, auras: AuraTpl[]): Promise<{
    survivedAuras: AuraTpl[];
    cancelledCount: number;
}> {
    type PmShape = { value?: number; max?: number };
    const pm  = (caster.system?.attributes?.pm ?? {}) as PmShape;
    let pmCur = Number(pm.value ?? 0);
    if (!Number.isFinite(pmCur)) pmCur = 0;

    const need = auras.length;          // 1 PM por aura ativa do caster
    const canSustain = Math.max(0, Math.min(need, pmCur));
    const survived   = auras.slice(0, canSustain);
    const cancelled  = auras.slice(canSustain);

    // Cobra os PMs que conseguiu pagar
    if (canSustain > 0) {
        const newPm = Math.max(0, pmCur - canSustain);
        try {
            await caster.update({ "system.attributes.pm.value": newPm });
        } catch (err) {
            warn(`Aura Sagrada: falha ao debitar PM:`, err);
        }
    }

    // Cancela as auras que não couberam ser sustentadas
    if (cancelled.length > 0) {
        const scene = canvas?.scene;
        if (scene?.deleteEmbeddedDocuments) {
            try {
                await scene.deleteEmbeddedDocuments("MeasuredTemplate", cancelled.map(t => t.id));
            } catch (err) {
                warn(`Aura Sagrada: falha ao cancelar aura por falta de PM:`, err);
            }
        }
        // Posta aviso no chat
        const casterName = (cancelled[0].flags?.[MODULE_ID]?.["casterName"] as string | undefined)
            ?? caster.name ?? "Paladino";
        try {
            await ChatMessage.create({
                content: `
                    <div class="tormenta20 chat-card item-card" style="border-color:var(--t20-color-danger);">
                        <header class="card-header flexrow">
                            <h3 class="item-name"><div>Aura Sagrada cancelada — sem PM</div></h3>
                        </header>
                        <div class="card-content" style="padding:6px 10px;color:var(--t20-text-primary);">
                            <p style="margin:0;">
                                <b>${escHtml(casterName)}</b> não tinha PM suficiente para sustentar
                                a aura (precisava ${need}, tinha ${pmCur}).
                                ${cancelled.length === 1 ? "Aura encerrada." : `${cancelled.length} auras encerradas.`}
                            </p>
                        </div>
                    </div>`,
                speaker: { alias: casterName },
            });
        } catch { /* ignore */ }
        ui.notifications?.warn(
            `${casterName}: sem PM para sustentar Aura Sagrada. ${cancelled.length === 1 ? "Aura encerrada." : `${cancelled.length} auras encerradas.`}`
        );
    }

    return { survivedAuras: survived, cancelledCount: cancelled.length };
}

// ── Tick por alvo (cura/dano no turno do alvo) ───────────────────────────────
//
// Quando o turno é do ALVO (caster ou outra criatura), checamos:
//   - Para cada aura ativa cuja `Aura de Cura` está ativa no SEU caster:
//     este alvo está dentro + é elegível pra cura? Aplica.
//   - Idem pra `Aura Ardente`.
// O caster também é elegível pra cura no SEU PRÓPRIO turno (já que ele se
// inclui como aliado dentro). Isso preserva o texto "você e os aliados".

async function applyHealForTarget(opts: {
    casterName: string;
    healAmount: number;
    target:     HealCandidate;
    alwaysPrompt: boolean;
}): Promise<void> {
    const { casterName, healAmount, target, alwaysPrompt } = opts;
    if (alwaysPrompt) {
        const chosen = await pickHealTargetsDialog({ casterName, candidates: [target] });
        if (!chosen || chosen.length === 0) return;
    }
    await applyHealsAndPostCard({ casterName, healAmount, candidates: [target] });
}

async function applyBurnForTarget(opts: {
    casterName: string;
    damage:     number;
    target:     BurnCandidate;
    alwaysPrompt: boolean;
}): Promise<void> {
    const { casterName, damage, target, alwaysPrompt } = opts;
    if (alwaysPrompt) {
        const chosen = await pickBurnTargetsDialog({ casterName, candidates: [target] });
        if (!chosen || chosen.length === 0) return;
    }
    await applyBurnsAndPostCard({ casterName, damage, candidates: [target] });
}

/**
 * Processa o início do turno de QUALQUER combatant:
 *
 * 1. Se o combatant é caster de aura(s): gasta 1 PM por aura ativa pra
 *    sustentar. Auras que não couberem ser pagas são canceladas.
 * 2. Para cada aura ainda ativa na cena: se este combatant é alvo elegível
 *    da cura ou dano (Aura de Cura / Aura Ardente do caster dessa aura),
 *    aplica o efeito agora — neste turno do alvo.
 *
 * Nota: a sequência (sustain ANTES de aplicar) garante que se a aura caiu
 * por falta de PM, ela não cura nem dana ninguém neste turno.
 */
async function onCombatTurnStart(actor: FoundryActor, combatantTokenId: string): Promise<void> {
    if (!isActiveGM()) {
        console.debug(`[t20-theme-overhaul] turn skip: não sou o active GM`);
        return;
    }
    const actorId = actor.id;
    if (!actorId) {
        console.debug(`[t20-theme-overhaul] turn skip: actor sem id`);
        return;
    }
    if (!combatantTokenId) {
        console.debug(`[t20-theme-overhaul] turn skip: combatant sem token na cena`);
        return;
    }

    // (1) Sustain: gasta 1 PM por aura própria; cancela as que não couberem
    //    Nota: dedupado por casterTokenId, não casterActorId — caso o caster
    //    tenha múltiplos tokens com a mesma actor.id (extremamente raro pra
    //    paladino, mas correto por simetria).
    const ownAuras = getAuraTemplates().filter(t =>
        t.flags?.[MODULE_ID]?.[FLAG_CASTER] === combatantTokenId
    );
    if (ownAuras.length > 0) {
        await spendSustainPM(actor, ownAuras);
        // Pequena pausa pra deletes propagarem (deleteMeasuredTemplate é async)
        await new Promise(r => setTimeout(r, 50));
    }

    let alwaysPrompt = false;
    try {
        alwaysPrompt = Boolean(game.settings.get(MODULE_ID, "auraSagrada.alwaysPromptStartOfTurn"));
    } catch { /* setting indisponível — usa default */ }

    const allAuras = getAuraTemplates();
    if (allAuras.length === 0) {
        console.debug(`[t20-theme-overhaul] turn ${actor.name}: sem auras ativas na cena`);
        return;
    }

    // (2) Tick por alvo: para cada aura, ESTE token específico é elegível?
    //    Filtragem por TOKEN id (não actor id) — múltiplos tokens unlinked do
    //    mesmo NPC base têm actor.id idêntico mas PV independentes.
    for (const tpl of allAuras) {
        const casterAid = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined;
        if (!casterAid) {
            console.debug(`[t20-theme-overhaul] aura ${tpl.id}: sem casterActorId no flag`);
            continue;
        }
        const casterActor = game.actors?.get(casterAid);
        if (!casterActor) {
            console.debug(`[t20-theme-overhaul] aura ${tpl.id}: casterActor não encontrado (id=${casterAid})`);
            continue;
        }

        const cha = getCasterChaFromTemplate(tpl);
        const amount = 5 + cha;
        const casterName = (tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined)
            ?? casterActor.name ?? "Paladino";

        const haveCura = hasAuraDeCura(casterActor);
        const haveBurn = hasAuraArdente(casterActor);

        // ─ Aura de Cura ─ (este TOKEN específico recebe cura?)
        if (haveCura) {
            const cands = listHealCandidates(tpl, amount).filter(c => c.tokenId === combatantTokenId);
            if (cands.length > 0) {
                await applyHealForTarget({
                    casterName, healAmount: amount, target: cands[0], alwaysPrompt,
                });
            } else {
                console.debug(`[t20-theme-overhaul] cura skip token=${combatantTokenId} (${actor.name}): inside? disposition? PV cheio?`);
            }
        }

        // ─ Aura Ardente ─ (este TOKEN específico recebe dano?)
        if (haveBurn) {
            const cands = listBurnCandidates(tpl, amount).filter(c => c.tokenId === combatantTokenId);
            if (cands.length > 0) {
                await applyBurnForTarget({
                    casterName, damage: amount, target: cands[0], alwaysPrompt,
                });
            } else {
                console.debug(`[t20-theme-overhaul] ardente skip token=${combatantTokenId} (${actor.name}): undead/spirit? inside? PV>0?`);
            }
        }

        if (!haveCura && !haveBurn) {
            console.debug(`[t20-theme-overhaul] caster ${casterActor.name} sem Aura de Cura/Ardente entre poderes — verifica nome do item`);
        }
    }
}

// ── Diagnóstico (chamado via macro pelo user quando algo parece quebrado) ────
//
// Imprime no console um snapshot do estado completo das auras na cena:
// templates ativos, caster, aprimoramentos detectados, candidatos a cura/dano.
// Use: `game.modules.get('t20-theme-overhaul').api.diagnoseAuras()`

export function diagnoseAuras(): unknown {
    const auras = getAuraTemplates();
    const report: Array<Record<string, unknown>> = [];
    const tokens = canvas?.tokens?.placeables ?? [];

    for (const tpl of auras) {
        const casterAid = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined;
        const casterActor = casterAid ? game.actors?.get(casterAid) : null;
        const cha = getCasterChaFromTemplate(tpl);

        const insideTokens = tokens.filter(t => t.actor && isTokenInsideTemplate(t, tpl));
        const insideDetail = insideTokens.map(t => {
            const a = t.actor!;
            type PVShape = { value?: number; max?: number };
            const pv = (a.system?.attributes?.pv ?? {}) as PVShape;
            type DetalhesShape = { detalhes?: { raca?: string } };
            const raca = (a.system as DetalhesShape | undefined)?.detalhes?.raca;
            return {
                name:        a.name,
                disposition: getTokenDisposition(t),
                pv:          { value: pv.value, max: pv.max },
                raca,
                isUndeadOrSpirit: isUndeadOrSpirit(a),
            };
        });

        report.push({
            templateId: tpl.id,
            casterName:    (tpl.flags?.[MODULE_ID]?.["casterName"] as string) ?? "?",
            casterActorId: casterAid,
            casterFound:   !!casterActor,
            casterCHA_inFlag: cha,
            tickAmount: 5 + cha,
            radius_m: tpl.distance,
            hasAuraDeCura:    hasAuraDeCura(casterActor),
            hasAuraArdente:   hasAuraArdente(casterActor),
            hasAuraAntimagia: hasAuraAntimagia(casterActor),
            insideTokens: insideDetail,
        });
    }

    log(`DIAGNOSE AURAS:`, report);
    return report;
}

// ── Setup (hooks) ────────────────────────────────────────────────────────────

export function setupAuraSagrada(): void {
    ensureAuraStyles();

    // Setting: "sempre perguntar antes de aplicar efeitos de início de turno"
    // (consumida por Aura de Cura — quando true, abre dialog picker em vez
    // de auto-curar todos os elegíveis).
    try {
        game.settings.register(MODULE_ID, "auraSagrada.alwaysPromptStartOfTurn", {
            name: "Aura Sagrada: sempre perguntar no início do turno",
            hint: "Quando ativado, abre um diálogo de escolha de alvos no início do turno do paladino para Aura de Cura e Aura Ardente. Caso contrário, aplica em todos os elegíveis automaticamente.",
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
        });
    } catch { /* já registrado / config indisponível */ }

    // Ação de cancelar registrada no skills-menu (botão único da toolbar)
    registerSkillAction({
        id:    "aura-sagrada-cancel",
        label: "Cancelar Aura Sagrada",
        icon:  "fa-solid fa-circle-xmark",
        color: "#ffe89a",
        isVisible: () => getMyAuras().length > 0,
        onClick:   () => onClickCancelAura(),
    });

    // 1. Detectar cast no chat → cria a aura E refresha o skills-menu
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        if (!isAuraSagradaMessage(message)) return;
        const uid = getMsgAuthorId(message);
        if (uid !== game.user?.id) return;
        void onAuraSagradaCast(message).then(() => refreshSkillsMenu());
    });

    // 2. Movimento de qualquer token: re-sync (e se for o caster, mover template)
    Hooks.on("updateToken", (...args: unknown[]) => {
        if (getAuraTemplates().length === 0) return;
        const tokenDoc = args[0] as { object?: FoundryToken; id?: string; flags?: Record<string, Record<string, unknown>> };
        // Skip esfera-flamejante (token sintético da Bola de Fogo, não é criatura)
        if (tokenDoc.flags?.[MODULE_ID]?.["spell"] === "bola-de-fogo-esfera") return;
        const changes  = args[1] as Record<string, unknown> | undefined;
        const token    = tokenDoc.object;
        if (!token) return;
        const tokenId  = token.id;
        const destX = typeof changes?.["x"] === "number" ? (changes["x"] as number) : undefined;
        const destY = typeof changes?.["y"] === "number" ? (changes["y"] as number) : undefined;
        const overrideXY = (destX !== undefined || destY !== undefined)
            ? { x: destX, y: destY } : undefined;

        // Se este token É caster de alguma aura: mover template e re-sync de todos
        const isCaster = getAuraTemplates().some(t =>
            t.flags?.[MODULE_ID]?.[FLAG_CASTER] === tokenId
        );
        if (isCaster) {
            void moveAuraWithCaster(token, overrideXY);
        } else {
            void syncTokenWithAuras(token, overrideXY);
        }
    });

    // 3. Template Aura Sagrada atualizado (posição/raio) → resync todos
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc  = args[0] as AuraTpl;
        const changes = args[1] as Record<string, unknown>;
        if (tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] !== SPELL_KEY) return;
        const movedOrResized =
            changes["x"] !== undefined ||
            changes["y"] !== undefined ||
            changes["distance"] !== undefined;
        const flagAdded =
            !!((changes["flags"] as Record<string, Record<string, unknown>> | undefined)?.[MODULE_ID]);
        if (!movedOrResized && !flagAdded) return;
        if (!isActiveGM()) return;
        void resyncAllTokens();
    });

    // 4. Template deletado → limpar AEs, encerrar animação do Sequencer
    //    (autoanimations cria efeitos PERSISTENTES anexados ao token do caster;
    //    deletar o template não para isso — temos que chamar endEffects), e
    //    refresh do skills-menu.
    Hooks.on("deleteMeasuredTemplate", (...args: unknown[]) => {
        const template = args[0] as {
            id: string;
            flags?: Record<string, Record<string, unknown>>;
        };
        if (template.flags?.[MODULE_ID]?.[FLAG_SPELL] !== SPELL_KEY) return;
        // Encerra animação ANTES do cleanup. Estratégia dupla pra robustez:
        //   1. IDs salvos no flag (capturados no cast) — caminho preciso
        //   2. Fallback: pega todos efeitos do Sequencer atrelados ao caster
        //      token cujo file menciona "spell" (autoanimations) e termina —
        //      cobre caso o flag não tenha sido salvo a tempo (race no cast)
        const seqIds = (template.flags?.[MODULE_ID]?.["sequencerEffectIds"] as string[] | undefined) ?? [];
        const casterTokenId = (template.flags?.[MODULE_ID]?.[FLAG_CASTER] as string | undefined) ?? "";
        void endAuraAnimationsForCaster(casterTokenId, seqIds);
        void cleanupAEsForTemplate(template.id).then(() => refreshSkillsMenu());
    });

    // 5. Novo token criado → checa se cai em alguma aura
    Hooks.on("createToken", (...args: unknown[]) => {
        if (getAuraTemplates().length === 0) return;
        const tokenDoc = args[0] as { object?: FoundryToken };
        const token = tokenDoc.object;
        if (!token) return;
        void syncTokenWithAuras(token);
    });

    // 6. Mudou a disposition de um token: aliados podem ter virado hostis (ou vice-versa)
    //    e precisam ter o AE removido/aplicado. updateToken cobre via changes; aqui só
    //    garantimos resync se um campo de disposition mudar.
    Hooks.on("updateToken", (...args: unknown[]) => {
        if (getAuraTemplates().length === 0) return;
        const changes = args[1] as Record<string, unknown> | undefined;
        if (changes?.["disposition"] === undefined) return;
        const tokenDoc = args[0] as { object?: FoundryToken; flags?: Record<string, Record<string, unknown>> };
        if (tokenDoc.flags?.[MODULE_ID]?.["spell"] === "bola-de-fogo-esfera") return;
        const token = tokenDoc.object;
        if (!token) return;
        void syncTokenWithAuras(token);
    });

    // 7. Carregar cena → re-sync tokens com auras existentes
    Hooks.on("canvasReady", () => {
        if (!isActiveGM()) return;
        const templates = getAuraTemplates();
        if (templates.length === 0) return;
        void resyncAllTokens();
    });

    // 8. Início do turno do combatant → tick (cura/dano) + sustain (1 PM)
    //
    // `combatTurnChange(combat, prior, current)` é o hook correto pra ESTE
    // caso. Diferenças dos outros:
    //   - `combatTurn` dispara com `combat.combatant` = combatant ANTERIOR
    //     (o que está terminando o turno). Aplicar tick aqui causa o efeito
    //     no FIM do turno do recebedor — bug que era visível ao usuário.
    //   - `combatTurnChange` dispara DEPOIS da transição, com
    //     `combat.combatant` = NOVO combatant (o que está começando). Isso é
    //     "início do turno do alvo", que é o que queremos.
    //   - `combatTurnChange` também cobre: virada de round (próximo turno do
    //     round dispara) E início do combate (priorRound=0 + currentRound=1).
    //     Por isso NÃO precisamos mais hooks separados pra combatStart/Round.
    type CombatLike = {
        combatant?: {
            actor?: FoundryActor | null;
            // `tokenId` é o ID do token na cena — único pra cada token, mesmo
            // que múltiplos tokens unlinked compartilhem o mesmo actor.id.
            tokenId?: string | null;
            token?: { id?: string | null } | null;
        } | null;
    };
    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const combat = args[0] as CombatLike | undefined;
        const cmb    = combat?.combatant;
        const actor  = cmb?.actor ?? null;
        if (!actor) return;
        // Identifica o TOKEN específico deste combatant — crítico pra cenas
        // com múltiplos tokens unlinked do mesmo NPC base.
        const tokenId = cmb?.tokenId ?? cmb?.token?.id ?? "";
        void onCombatTurnStart(actor, tokenId);
    });

    // 9. CHA dinâmico — recomputa bônus/cura/dano da aura quando o Carisma do
    //    caster muda (item/habilidade via Active Effect ou edição manual da ficha).
    setupChaDynamicAura({
        moduleId:      MODULE_ID,
        flagSpell:     FLAG_SPELL,
        spellKey:      SPELL_KEY,
        flagOrigin:    FLAG_ORIGIN,
        flagCasterAid: FLAG_CASTER_AID,
        label:         "Aura Sagrada",
    });
}
