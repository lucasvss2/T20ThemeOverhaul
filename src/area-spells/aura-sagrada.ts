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
import AURA_STYLES from "./aura-sagrada.css?inline";

// Valor RETORNADO por normalizeCondName("Aura Sagrada") — esse helper só
// faz lowercase + remove acentos, NÃO substitui espaço por hífen. Manter o
// espaço aqui é essencial pra detecção do cast funcionar.
const SPELL_NAME_NORMALIZED = "aura sagrada";
const SPELL_KEY      = "aura-sagrada";        // identificador interno (flag/template)
const FLAG_SPELL     = "spell";               // template flag: identifica a aura
const FLAG_ORIGIN    = "auraSagradaTemplateOrigin"; // AE flag: liga AE ao template
const FLAG_CASTER    = "casterTokenId";       // template flag: token que emite
const FLAG_CASTER_AID = "casterActorId";      // template flag: actor do caster
const POWERFUL_AURA_NORMALIZED   = "aura poderosa";  // (idem: sem hífen)
const HEALING_AURA_NORMALIZED    = "aura de cura";   // cura por turno
const BURNING_AURA_NORMALIZED    = "aura ardente";   // dano por turno em undead/espíritos
const ANTIMAGIC_AURA_NORMALIZED  = "aura antimagia"; // re-roll de resistência contra magia
const INVINCIBILITY_AURA_NORMALIZED = "aura de invencibilidade"; // ignora 1º dano na cena
const FLAG_INVENC_USED_SCENE = "auraInvencibilidadeUsedSceneId"; // actor flag

const RAIO_PADRAO_M  = 9;
const RAIO_PODEROSA_M = 30;

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
        console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao criar template:`, err);
        return null;
    }
}

/** Lista todos os templates de Aura Sagrada na cena atual. */
type AuraTpl = {
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
};

function getAuraTemplates(): AuraTpl[] {
    const list = canvas?.scene?.templates?.contents ?? [];
    return list.filter(t => t.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada apply em ${actor.name}:`, err);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada remove em ${actor.name}:`, err);
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
            console.warn(`[t20-theme-overhaul] Aura Sagrada cleanup em ${actor.name}:`, err);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao encerrar efeitos do Sequencer:`, err);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada: fallback endEffects falhou:`, err);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada: mensagem sem effects[0][0] — abortando.`);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao anexar baseEffectData:`, err);
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
            console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao salvar sequencerEffectIds:`, err);
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
            console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao mover template:`, err);
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
        console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao cancelar:`, err);
        ui.notifications?.error("Falha ao cancelar aura (veja console).");
    }
}

function confirmCancelAura(tpl: AuraTpl): Promise<string[] | null> {
    const caster = escHtml((tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Paladino");
    return new Promise<string[] | null>((resolve) => {
        new Dialog({
            title: "Cancelar Aura Sagrada",
            content: `
                <div class="bg3-aura-cancel">
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
        }, { classes: ["bg3-dialog"] }).render(true);
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
                <div class="bg3-aura-picker">
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
        }, { classes: ["bg3-dialog"] }).render(true);
    });
}

// Pequeno suplemento CSS pros dialogs de aura

const AURA_STYLES_ID = "bg3-t20-aura-sagrada-styles";

function ensureAuraStyles(): void {
    if (document.getElementById(AURA_STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = AURA_STYLES_ID;
    el.textContent = AURA_STYLES;
    document.head.appendChild(el);
}

// ── Aura de Cura (aprimoramento) ─────────────────────────────────────────────
//
// Quando o caster TEM o aprimoramento "Aura de Cura" entre seus poderes E sua
// Aura Sagrada está ativa, no INÍCIO DE CADA TURNO dele, os aliados (à sua
// escolha) dentro da aura recebem 5 + CHA do caster em PV.
//
// Comportamento UX (controlado por `auraSagrada.alwaysPromptStartOfTurn`):
//   - false (default): aplica automaticamente em TODOS os elegíveis,
//     posta um chat card resumindo. Tem botão "desfazer" no card.
//   - true: abre dialog com checkboxes pra escolher quem cura.

/** True se o ator tem o item "Aura de Cura" entre seus poderes. */
function hasAuraDeCura(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === HEALING_AURA_NORMALIZED);
}

/** CHA do caster: lemos do baseEffectData (T20 já calculou no momento do cast). */
function getCasterChaFromTemplate(template: AuraTpl): number {
    const base = template.flags?.[MODULE_ID]?.["baseEffectData"] as
        | { changes?: Array<{ value?: string | number }> } | undefined;
    const raw = base?.changes?.[0]?.value;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

type HealCandidate = {
    actorId:   string;
    actorName: string;
    tokenId:   string;
    pvBefore:  number;
    pvMax:     number;
    pvAfter:   number;
    healed:    number;  // quanto foi efetivamente curado (clamped)
};

/**
 * Resolve o `actor` correto pra um candidate. Prefere o actor do TOKEN
 * (synthetic) porque tokens unlinked têm um actor separado do world actor
 * — modificar `game.actors.get(id)` NÃO reflete no PV mostrado no token.
 * Fallback: world actor.
 */
function resolveActorForCandidate(c: { tokenId: string; actorId: string }): FoundryActor | null {
    const tok = canvas?.tokens?.get(c.tokenId);
    if (tok?.actor) return tok.actor;
    return game.actors?.get(c.actorId) ?? null;
}

/** Lista tokens elegíveis pra cura por uma aura — caster + aliados FRIENDLY dentro. */
function listHealCandidates(template: AuraTpl, healAmount: number): HealCandidate[] {
    const tokens = canvas?.tokens?.placeables ?? [];

    const casterTokenId = template.flags?.[MODULE_ID]?.[FLAG_CASTER] as string | undefined;
    const casterActorId = template.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined;
    if (!casterTokenId || !casterActorId) return [];
    const casterToken = findTokenForActor(casterActorId);
    const casterDisp  = casterToken ? getTokenDisposition(casterToken) : 0;

    // IMPORTANTE: dedup por TOKEN ID, não actor ID. Múltiplos tokens unlinked
    // do mesmo NPC base compartilham `actor.id` (todos herdam o id do world
    // actor), mas cada um tem seu próprio synthetic actor com PV independente.
    // Deduplicar por actorId fazia só UM token ser candidato.
    const out: HealCandidate[] = [];
    const seenToken = new Set<string>();

    for (const tk of tokens) {
        if (!tk.actor) continue;
        const tid = tk.id;
        if (!tid || seenToken.has(tid)) continue;
        if (!isAuraTarget(tk, casterTokenId, casterDisp)) continue;
        if (!isTokenInsideTemplate(tk, template)) continue;

        type PVShape = { value?: number; max?: number };
        const pv = (tk.actor.system?.attributes?.pv ?? {}) as PVShape;
        const cur = Number(pv.value ?? NaN);
        const max = Number(pv.max ?? NaN);
        if (!Number.isFinite(cur) || !Number.isFinite(max)) continue;
        if (max <= 0)  continue;        // sem PV configurado
        if (cur >= max) continue;       // já cheio — pular

        const after = Math.min(max, cur + healAmount);
        out.push({
            actorId:   tk.actor?.id ?? "",
            actorName: tk.actor.name ?? tk.name ?? "Ator",
            tokenId:   tid,
            pvBefore:  cur,
            pvMax:     max,
            pvAfter:   after,
            healed:    after - cur,
        });
        seenToken.add(tid);
    }
    return out;
}

async function applyHealsAndPostCard(opts: {
    casterName:   string;
    healAmount:   number;
    candidates:   HealCandidate[];
}): Promise<void> {
    const { casterName, healAmount, candidates } = opts;
    if (candidates.length === 0) return;

    // Aplica
    const applied: HealCandidate[] = [];
    for (const c of candidates) {
        try {
            // IMPORTANTE: resolver via TOKEN (não via game.actors). Tokens
            // unlinked (NPCs) têm um synthetic actor cujo PV é separado do
            // world actor — atualizar o world actor NÃO reflete no token.
            const actor = resolveActorForCandidate(c);
            if (!actor) continue;
            await actor.update({ "system.attributes.pv.value": c.pvAfter });
            applied.push(c);
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Aura de Cura: falha ao curar ${c.actorName}:`, err);
        }
    }
    if (applied.length === 0) return;

    // Chat card resumo
    const rows = applied.map(c => `
        <li style="display:flex;justify-content:space-between;padding:2px 0;">
            <span>${escHtml(c.actorName)}</span>
            <span style="color:var(--bg3-color-success);font-weight:700;">+${c.healed}</span>
        </li>`).join("");
    const content = `
        <div class="tormenta20 chat-card item-card" style="border-color:var(--bg3-accent);">
            <header class="card-header flexrow">
                <h3 class="item-name"><div>Aura de Cura — ${escHtml(casterName)}</div></h3>
            </header>
            <div class="card-content" style="padding: 6px 10px;">
                <p style="margin: 0 0 6px;color:var(--bg3-text-muted);font-size:0.85rem;">
                    Cura: <b>${healAmount}</b> PV
                </p>
                <ul style="list-style:none;padding:0;margin:0;">${rows}</ul>
            </div>
        </div>`;
    try {
        await ChatMessage.create({ content, speaker: { alias: casterName } });
    } catch { /* ignore — cura já aplicada */ }
}

/** Dialog picker (quando setting `alwaysPromptStartOfTurn` está ativa). */
function pickHealTargetsDialog(opts: {
    casterName: string;
    candidates: HealCandidate[];
}): Promise<HealCandidate[] | null> {
    return new Promise<HealCandidate[] | null>((resolve) => {
        if (opts.candidates.length === 0) { resolve([]); return; }
        const rows = opts.candidates.map((c, i) => `
            <label class="heal-row">
                <input type="checkbox" data-idx="${i}" checked />
                <span>${escHtml(c.actorName)} <small style="color:var(--bg3-accent-muted);">(${c.pvBefore}/${c.pvMax})</small></span>
                <span class="heal-amount">+${c.healed}</span>
            </label>`).join("");
        new Dialog({
            title: `Aura de Cura — ${opts.casterName}`,
            content: `
                <div class="bg3-aura-cura-picker">
                    <p class="intro">Aliados dentro da aura — desmarque quem não curar</p>
                    ${rows}
                </div>`,
            buttons: {
                heal: {
                    icon:  '<i class="fas fa-heart"></i>',
                    label: "Curar selecionados",
                    callback: ($html: JQuery) => {
                        const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                        const idxs = Array.from(
                            (root as HTMLElement).querySelectorAll<HTMLInputElement>("input[data-idx]:checked")
                        ).map(el => Number(el.getAttribute("data-idx") ?? -1)).filter(i => i >= 0);
                        resolve(idxs.map(i => opts.candidates[i]).filter(Boolean));
                    },
                },
                skip: {
                    icon:  '<i class="fas fa-forward"></i>',
                    label: "Pular tick",
                    callback: () => resolve(null),
                },
            },
            default: "heal",
            close:   () => resolve(null),
        }, { classes: ["bg3-dialog"] }).render(true);
    });
}

// ── Aura Ardente (aprimoramento) ─────────────────────────────────────────────
//
// Quando o caster TEM o aprimoramento "Aura Ardente" entre seus poderes E sua
// Aura Sagrada está ativa, no INÍCIO DE CADA TURNO dele, mortos-vivos e
// espíritos (à sua escolha) dentro da aura sofrem dano de luz = 5 + CHA do
// caster.
//
// Detecção de undead: `actor.system.detalhes.raca === "Morto-vivo"`
// Detecção de espírito: raça contém "espír" (case+accent-insensitive). Em
// T20 não existe raça padrão "Espírito", mas mantemos a detecção robusta —
// quando aparecer, é detectado. Disposition não é checada porque o texto
// fala explicitamente "à sua escolha" (o picker resolve casos ambíguos).

/** True se o ator tem o item "Aura Ardente" entre seus poderes. */
function hasAuraArdente(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === BURNING_AURA_NORMALIZED);
}

/**
 * True se o ator é morto-vivo OU espírito (alvo da Aura Ardente).
 *
 * T20 usa DOIS lugares pra essa info no bestiário:
 *   - `detalhes.raca` = nome completo, ex. "Morto-vivo", "Espírito", "Anão"
 *   - `detalhes.tipo` = código curto, ex. "mor", "esp", "hum", "con", "ani"
 *
 * NPCs como Lich têm `raca: ""` mas `tipo: "mor"` — só checar `raca` faz a
 * detecção falhar. Ravarimm é exemplo de humanoide-morto-vivo: `raca: "Anão"`
 * + `tipo: "mor"`. A solução robusta é OU `raca` indicar morto-vivo/espírito
 * OU `tipo` ser "mor"/"esp".
 */
function isUndeadOrSpirit(actor: FoundryActor): boolean {
    type DetalhesShape = { detalhes?: { raca?: string; tipo?: string } };
    const det  = (actor.system as DetalhesShape | undefined)?.detalhes;
    const raca = typeof det?.raca === "string" ? normalizeCondName(det.raca) : "";
    const tipo = typeof det?.tipo === "string" ? det.tipo.toLowerCase().trim() : "";
    if (raca === "morto-vivo")  return true;
    if (/\bespir/.test(raca))    return true;
    if (tipo === "mor")          return true; // Lich, Ravarimm, ...
    if (tipo === "esp")          return true; // Sílfide, Nandara, ...
    return false;
}

type BurnCandidate = {
    actorId:   string;
    actorName: string;
    tokenId:   string;
    pvBefore:  number;
    damage:    number;  // dano final (sem RD — passamos applyRD=false)
};

/** Lista mortos-vivos e espíritos dentro da aura. */
function listBurnCandidates(template: AuraTpl, damage: number): BurnCandidate[] {
    const tokens = canvas?.tokens?.placeables ?? [];

    // Dedup por TOKEN ID (não actor ID) — múltiplos tokens unlinked do mesmo
    // NPC base compartilham `actor.id` mas têm PV independentes (synthetic
    // actor por token). Antes ficava só o primeiro como candidato.
    const out: BurnCandidate[] = [];
    const seenToken = new Set<string>();

    for (const tk of tokens) {
        if (!tk.actor) continue;
        const tid = tk.id;
        if (!tid || seenToken.has(tid)) continue;
        if (!isUndeadOrSpirit(tk.actor)) continue;
        if (!isTokenInsideTemplate(tk, template)) continue;

        type PVShape = { value?: number; max?: number };
        const pv = (tk.actor.system?.attributes?.pv ?? {}) as PVShape;
        const cur = Number(pv.value ?? NaN);
        if (!Number.isFinite(cur) || cur <= 0) continue; // já morto / sem PV → não inclui

        out.push({
            actorId:   tk.actor?.id ?? "",
            actorName: tk.name ?? tk.actor.name ?? "Ator",
            tokenId:   tid,
            pvBefore:  cur,
            damage,
        });
        seenToken.add(tid);
    }
    return out;
}

async function applyBurnsAndPostCard(opts: {
    casterName: string;
    damage:     number;
    candidates: BurnCandidate[];
}): Promise<void> {
    const { casterName, damage, candidates } = opts;
    if (candidates.length === 0) return;

    type ActorWithApply = FoundryActor & {
        applyDamage?(amount: number, multiplier?: number, applyRD?: boolean): Promise<unknown>;
    };
    const applied: Array<BurnCandidate & { pvAfter: number; dealt: number }> = [];
    for (const c of candidates) {
        // IMPORTANTE: resolver via TOKEN (synthetic actor pra unlinked NPCs).
        // Aparição é o caso clássico: NPC unlinked, applyDamage no world actor
        // não move o PV do token na cena.
        const actor = resolveActorForCandidate(c) as ActorWithApply | null;
        if (!actor) continue;
        try {
            // applyRD=false — dano de luz é elemental, ignora RD genérica
            await actor.applyDamage?.(damage, 1, false);
            const pvAfter = Number(actor.system?.attributes?.pv?.value ?? c.pvBefore);
            applied.push({ ...c, pvAfter, dealt: Math.max(0, c.pvBefore - pvAfter) });
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Aura Ardente: falha ao aplicar dano em ${c.actorName}:`, err);
        }
    }
    if (applied.length === 0) return;

    const rows = applied.map(c => `
        <li style="display:flex;justify-content:space-between;padding:2px 0;">
            <span>${escHtml(c.actorName)}</span>
            <span style="color:#ff8a4a;font-weight:700;">-${c.dealt}</span>
        </li>`).join("");
    const content = `
        <div class="tormenta20 chat-card item-card" style="border-color:#ff8a4a;">
            <header class="card-header flexrow">
                <h3 class="item-name"><div>Aura Ardente — ${escHtml(casterName)}</div></h3>
            </header>
            <div class="card-content" style="padding: 6px 10px;">
                <p style="margin: 0 0 6px;color:var(--bg3-text-muted);font-size:0.85rem;">
                    Dano de luz: <b>${damage}</b>
                </p>
                <ul style="list-style:none;padding:0;margin:0;">${rows}</ul>
            </div>
        </div>`;
    try {
        await ChatMessage.create({ content, speaker: { alias: casterName } });
    } catch { /* ignore — dano já aplicado */ }
}

function pickBurnTargetsDialog(opts: {
    casterName: string;
    candidates: BurnCandidate[];
}): Promise<BurnCandidate[] | null> {
    return new Promise<BurnCandidate[] | null>((resolve) => {
        if (opts.candidates.length === 0) { resolve([]); return; }
        const rows = opts.candidates.map((c, i) => `
            <label class="burn-row">
                <input type="checkbox" data-idx="${i}" checked />
                <span>${escHtml(c.actorName)} <small style="color:var(--bg3-accent-muted);">(${c.pvBefore} PV)</small></span>
                <span class="burn-amount">-${c.damage}</span>
            </label>`).join("");
        new Dialog({
            title: `Aura Ardente — ${opts.casterName}`,
            content: `
                <div class="bg3-aura-ardente-picker">
                    <p class="intro">Mortos-vivos e espíritos na aura — desmarque quem poupar</p>
                    ${rows}
                </div>`,
            buttons: {
                burn: {
                    icon:  '<i class="fas fa-fire"></i>',
                    label: "Queimar selecionados",
                    callback: ($html: JQuery) => {
                        const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                        const idxs = Array.from(
                            (root as HTMLElement).querySelectorAll<HTMLInputElement>("input[data-idx]:checked")
                        ).map(el => Number(el.getAttribute("data-idx") ?? -1)).filter(i => i >= 0);
                        resolve(idxs.map(i => opts.candidates[i]).filter(Boolean));
                    },
                },
                skip: {
                    icon:  '<i class="fas fa-forward"></i>',
                    label: "Pular tick",
                    callback: () => resolve(null),
                },
            },
            default: "burn",
            close:   () => resolve(null),
        }, { classes: ["bg3-dialog"] }).render(true);
    });
}

// ── API pública: detecção de aprimoramentos pra outros sistemas ──────────────
//
// Outros módulos (ex.: spell-resistance) precisam saber "este ator é elegível
// pra Aura Antimagia agora?" pra renderizar UI condicional. Expomos uma API
// pequena que encapsula a lógica de "ator dentro de uma aura sagrada cujo
// caster tem o aprimoramento X". Mantém spell-resistance sem ler flags
// internos do nosso template.

/** True se o ator tem o item "Aura Antimagia" entre seus poderes. */
function hasAuraAntimagia(actor: FoundryActor | null | undefined): boolean {
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
function hasAuraInvencibilidade(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === INVINCIBILITY_AURA_NORMALIZED);
}

function getCurrentSceneId(): string {
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
        console.warn(`[t20-theme-overhaul] Aura de Invencibilidade: falha ao marcar uso:`, err);
    }

    try {
        await ChatMessage.create({
            content: `
                <div class="tormenta20 chat-card item-card" style="border-color:var(--bg3-accent);">
                    <header class="card-header flexrow">
                        <h3 class="item-name"><div>Aura de Invencibilidade — ${escHtml(casterName)}</div></h3>
                    </header>
                    <div class="card-content" style="padding:6px 10px;color:var(--bg3-text-primary);">
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
            console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao debitar PM:`, err);
        }
    }

    // Cancela as auras que não couberam ser sustentadas
    if (cancelled.length > 0) {
        const scene = canvas?.scene;
        if (scene?.deleteEmbeddedDocuments) {
            try {
                await scene.deleteEmbeddedDocuments("MeasuredTemplate", cancelled.map(t => t.id));
            } catch (err) {
                console.warn(`[t20-theme-overhaul] Aura Sagrada: falha ao cancelar aura por falta de PM:`, err);
            }
        }
        // Posta aviso no chat
        const casterName = (cancelled[0].flags?.[MODULE_ID]?.["casterName"] as string | undefined)
            ?? caster.name ?? "Paladino";
        try {
            await ChatMessage.create({
                content: `
                    <div class="tormenta20 chat-card item-card" style="border-color:var(--bg3-color-danger);">
                        <header class="card-header flexrow">
                            <h3 class="item-name"><div>Aura Sagrada cancelada — sem PM</div></h3>
                        </header>
                        <div class="card-content" style="padding:6px 10px;color:var(--bg3-text-primary);">
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
// Use: `game.modules.get('aeris-bg3-rolls-t20').api.diagnoseAuras()`

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

    console.log(`[t20-theme-overhaul] DIAGNOSE AURAS:`, report);
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
