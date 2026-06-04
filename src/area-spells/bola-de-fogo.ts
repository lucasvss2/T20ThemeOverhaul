/**
 * Bola de Fogo — magia de área (T20)
 *
 * FASE 1: base + aprimoramento 1 (+2 PM = +2d6)
 *  - Detecta o cast → registra "pending" para reclamar o template do T20.
 *  - Reclamado o template (esfera 6m), enumera todos os tokens dentro e
 *    dispara o modal de resistência para CADA um deles. Cada alvo rola
 *    Reflexos próprio e decide aplicar integral (falhou) ou metade (passou).
 *  - Template auto-deletado após TEMPLATE_LINGER_MS (3.5s).
 *
 * FASE 2: aprimoramento 2 (+2 PM = esfera flamejante persistente)
 *  - Muda a magia para uma esfera de 1.5m de diâmetro (raio ESFERA_RAIO_M)
 *    que persiste pela cena. Dano por hit: 3d6 + (qty imp1) × 2d6.
 *  - Posicionamento via clique no canvas (igual Consagrar).
 *  - Tick automático no INÍCIO DO TURNO do caster: cada token no espaço
 *    da esfera rola Reflexos auto, recebe metade (passa) ou integral
 *    (falha). Resultado num chat card único.
 *  - Movimento: caster arrasta o template no canvas (Foundry default
 *    permite isso pro dono). Ao mover sobre tokens, aplica dano.
 *  - "Uma criatura só pode sofrer dano uma vez por rodada": tracking
 *    via flag `damagedThisRound: { [tokenId]: round }` no template.
 *  - Cancelamento via skills-menu ("Apagar esfera flamejante").
 *  - Roll de dano original (6d6/8d6) suprimido via preCreateChatMessage —
 *    com imp 2 a explosão não acontece, só a esfera.
 *
 * FASE 3: aprimoramento 3 (+3 PM = pedra flamejante deferred)
 *  - Cast com imp 3 NÃO faz grid, NÃO rola dano, NÃO dispara resistência.
 *    Só cria um item consumível "Pedra Flamejante" no inventário do caster
 *    com a fórmula de dano stackável com imp 1 (3 + N*2)d6.
 *  - User clica no item no inventário → T20 posta chat card → nós
 *    interceptamos via flags.tormenta20.itemData[flags.MODULE_ID]:
 *    a) prompt canvas click para posicionamento
 *    b) roll de dano fresco (formula salva no item)
 *    c) cria MeasuredTemplate com nossos flags + chama dispatchExplosion
 *       (reutiliza fluxo FASE 1 inteiro: grid + resistência + auto-delete)
 *    d) deleta o item do inventário (single-charge consumível)
 *
 * Aprimoramento 1 (+2d6) é stack-compatível com imp 2 e imp 3.
 */

import { MODULE_ID } from "@/constants";
import {
    extractSpellName,
    extractItemId,
    normalizeCondName,
    getMsgAuthorId,
    parseResistance,
    extractCD,
    getTargetUserId,
    dispatchSpellResistanceToTarget,
} from "@/spell-resistance/index";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { isActiveGM, getTokenPosPx, tokensInTemplate, escHtml } from "@/_shared";
import type { SpellResistPreRollRequest } from "@/spell-resistance/types";
import {
    collectOnUseDanoBonuses,
    danoBonusToFormula,
    correctMangledDanoFormula,
    type OnUseDanoBonus,
} from "@/t20-fixes/onuse-foreign-die-dano";

// Aprimoramento próprio da magia (+2d6) — já contabilizado na fórmula base da
// esfera/pedra. Excluído dos bônus externos pra não duplicar.
const IMP1_DESC_RE = /aumenta\s+o?\s*dano\s+em\s+\+?2d6/i;

interface AEChangeLike { name?: string; changes?: Array<{ key?: string; value?: string; mode?: number }> }

/** Resolve o ator que lançou (token sintético de NPC unlinked tem prioridade). */
function resolveCasterActor(message: ChatMessage): FoundryActor | null {
    const spk = message.speaker as { token?: string; actor?: string } | undefined;
    type CanvasTokenLyr = { get(id: string): { actor: FoundryActor | null } | undefined };
    const lyr = (canvas as unknown as { tokens?: CanvasTokenLyr }).tokens;
    return lyr?.get(spk?.token ?? "")?.actor ?? game.actors?.get(spk?.actor ?? "") ?? null;
}

/**
 * Bônus de dano on-use EXTERNOS (ex.: "Tomo do Rancor: +2d8+2") aplicados ao
 * cast — excluindo o aprimoramento próprio da magia (+2d6), que já está na
 * fórmula base da esfera/pedra. Casa onUseEffects com effects do ator.
 */
function externalDanoBonuses(message: ChatMessage): OnUseDanoBonus[] {
    const actor = resolveCasterActor(message);
    const candidates = (actor?.effects?.contents ?? []) as unknown as AEChangeLike[];
    const entries = (message.flags as Record<string, unknown> | undefined)?.["tormenta20"];
    const onUse = (entries as { onUseEffects?: unknown } | undefined)?.onUseEffects;
    return collectOnUseDanoBonuses(onUse, candidates).filter(b => !IMP1_DESC_RE.test(b.description));
}

const SPELL_KEY = "bola de fogo";
const ESFERA_KEY = "bola-de-fogo-esfera";
const PEDRA_KEY = "bola-de-fogo-pedra";
const FLAG_SPELL = "spell";
const PENDING_WINDOW_MS = 30_000;
const TEMPLATE_LINGER_MS = 3500;
const ESFERA_DIAMETRO_M = 1.5;  // diâmetro em metros = 1 quadrado do tabuleiro
const ESFERA_TEXTURE = `modules/${MODULE_ID}/assets/esfera-flamejante.png`;


// ── Geometria para esfera-Token (FASE 2 — esfera flamejante) ────────────────
//
// A esfera flamejante é representada por um Token sintético (actorLink:false)
// de 1×1 quadrado, ocupando UM espaço de tabuleiro. Detecção de "criatura no
// mesmo espaço" é AABB: centro do token-criatura deve cair dentro do
// retângulo do token-esfera. Token-esferas são excluídas dos alvos pelo
// flag spell:"bola-de-fogo-esfera".

function tokenIsEsfera(token: FoundryToken): boolean {
    type WithDoc = { document?: { flags?: Record<string, Record<string, unknown>> }; flags?: Record<string, Record<string, unknown>> };
    const t = token as unknown as WithDoc;
    const flags = t.document?.flags ?? t.flags;
    return flags?.[MODULE_ID]?.[FLAG_SPELL] === ESFERA_KEY;
}

function isTokenInEsferaBounds(
    token: FoundryToken,
    esferaPx: { x: number; y: number; width: number; height: number },
): boolean {
    type CanvasLike = { scene?: { grid?: { size?: number } } };
    const cv       = canvas as unknown as CanvasLike;
    const gridSize = cv.scene?.grid?.size ?? 100;
    const pos      = getTokenPosPx(token);

    // Caixa (AABB) da criatura em pixels — cobre TODOS os quadrados ocupados.
    const cx = pos.x;
    const cy = pos.y;
    const cw = pos.widthSq  * gridSize;
    const ch = pos.heightSq * gridSize;

    // A esfera (1 quadrado) acerta se sua caixa INTERSECTA a caixa da criatura,
    // não apenas se o centro da criatura cai dentro da esfera. Isso faz a esfera
    // acertar criaturas Grandes/Enormes/Colossais em QUALQUER quadrado ocupado.
    // EPS evita falso-positivo em adjacência exata (bordas que só se tocam) e
    // grazing durante o movimento.
    const eps = gridSize * 0.1;
    return cx           < esferaPx.x + esferaPx.width  - eps
        && cx + cw      > esferaPx.x                   + eps
        && cy           < esferaPx.y + esferaPx.height - eps
        && cy + ch      > esferaPx.y                   + eps;
}

/**
 * Tokens-criatura cujo centro cai dentro dos bounds do esfera-token.
 * Exclui o próprio esfera-token (e qualquer outro com nossa flag).
 */
function tokensInEsfera(esferaPx: { x: number; y: number; width: number; height: number }): FoundryToken[] {
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv     = canvas as unknown as CanvasLike;
    const tokens = cv.tokens?.placeables ?? [];
    return tokens.filter(t => !tokenIsEsfera(t) && isTokenInEsferaBounds(t, esferaPx));
}

/** Converte width/height de grid-units pra pixels (Token v13). */
function tokenBoundsPx(token: { x: number; y: number; width: number; height: number }): {
    x: number; y: number; width: number; height: number;
} {
    type CanvasLike = { scene?: { grid?: { size?: number } } };
    const cv       = canvas as unknown as CanvasLike;
    const gridSize = cv.scene?.grid?.size ?? 100;
    return {
        x:      token.x,
        y:      token.y,
        width:  token.width  * gridSize,
        height: token.height * gridSize,
    };
}

// ── Detecção de aprimoramentos ───────────────────────────────────────────────

type OnUseEntry = { cost?: number; qty?: number; description?: string };

function getOnUseEffects(message: ChatMessage): OnUseEntry[] {
    const t20 = (message.flags as Record<string, unknown> | undefined)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    return Array.isArray(raw) ? raw as OnUseEntry[] : [];
}

function getOnUseEffectsFromData(data: Record<string, unknown>): OnUseEntry[] {
    const flags = data["flags"] as Record<string, unknown> | undefined;
    const t20   = flags?.["tormenta20"] as { onUseEffects?: unknown } | undefined;
    const raw   = t20?.onUseEffects;
    return Array.isArray(raw) ? raw as OnUseEntry[] : [];
}

function detectImp1Qty(entries: OnUseEntry[]): number {
    for (const e of entries) {
        const qty = Number(e?.qty ?? 0);
        if (!Number.isFinite(qty) || qty < 1) continue;
        const desc = String(e?.description ?? "");
        // "aumenta o dano em +2d6"
        if (/aumenta\s+o?\s*dano\s+em\s+\+?2d6/i.test(desc)) return qty;
    }
    return 0;
}

function detectImp2Active(entries: OnUseEntry[]): boolean {
    for (const e of entries) {
        const qty = Number(e?.qty ?? 0);
        if (!Number.isFinite(qty) || qty < 1) continue;
        const desc = String(e?.description ?? "");
        // "muda a área para efeito de esfera flamejante..."
        if (/esfera\s+flamejante/i.test(desc)) return true;
    }
    return false;
}

/**
 * Detecta o aprimoramento 3 (+3 PM = Pedra Flamejante deferred).
 *
 * Estratégia robusta: tenta múltiplos padrões textuais comuns que o T20
 * pode usar pra descrever "a magia se concentra em uma pedra". Exclui
 * explicitamente os padrões de imp 1 e imp 2 antes de tentar imp 3.
 *
 * Adiciona log de diagnóstico (console.warn) quando detecta, para que o
 * usuário possa confirmar via DevTools que a detecção funcionou. Remover
 * o log após validação em produção.
 */
function detectImp3Active(entries: OnUseEntry[]): boolean {
    for (const e of entries) {
        const qty = Number(e?.qty ?? 0);
        if (!Number.isFinite(qty) || qty < 1) continue;
        const desc = String(e?.description ?? "");
        // Não confundir com imp1/imp2
        if (/aumenta\s+o?\s*dano\s+em\s+\+?2d6/i.test(desc)) continue;
        if (/esfera\s+flamejante/i.test(desc))               continue;
        // Padrões de imp 3 (pedra flamejante / concentra em pedra)
        if (/pedra\s*flamejante/i.test(desc))                return true;
        if (/concentra(?:r|do|m|-?se)?\s+em\s+uma?\s+pedra/i.test(desc)) return true;
        if (/torna(?:r|-?se)?\s+uma?\s+pedra/i.test(desc))   return true;
        if (/transforma(?:r|-?se)?\s+em\s+uma?\s+pedra/i.test(desc)) return true;
        // Fallback: qualquer menção a "pedra" + alusão a "não explode" / "carrega"
        if (/pedra/i.test(desc) && (/n[ãa]o\s+explode/i.test(desc) || /carrega/i.test(desc) || /arremess/i.test(desc))) return true;
        // Último recurso: cost = 3 PM + menção a "pedra"
        const cost = Number(e?.cost ?? 0);
        if (cost === 3 && /pedra/i.test(desc)) return true;
    }
    return false;
}


// ── Pending cast (FASE 1 — explosão one-shot) ────────────────────────────────

type PendingCast = {
    casterActorId: string;
    casterName:    string;
    casterUserId:  string;
    messageId:     string;
    damageTotal:   number;
    damageFormula: string;
    cd:            number;
    resistTxt:     string;
    spellName:     string;
    ts:            number;
};
const _pendingCasts = new Map<string, PendingCast>();
// Marcador para templates do T20 que devem ser deletados imediatamente (FASE 2 —
// a área padrão é substituída pelo esfera-Token; o MeasuredTemplate não é usado).
const _pendingEsferaTemplateDelete = new Map<string, number>(); // userId → timestamp

// Tracking de templates criados pelo usuário nos últimos 5s — usado pra
// "sweep" de templates órfãos em FASE 2/3, cobrindo race condition onde
// createMeasuredTemplate roda ANTES de preCreateChatMessage (T20 cria template
// antes da chat msg em alguns fluxos, então nosso flag não está setado a tempo).
type RecentTemplate = { id: string; ts: number };
const _recentTemplatesByUser = new Map<string, RecentTemplate[]>();
const TPL_TRACK_WINDOW_MS = 5000;

function trackRecentTemplate(authorUid: string, tplId: string): void {
    const now    = Date.now();
    const cutoff = now - TPL_TRACK_WINDOW_MS;
    const arr    = (_recentTemplatesByUser.get(authorUid) ?? []).filter(t => t.ts >= cutoff);
    arr.push({ id: tplId, ts: now });
    _recentTemplatesByUser.set(authorUid, arr);
}

function sweepRecentUnflaggedTemplates(authorUid: string): void {
    const arr = _recentTemplatesByUser.get(authorUid);
    if (!arr || arr.length === 0) return;
    type TplDoc = {
        flags?: Record<string, Record<string, unknown>>;
        delete?(): Promise<unknown>;
    };
    type CanvasLike = { scene?: { templates?: { get(id: string): TplDoc | undefined } } };
    const cv     = canvas as unknown as CanvasLike;
    const cutoff = Date.now() - TPL_TRACK_WINDOW_MS;
    const remaining: RecentTemplate[] = [];
    for (const r of arr) {
        if (r.ts < cutoff) continue;
        const t = cv.scene?.templates?.get(r.id);
        if (!t) continue;
        const ourFlag = t.flags?.[MODULE_ID]?.[FLAG_SPELL];
        if (ourFlag) { remaining.push(r); continue; } // já é nosso → mantém
        void t.delete?.();
    }
    _recentTemplatesByUser.set(authorUid, remaining);
}

function registerPendingCast(uid: string, cast: Omit<PendingCast, "ts">): void {
    _pendingCasts.set(uid, { ...cast, ts: Date.now() });
}

// ── Template flags ───────────────────────────────────────────────────────────

function buildBolaDeFogoFlags(meta: PendingCast): Record<string, unknown> {
    return {
        [FLAG_SPELL]:   SPELL_KEY,
        casterActorId:  meta.casterActorId,
        casterName:     meta.casterName,
        casterUserId:   meta.casterUserId,
        messageId:      meta.messageId,
        damageTotal:    meta.damageTotal,
        damageFormula:  meta.damageFormula,
        cd:             meta.cd,
        resistTxt:      meta.resistTxt,
        spellName:      meta.spellName,
        createdAtMs:    Date.now(),
        dispatched:     false,
    };
}

async function claimTemplate(
    tplDoc: { update(data: Record<string, unknown>): Promise<unknown> },
    pending: PendingCast,
): Promise<void> {
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}`]: buildBolaDeFogoFlags(pending) });
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Bola de Fogo: falha ao reclamar template:`, err);
    }
}

// ── FASE 1: Dispatch explosão ────────────────────────────────────────────────

async function dispatchExplosion(tplDoc: {
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
    delete?(): Promise<unknown>;
}): Promise<void> {
    const flags = tplDoc.flags?.[MODULE_ID];
    if (!flags || flags[FLAG_SPELL] !== SPELL_KEY) return;
    if (flags["dispatched"] === true) return;

    try {
        await tplDoc.update({ [`flags.${MODULE_ID}.dispatched`]: true });
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Bola de Fogo: falha ao marcar dispatched:`, err);
    }

    const tokens = tokensInTemplate({ x: tplDoc.x, y: tplDoc.y, distance: tplDoc.distance });

    const casterName    = (flags["casterName"]    as string) ?? "Lançador";
    const casterUserId  = (flags["casterUserId"]  as string) ?? "";
    const messageId     = (flags["messageId"]     as string) ?? "";
    const damageTotal   = (flags["damageTotal"]   as number) ?? 0;
    const damageFormula = (flags["damageFormula"] as string) ?? "";
    const cd            = (flags["cd"]            as number) ?? 0;
    const resistTxt     = (flags["resistTxt"]     as string) ?? "Reflexos reduz à metade";
    const spellName     = (flags["spellName"]     as string) ?? "Bola de Fogo";

    const { skill, outcome } = parseResistance(resistTxt);

    if (tokens.length === 0) {
        ui.notifications?.info(`Bola de Fogo: nenhum alvo na área (${damageTotal} de dano rolado).`);
    } else {
        ui.notifications?.info(`Bola de Fogo explode! ${damageTotal} de dano em ${tokens.length} alvo(s).`);
    }

    type RandomIDFn = () => string;
    const rid = (globalThis as unknown as { randomID?: RandomIDFn }).randomID
             ?? (() => Math.random().toString(36).slice(2, 18));

    for (const token of tokens) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        const targetUserId = getTargetUserId(targetActor);
        if (!targetUserId) {
            ui.notifications?.warn(`Bola de Fogo: nenhum usuário ativo para ${targetActor.name}.`);
            continue;
        }
        const preReq: SpellResistPreRollRequest = {
            type:              "spell-resist-preroll",
            requestId:         rid(),
            targetUserId,
            casterUserId,
            targetActorId:     targetActor.id,
            targetActorUuid:   targetActor.uuid,
            casterName,
            spellName,
            resistTxt,
            resistSkill:       skill,
            resistOutcome:     outcome,
            cd,
            messageId,
            damageTotal,
            damageFormula,
            isHeal:            false,
            maxHealValue:      0,
            removeFadiga:      false,
            truqueAtivo:       false,
            conditions:        [],
            customEffectNames: [],
        };
        dispatchSpellResistanceToTarget(preReq);
    }

    setTimeout(() => {
        void tplDoc.delete?.();
    }, TEMPLATE_LINGER_MS);
}

// ── FASE 2: Esfera Flamejante persistente ────────────────────────────────────

type EsferaMeta = {
    casterActorId:    string;
    casterName:       string;
    casterUserId:     string;
    cd:               number;
    resistTxt:        string;
    damageFormula:    string;     // "3d6", "5d6", "7d6" etc
    imp1Qty:          number;
    spellName:        string;
};

function buildEsferaFlags(meta: EsferaMeta): Record<string, unknown> {
    return {
        [FLAG_SPELL]:   ESFERA_KEY,
        casterActorId:  meta.casterActorId,
        casterName:     meta.casterName,
        casterUserId:   meta.casterUserId,
        cd:             meta.cd,
        resistTxt:      meta.resistTxt,
        damageFormula:  meta.damageFormula,
        imp1Qty:        meta.imp1Qty,
        spellName:      meta.spellName,
        createdAtMs:    Date.now(),
        creatorUserId:  game.user?.id ?? "",
        damagedThisRound: {} as Record<string, number>,
    };
}

/**
 * Promise que resolve quando o usuário clica no canvas (ou ESC cancela).
 * Copiado do Consagrar — mesmo padrão.
 */
async function promptCanvasClick(label: string): Promise<{ x: number; y: number } | null> {
    return new Promise((resolve) => {
        ui.notifications?.info(label);
        type StageLike = {
            once?(event: string, fn: (e: unknown) => void): void;
            on?(event: string, fn: (e: unknown) => void): void;
            off?(event: string, fn: (e: unknown) => void): void;
        };
        type CanvasLike = { app?: { stage?: StageLike }; stage?: StageLike };
        const cv = canvas as unknown as CanvasLike;
        const stage = cv.app?.stage ?? cv.stage;
        if (!stage?.on || !stage?.off) { resolve(null); return; }

        const clickHandler = (event: unknown) => {
            const ev = event as { data?: { getLocalPosition(target: unknown): { x: number; y: number } } };
            const local = ev.data?.getLocalPosition(stage);
            cleanup();
            if (local) resolve({ x: local.x, y: local.y });
            else       resolve(null);
        };
        const keyHandler = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cleanup();
                ui.notifications?.info("Esfera Flamejante: posicionamento cancelado");
                resolve(null);
            }
        };
        function cleanup(): void {
            stage?.off?.("pointerdown", clickHandler);
            document.removeEventListener("keydown", keyHandler, true);
        }
        stage.on("pointerdown", clickHandler);
        document.addEventListener("keydown", keyHandler, true);
    });
}

/**
 * Constrói os dados do Token da esfera flamejante (sem persistir).
 *
 * O Token é SINTÉTICO (actorLink:false) e referencia o actor do caster.
 * Player tem permissão TOKEN_CREATE e OWNER no caster → consegue criar
 * direto sem precisar de GM (era o problema com Tile, que é GAMEMASTER-only
 * por design do Foundry).
 *
 * Display ajustado pra parecer um efeito mágico (sem nameplate, sem barras
 * de PV, disposition neutra, texture é a PNG da bola de fogo).
 */
function buildEsferaTokenData(
    sceneGrid: { size?: number; distance?: number } | undefined,
    pos: { x: number; y: number },
    meta: EsferaMeta,
): Record<string, unknown> {
    const gridSize = sceneGrid?.size     ?? 100;
    const gridDist = sceneGrid?.distance ?? 1.5;
    // Token.width/height são em GRID UNITS (quadrados), não pixels.
    const gridUnits = ESFERA_DIAMETRO_M / gridDist; // = 1 pra grid 1.5m

    // Snap pra grid: token alinhado no quadrado onde clicou.
    const snappedX = Math.floor(pos.x / gridSize) * gridSize;
    const snappedY = Math.floor(pos.y / gridSize) * gridSize;

    return {
        name:        "Esfera Flamejante",
        x:           snappedX,
        y:           snappedY,
        width:       gridUnits,
        height:      gridUnits,
        actorId:     meta.casterActorId,
        actorLink:   false,   // sintético — não afeta o actor base do caster
        texture:     { src: ESFERA_TEXTURE, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 },
        displayName: 0,       // nunca mostrar nameplate
        displayBars: 0,       // nunca mostrar barras
        bar1:        { attribute: "" },
        bar2:        { attribute: "" },
        disposition: 0,       // neutro (sem borda de cor de afinidade)
        hidden:      false,
        locked:      false,
        flags:       { [MODULE_ID]: buildEsferaFlags(meta) },
    };
}

async function placeEsfera(meta: EsferaMeta): Promise<void> {
    const pos = await promptCanvasClick(
        `Clique no canvas para posicionar a Esfera Flamejante (1.5m de diâmetro). ESC cancela.`,
    );
    if (!pos) return;

    type SceneLike = {
        id?: string;
        grid?: { size?: number; distance?: number };
        createEmbeddedDocuments(t: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown[]>;
    };
    type CanvasLike = { scene?: SceneLike };
    const cv    = canvas as unknown as CanvasLike;
    const scene = cv.scene;
    if (!scene) {
        ui.notifications?.error("Esfera Flamejante: nenhuma cena ativa");
        return;
    }

    const tokenData = buildEsferaTokenData(scene.grid, pos, meta);
    try {
        await scene.createEmbeddedDocuments("Token", [tokenData]);
        ui.notifications?.info(`Esfera Flamejante criada (${meta.damageFormula} por hit). Arraste o token pra mover.`);
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Esfera Flamejante: falha ao criar token:`, err);
        ui.notifications?.error("Esfera Flamejante: falha ao criar token (veja console).");
    }
}

/**
 * Samplea posições ao longo do segmento (fromPx → toPx) para coletar
 * tokens-criatura que a esfera intersecta em qualquer ponto do trajeto.
 * Step = gridSize/4 (4 samples por quadrado) — fino o suficiente pra
 * pegar tokens menores em diagonais.
 */
function tokensAlongPath(
    fromPx: { x: number; y: number },
    toPx:   { x: number; y: number },
    esferaW: number,
    esferaH: number,
): FoundryToken[] {
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
        return tokensInEsfera({ x: fromPx.x, y: fromPx.y, width: esferaW, height: esferaH });
    }
    type CanvasLike = { scene?: { grid?: { size?: number } } };
    const cv       = canvas as unknown as CanvasLike;
    const gridSize = cv.scene?.grid?.size ?? 100;
    const steps    = Math.max(1, Math.ceil(dist / (gridSize / 4)));
    const seen     = new Set<string>();
    const result: FoundryToken[] = [];
    for (let i = 0; i <= steps; i++) {
        const t  = i / steps;
        const sx = fromPx.x + dx * t;
        const sy = fromPx.y + dy * t;
        for (const tok of tokensInEsfera({ x: sx, y: sy, width: esferaW, height: esferaH })) {
            const tid = (tok as unknown as { document?: { id?: string }; id?: string }).document?.id
                     ?? (tok as unknown as { id?: string }).id
                     ?? "";
            if (tid && !seen.has(tid)) {
                seen.add(tid);
                result.push(tok);
            }
        }
    }
    return result;
}

/**
 * Aplica dano da esfera nos tokens-alvo:
 *  - Filtra "1x por rodada" via flag damagedThisRound:{tokId:round}
 *  - Rola damageFormula UMA VEZ (todos os alvos veem o mesmo damageTotal)
 *  - Dispatcha o MODAL DE RESISTÊNCIA pra cada alvo (não auto-roll); cada
 *    dono decide se aplica metade (passou Reflexos) ou integral (falhou)
 *  - Posta um chat card-resumo listando damage rolada + alvos afetados
 *  - Atualiza damagedThisRound no token-esfera
 *
 * GM-side only via isActiveGM (player não tem permissão de aplicar dano em
 * NPCs alheios; o modal é dispatchado via socketlib ao dono de cada alvo).
 *
 * `affectedTokens` opcional: usa essa lista (ex.: tokens no trajeto do
 * movimento). Sem ela, usa tokens na posição atual da esfera (tick por turno).
 */
async function applyEsferaDamage(esferaTokenDoc: {
    id: string; uuid: string; x: number; y: number; width: number; height: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
}, trigger: "turn-start" | "moved" | "placed", affectedTokens?: FoundryToken[]): Promise<void> {
    const flags = esferaTokenDoc.flags?.[MODULE_ID];
    if (!flags || flags[FLAG_SPELL] !== ESFERA_KEY) return;

    // GM-side only: aplica via modal-dispatch (socketlib executa nos donos).
    // Multi-GM dedup via isActiveGM (lowest sorted userId).
    if (!isActiveGM()) return;

    const round         = (game as unknown as { combat?: { round?: number } }).combat?.round ?? 0;
    const damaged       = (flags["damagedThisRound"] as Record<string, number> | undefined) ?? {};
    const damageFormula = (flags["damageFormula"]    as string) ?? "3d6";
    const cd            = (flags["cd"]               as number) ?? 0;
    const casterName    = (flags["casterName"]       as string) ?? "Lançador";
    const casterUserId  = (flags["casterUserId"]     as string) ?? "";
    const resistTxt     = (flags["resistTxt"]        as string) ?? "Reflexos reduz à metade";
    const spellName     = (flags["spellName"]        as string) ?? "Bola de Fogo (Esfera Flamejante)";

    const tokens = affectedTokens ?? tokensInEsfera(tokenBoundsPx(esferaTokenDoc));
    if (tokens.length === 0) return;

    // Dedup + filtra "1x por rodada"
    const seen = new Set<string>();
    const targets: FoundryToken[] = [];
    for (const t of tokens) {
        if (!t.actor) continue;
        const tokId = (t as unknown as { document?: { id?: string }; id?: string }).document?.id
                   ?? (t as unknown as { id?: string }).id
                   ?? "";
        if (!tokId || seen.has(tokId)) continue;
        seen.add(tokId);
        if (damaged[tokId] === round) continue;
        targets.push(t);
    }
    if (targets.length === 0) return;

    // Rola dano UMA VEZ — todos os alvos veem o mesmo damageTotal no modal
    type RollCtor = new (formula: string) => Roll & { evaluate(opts?: object): Promise<Roll> };
    const RollCls = (globalThis as unknown as { Roll: RollCtor }).Roll;
    const dmgRoll = new RollCls(damageFormula);
    await dmgRoll.evaluate({ async: true } as never);
    const damageTotal = dmgRoll.total ?? 0;

    const { skill, outcome } = parseResistance(resistTxt);
    const newDamaged: Record<string, number> = { ...damaged };

    type RandomIDFn = () => string;
    const rid = (globalThis as unknown as { randomID?: RandomIDFn }).randomID
             ?? (() => Math.random().toString(36).slice(2, 18));

    const targetNames: string[] = [];
    for (const token of targets) {
        const actor = token.actor;
        if (!actor) continue;
        const targetUserId = getTargetUserId(actor);
        if (!targetUserId) continue;
        const tokId = (token as unknown as { document?: { id?: string }; id?: string }).document?.id
                   ?? (token as unknown as { id?: string }).id
                   ?? "";
        if (tokId) newDamaged[tokId] = round;
        targetNames.push(token.name ?? actor.name ?? "Alvo");

        const preReq: SpellResistPreRollRequest = {
            type:              "spell-resist-preroll",
            requestId:         rid(),
            targetUserId,
            casterUserId,
            targetActorId:     actor.id,
            targetActorUuid:   actor.uuid,
            casterName,
            spellName,
            resistTxt,
            resistSkill:       skill,
            resistOutcome:     outcome,
            cd,
            messageId:         "",
            damageTotal,
            damageFormula,
            isHeal:            false,
            maxHealValue:      0,
            removeFadiga:      false,
            truqueAtivo:       false,
            conditions:        [],
            customEffectNames: [],
        };
        dispatchSpellResistanceToTarget(preReq);
    }

    try {
        await esferaTokenDoc.update({ [`flags.${MODULE_ID}.damagedThisRound`]: newDamaged });
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Esfera Flamejante: falha ao salvar damagedThisRound:`, err);
    }

    // Posta um chat card-resumo com o dano rolado + lista de alvos
    if (targetNames.length > 0) {
        await postEsferaSummaryCard(casterName, trigger, dmgRoll, damageTotal, cd, targetNames);
    }
}

async function postEsferaSummaryCard(
    casterName: string,
    trigger: "turn-start" | "moved" | "placed",
    dmgRoll: Roll,
    _damageTotal: number,
    cd: number,
    targetNames: string[],
): Promise<void> {
    const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const triggerLabel =
        trigger === "turn-start" ? "Início do turno do conjurador" :
        trigger === "placed"     ? "Esfera invocada sobre a criatura" :
                                   "Movimento da esfera";
    const targetsHtml = targetNames.map(n =>
        `<span style="display:inline-block; padding:2px 8px; margin:2px; background:rgba(var(--bg3-color-danger-rgb),0.12); border:1px solid rgba(var(--bg3-color-danger-rgb),0.35); border-radius:3px; color:var(--bg3-accent-bright); font-size:0.82rem;">${esc(n)}</span>`
    ).join("");
    const rollRendered = await dmgRoll.render();

    const content = `
        <div class="t20-theme-chat-card" style="padding:10px 12px; background:linear-gradient(180deg, rgba(var(--bg3-color-danger-rgb),0.10) 0%, transparent 100%); border-left:3px solid #cc4422;">
            <div style="color:#cc4422; font-size:0.7rem; letter-spacing:0.14em; text-transform:uppercase; font-weight:700;">Esfera Flamejante — ${esc(casterName)}</div>
            <div style="color:var(--bg3-accent-muted); font-size:0.65rem; letter-spacing:0.1em; text-transform:uppercase; font-style:italic; margin: 2px 0 8px;">${triggerLabel}</div>
            <div style="margin-bottom:8px;">${rollRendered}</div>
            <div style="color:var(--bg3-accent-muted); font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px;">Alvos atingidos (${targetNames.length}) — cada dono rola Reflexos no modal:</div>
            <div>${targetsHtml}</div>
            <div style="color:var(--bg3-text-muted); font-size:0.75rem; font-style:italic; margin-top:6px;">CD ${cd} · Falhar = dano integral, passar = metade</div>
        </div>`;
    type CMCreate = { create(data: Record<string, unknown>): Promise<unknown> };
    await (ChatMessage as unknown as CMCreate).create({
        content,
        rolls:   [dmgRoll.toJSON()],
        type:    5,
        speaker: { alias: casterName },
        flags:   { [MODULE_ID]: { esferaFlamejante: true } },
    });
}


// ── FASE 3: Pedra Flamejante via T20 brew (deferred) ─────────────────────────
//
// Arquitetura: T20 já tem o mecanismo "Preparar Poção" (brew) que clona uma
// magia num item consumível tipo "Granada" com TODAS as propriedades baked in
// (rolls, area, resistencia, alcance). Ao usar a granada, T20 nativo:
//  - rola dano via item.rollDamage (sem que a gente faça nada)
//  - cria MeasuredTemplate via AbilityTemplate.fromItem (linha 7058 do T20)
//  - posta chat card via item.displayCard
//
// Estratégia para Ap3:
//  1. Monkey-patch `game.tormenta20.applications.AbilityUseDialog.create`
//  2. Quando o user marca Ap3 da Bola de Fogo e clica "Lançar Magia",
//     interceptamos o resultado do dialog e forçamos `result.brew = true`.
//  3. T20 entra no brew branch (linha 7014 do tormenta20.mjs) — esse branch
//     RETORNA antes de criar template (linha 7057), então o grid NÃO aparece.
//  4. T20 cria o consumível "Granada de [Bola de Fogo]" com cost=0 e qtd=1.
//  5. Nosso hook `createItem` detecta esse novo consumível por nome e:
//     - renomeia pra "Pedra Flamejante"
//     - troca icon pra esfera-flamejante.png
//     - adiciona flag PEDRA_KEY (pra detectarmos no uso posterior)
//  6. User clica no item → T20 dispara seu fluxo nativo (template + dano).
//  7. Nosso hook em createChatMessage detecta msg com PEDRA_KEY flag e
//     reivindica o template criado pelo T20 (via _recentTemplatesByUser),
//     deixando o dispatchExplosion existente cuidar da resistência.

interface AbilityUseDialogLike {
    create: (item: unknown, ...args: unknown[]) => Promise<Record<string, unknown> | null>;
}

// Captura o CD da magia no momento exato do cast (depois que applyOnUseEffects
// rodou dentro do callback do dialog). Esse CD é o "real" — inclui bônus de
// items via Active Effects + bônus de aprimoramentos como Fortalecimento Arcano.
// Lido pelo createItem hook quando T20 cria a granada do brew.
type PedraPendingCD = {
    cd: number;
    resistTxt: string;
    ts: number;
    /** Bônus de dano de face estrangeira (ex.: Tomo +2d8) capturados no cast, pra
     *  corrigir a fórmula mangleada que o T20 baka na pedra (createItem). */
    foreignBonuses?: Array<{ count: number; faces: number; dmgType: string }>;
    /** Face base do dado de dano da magia (ex.: 6 pra Bola de Fogo). */
    baseFace?: number;
};
const _pendingPedraCDs = new Map<string, PedraPendingCD>();

function patchAbilityUseDialog(): void {
    type T20Global = {
        applications?: { AbilityUseDialog?: AbilityUseDialogLike & { _bg3PatchedForAp3?: boolean } };
    };
    const t20 = (game as unknown as { tormenta20?: T20Global }).tormenta20;
    const Dlg = t20?.applications?.AbilityUseDialog;
    if (!Dlg) {
        console.warn(`[t20-theme-overhaul] AbilityUseDialog não encontrado — Pedra Flamejante (Ap3) desabilitada.`);
        return;
    }
    if (Dlg._bg3PatchedForAp3) return;
    const origCreate = Dlg.create.bind(Dlg);
    Dlg.create = async function(item: unknown, ...args: unknown[]) {
        const result = await origCreate(item, ...args);
        if (!result || typeof result !== "object") return result;
        const itemTyped = item as { name?: string; type?: string };
        const isBolaDeFogo = itemTyped.type === "magia"
            && normalizeCondName(itemTyped.name ?? "").includes("bola de fogo");
        if (!isBolaDeFogo) return result;

        const resTyped = result as { onUseEffects?: Array<Record<string, unknown>>; brew?: boolean };
        const onUseEffects = Array.isArray(resTyped.onUseEffects) ? resTyped.onUseEffects : [];
        const ap3Active = onUseEffects.some(ef => {
            const qty = Number((ef as { qty?: unknown }).qty ?? 0);
            if (!Number.isFinite(qty) || qty < 1) return false;
            const desc = String((ef as { description?: unknown }).description ?? "");
            // Skip imp1/imp2 patterns
            if (/aumenta\s+o?\s*dano\s+em\s+\+?2d6/i.test(desc)) return false;
            if (/esfera\s+flamejante/i.test(desc))               return false;
            // imp 3 patterns
            return /pedra\s*flamejante/i.test(desc)
                || /concentra(?:r|do|m|-?se)?\s+em\s+uma?\s+pedra/i.test(desc)
                || /torna(?:r|-?se)?\s+uma?\s+pedra/i.test(desc)
                || /transforma(?:r|-?se)?\s+em\s+uma?\s+pedra/i.test(desc)
                || /descarreg/i.test(desc)
                || (Number((ef as { cost?: unknown }).cost ?? 0) === 3 && /pedra/i.test(desc));
        });

        if (ap3Active) {
            resTyped.brew = true;
            // ── Captura do CD no momento do cast ──
            // T20's prepareFinalAttributes (item) usa `10 + nivel/2 + atributo + bonus`,
            // o que IGNORA bônus de items via Active Effects (ex: Foco Arcano +1 CD).
            // O valor correto está em `actor.system.attributes.cd` (que JÁ inclui todos
            // os modificadores aplicados ao actor pelos items/AEs).
            //
            // Logo, CD correto = actor.attributes.cd + atributo_conjuracao_mod + bonus_de_aprimoramentos.
            // - actor.attributes.cd  = 10 + nivel/2 + Foco Arcano + outros AEs
            // - atributo_mod         = INT/SAB/CAR do conjurador
            // - bonus                = resistencia.bonus do clone (já modificado por Fortalecimento etc.)
            type ItemWithSystem = {
                actor?: {
                    id?: string;
                    system?: {
                        attributes?: { cd?: number; conjuracao?: string };
                        atributos?:  Record<string, { value?: number } | undefined>;
                    };
                };
                system?: { resistencia?: { cd?: number; txt?: string; bonus?: number; atributo?: string } };
            };
            const itemTyped2 = item as ItemWithSystem;
            const itemSys    = itemTyped2.system;
            const actor      = itemTyped2.actor;
            const actorSys   = actor?.system;
            const resistTxt  = String(itemSys?.resistencia?.txt ?? "Reflexos reduz à metade");

            // Resolve atributo de conjuracao (do item se setado, senão do actor)
            const atrKey = String(
                itemSys?.resistencia?.atributo
                || actorSys?.attributes?.conjuracao
                || "int",
            );
            const actorAttrCD = Number(actorSys?.attributes?.cd ?? 0);  // já com items bonus
            const atrMod      = Number(actorSys?.atributos?.[atrKey]?.value ?? 0);
            const bonusAfter  = Number(itemSys?.resistencia?.bonus ?? 0);

            // Fórmula principal: usa attributes.cd do actor (CORRETO — tem Foco Arcano etc.)
            let cdAtCast = 0;
            let formula  = "";
            if (actorAttrCD > 0) {
                cdAtCast = actorAttrCD + atrMod + bonusAfter;
                formula  = `actorAttrCD(${actorAttrCD}) + atr_${atrKey}(${atrMod}) + bonus(${bonusAfter})`;
            } else {
                // Fallback: usa o cd do clone (T20 formula — sem items bonus)
                cdAtCast = Number(itemSys?.resistencia?.cd ?? 0);
                formula  = `fallback: itemSys.resistencia.cd = ${cdAtCast}`;
            }

            // ── Captura de bônus de dano de FACE ESTRANGEIRA (ex.: Tomo +2d8) ──
            // O brew do T20 baka na pedra a fórmula JÁ mangleada (2d8 vira 2d6 na
            // contagem do dado base). Guardamos os bônus de face errada + a face
            // base aqui pra corrigir a fórmula da pedra no createItem.
            type CloneEffectsRolls = {
                system?: { rolls?: Array<{ type?: string; parts?: Array<[string, string?, string?]> }> };
            };
            const clone = item as CloneEffectsRolls;
            const baseExpr = clone.system?.rolls?.find(r => r.type === "dano")?.parts?.[0]?.[0];
            const baseFaceMatch = typeof baseExpr === "string" ? baseExpr.match(/\d*d(\d+)/) : null;
            const baseFace = baseFaceMatch ? parseInt(baseFaceMatch[1], 10) : 0;
            // Tomo do Rancor & cia. são effects do ATOR (não do item) — usar actor.effects.
            const actorEffects = (actor as unknown as { effects?: { contents: unknown[] } })?.effects?.contents ?? [];
            const candidates = actorEffects as unknown as AEChangeLike[];
            const foreignBonuses = baseFace >= 2
                ? collectOnUseDanoBonuses(onUseEffects, candidates)
                    .filter(b => b.faces !== baseFace)
                    .map(b => ({ count: b.count, faces: b.faces, dmgType: b.dmgType }))
                : [];

            const castActorId = actor?.id ?? "";
            if (castActorId && cdAtCast > 0) {
                _pendingPedraCDs.set(castActorId, { cd: cdAtCast, resistTxt, ts: Date.now(), foreignBonuses, baseFace });
                console.warn(`[t20-theme-overhaul] Bola de Fogo Ap3 — CD capturado: ${cdAtCast} = ${formula} (resist: "${resistTxt}"). Bônus face estrangeira: ${foreignBonuses.length}`);
            } else {
                console.warn(`[t20-theme-overhaul] Bola de Fogo Ap3 detectado mas CD do cast indisponível. Fallback será usado.`);
            }
            console.warn(`[t20-theme-overhaul] Bola de Fogo Ap3 detectado — forçando brew=true (T20 vai criar a Pedra Flamejante via seu fluxo nativo).`);
        }
        return result;
    };
    Dlg._bg3PatchedForAp3 = true;
    console.log(`[t20-theme-overhaul] AbilityUseDialog patched (Pedra Flamejante Ap3 ativo).`);
}


// ── Skills menu (cancelar esfera) ────────────────────────────────────────────

type EsferaTokenDoc = {
    id: string;
    x?: number; y?: number; width?: number; height?: number;
    flags?: Record<string, Record<string, unknown>>;
    delete?(): Promise<unknown>;
};

function getMyEsferas(): EsferaTokenDoc[] {
    type CanvasLike = { scene?: { tokens?: { contents?: EsferaTokenDoc[] } } };
    const cv  = canvas as unknown as CanvasLike;
    const all = cv.scene?.tokens?.contents ?? [];
    const mine = all.filter(t => t.flags?.[MODULE_ID]?.[FLAG_SPELL] === ESFERA_KEY);
    if (game.user?.isGM) return mine;
    const uid = game.user?.id;
    if (!uid) return [];
    return mine.filter(t => (t.flags?.[MODULE_ID]?.["creatorUserId"] as string | undefined) === uid);
}

async function onClickCancelEsfera(): Promise<void> {
    const mine = getMyEsferas();
    if (mine.length === 0) {
        ui.notifications?.info("Nenhuma Esfera Flamejante ativa para apagar.");
        refreshSkillsMenu();
        return;
    }
    type SceneLike = { deleteEmbeddedDocuments?(t: string, ids: string[]): Promise<unknown> };
    const scene = (canvas as unknown as { scene?: SceneLike }).scene;
    if (!scene?.deleteEmbeddedDocuments) return;

    if (mine.length === 1) {
        try {
            await scene.deleteEmbeddedDocuments("Token", [mine[0].id]);
            ui.notifications?.info("Esfera Flamejante apagada.");
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Esfera Flamejante: falha ao apagar:`, err);
        }
        return;
    }

    // Múltiplas esferas — picker
    type DialogCtor = new (data: object, opts?: object) => { render(force?: boolean): unknown };
    const DialogCls = (globalThis as unknown as { Dialog: DialogCtor }).Dialog;
    const rows = mine.map((t, i) => {
        const caster = escHtml((t.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Lançador");
        return `<label class="picker-row" style="display:flex; align-items:center; gap:10px; padding:6px 8px; cursor:pointer;">
            <input type="checkbox" data-tid="${t.id}" checked />
            <span style="color:var(--bg3-accent-muted); min-width:56px;">Esfera #${i + 1}</span>
            <span style="color:var(--bg3-text-primary);"><b style="color:#cc4422;">${caster}</b></span>
        </label>`;
    }).join("");
    const ids = await new Promise<string[] | null>((resolve) => {
        new DialogCls({
            title: "Apagar esferas flamejantes",
            content: `<div style="padding:8px 12px;"><p style="color:var(--bg3-accent-muted); font-size:0.78rem; letter-spacing:0.12em; text-transform:uppercase;">Selecione as esferas a apagar</p>${rows}</div>`,
            buttons: {
                remove: {
                    icon: '<i class="fas fa-fire-flame-curved"></i>', label: "Apagar selecionadas",
                    callback: ($html: JQuery) => {
                        const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                        const sel = Array.from((root as HTMLElement).querySelectorAll("input[data-tid]:checked"))
                            .map(el => el.getAttribute("data-tid") ?? "").filter(Boolean);
                        resolve(sel.length > 0 ? sel : null);
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar", callback: () => resolve(null) },
            },
            default: "remove", close: () => resolve(null),
        }, { classes: ["bg3-dialog"] }).render(true);
    });
    if (!ids || ids.length === 0) return;
    try {
        await scene.deleteEmbeddedDocuments("Token", ids);
        ui.notifications?.info(`${ids.length} Esfera(s) Flamejante apagada(s).`);
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Esfera Flamejante: falha ao apagar múltiplas:`, err);
    }
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function setupBolaDeFogo(): void {
    // Skills-menu: botão para apagar Esfera Flamejante (Fase 2)
    registerSkillAction({
        id:    "bola-de-fogo-esfera-cancel",
        label: "Apagar esfera flamejante",
        icon:  "fa-solid fa-fire-flame-curved",
        color: "#ff7733",
        isVisible: () => getMyEsferas().length > 0,
        onClick:   () => onClickCancelEsfera(),
    });

    // Monkey-patch do AbilityUseDialog do T20 (ready garante game.tormenta20 inicializado).
    // Detecta Ap3 da Bola de Fogo e força brew=true → T20 cria granada via fluxo nativo.
    Hooks.once("ready", () => {
        patchAbilityUseDialog();
    });

    // Quando T20 cria a granada da Bola de Fogo (resultado do brew),
    // renomeamos pra "Pedra Flamejante" + adicionamos nossa flag PEDRA_KEY +
    // copiamos flags de animação (automated-animations, sequencer) da magia
    // original — assim quando a pedra é usada, a animação da Bola de Fogo dispara.
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as {
            id: string;
            name?: string;
            type?: string;
            img?:  string;
            system?: Record<string, unknown>;
            flags?: Record<string, Record<string, unknown>>;
            parent?: {
                id?: string;
                name?: string;
                items?: { contents?: Array<{ name?: string; type?: string; flags?: Record<string, Record<string, unknown>> }> };
            } | null;
            update(data: Record<string, unknown>): Promise<unknown>;
        };
        if (item.type !== "consumivel") return;
        if (item.flags?.[MODULE_ID]?.[FLAG_SPELL]) return; // já tem nossa flag

        // T20 brew nomeia: "<Granada/Poção/Óleo> <nome da magia>" — pra Bola de Fogo com area,
        // o nome contém "Granada" + "Bola de Fogo". Match defensivo:
        const name = item.name ?? "";
        const isGranadaBolaDeFogo = /granada/i.test(name) && /bola\s+de\s+fogo/i.test(name);
        if (!isGranadaBolaDeFogo) return;

        // Extrai fórmula de dano dos rolls (pra mostrar no nome do item)
        type RollDef = { type?: string; key?: string; name?: string; parts?: Array<Array<string>> };
        const rolls   = (item.system?.["rolls"] as RollDef[] | undefined) ?? [];
        const danoDef = rolls.find(r => r?.type === "dano");
        let   dado    = String(danoDef?.parts?.[0]?.[0] ?? "6d6");

        // ── Correção de bônus de dano de face estrangeira (ex.: Tomo +2d8) ──
        // O brew do T20 baka a fórmula JÁ mangleada (2d8 contado como 2d6 no dado
        // base). Usando os bônus capturados no cast, reconstruímos a fórmula
        // correta e atualizamos TANTO o nome QUANTO os rolls da pedra (o dano é
        // rolado desses rolls quando a pedra é usada).
        let correctedRolls: RollDef[] | null = null;
        {
            const pedraActorId = item.parent?.id ?? "";
            const pend = pedraActorId ? _pendingPedraCDs.get(pedraActorId) : undefined;
            const pendFresh = !!pend && Date.now() - pend.ts < 60_000;
            const fBonuses = pendFresh ? (pend?.foreignBonuses ?? []) : [];
            const fBaseFace = pend?.baseFace ?? 0;
            if (fBonuses.length && fBaseFace >= 2) {
                const fixed = correctMangledDanoFormula(dado, fBaseFace, fBonuses);
                if (fixed) {
                    dado = fixed;
                    correctedRolls = rolls.map(r => ({
                        ...r,
                        parts: r.parts ? r.parts.map(p => [...p]) : r.parts,
                    }));
                    const danoIdx = correctedRolls.findIndex(r => r?.type === "dano");
                    if (danoIdx >= 0 && correctedRolls[danoIdx].parts?.[0]) {
                        correctedRolls[danoIdx].parts![0][0] = fixed;
                    }
                    console.warn(`[t20-theme-overhaul] Pedra Flamejante: fórmula de dano corrigida (face estrangeira) → ${fixed}`);
                }
            }
        }

        // Procura a magia "Bola de Fogo" no inventário do mesmo actor — vamos
        // copiar flags de automated-animations / sequencer pra que a animação
        // continue tocando quando a pedra for usada.
        type SpellItemLike = {
            name?: string;
            type?: string;
            flags?: Record<string, Record<string, unknown>>;
            system?: Record<string, unknown>;
        };
        const actorItems = (item.parent?.items?.contents ?? []) as SpellItemLike[];
        const origSpell  = actorItems.find(i =>
            i.type === "magia"
            && normalizeCondName(i.name ?? "").includes("bola de fogo"),
        );
        const animFlags: Record<string, unknown> = {};
        if (origSpell?.flags) {
            const aaFlags = origSpell.flags["automated-animations"];
            const seqFlags = origSpell.flags["sequencer"];
            const jb2aFlags = origSpell.flags["jb2a"];
            if (aaFlags)   animFlags["flags.automated-animations"] = aaFlags;
            if (seqFlags)  animFlags["flags.sequencer"]            = seqFlags;
            if (jb2aFlags) animFlags["flags.jb2a"]                 = jb2aFlags;
        }

        // ── CD: prioriza o valor capturado do cast (fonte da verdade) ───────
        //
        // O monkey-patch do AbilityUseDialog.create já capturou o CD do clone
        // modificado — isso é o CD FINAL e inclui:
        //   - bônus de items do actor via Active Effects (ex: Cajado Arcano)
        //   - bônus de aprimoramentos selecionados (Fortalecimento Arcano, etc.)
        //   - base 10 + nivel/2 + atributo_conjuracao
        //
        // Fallbacks (caso o map esteja vazio — pedras "stranger" criadas fora
        // do nosso fluxo): origSpellCD + granadaBonus, depois fórmula direta.
        const actorIdForCD = item.parent?.id ?? "";
        const pendingCD    = actorIdForCD ? _pendingPedraCDs.get(actorIdForCD) : undefined;
        const cdIsFresh    = !!pendingCD && Date.now() - pendingCD.ts < 60_000;

        const origSpellResist = (origSpell?.system?.["resistencia"]
                              ?? {}) as Record<string, unknown>;
        const origSpellCD     = Number(origSpellResist["cd"] ?? 0);
        const origSpellAtr    = String(origSpellResist["atributo"] ?? "");
        const granadaResist   = (item.system?.["resistencia"]
                              ?? {}) as Record<string, unknown>;
        const granadaBonus    = Number(granadaResist["bonus"] ?? 0);
        type ParentLike = { system?: { attributes?: { conjuracao?: string } } };
        const parent     = item.parent as ParentLike | null | undefined;
        const conjuracao = origSpellAtr
                        || String(parent?.system?.attributes?.conjuracao ?? "int");

        let effectiveCD = 0;
        let cdSource    = "";
        if (cdIsFresh && pendingCD) {
            effectiveCD = pendingCD.cd;
            cdSource    = "cast-time (captured from clone)";
            _pendingPedraCDs.delete(actorIdForCD);
        } else {
            effectiveCD = origSpellCD + granadaBonus;
            cdSource    = `origSpellCD(${origSpellCD}) + granadaBonus(${granadaBonus})`;
            if (!effectiveCD || effectiveCD <= 10) {
                type ActorSys = {
                    atributos?:  Record<string, { value?: number } | undefined>;
                    attributes?: { nivel?: { value?: number }; cd?: number };
                };
                const actorSys  = (parent as unknown as { system?: ActorSys })?.system;
                // Usa actor.system.attributes.cd se disponível (já inclui bônus de items)
                const actorBaseCD = Number(actorSys?.attributes?.cd ?? 0);
                const atrVal      = Number(actorSys?.atributos?.[conjuracao]?.value ?? 0);
                if (actorBaseCD > 0) {
                    effectiveCD = actorBaseCD + atrVal + granadaBonus;
                    cdSource    = `actorBaseCD(${actorBaseCD}) + atr(${atrVal}) + bonus(${granadaBonus})`;
                } else {
                    const nvl  = Math.floor(Number(actorSys?.attributes?.nivel?.value ?? 0) / 2);
                    effectiveCD = 10 + nvl + atrVal + granadaBonus;
                    cdSource    = `10 + nvl/2(${nvl}) + atr(${atrVal}) + bonus(${granadaBonus})`;
                }
            }
        }

        // Atualiza nome, img, e flags
        const actorId = item.parent?.id ?? "";
        const userId  = game.user?.id ?? "";
        void item.update({
            name: `Pedra Flamejante (${dado} fogo)`,
            img:  ESFERA_TEXTURE,
            ...(correctedRolls ? { "system.rolls": correctedRolls } : {}),
            "system.resistencia.atributo": conjuracao,
            "system.resistencia.cd":       effectiveCD,
            [`flags.${MODULE_ID}.${FLAG_SPELL}`]: PEDRA_KEY,
            [`flags.${MODULE_ID}.casterActorId`]: actorId,
            [`flags.${MODULE_ID}.casterUserId`]:  userId,
            [`flags.${MODULE_ID}.casterName`]:    item.parent?.name ?? "Lançador",
            [`flags.${MODULE_ID}.createdAtMs`]:   Date.now(),
            [`flags.${MODULE_ID}.cd`]:            effectiveCD,
            ...animFlags,
        });
        console.warn(`[t20-theme-overhaul] Pedra Flamejante criada — CD=${effectiveCD} (fonte: ${cdSource}, atributo=${conjuracao}).`);
        ui.notifications?.info(`Pedra Flamejante criada no inventário (${dado} fogo, CD ${effectiveCD}). Clique no item para arremessar.`);
    });

    // 0. preCreateChatMessage — quando imp 2 ativo no cast:
    //    a) seta _pendingEsferaTemplateDelete ANTES que o T20 processe o
    //       createChatMessage (garante que preCreateMeasuredTemplate já
    //       encontra o flag quando o T20 criar o template automático).
    //    b) suprime o roll de damage (imp 2: esfera tem dano próprio).
    //
    // Ap3 (Pedra Flamejante) é tratado de forma diferente: o brew do T20
    // (via patchAbilityUseDialog) já bypassa criação de template e damage
    // antes do chat msg ser criado — não precisamos suprimir nada aqui.
    Hooks.on("preCreateChatMessage", (...args: unknown[]) => {
        type DocLike = { updateSource(changes: Record<string, unknown>): void };
        const doc    = args[0] as DocLike;
        const data   = args[1] as Record<string, unknown>;
        const userId = args[3] as string;
        if (userId !== game.user?.id) return;

        const entries = getOnUseEffectsFromData(data);
        if (!detectImp2Active(entries)) return;

        _pendingEsferaTemplateDelete.set(userId, Date.now());

        const rolls = data["rolls"] as unknown[] | undefined;
        if (!Array.isArray(rolls) || !rolls.length) return;
        const filtered = rolls.filter(r => {
            try {
                const rd = typeof r === "string" ? JSON.parse(r) as Record<string, unknown> : r as Record<string, unknown>;
                const opts = rd["options"] as Record<string, unknown> | undefined;
                return opts?.["type"] !== "damage";
            } catch { return true; }
        });
        if (filtered.length === rolls.length) return;
        doc.updateSource({ rolls: filtered });
    });

    // 1. createChatMessage — branch entre FASE 1 (explosão), FASE 2 (esfera),
    //    FASE 3 (criação de pedra no cast) e uso de pedra do inventário.
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        const uid     = getMsgAuthorId(message);
        if (uid !== game.user?.id) return;

        // ── Detecta USO da Pedra Flamejante (item no inventário) ─────────────
        // Quando o user clica no item da pedra, T20 nativo:
        //  1. Rola o dano via item.rollDamage
        //  2. AbilityTemplate.fromItem(item).drawPreview() — abre placement UI (async)
        //  3. Imediatamente em seguida posta chat msg via item.displayCard
        //  4. (depois) user clica no canvas → MeasuredTemplate document é criado
        //
        // Por isso, a chat msg da Pedra Flamejante chega ANTES do template existir.
        // Registramos um pending cast (mesmo padrão da FASE 1) — o hook
        // createMeasuredTemplate vai reivindicar o template quando ele aparecer.
        //
        // T20 grava `flags.tormenta20.itemData = this.system` (linha 7339) — só o
        // `system`, SEM flags. Por isso checamos flags via lookup do item vivo
        // usando data-item-id do HTML.
        {
            const itemIdMaybe = extractItemId(message);
            const actorIdMaybe = message.speaker?.actor ?? "";
            type ActorsGetter = {
                get(id: string): {
                    items?: { get(id: string): { flags?: Record<string, Record<string, unknown>> } | undefined };
                } | undefined;
            };
            const liveItem = (itemIdMaybe && actorIdMaybe)
                ? (game.actors as unknown as ActorsGetter).get(actorIdMaybe)?.items?.get(itemIdMaybe)
                : undefined;
            const isPedraUse = liveItem?.flags?.[MODULE_ID]?.[FLAG_SPELL] === PEDRA_KEY;
            if (isPedraUse) {
                const damageRoll = (message.rolls ?? []).find(r =>
                    (r.options as Record<string, unknown>)?.["type"] === "damage",
                );
                if (!damageRoll) {
                    console.warn(`[t20-theme-overhaul] Pedra Flamejante usada mas sem damage roll na msg.`);
                    return;
                }
                const t20Item = message.getFlag("tormenta20", "itemData") as Record<string, unknown> | undefined;
                const resist  = t20Item?.["resistencia"] as Record<string, unknown> | undefined;
                // CD: nossa flag (bake at createItem) é fonte mais confiável; depois
                // tenta system.resistencia.cd do snapshot; depois extractCD do HTML.
                let cd = Number(liveItem?.flags?.[MODULE_ID]?.["cd"] ?? 0);
                if (!cd) cd = Number(resist?.["cd"] ?? 0);
                if (!cd || cd <= 10) {
                    const cdFromHtml = extractCD(message);
                    if (cdFromHtml > 0) cd = cdFromHtml;
                }
                const resTxt  = String(resist?.["txt"] ?? "Reflexos reduz à metade");
                registerPendingCast(uid, {
                    casterActorId: actorIdMaybe,
                    casterName:    message.speaker?.alias ?? "Lançador",
                    casterUserId:  uid,
                    messageId:     message.id,
                    damageTotal:   damageRoll.total ?? 0,
                    damageFormula: damageRoll.formula ?? "",
                    cd,
                    resistTxt:     resTxt,
                    spellName:     "Pedra Flamejante (Bola de Fogo)",
                });
                console.warn(`[t20-theme-overhaul] Pedra Flamejante detonada — pending cast registrado (dano=${damageRoll.total}, cd=${cd}). Aguardando user posicionar template.`);
                return;
            }
        }
        // ── Fim detecção uso de pedra ─────────────────────────────────────────

        if (normalizeCondName(extractSpellName(message)) !== SPELL_KEY) return;

        const itemData = message.getFlag("tormenta20", "itemData") as Record<string, unknown> | undefined;
        if (!itemData) return;

        const entries = getOnUseEffects(message);

        // ── DIAGNÓSTICO: log temporário para verificar detecção de aprimoramentos.
        //    Abrir DevTools (F12) → Console ao castar com Ap3 selecionado.
        //    Remover após confirmar que detectImp3Active retorna true.
        console.warn(
            `[t20-theme-overhaul] Bola de Fogo cast — onUseEffects (${entries.length} entries):`,
            JSON.stringify(entries, null, 2),
            `· imp1=${detectImp1Qty(entries)} imp2=${detectImp2Active(entries)} imp3=${detectImp3Active(entries)}`,
        );
        // ── FIM DIAGNÓSTICO ──

        // FASE 2: imp 2 ativo → esfera flamejante persistente
        if (detectImp2Active(entries)) {
            // Sweep robusto: deleta qualquer template do T20 criado nessa cast
            // que escapou do preCreateMeasuredTemplate (race condition).
            sweepRecentUnflaggedTemplates(uid);
            const imp1Qty = detectImp1Qty(entries);
            const dice    = 3 + imp1Qty * 2;
            // Bônus de dano on-use externos (ex.: Tomo do Rancor +2d8+2) — o T20
            // não toca na fórmula da esfera (ela é nossa), então anexamos o valor
            // COMPLETO com a face correta. Fica no flag → todas as passagens
            // (placed/moved/turn-start) usam a mesma fórmula (corrige a perda nas
            // passagens seguintes).
            const extBonuses = externalDanoBonuses(message);
            const extSuffix  = extBonuses.map(b => ` + ${danoBonusToFormula(b)}`).join("");
            const damageFormula = `${dice}d6[fogo]${extSuffix}`;
            if (extSuffix) {
                console.log(`[${MODULE_ID}] Esfera Flamejante: bônus on-use externos anexados → ${damageFormula}`);
            }
            const cd            = extractCD(message);
            const resistTxt     = ((itemData["resistencia"] as { txt?: string } | undefined)?.txt ?? "").trim()
                                  || "Reflexos reduz à metade";
            const meta: EsferaMeta = {
                casterActorId: message.speaker?.actor ?? "",
                casterName:    message.speaker?.alias ?? "Lançador",
                casterUserId:  uid,
                cd,
                resistTxt,
                damageFormula,
                imp1Qty,
                spellName:     "Bola de Fogo (Esfera Flamejante)",
            };
            void placeEsfera(meta);
            return;
        }

        // FASE 1: explosão one-shot
        const rolls      = message.rolls ?? [];
        const damageRoll = rolls.find(r => (r.options as Record<string, unknown>)?.["type"] === "damage");
        if (!damageRoll) return;

        registerPendingCast(uid, {
            casterActorId: message.speaker?.actor ?? "",
            casterName:    message.speaker?.alias ?? "Lançador",
            casterUserId:  uid,
            messageId:     message.id,
            damageTotal:   damageRoll.total ?? 0,
            damageFormula: damageRoll.formula ?? "",
            cd:            extractCD(message),
            resistTxt:     ((itemData["resistencia"] as { txt?: string } | undefined)?.txt ?? "").trim(),
            spellName:     extractSpellName(message),
        });
    });

    // 2a. preCreateMeasuredTemplate — cancela o template do T20 ANTES de aparecer
    //     quando imp 2 ou imp 3 ativo. Zero flash no mapa.
    //     (Para FASE 1 não há entrada em _pendingEsferaTemplateDelete → não cancela.)
    Hooks.on("preCreateMeasuredTemplate", (...args: unknown[]) => {
        // pre-hooks: (doc, data, options, userId) → userId em args[3]
        const userId     = typeof args[3] === "string" ? (args[3] as string) : undefined;
        const currentUid = game.user?.id;
        if (!currentUid || userId !== currentUid) return;

        const esferaPendingTs = _pendingEsferaTemplateDelete.get(currentUid);
        if (esferaPendingTs === undefined || Date.now() - esferaPendingTs >= PENDING_WINDOW_MS) return;
        _pendingEsferaTemplateDelete.delete(currentUid);
        return false; // cancela criação — template nunca aparece no mapa
    });

    // 2b. createMeasuredTemplate — caster reclama (FASE 1 explosão)
    Hooks.on("createMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc = args[0] as {
            id: string;
            flags?: Record<string, Record<string, unknown>>;
            user?: string | { id?: string };
            author?: { id?: string };
            update(data: Record<string, unknown>): Promise<unknown>;
        };
        const triggerUserId = typeof args[2] === "string" ? (args[2] as string) : undefined;
        const currentUid    = game.user?.id;
        if (!currentUid) return;

        const authorUidAll =
            tplDoc.author?.id
            ?? (typeof tplDoc.user === "string" ? tplDoc.user : tplDoc.user?.id)
            ?? triggerUserId;
        // Tracking: registra template criado pelo usuário (mesmo se não for nosso) —
        // permite sweep posterior em FASE 2/3 quando preCreate não cancelou em tempo.
        if (authorUidAll === currentUid && tplDoc.id) {
            trackRecentTemplate(currentUid, tplDoc.id);
        }

        // Já tem flag (esfera ou explosão)? — nada a fazer
        const ourFlag = tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL];
        if (ourFlag === SPELL_KEY || ourFlag === ESFERA_KEY) {
            refreshSkillsMenu();
            return;
        }

        const authorUid = authorUidAll;
        if (authorUid !== currentUid) return;

        // ── Backup Ap2/Ap3: preCreateMeasuredTemplate deveria ter cancelado via
        //    return false, mas em alguns cenários do Foundry v13 isso pode não
        //    funcionar (ex.: T20 chama createEmbeddedDocuments por caminho não-hook).
        //    Neste caso o template já foi criado — deletamos imediatamente.
        {
            const esferaBackupTs = _pendingEsferaTemplateDelete.get(currentUid);
            if (esferaBackupTs !== undefined && Date.now() - esferaBackupTs < PENDING_WINDOW_MS) {
                _pendingEsferaTemplateDelete.delete(currentUid);
                void (tplDoc as unknown as { delete?(): Promise<unknown> }).delete?.();
                return;
            }
        }
        // ── Fim backup ──

        const pending = _pendingCasts.get(currentUid);
        if (!pending || Date.now() - pending.ts >= PENDING_WINDOW_MS) return;
        _pendingCasts.delete(currentUid);
        void claimTemplate(tplDoc, pending);
    });

    // 3. updateMeasuredTemplate — FASE 1: dispatch da explosão após claim
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc  = args[0] as {
            id: string; uuid: string; x: number; y: number; distance: number;
            flags?: Record<string, Record<string, unknown>>;
            update(data: Record<string, unknown>): Promise<unknown>;
            delete?(): Promise<unknown>;
        };
        const changes = args[1] as Record<string, unknown> | undefined;
        const flags   = tplDoc.flags?.[MODULE_ID];
        if (!flags || flags[FLAG_SPELL] !== SPELL_KEY) return;
        if (flags["dispatched"] === true) return;

        const changedFlags = (changes?.["flags"] as Record<string, unknown> | undefined)?.[MODULE_ID];
        if (!changedFlags) return;
        const casterUid = flags["casterUserId"] as string | undefined;
        if (casterUid !== game.user?.id) return;
        void dispatchExplosion(tplDoc);
    });

    // 4. createToken — refresh skills menu + concede OWNER (3) ao caster.
    //    Player não tem permissão pra setar ownership ao criar token, então
    //    Foundry ignora silenciosamente o campo `ownership` que passamos em
    //    placeEsfera. Resultado: token nasce com ownership:{} e o player não
    //    consegue arrastar (server rejeita updates). Aqui, no cliente do
    //    GM-ativo, fazemos um update pra granti'r OWNER ao casterUserId.
    Hooks.on("createToken", (...args: unknown[]) => {
        const tokDoc = args[0] as {
            id: string;
            flags?: Record<string, Record<string, unknown>>;
            ownership?: Record<string, number>;
            update(data: Record<string, unknown>): Promise<unknown>;
        };
        const flags = tokDoc.flags?.[MODULE_ID];
        if (flags?.[FLAG_SPELL] !== ESFERA_KEY) {
            refreshSkillsMenu();
            return;
        }
        refreshSkillsMenu();

        if (!isActiveGM()) return;
        const casterUid = flags["casterUserId"] as string | undefined;
        const own = (tokDoc.ownership as Record<string, number> | undefined) ?? {};

        void (async () => {
            // (a) Concede OWNER ao caster se faltar — players não conseguem
            // setar ownership ao criar token, então fazemos server-side.
            if (casterUid && own[casterUid] !== 3) {
                try {
                    await tokDoc.update({ [`ownership.${casterUid}`]: 3 });
                } catch (err) {
                    console.warn(`[t20-theme-overhaul] Bola de Fogo: falha ao conceder OWNER da esfera ao caster (${casterUid}):`, err);
                }
            }

            // (b) Dispara dano imediato se a esfera nasce SOBRE uma criatura.
            // Sem isso, posicionar a esfera no espaço de um alvo não causa
            // dano até a próxima movimentação. Usa applyEsferaDamage com
            // trigger="placed" — passa pela mesma lógica de modal-dispatch
            // e de "1x por rodada" das outras triggers.
            const tileBoxLike = tokDoc as unknown as {
                id: string; uuid: string; x: number; y: number; width: number; height: number;
                flags?: Record<string, Record<string, unknown>>;
                update(data: Record<string, unknown>): Promise<unknown>;
            };
            void applyEsferaDamage(tileBoxLike, "placed");
        })();
    });

    // 5. updateToken — esfera-token moveu (x/y mudou) → aplica dano em TODOS
    //    os tokens-criatura que a esfera intersecta no TRAJETO (não só na
    //    posição final). Gating GM-side via isActiveGM dentro de
    //    applyEsferaDamage.
    Hooks.on("updateToken", (...args: unknown[]) => {
        const tokDoc  = args[0] as {
            id: string; uuid: string; x: number; y: number; width: number; height: number;
            flags?: Record<string, Record<string, unknown>>;
            update(data: Record<string, unknown>): Promise<unknown>;
        };
        const flags = tokDoc.flags?.[MODULE_ID];
        if (!flags || flags[FLAG_SPELL] !== ESFERA_KEY) return;
        const changes = args[1] as Record<string, unknown> | undefined;
        const destX = typeof changes?.["x"] === "number" ? (changes["x"] as number) : undefined;
        const destY = typeof changes?.["y"] === "number" ? (changes["y"] as number) : undefined;
        if (destX === undefined && destY === undefined) return;

        // Quirk v13: tokDoc.x/y é a posição ANTIGA (pré-move); destino vem em
        // changes. Computamos o trajeto e samplemos posições intermediárias.
        const oldX = tokDoc.x;
        const oldY = tokDoc.y;
        const newX = destX ?? oldX;
        const newY = destY ?? oldY;
        if (oldX === newX && oldY === newY) return;

        type CanvasLike = { scene?: { grid?: { size?: number } } };
        const cv       = canvas as unknown as CanvasLike;
        const gridSize = cv.scene?.grid?.size ?? 100;
        const esferaW  = tokDoc.width  * gridSize;
        const esferaH  = tokDoc.height * gridSize;
        const affected = tokensAlongPath(
            { x: oldX, y: oldY },
            { x: newX, y: newY },
            esferaW,
            esferaH,
        );
        void applyEsferaDamage(tokDoc, "moved", affected);
    });

    // 6. deleteToken — esfera-token deletada → refresh skills menu
    Hooks.on("deleteToken", (...args: unknown[]) => {
        const tokDoc = args[0] as { flags?: Record<string, Record<string, unknown>> };
        if (tokDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] === ESFERA_KEY) refreshSkillsMenu();
    });

    // 7. combatTurnChange — tick da esfera no início do turno do caster.
    //    Padrão Aura Sagrada: usar combatTurnChange (não combatTurn) para
    //    pegar o NOVO combatant. Gating GM-side via applyEsferaDamage.
    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        const combat = args[0] as { round?: number; combatant?: { actor?: { id?: string }; tokenId?: string } } | null;
        const newCombatant = combat?.combatant;
        const newActorId   = newCombatant?.actor?.id;
        if (!newActorId) return;

        type TokenLike = {
            id: string; uuid: string; x: number; y: number; width: number; height: number;
            flags?: Record<string, Record<string, unknown>>;
            update(data: Record<string, unknown>): Promise<unknown>;
        };
        type CanvasLike = { scene?: { tokens?: { contents?: TokenLike[] } } };
        const cv     = canvas as unknown as CanvasLike;
        const tokens = cv.scene?.tokens?.contents ?? [];
        for (const tok of tokens) {
            const flags = tok.flags?.[MODULE_ID];
            if (flags?.[FLAG_SPELL] !== ESFERA_KEY) continue;
            if ((flags["casterActorId"] as string | undefined) !== newActorId) continue;
            void applyEsferaDamage(tok, "turn-start");
        }
    });
}
