/**
 * Égide Sagrada (Paladino, T20) — Fase 5 base + aprimoramento Escudo Fraterno
 *
 * Texto base: "Você pode gastar uma ação de movimento e 2 PM para recobrir de
 * energia seu escudo ou símbolo sagrado. Até o fim da cena, você e todos os
 * aliados adjacentes somam seu Carisma na Defesa (cumulativo com outros
 * efeitos)."
 *
 * Aprimoramento "Escudo Fraterno": "Se você estiver empunhando um escudo, sua
 * Égide Sagrada afeta aliados até 9m (em vez de apenas adjacentes)."
 *
 * Diferenças em relação à Aura Sagrada (compartilha o esqueleto):
 *  - SEM sustain de PM (paga 2 PM upfront no cast — T20 já debita).
 *  - SEM tick (sem cura/dano por turno).
 *  - SEM tracking de animação do Sequencer (skill não tem autoanim de aura
 *    persistente; o autoanim, se houver, é só um burst no cast).
 *  - Raio dinâmico: 1.5m (adjacente) padrão; 9m se Escudo Fraterno + escudo
 *    equipado.
 *  - "Até fim da cena": persiste até cancel manual via skills-menu. Foundry
 *    não tem evento "scene end"; usuário cancela quando o encontro termina.
 *
 * NÃO implementado ainda (próxima fase):
 *  - Reroll de teste de resistência contra magia (nível 11+, 5 PM).
 *  - Reflexão de magia ao conjurador se passar no teste.
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

const SPELL_NAME_NORMALIZED = "egide sagrada";   // normalizeCondName remove acentos
const SPELL_KEY        = "egide-sagrada";        // identificador interno
const FLAG_SPELL       = "spell";
const FLAG_ORIGIN      = "egideSagradaTemplateOrigin";
const FLAG_CASTER      = "casterTokenId";
const FLAG_CASTER_AID  = "casterActorId";
const ESCUDO_FRATERNO_NORMALIZED = "escudo fraterno";

const RAIO_ADJACENTE_M = 1.5;   // 1 square — "adjacente"
const RAIO_ESCUDO_FRATERNO_M = 9;


// ── Detecção da Égide Sagrada e estado do caster ─────────────────────────────

function isEgideSagradaMessage(message: ChatMessage): boolean {
    // T20 nomeia o poder como "Bênção da Justiça: Égide Sagrada" (não só
    // "Égide Sagrada"). Match por substring com word boundary é mais robusto
    // e cobre eventuais variações futuras (prefixos diferentes etc).
    const name = normalizeCondName(extractSpellName(message));
    return name.includes(SPELL_NAME_NORMALIZED);
}

/** True se o ator tem "Escudo Fraterno" entre seus poderes. */
function hasEscudoFraterno(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    type ItemLike = { type?: string; name?: string };
    const items = (actor as unknown as { items?: { contents?: ItemLike[] } }).items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === ESCUDO_FRATERNO_NORMALIZED);
}

/**
 * Verifica se o ator tem escudo equipado. T20 expõe equipamento como itens
 * `type: "equipamento"`. Cobrimos as variações conhecidas (alguns templates
 * usam `system.tipo === "escudo"`, outros `system.subtipo`). Como fallback,
 * detectamos pelo nome contendo "escudo" + flag de equipado.
 */
function hasShieldEquipped(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    type ItemLike = {
        type?: string;
        name?: string;
        system?: {
            tipo?: string;
            subtipo?: string;
            equipado?: boolean;
            equipped?: boolean;
        };
    };
    const items = (actor as unknown as { items?: { contents?: ItemLike[] } }).items?.contents ?? [];
    for (const it of items) {
        if (it.type !== "equipamento") continue;
        const sys = it.system ?? {};
        const equipado = sys.equipado === true || sys.equipped === true;
        if (!equipado) continue;
        const tipo    = (sys.tipo ?? "").toString().toLowerCase();
        const subtipo = (sys.subtipo ?? "").toString().toLowerCase();
        const nome    = normalizeCondName(it.name ?? "");
        if (tipo === "escudo" || subtipo === "escudo" || /\bescudo\b/.test(nome)) {
            return true;
        }
    }
    return false;
}

function computeEgideRaioM(caster: FoundryActor): number {
    if (hasEscudoFraterno(caster) && hasShieldEquipped(caster)) {
        return RAIO_ESCUDO_FRATERNO_M;
    }
    return RAIO_ADJACENTE_M;
}

// ── Template ghost + AE apply/remove ─────────────────────────────────────────

type EgideTpl = {
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
};

function buildEgideFlags(meta: {
    casterActorId: string; casterTokenId: string; casterName: string; raioM: number;
}): Record<string, unknown> {
    return {
        [FLAG_SPELL]:       SPELL_KEY,
        [FLAG_CASTER]:      meta.casterTokenId,
        [FLAG_CASTER_AID]:  meta.casterActorId,
        casterName:         meta.casterName,
        raioM:              meta.raioM,
        creatorUserId:      game.user?.id ?? "",
        createdAtGameTime:  (game as unknown as { time?: { worldTime?: number } }).time?.worldTime ?? 0,
    };
}

async function createGhostTemplate(opts: {
    casterToken: FoundryToken;
    casterActorId: string;
    casterName: string;
    raioM: number;
}): Promise<string | null> {
    type SceneLike = FoundryActor & {
        createEmbeddedDocuments(t: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown[]>;
    };
    type CanvasLike = { scene?: SceneLike };
    const cv    = canvas as unknown as CanvasLike;
    const scene = cv.scene;
    if (!scene) return null;

    const center = getTokenCenterPx(opts.casterToken);
    const tokenId = (opts.casterToken as unknown as { id?: string }).id ?? "";

    const data = {
        t: "circle",
        user: game.user?.id,
        distance: opts.raioM,
        direction: 0,
        angle: 0,
        x: center.x,
        y: center.y,
        // Azul-prateado pra diferenciar visualmente de Aura Sagrada (dourado)
        // e Consagrar (dourado intenso).
        fillColor:  "#a8d2ff",
        borderColor: "#5a8bb8",
        flags: { [MODULE_ID]: buildEgideFlags({
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
        console.warn(`[t20-theme-overhaul] Égide Sagrada: falha ao criar template:`, err);
        return null;
    }
}

function getEgideTemplates(): EgideTpl[] {
    type SceneLike = { templates?: { contents?: EgideTpl[] } };
    const cv = canvas as unknown as { scene?: SceneLike };
    const list = cv.scene?.templates?.contents ?? [];
    return list.filter(t => t.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY);
}

function getCasterTemplates(casterTokenId: string): EgideTpl[] {
    return getEgideTemplates().filter(t =>
        t.flags?.[MODULE_ID]?.[FLAG_CASTER] === casterTokenId
    );
}

const _applyInProgress = new Set<string>();

function tokenHasEgideEffectFrom(actor: FoundryActor, templateId: string): boolean {
    return (actor.effects?.contents ?? []).some(e =>
        (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_ORIGIN] === templateId
    );
}

function buildEffectDataFromTemplate(template: EgideTpl): Record<string, unknown> | null {
    const baseRaw = template.flags?.[MODULE_ID]?.["baseEffectData"];
    if (!baseRaw) return null;
    const base = baseRaw as Record<string, unknown>;
    const cloned: Record<string, unknown> = JSON.parse(JSON.stringify(base));
    delete (cloned as Record<string, unknown>)["_id"];
    delete (cloned as Record<string, unknown>)["_stats"];
    cloned["origin"] = template.uuid;
    cloned["transfer"] = false;
    const flags = (cloned["flags"] as Record<string, Record<string, unknown>> | undefined) ?? {};
    flags[MODULE_ID] = { ...(flags[MODULE_ID] ?? {}), [FLAG_ORIGIN]: template.id };
    cloned["flags"] = flags;
    return cloned;
}

async function applyEgideToToken(token: FoundryToken, template: EgideTpl): Promise<boolean> {
    const actor = token.actor;
    if (!actor) return false;
    const actorId = (actor as unknown as { id?: string }).id ?? "";
    const lockKey = `${actorId}::${template.id}`;
    if (_applyInProgress.has(lockKey)) return false;
    if (tokenHasEgideEffectFrom(actor, template.id)) return false;
    _applyInProgress.add(lockKey);
    try {
        if (tokenHasEgideEffectFrom(actor, template.id)) return false;
        const data = buildEffectDataFromTemplate(template);
        if (!data) return false;
        await (actor as FoundryActor & {
            createEmbeddedDocuments(t: string, data: unknown[]): Promise<unknown>;
        }).createEmbeddedDocuments("ActiveEffect", [data]);
        return true;
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Égide Sagrada apply em ${actor.name}:`, err);
        return false;
    } finally {
        _applyInProgress.delete(lockKey);
    }
}

async function removeEgideFromToken(token: FoundryToken, templateId: string): Promise<boolean> {
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
        console.warn(`[t20-theme-overhaul] Égide Sagrada remove em ${actor.name}:`, err);
        return false;
    }
}

// ── Sync ─────────────────────────────────────────────────────────────────────

const _syncInProgress = new Set<string>();
const _syncPending = new Map<string, { token: FoundryToken; overrideXY?: { x?: number; y?: number } }>();

async function syncTokenWithEgides(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): Promise<void> {
    if (!isActiveGM()) return;
    if (!token.actor) return;
    const tokenId = (token as unknown as { id?: string }).id ?? "";
    if (!tokenId) return;

    if (_syncInProgress.has(tokenId)) {
        _syncPending.set(tokenId, { token, overrideXY });
        return;
    }
    _syncInProgress.add(tokenId);
    try {
        const templates = getEgideTemplates();
        if (templates.length === 0) {
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
            const casterTokenId = tpl.flags?.[MODULE_ID]?.[FLAG_CASTER] as string | undefined;
            if (!casterTokenId) continue;
            const casterToken   = findTokenForActor(
                (tpl.flags?.[MODULE_ID]?.[FLAG_CASTER_AID] as string | undefined) ?? ""
            );
            const casterDisp    = casterToken ? getTokenDisposition(casterToken) : 0;
            const eligible      = isAuraTarget(token, casterTokenId, casterDisp);
            const inside        = isTokenInsideTemplate(token, tpl, overrideXY);
            const has           = tokenHasEgideEffectFrom(token.actor, tpl.id);

            if (eligible && inside && !has)    await applyEgideToToken(token, tpl);
            if ((!eligible || !inside) && has) await removeEgideFromToken(token, tpl.id);
        }
    } finally {
        _syncInProgress.delete(tokenId);
        const pending = _syncPending.get(tokenId);
        if (pending) {
            _syncPending.delete(tokenId);
            void syncTokenWithEgides(pending.token, pending.overrideXY);
        }
    }
}

async function resyncAllTokens(overrideForToken?: {
    tokenId: string; xy: { x?: number; y?: number };
}): Promise<void> {
    if (!isActiveGM()) return;
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv = canvas as unknown as CanvasLike;
    for (const tk of (cv.tokens?.placeables ?? [])) {
        if (!tk.actor) continue;
        const tid = (tk as unknown as { id?: string }).id;
        const ov  = (overrideForToken && overrideForToken.tokenId === tid)
            ? overrideForToken.xy
            : undefined;
        await syncTokenWithEgides(tk, ov);
    }
}

async function cleanupAEsForTemplate(templateId: string): Promise<void> {
    if (!isActiveGM()) return;
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv = canvas as unknown as CanvasLike;
    const actorsSet = new Set<FoundryActor>();
    for (const a of ((game.actors?.contents ?? []) as unknown as FoundryActor[])) {
        if (a) actorsSet.add(a);
    }
    for (const tk of (cv.tokens?.placeables ?? [])) {
        if (tk.actor) actorsSet.add(tk.actor);
    }
    let removed = 0;
    for (const actor of actorsSet) {
        const ours = (actor.effects?.contents ?? []).filter(e =>
            (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_ORIGIN] === templateId
        );
        if (ours.length === 0) continue;
        try {
            await (actor as FoundryActor & {
                deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
            }).deleteEmbeddedDocuments("ActiveEffect", ours.map(e => e.id));
            removed += ours.length;
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Égide Sagrada cleanup em ${actor.name}:`, err);
        }
    }
    if (removed > 0) {
        ui.notifications?.info(`Égide Sagrada: ${removed} efeito(s) removido(s)`);
    }
}

// ── Sequencer (autoanim persistente atrelado ao token do caster) ────────────
//
// O autoanimations cria efeitos PERSISTENTES atrelados ao token do caster (não
// ao MeasuredTemplate). Pra Égide observei file pattern
// `autoanimations.static.shieldfx.energyfield.*` (escudo amarelo). Deletar o
// template NÃO encerra a animação — temos que chamar `Sequencer.EffectManager
// .endEffects({ effects: <IDs> })`.
//
// Estratégia idêntica à do Aura Sagrada: snapshot dos IDs atrelados ao caster
// ANTES do cast, depois 1.5s após. Diff = IDs novos = efeitos da Égide. Salvo
// no flag do template. No delete: termino esses IDs + fallback por file regex.

type SequencerEffectManager = {
    effects: Iterable<{ id: string; data?: { source?: unknown; file?: string } }>;
    endEffects(filter: { effects: string[] }): Promise<unknown> | unknown;
};

function getSequencerManager(): SequencerEffectManager | null {
    const g = globalThis as unknown as { Sequencer?: { EffectManager?: SequencerEffectManager } };
    return g.Sequencer?.EffectManager ?? null;
}

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

async function endSequencerEffectsByIds(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const sm = getSequencerManager();
    if (!sm) return;
    const liveIds = new Set<string>();
    for (const e of sm.effects) liveIds.add(e.id);
    const toEnd = ids.filter(id => liveIds.has(id));
    if (toEnd.length === 0) return;
    try {
        await sm.endEffects({ effects: toEnd });
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Égide Sagrada: falha ao encerrar efeitos do Sequencer:`, err);
    }
}

/**
 * FALLBACK: termina efeitos do autoanim atrelados ao caster token cujo file
 * casa o padrão de Égide (shieldfx) OU genéricos de spell/aura.
 */
async function endAutoanimEgideEffectsForCasterToken(casterTokenId: string): Promise<void> {
    if (!casterTokenId) return;
    const sm = getSequencerManager();
    if (!sm) return;
    const matchIds: string[] = [];
    for (const e of sm.effects) {
        const src = e.data?.source;
        const srcStr = typeof src === "string" ? src : "";
        if (!srcStr.includes(casterTokenId)) continue;
        const file = e.data?.file ?? "";
        // Padrão pra Égide observado: shieldfx. Cobrimos também spell/aura
        // genéricos por segurança caso o user troque a animação no autoanim.
        if (!/autoanimations.*\.(shieldfx|spell|aura)\./i.test(file)) continue;
        matchIds.push(e.id);
    }
    if (matchIds.length === 0) return;
    try {
        await sm.endEffects({ effects: matchIds });
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Égide Sagrada: fallback endEffects falhou:`, err);
    }
}

async function endEgideAnimationsForCaster(casterTokenId: string, savedIds: string[]): Promise<void> {
    const sm = getSequencerManager();
    if (!sm) return;

    if (savedIds && savedIds.length > 0) {
        await endSequencerEffectsByIds(savedIds);
    }

    await new Promise(r => setTimeout(r, 100));

    if (casterTokenId) {
        await endAutoanimEgideEffectsForCasterToken(casterTokenId);
    }
}

// ── Pipeline de cast ─────────────────────────────────────────────────────────

async function onEgideSagradaCast(message: ChatMessage): Promise<void> {
    const casterActorId = message.speaker?.actor;
    if (!casterActorId) return;
    const casterActor = game.actors?.get(casterActorId);
    if (!casterActor) return;
    const casterToken = findTokenForActor(casterActorId);
    if (!casterToken) {
        ui.notifications?.warn(
            "Égide Sagrada: token do paladino não encontrado na cena. Coloque o token e tente de novo.",
        );
        return;
    }
    const casterTokenId = (casterToken as unknown as { id?: string }).id ?? "";

    // SNAPSHOT: efeitos do Sequencer já atrelados ao caster ANTES do cast.
    // O diff posterior nos dá os IDs criados pelo autoanim pra Égide.
    const seqIdsBefore = new Set(getSequencerEffectIdsForToken(casterTokenId));

    const baseEffect = extractBaseEffectData(message);
    if (!baseEffect) {
        console.warn(`[t20-theme-overhaul] Égide Sagrada: mensagem sem effects[0][0] — abortando.`);
        return;
    }

    const raioM = computeEgideRaioM(casterActor);
    const withShield = raioM === RAIO_ESCUDO_FRATERNO_M;

    type SceneLike = { deleteEmbeddedDocuments?(t: string, ids: string[]): Promise<unknown> };
    const scene = (canvas as unknown as { scene?: SceneLike }).scene;

    // 1 caster = 1 égide ativa (recast substitui)
    const previas = getCasterTemplates(casterTokenId);
    if (previas.length > 0 && scene?.deleteEmbeddedDocuments) {
        try {
            await scene.deleteEmbeddedDocuments("MeasuredTemplate", previas.map(t => t.id));
        } catch { /* ignore */ }
    }

    const newTplId = await createGhostTemplate({
        casterToken,
        casterActorId,
        casterName: message.speaker?.alias ?? casterActor.name ?? "Paladino",
        raioM,
    });
    if (!newTplId) return;

    const tplDoc = getEgideTemplates().find(t => t.id === newTplId);
    if (!tplDoc) return;
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}.baseEffectData`]: baseEffect });
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Égide Sagrada: falha ao anexar baseEffectData:`, err);
        return;
    }

    if (isActiveGM()) await resyncAllTokens();

    // Captura IDs NOVOS do Sequencer (atrelados ao caster) — esses são os
    // efeitos que o autoanim criou pra animar a Égide. Salvamos no flag pro
    // hook deleteMeasuredTemplate encerrar a animação depois.
    void (async () => {
        await new Promise(r => setTimeout(r, 1500));
        const afterIds = getSequencerEffectIdsForToken(casterTokenId);
        const newIds = afterIds.filter(id => !seqIdsBefore.has(id));
        if (newIds.length === 0) return;
        try {
            await tplDoc.update({ [`flags.${MODULE_ID}.sequencerEffectIds`]: newIds });
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Égide Sagrada: falha ao salvar sequencerEffectIds:`, err);
        }
    })();

    ui.notifications?.info(
        `Égide Sagrada ativada (raio ${raioM}m${withShield ? " — Escudo Fraterno" : " — adjacente"}).`
    );
}

// ── Movimento do caster ──────────────────────────────────────────────────────

async function moveEgideWithCaster(
    casterToken: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): Promise<void> {
    const casterTokenId = (casterToken as unknown as { id?: string }).id ?? "";
    if (!casterTokenId) return;
    const mine = getCasterTemplates(casterTokenId);
    if (mine.length === 0) return;

    const newCenter = getTokenCenterPx(casterToken, overrideXY);
    for (const tpl of mine) {
        if (Math.abs(tpl.x - newCenter.x) < 1 && Math.abs(tpl.y - newCenter.y) < 1) continue;
        try {
            await tpl.update({ x: newCenter.x, y: newCenter.y });
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Égide Sagrada: falha ao mover template:`, err);
        }
    }
    if (isActiveGM()) {
        await resyncAllTokens({ tokenId: casterTokenId, xy: overrideXY ?? {} });
    }
}

// ── Cancelar ─────────────────────────────────────────────────────────────────

function getMyEgides(): EgideTpl[] {
    const all = getEgideTemplates();
    if (game.user?.isGM) return all;
    const uid = game.user?.id;
    if (!uid) return [];
    return all.filter(t => t.flags?.[MODULE_ID]?.["creatorUserId"] === uid);
}

async function onClickCancelEgide(): Promise<void> {
    const mine = getMyEgides();
    if (mine.length === 0) {
        ui.notifications?.info("Nenhuma Égide Sagrada ativa para cancelar.");
        refreshSkillsMenu();
        return;
    }
    type SceneLike = { deleteEmbeddedDocuments?(t: string, ids: string[]): Promise<unknown> };
    const scene = (canvas as unknown as { scene?: SceneLike }).scene;
    if (!scene?.deleteEmbeddedDocuments) return;

    // Caso simples: 1 ativa → confirmar e deletar
    if (mine.length === 1) {
        const tpl = mine[0];
        const casterName = (tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Paladino";
        new Dialog({
            title: "Cancelar Égide Sagrada",
            content: `<p>Cancelar a Égide Sagrada de <b>${escHtml(casterName)}</b>?</p>`,
            buttons: {
                yes: {
                    icon:  '<i class="fas fa-circle-xmark"></i>',
                    label: "Cancelar",
                    callback: async () => {
                        try {
                            await scene.deleteEmbeddedDocuments!("MeasuredTemplate", [tpl.id]);
                        } catch { /* ignore */ }
                    },
                },
                no: { icon: '<i class="fas fa-times"></i>', label: "Manter" },
            },
            default: "yes",
        }, { classes: ["bg3-dialog"] }).render(true);
        return;
    }

    // 2+ → picker
    const rows = mine.map(t => {
        const casterName = (t.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Paladino";
        const raio = t.flags?.[MODULE_ID]?.["raioM"] as number | undefined;
        return `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <input type="checkbox" name="egide" value="${escHtml(t.id)}" checked />
            <span><b>${escHtml(casterName)}</b> <small style="color:var(--bg3-text-muted);">(raio ${raio ?? "?"}m)</small></span>
        </label>`;
    }).join("");
    new Dialog({
        title: "Cancelar Égides Sagradas",
        content: `<form><p>Selecione quais cancelar:</p>${rows}</form>`,
        buttons: {
            yes: {
                icon:  '<i class="fas fa-circle-xmark"></i>',
                label: "Cancelar selecionadas",
                callback: async ($html: JQuery) => {
                    const ids = $html.find('input[name="egide"]:checked')
                        .map((_i, el) => (el as HTMLInputElement).value).get() as string[];
                    if (ids.length === 0) return;
                    try {
                        await scene.deleteEmbeddedDocuments!("MeasuredTemplate", ids);
                    } catch { /* ignore */ }
                },
            },
            no: { icon: '<i class="fas fa-times"></i>', label: "Manter todas" },
        },
        default: "yes",
    }, { classes: ["bg3-dialog"] }).render(true);
}

// ── Public entry ─────────────────────────────────────────────────────────────

export function setupEgideSagrada(): void {
    registerSkillAction({
        id:    "egide-sagrada-cancel",
        label: "Cancelar Égide Sagrada",
        icon:  "fa-solid fa-shield-halved",
        color: "#a8d2ff",
        isVisible: () => getMyEgides().length > 0,
        onClick:   () => onClickCancelEgide(),
    });

    // 1. Detectar cast
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        if (!isEgideSagradaMessage(message)) return;
        const uid = getMsgAuthorId(message);
        if (uid !== game.user?.id) return;
        void onEgideSagradaCast(message).then(() => refreshSkillsMenu());
    });

    // 2. Movimento de tokens
    Hooks.on("updateToken", (...args: unknown[]) => {
        if (getEgideTemplates().length === 0) return;
        const tokenDoc = args[0] as { object?: FoundryToken; id?: string; flags?: Record<string, Record<string, unknown>> };
        // Skip esfera-flamejante (token sintético da Bola de Fogo, não é criatura)
        if (tokenDoc.flags?.[MODULE_ID]?.["spell"] === "bola-de-fogo-esfera") return;
        const changes  = args[1] as Record<string, unknown> | undefined;
        const token    = tokenDoc.object;
        if (!token) return;
        const tokenId  = (token as unknown as { id?: string }).id ?? "";
        const destX = typeof changes?.["x"] === "number" ? (changes["x"] as number) : undefined;
        const destY = typeof changes?.["y"] === "number" ? (changes["y"] as number) : undefined;
        const overrideXY = (destX !== undefined || destY !== undefined)
            ? { x: destX, y: destY } : undefined;

        const isCaster = getEgideTemplates().some(t =>
            t.flags?.[MODULE_ID]?.[FLAG_CASTER] === tokenId
        );
        if (isCaster) {
            void moveEgideWithCaster(token, overrideXY);
        } else {
            void syncTokenWithEgides(token, overrideXY);
        }
    });

    // 3. Template atualizado → resync
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc  = args[0] as EgideTpl;
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

    // 4. Template deletado → encerra animação do Sequencer + cleanup AEs + refresh menu
    Hooks.on("deleteMeasuredTemplate", (...args: unknown[]) => {
        const template = args[0] as {
            id: string;
            flags?: Record<string, Record<string, unknown>>;
        };
        if (template.flags?.[MODULE_ID]?.[FLAG_SPELL] !== SPELL_KEY) return;
        const seqIds = (template.flags?.[MODULE_ID]?.["sequencerEffectIds"] as string[] | undefined) ?? [];
        const casterTokenId = (template.flags?.[MODULE_ID]?.[FLAG_CASTER] as string | undefined) ?? "";
        void endEgideAnimationsForCaster(casterTokenId, seqIds);
        void cleanupAEsForTemplate(template.id).then(() => refreshSkillsMenu());
    });

    // 5. Novo token
    Hooks.on("createToken", (...args: unknown[]) => {
        if (getEgideTemplates().length === 0) return;
        const tokenDoc = args[0] as { object?: FoundryToken };
        const token = tokenDoc.object;
        if (!token) return;
        void syncTokenWithEgides(token);
    });

    // 6. Disposition change → resync
    Hooks.on("updateToken", (...args: unknown[]) => {
        if (getEgideTemplates().length === 0) return;
        const changes = args[1] as Record<string, unknown> | undefined;
        if (changes?.["disposition"] === undefined) return;
        const tokenDoc = args[0] as { object?: FoundryToken; flags?: Record<string, Record<string, unknown>> };
        if (tokenDoc.flags?.[MODULE_ID]?.["spell"] === "bola-de-fogo-esfera") return;
        const token = tokenDoc.object;
        if (!token) return;
        void syncTokenWithEgides(token);
    });

    // 7. canvasReady → resync
    Hooks.on("canvasReady", () => {
        if (!isActiveGM()) return;
        const templates = getEgideTemplates();
        if (templates.length === 0) return;
        void resyncAllTokens();
    });

    // 8. CHA dinâmico — recomputa o bônus de Defesa da Égide quando o Carisma do
    //    caster muda (item/habilidade via Active Effect ou edição manual da ficha).
    setupChaDynamicAura({
        moduleId:      MODULE_ID,
        flagSpell:     FLAG_SPELL,
        spellKey:      SPELL_KEY,
        flagOrigin:    FLAG_ORIGIN,
        flagCasterAid: FLAG_CASTER_AID,
        label:         "Égide Sagrada",
    });
}
