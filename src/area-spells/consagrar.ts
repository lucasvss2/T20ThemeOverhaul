/**
 * Consagrar — magia de área persistente (T20)
 *
 * FASE 1 (este arquivo):
 *  - Detecta quando "Consagrar" é castada
 *  - Pede ao lançador para clicar no canvas para posicionar a área
 *  - Cria um MeasuredTemplate (esfera 9m) com flag identificando como Consagrar
 *  - Cliente do GM (no hook createMeasuredTemplate) percorre tokens dentro
 *    da área e aplica os AEs apropriados:
 *      - Mortos-vivos: penalidade (-2 testes/defesa, +N do aprimoramento)
 *      - Vivos: efeito de "Cura Aprimorada" (flag — integração com modal de
 *        cura virá depois)
 *  - Quando o template é deletado, todos os AEs criados por ele são removidos
 *
 * FASE 2 (futuro): tracking de entrada/saída via updateToken / createToken,
 * para que criaturas que entrem depois do cast também recebam (e quem sair
 * perca) os efeitos.
 */

import { MODULE_ID } from "@/constants";
import { extractSpellName, normalizeCondName, getMsgAuthorId } from "@/spell-resistance/index";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import CONSAGRAR_STYLES from "./consagrar.css?inline";

const SPELL_KEY = "consagrar";
const FLAG_SPELL = "spell";                          // template flag: identifica como Consagrar
const FLAG_EFFECT_ORIGIN = "consagrarTemplateOrigin"; // AE flag: ID do template que criou
const FLAG_HEAL_BOOST = "consagrarHealingBoost";      // AE flag: marca o effect de cura aprimorada

const RAIO_METROS = 9;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Elege o GM "primário" para executar mutações compartilhadas (apply/remove
 * AE, sweep, etc.). Quando há múltiplos GMs ativos, todos rodavam a lógica
 * em paralelo e cada mutação era feita N vezes — o bug de duplicação de AE
 * reportado em v1.6.66. Elegemos o GM ativo com o menor ID lexicográfico:
 * determinístico em todos os clientes, sem precisar de coordenação.
 */
function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter(u => u.isGM && u.active)
        .map(u => u.id)
        .sort();
    return activeGMs[0] === myId;
}

/**
 * Calcula a penalidade para mortos-vivos com base nos APRIMORAMENTOS QUE O
 * USUÁRIO REALMENTE MARCOU no cast (`message.flags.tormenta20.onUseEffects`).
 *
 * Por que NÃO usar `flags.tormenta20.effects`:
 *   T20 carrega `effects[0] = "Penalidade em Mortos-Vivos" (-2)` na mensagem
 *   *independentemente* do usuário ter ativado o 1PM. Ler dali aplicava
 *   penalidade mesmo sem aprimoramento — o bug reportado em v1.6.66.
 *
 * Regra (segundo o texto da magia + esclarecimento do usuário):
 *   - 1PM "além do normal ... -2 em testes e Defesa" — base; SEM ele, ZERO
 *   - 2PM "aumenta as penalidades em -1" — cada nível adiciona -1
 *   - Se o 1PM não foi marcado, o 2PM (que só "aumenta as penalidades") não
 *     produz penalidade sozinho.
 */
export function computeUndeadPenaltyFromMessage(message: ChatMessage): number {
    type OnUseEntry = { cost?: number; description?: string; qty?: number };
    const t20 = (message.flags as Record<string, unknown> | undefined)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    if (!Array.isArray(raw)) return 0;

    let baseFromFirst   = 0;
    let extraFromSecond = 0;

    for (const rawE of raw) {
        const e   = rawE as OnUseEntry;
        const qty = Number(e?.qty ?? 0);
        if (!Number.isFinite(qty) || qty < 1) continue;
        const desc = String(e?.description ?? "");

        // 1PM: "além do normal, mortos-vivos na área sofrem –2 em testes e Defesa"
        // Match generoso: "-2" + ... + "testes" + ... + "defesa" (qualquer
        // ordem de palavras entre eles, incluindo "em"). A versão anterior
        // usava [^a-z]+ que com /i bloqueia QUALQUER letra — não casava
        // porque " em " tem letras.
        if (/[-–−]\s*2\b.*?\btestes\b.*?\bdefesa\b/i.test(desc)) {
            baseFromFirst = 2;
            continue;
        }

        // 2PM: "aumenta as penalidades para mortos-vivos em –1"
        // — cada nível (qty) adiciona -1 à penalidade existente.
        if (/aumenta\s+(?:as\s+)?penalidades/i.test(desc)) {
            extraFromSecond += qty * 1;
            continue;
        }
    }

    // Sem o aprimoramento-base (1PM), não há penalidade — o 2PM sozinho só
    // "aumenta as penalidades", não cria nenhuma.
    if (baseFromFirst === 0) return 0;
    return baseFromFirst + extraFromSecond;
}

/**
 * Detecta se o ator é morto-vivo.
 *
 * NPCs: T20 usa DOIS campos no bestiário pra essa info:
 *   - `detalhes.raca === "Morto-vivo"` (nome completo, ex.: Aparição, Esqueleto)
 *   - `detalhes.tipo === "mor"`         (código curto, ex.: Lich, Ravarimm)
 * Checagem precisa cobrir AMBOS — Lich tem `raca: ""` e `tipo: "mor"`.
 *
 * PCs: item de tipo "race" com nome "Osteon" ou "Soterrado".
 */
export function isUndead(actor: FoundryActor): boolean {
    // NPCs — campos detalhes.raca / detalhes.tipo
    type DetalhesShape = { detalhes?: { raca?: string; tipo?: string } };
    const det  = (actor.system as DetalhesShape | undefined)?.detalhes;
    const raca = typeof det?.raca === "string" ? normalizeCondName(det.raca) : "";
    const tipo = typeof det?.tipo === "string" ? det.tipo.toLowerCase().trim() : "";
    if (raca === "morto-vivo") return true;
    if (tipo === "mor")        return true; // Lich, Ravarimm, etc.

    // PCs — item de raça undead (Osteon, Soterrado)
    type ItemLike = { type?: string; name?: string };
    const items = (actor as unknown as { items?: { contents?: ItemLike[] } }).items?.contents ?? [];
    return items.some(item => {
        if (item.type !== "race") return false;
        const n = typeof item.name === "string" ? normalizeCondName(item.name) : "";
        return n === "osteon" || n === "soterrado";
    });
}

/**
 * Verdadeira posição do token em PIXELS levando em conta o quirk do v13:
 *
 *   No hook `updateToken`, `doc.x/y` ainda é a posição ANTIGA — o destino
 *   está em `changes.x/y` (que o caller passa via `overrideXY`).
 *   `doc.x/y` só converge para o destino DEPOIS que a animação termina
 *   (centenas de ms a segundos). Por isso TODA chamada de sync que vem
 *   de `updateToken` precisa passar o destino explicitamente.
 *
 * Para chamadas de fora de `updateToken` (canvasReady, createToken,
 * updateMeasuredTemplate), `overrideXY` é undefined e usamos doc.x/y, que
 * aí sim já está estável.
 */
function getTokenPosPx(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): { x: number; y: number; widthSq: number; heightSq: number } {
    type TokenDoc = {
        document?: { x?: number; y?: number; width?: number; height?: number };
        x?: number; y?: number;
    };
    const t = token as unknown as TokenDoc;
    const doc = t.document;
    const baseX = doc?.x ?? t.x ?? 0;
    const baseY = doc?.y ?? t.y ?? 0;
    return {
        x:        overrideXY?.x ?? baseX,
        y:        overrideXY?.y ?? baseY,
        widthSq:  doc?.width  ?? 1,
        heightSq: doc?.height ?? 1,
    };
}

/**
 * Testa se o centro do token cai dentro do raio do template.
 *
 * Tudo é convertido para QUADRADOS:
 *   raioQuads   = template.distance(m) / grid.distance(m/quadrado)
 *   centroTplQ  = template.x(px) / grid.size(px/quadrado)
 *   centroTkQ   = token.x(px)    / grid.size + widthSq/2
 *
 * `overrideXY` é o destino do movimento (changes.x/y do hook), usado para
 * derrotar o quirk de doc.x/y desatualizado durante a animação em v13.
 */
function isTokenInsideTemplate(
    token: FoundryToken,
    template: { x: number; y: number; distance: number },
    overrideXY?: { x?: number; y?: number },
): boolean {
    type CanvasLike = { scene?: { grid?: { size?: number; distance?: number } } };
    const cv       = canvas as unknown as CanvasLike;
    const gridSize = cv.scene?.grid?.size     ?? 100;
    const gridDist = cv.scene?.grid?.distance ?? 1.5;

    const radiusSq = template.distance / gridDist;
    const tCxSq    = template.x / gridSize;
    const tCySq    = template.y / gridSize;

    const pos = getTokenPosPx(token, overrideXY);
    const cx  = pos.x / gridSize + pos.widthSq  / 2;
    const cy  = pos.y / gridSize + pos.heightSq / 2;
    const dx  = cx - tCxSq;
    const dy  = cy - tCySq;
    return Math.sqrt(dx * dx + dy * dy) <= radiusSq;
}

/**
 * Lista de tokens cujo centro está dentro do template (sem override —
 * para uso em sweeps de mundo, p.ex. ao criar o template inicialmente).
 */
function tokensInTemplate(template: {
    x: number; y: number; distance: number;
}): FoundryToken[] {
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv     = canvas as unknown as CanvasLike;
    const tokens = cv.tokens?.placeables ?? [];
    return tokens.filter(t => isTokenInsideTemplate(t, template));
}

/** Promise que resolve quando o usuário clica no canvas (ou ESC para cancelar). */
async function promptCanvasClick(): Promise<{ x: number; y: number } | null> {
    return new Promise((resolve) => {
        ui.notifications?.info(`Clique no canvas para posicionar a área de Consagrar (esfera de ${RAIO_METROS}m de raio). ESC cancela.`);
        type StageLike = {
            once?(event: string, fn: (e: unknown) => void): void;
            on?(event: string, fn: (e: unknown) => void): void;
            off?(event: string, fn: (e: unknown) => void): void;
        };
        type CanvasLike = { app?: { stage?: StageLike }; stage?: StageLike };
        const cv = canvas as unknown as CanvasLike;
        const stage = cv.app?.stage ?? cv.stage;
        if (!stage?.on || !stage?.off) {
            resolve(null);
            return;
        }

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
                ui.notifications?.info("Consagrar: posicionamento cancelado");
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

// ── Template placement ───────────────────────────────────────────────────────
//
// Estratégia (v1.6.65+): NÃO criamos mais um MeasuredTemplate por conta própria.
// O sistema T20 já cria seu template animado quando a magia é lançada — antes
// estávamos criando UM SEGUNDO template, daí o usuário via duas áreas. Agora:
//   1. Detectamos o cast → registramos um "pending"
//   2. Quando o T20 (ou qualquer outro caminho) cria um MeasuredTemplate pelo
//      usuário lançador, reclamamos esse template adicionando nossas flags via
//      doc.update(). A partir desse ponto ele é tratado como template Consagrar.
//   3. Se nenhum template aparecer em FALLBACK_PROMPT_MS, abrimos NOSSO próprio
//      prompt manual (placeTemplateManual) — fallback para spells/configurações
//      em que o T20 não auto-posiciona.

type PendingCast = {
    casterActorId: string;
    casterName:    string;
    undeadPenalty: number;
    ts:            number;
    fallbackTimer?: ReturnType<typeof setTimeout>;
};
const _pendingCasts      = new Map<string, PendingCast>(); // key: userId
const PENDING_WINDOW_MS  = 30_000;
const FALLBACK_PROMPT_MS = 4_000;

function clearPending(uid: string): void {
    const p = _pendingCasts.get(uid);
    if (p?.fallbackTimer) clearTimeout(p.fallbackTimer);
    _pendingCasts.delete(uid);
}

function registerPendingCast(uid: string, cast: Omit<PendingCast, "ts" | "fallbackTimer">): void {
    clearPending(uid);
    const entry: PendingCast = { ...cast, ts: Date.now() };
    entry.fallbackTimer = setTimeout(() => {
        // Se ainda está pendente após FALLBACK_PROMPT_MS, o T20 não criou
        // template; recorremos ao prompt manual.
        const still = _pendingCasts.get(uid);
        if (!still || still.ts !== entry.ts) return;
        _pendingCasts.delete(uid);
        void placeTemplateManual(entry);
    }, FALLBACK_PROMPT_MS);
    _pendingCasts.set(uid, entry);
}

/** Constrói o objeto de flags Consagrar para um template (criação ou claim). */
function buildConsagrarFlags(meta: {
    casterActorId: string; casterName: string; undeadPenalty: number;
}): Record<string, unknown> {
    return {
        [FLAG_SPELL]:       SPELL_KEY,
        casterActorId:      meta.casterActorId,
        casterName:         meta.casterName,
        undeadPenalty:      meta.undeadPenalty,
        createdAtGameTime:  (game as unknown as { time?: { worldTime?: number } }).time?.worldTime ?? 0,
        creatorUserId:      game.user?.id ?? "",
    };
}

/**
 * Reclama um template existente (criado pelo T20) adicionando as flags do
 * Consagrar via doc.update. O `updateMeasuredTemplate` hook se encarrega de
 * disparar a aplicação dos AEs no cliente GM.
 */
async function claimTemplate(
    tplDoc: { update(data: Record<string, unknown>): Promise<unknown> },
    pending: PendingCast,
): Promise<void> {
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}`]: buildConsagrarFlags(pending) });
        const msg = pending.undeadPenalty > 0
            ? `Consagrar ativada (penalidade undead -${pending.undeadPenalty}).`
            : `Consagrar ativada (sem penalidade — nenhum aprimoramento selecionado).`;
        ui.notifications?.info(msg);
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Consagrar: falha ao reclamar template:`, err);
    }
}

/**
 * Fallback: cria nosso próprio template via prompt manual. Só roda se o T20
 * não criar um template automaticamente dentro de FALLBACK_PROMPT_MS após o
 * cast.
 */
async function placeTemplateManual(meta: {
    casterActorId: string;
    casterName:    string;
    undeadPenalty: number;
}): Promise<void> {
    const pos = await promptCanvasClick();
    if (!pos) return;

    type SceneLike = FoundryActor & {
        createEmbeddedDocuments(t: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown>;
    };
    type CanvasLike = { scene?: SceneLike };
    const cv    = canvas as unknown as CanvasLike;
    const scene = cv.scene;
    if (!scene) {
        ui.notifications?.error("Consagrar: nenhuma cena ativa");
        return;
    }

    const templateData = {
        t: "circle",
        user: game.user?.id,
        distance: RAIO_METROS,
        direction: 0,
        angle: 0,
        x: pos.x,
        y: pos.y,
        fillColor: "#ffd86b",
        borderColor: "#c9a76a",
        flags: { [MODULE_ID]: buildConsagrarFlags(meta) },
    };

    try {
        await scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
        ui.notifications?.info(`Consagrar posicionada (fallback, ${RAIO_METROS}m, penalidade undead -${meta.undeadPenalty}).`);
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Consagrar: falha ao criar template:`, err);
    }
}

// ── Apply / Remove AEs (GM-side) ─────────────────────────────────────────────

/** Constrói os dados do AE apropriado pro tipo da criatura. */
function buildEffectData(actor: FoundryActor, template: {
    id: string; uuid: string; flags?: Record<string, Record<string, unknown>>;
}): Record<string, unknown> | null {
    const moduleFlags   = template.flags?.[MODULE_ID];
    const undeadPenalty = (moduleFlags?.["undeadPenalty"] as number | undefined) ?? 0;

    if (isUndead(actor)) {
        // Sem aprimoramentos selecionados → T20 não computa penalidade → não
        // criamos AE para o morto-vivo (ele continua na área, mas sem o debuff).
        if (undeadPenalty <= 0) return null;
        return {
            name: `Consagrar — Penalidade (-${undeadPenalty})`,
            img: "icons/svg/sun.svg",
            transfer: false,
            origin: template.uuid,
            flags: { [MODULE_ID]: { [FLAG_EFFECT_ORIGIN]: template.id } },
            changes: [
                { key: "system.attributes.defesa.bonus",      mode: 2, value: `-${undeadPenalty}`, priority: 20 },
                { key: "system.modificadores.pericias.geral", mode: 2, value: `-${undeadPenalty}`, priority: 20 },
            ],
        };
    }
    return {
        name: "Consagrar — Cura Aprimorada",
        img: "icons/svg/holy-shield.svg",
        transfer: false,
        origin: template.uuid,
        flags: {
            [MODULE_ID]: {
                [FLAG_EFFECT_ORIGIN]: template.id,
                [FLAG_HEAL_BOOST]:    true,
            },
        },
        changes: [],
    };
}

/** Verifica se o token já tem um AE deste template. */
function tokenHasEffectFromTemplate(actor: FoundryActor, templateId: string): boolean {
    return (actor.effects?.contents ?? []).some(e =>
        (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN] === templateId
    );
}

/**
 * Lock por (actorId, templateId) para evitar race condition entre paths concorrentes
 * (createMeasuredTemplate sweep + updateToken sync) que ambos passem no check
 * tokenHasEffectFromTemplate antes de qualquer createEmbeddedDocuments resolver.
 */
const _applyInProgress = new Set<string>();

/**
 * Procura uma AE de Consagrar "Penalidade em Mortos-Vivos" no ator que NÃO
 * foi marcada por nós (tipicamente: aplicada pelo botão `chat-apply-ae` do
 * card do T20). Quando existe, devemos ADOTAR essa AE (marcando com nossa
 * flag de origem) em vez de criar uma duplicada.
 */
function findUnclaimedT20PenaltyEffect(
    actor: FoundryActor,
    templateId: string,
): FoundryItemEffect | null {
    for (const e of (actor.effects?.contents ?? [])) {
        const ours = (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN];
        if (ours) continue; // já é nosso (de qualquer template)
        const name = e.name ?? "";
        if (
            name === "Penalidade em Mortos-Vivos" ||
            /^Consagrar\s*[—\-:]\s*Penalidade/i.test(name)
        ) {
            // Sanity: ignora templateId === ours já filtrado acima
            void templateId;
            return e;
        }
    }
    return null;
}

/** Aplica o AE deste template ao token (se ainda não tiver). Thread-safe. */
async function applyEffectToToken(token: FoundryToken, template: {
    id: string; uuid: string; flags?: Record<string, Record<string, unknown>>;
}): Promise<boolean> {
    const actor = token.actor;
    if (!actor) return false;
    const actorId = (actor as unknown as { id?: string }).id ?? "";
    const lockKey = `${actorId}::${template.id}`;
    // Bloqueia qualquer segundo caller antes mesmo de verificar o efeito
    if (_applyInProgress.has(lockKey)) return false;
    if (tokenHasEffectFromTemplate(actor, template.id)) return false;
    _applyInProgress.add(lockKey);
    try {
        // Double-check após adquirir o lock (pode ter sido aplicado por caller concorrente)
        if (tokenHasEffectFromTemplate(actor, template.id)) return false;

        // ADOÇÃO: se já há uma AE de "Penalidade em Mortos-Vivos" no ator
        // (tipicamente aplicada manualmente via botão `chat-apply-ae` do
        // chat-card T20), apenas marcamos com nossa origem em vez de criar
        // duplicata. removeEffectFromToken depois apaga essa AE quando o
        // token deixar a área.
        if (isUndead(actor)) {
            const existing = findUnclaimedT20PenaltyEffect(actor, template.id);
            if (existing) {
                try {
                    await (existing as unknown as { update(d: Record<string, unknown>): Promise<unknown> })
                        .update({ [`flags.${MODULE_ID}.${FLAG_EFFECT_ORIGIN}`]: template.id });
                    return true;
                } catch (err) {
                    console.warn(`[t20-theme-overhaul] Consagrar adopt em ${actor.name}:`, err);
                    // Se a adoção falhar, NÃO criamos uma nova (evita o duplicado)
                    return false;
                }
            }
        }

        const data = buildEffectData(actor, template);
        if (!data) return false;
        await (actor as FoundryActor & {
            createEmbeddedDocuments(t: string, data: unknown[]): Promise<unknown>;
        }).createEmbeddedDocuments("ActiveEffect", [data]);
        return true;
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Consagrar apply em ${actor.name}:`, err);
        return false;
    } finally {
        _applyInProgress.delete(lockKey);
    }
}

/** Remove do token o AE específico deste template. */
async function removeEffectFromToken(token: FoundryToken, templateId: string): Promise<boolean> {
    const actor = token.actor;
    if (!actor) return false;
    const ours = (actor.effects?.contents ?? []).filter(e =>
        (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN] === templateId
    );
    if (ours.length === 0) return false;
    try {
        await (actor as FoundryActor & {
            deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
        }).deleteEmbeddedDocuments("ActiveEffect", ours.map(e => e.id));
        return true;
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Consagrar remove em ${actor.name}:`, err);
        return false;
    }
}

/** Lista todos os templates Consagrar ativos na cena atual. */
function getConsagrarTemplates(): Array<{
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
}> {
    type SceneLike = { templates?: { contents?: Array<{ flags?: Record<string, Record<string, unknown>> }> } };
    const cv = canvas as unknown as { scene?: SceneLike };
    const templates = cv.scene?.templates?.contents ?? [];
    return templates.filter(t =>
        t.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY
    ) as Array<{
        id: string; uuid: string; x: number; y: number; distance: number;
        flags?: Record<string, Record<string, unknown>>;
    }>;
}

/**
 * Lock por tokenId: evita sync concorrente.
 * Pending: garante que a ÚLTIMA posição sempre seja processada, mesmo que o evento
 * tenha chegado durante um sync em andamento (caso contrário o evento seria descartado,
 * causando delay na remoção do AE quando o token sai da área durante um sync ativo).
 */
const _syncInProgress = new Set<string>();
type PendingSync = { token: FoundryToken; overrideXY?: { x?: number; y?: number } };
const _syncPending = new Map<string, PendingSync>();

/**
 * Sincroniza UM token contra TODOS os templates Consagrar na cena.
 *
 * `overrideXY` é o DESTINO do movimento (changes.x/y do updateToken hook).
 * Necessário em Foundry v13 porque `token.document.x/y` continua na posição
 * antiga durante toda a animação — só converge para o destino depois. Sem o
 * override, o sync usa a posição antiga e o "inside" fica incorreto.
 */
async function syncTokenWithTemplates(
    token: FoundryToken,
    overrideXY?: { x?: number; y?: number },
): Promise<void> {
    if (!isActiveGM()) return;
    if (!token.actor) return;
    const tokenId = (token as unknown as { id?: string }).id ?? "";
    if (!tokenId) return;

    if (_syncInProgress.has(tokenId)) {
        // Salva o sync mais recente para re-processar assim que o atual terminar.
        // Sempre prevalece a posição mais nova (último override > anterior).
        _syncPending.set(tokenId, { token, overrideXY });
        return;
    }
    _syncInProgress.add(tokenId);
    try {
        const templates = getConsagrarTemplates();
        if (templates.length === 0) {
            // Sem templates ativos — limpa qualquer AE órfão de Consagrar
            const all = (token.actor.effects?.contents ?? []).filter(e =>
                (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN] != null
            );
            if (all.length > 0) {
                try {
                    await (token.actor as FoundryActor & {
                        deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
                    }).deleteEmbeddedDocuments("ActiveEffect", all.map(e => e.id));
                } catch { /* ignore */ }
            }
            return;
        }
        for (const template of templates) {
            const inside = isTokenInsideTemplate(token, template, overrideXY);
            const has    = tokenHasEffectFromTemplate(token.actor, template.id);
            if (inside && !has)  await applyEffectToToken(token, template);
            if (!inside && has)  await removeEffectFromToken(token, template.id);
        }
    } finally {
        _syncInProgress.delete(tokenId);
        // Processa o sync pendente (última posição) se chegou durante este sync
        const pending = _syncPending.get(tokenId);
        if (pending) {
            _syncPending.delete(tokenId);
            void syncTokenWithTemplates(pending.token, pending.overrideXY);
        }
    }
}

async function applyAEsForTemplate(template: {
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
}): Promise<void> {
    if (!isActiveGM()) return;
    const moduleFlags = template.flags?.[MODULE_ID];
    if (!moduleFlags || moduleFlags[FLAG_SPELL] !== SPELL_KEY) return;

    const tokens = tokensInTemplate(template);
    let undeadCount = 0;
    let livingCount = 0;

    for (const token of tokens) {
        if (!token.actor) continue;
        const applied = await applyEffectToToken(token, template);
        if (applied) {
            if (isUndead(token.actor)) undeadCount++;
            else                       livingCount++;
        }
    }

    if (undeadCount + livingCount > 0) {
        ui.notifications?.info(`Consagrar: ${livingCount} vivo(s) abençoado(s), ${undeadCount} morto(s)-vivo(s) penalizado(s)`);
    }
}

async function removeAEsForTemplate(templateId: string): Promise<void> {
    if (!isActiveGM()) return;

    // Coleta atores únicos de DOIS lugares:
    //   (1) game.actors.contents — atores do mundo
    //   (2) canvas.tokens.placeables[*].actor — atores SINTÉTICOS de tokens
    //       unlinked (NPCs em cena). Importante: para tokens unlinked, o
    //       synthetic.actor é uma instância DIFERENTE com mesmo id do world
    //       actor; precisamos deduplicar por REFERÊNCIA (Set), não por id.
    const actorsSet = new Set<FoundryActor>();
    for (const a of ((game.actors?.contents ?? []) as unknown as FoundryActor[])) {
        if (a) actorsSet.add(a);
    }
    type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
    const cv = canvas as unknown as CanvasLike;
    for (const tk of (cv.tokens?.placeables ?? [])) {
        const a = tk.actor;
        if (a) actorsSet.add(a);
    }
    const actors = [...actorsSet];

    let removed = 0;
    for (const actor of actors) {
        const ours = (actor.effects?.contents ?? []).filter(e =>
            (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN] === templateId
        );
        if (ours.length === 0) continue;
        try {
            await (actor as FoundryActor & {
                deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
            }).deleteEmbeddedDocuments("ActiveEffect", ours.map(e => e.id));
            removed += ours.length;
        } catch (err) {
            console.warn(`[t20-theme-overhaul] Consagrar cleanup em ${actor.name}:`, err);
        }
    }
    if (removed > 0) ui.notifications?.info(`Consagrar removida (${removed} efeito(s) limpos)`);
}

// ── Ação "Remover área" (registrada no skills-menu) ──────────────────────────
//
// O botão na toolbar vem do skills-menu — aqui apenas declaramos o handler
// (onClickRemoveArea + dialogs). Visibilidade:
//   - GM: vê a ação se existir QUALQUER área Consagrar na cena
//   - Jogador: vê a ação se for o creatorUserId de pelo menos uma área

const CONSAGRAR_STYLES_ID = "bg3-t20-consagrar-styles";

// CSS específico do dialog Consagrar — pequeno complemento ao tema bg3-dialog
// (que já cuida do gradiente, header, footer, botões e checkboxes).


function ensureConsagrarStyles(): void {
    if (document.getElementById(CONSAGRAR_STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = CONSAGRAR_STYLES_ID;
    el.textContent = CONSAGRAR_STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type ConsagrarTpl = {
    id: string;
    user?: string | { id?: string };
    author?: { id?: string };
    flags?: Record<string, Record<string, unknown>>;
};

/** Templates Consagrar que o usuário atual pode remover. GMs veem todas. */
function getMyConsagrarTemplates(): ConsagrarTpl[] {
    const all = getConsagrarTemplates() as unknown as ConsagrarTpl[];
    if (game.user?.isGM) return all;
    const uid = game.user?.id;
    if (!uid) return [];
    return all.filter(t => {
        const flagged = t.flags?.[MODULE_ID]?.["creatorUserId"] as string | undefined;
        if (flagged) return flagged === uid;
        // Fallback (templates antigos, sem flag): tenta author/user nativos
        const authorId = t.author?.id ?? (typeof t.user === "string" ? t.user : t.user?.id);
        return authorId === uid;
    });
}

async function onClickRemoveArea(): Promise<void> {
    const mine = getMyConsagrarTemplates();
    if (mine.length === 0) {
        ui.notifications?.info("Nenhuma área de Consagrar ativa para remover.");
        refreshSkillsMenu();
        return;
    }

    type SceneLike = { deleteEmbeddedDocuments?(t: string, ids: string[]): Promise<unknown> };
    const scene = (canvas as unknown as { scene?: SceneLike }).scene;
    if (!scene?.deleteEmbeddedDocuments) {
        ui.notifications?.warn("Cena não disponível.");
        return;
    }

    const idsToRemove = mine.length === 1
        ? await confirmSingleRemoval(mine[0])
        : await pickTemplatesDialog(mine);

    if (!idsToRemove || idsToRemove.length === 0) return;

    try {
        await scene.deleteEmbeddedDocuments("MeasuredTemplate", idsToRemove);
    } catch (err) {
        console.warn(`[t20-theme-overhaul] Consagrar: falha ao remover área(s):`, err);
        ui.notifications?.error("Falha ao remover área de Consagrar (veja console).");
    }
}

function confirmSingleRemoval(tpl: ConsagrarTpl): Promise<string[] | null> {
    const caster = esc((tpl.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Lançador");
    return new Promise<string[] | null>((resolve) => {
        new Dialog({
            title: "Remover área de Consagrar",
            content: `
                <div class="bg3-consagrar-remove">
                    <p>Remover a área de Consagrar de <b>${caster}</b>?</p>
                    <p class="hint">Os efeitos aplicados aos tokens dentro da área serão limpos.</p>
                </div>`,
            buttons: {
                remove: {
                    icon:  '<i class="fas fa-circle-xmark"></i>',
                    label: "Remover",
                    callback: () => resolve([tpl.id]),
                },
                cancel: {
                    icon:  '<i class="fas fa-times"></i>',
                    label: "Cancelar",
                    callback: () => resolve(null),
                },
            },
            default: "remove",
            close:   () => resolve(null),
        }, { classes: ["bg3-dialog"] }).render(true);
    });
}

function pickTemplatesDialog(templates: ConsagrarTpl[]): Promise<string[] | null> {
    return new Promise<string[] | null>((resolve) => {
        const rows = templates.map((t, i) => {
            const caster = esc((t.flags?.[MODULE_ID]?.["casterName"] as string | undefined) ?? "Lançador");
            return `
                <label class="picker-row">
                    <input type="checkbox" data-tid="${t.id}" checked />
                    <span class="row-idx">Área #${i + 1}</span>
                    <span class="row-name"><b>${caster}</b></span>
                </label>`;
        }).join("");

        new Dialog({
            title: "Remover áreas de Consagrar",
            content: `
                <div class="bg3-consagrar-picker">
                    <p class="picker-intro">Selecione as áreas a remover</p>
                    ${rows}
                </div>`,
            buttons: {
                remove: {
                    icon:  '<i class="fas fa-circle-xmark"></i>',
                    label: "Remover selecionadas",
                    callback: ($html: JQuery) => {
                        const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                        const ids = Array.from(
                            (root as HTMLElement).querySelectorAll("input[data-tid]:checked")
                        )
                            .map(el => el.getAttribute("data-tid") ?? "")
                            .filter(Boolean);
                        resolve(ids.length > 0 ? ids : null);
                    },
                },
                cancel: {
                    icon:  '<i class="fas fa-times"></i>',
                    label: "Cancelar",
                    callback: () => resolve(null),
                },
            },
            default: "remove",
            close:   () => resolve(null),
        }, { classes: ["bg3-dialog"] }).render(true);
    });
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function setupConsagrar(): void {
    // CSS específico dos dialogs Consagrar (complementa o tema bg3-dialog)
    ensureConsagrarStyles();

    // Ação no skills-menu (botão único na toolbar)
    registerSkillAction({
        id:    "consagrar-remove",
        label: "Remover área de Consagrar",
        icon:  "fa-solid fa-circle-xmark",
        color: "#ffb84d",
        isVisible: () => getMyConsagrarTemplates().length > 0,
        onClick:   () => onClickRemoveArea(),
    });

    // 1. Detecta cast → registra "pending" para reclamar o template do T20
    //    (NÃO mais cria template aqui — antes resultava em 2 áreas no canvas).
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        const uid = getMsgAuthorId(message);
        if (uid !== game.user?.id) return;
        if (normalizeCondName(extractSpellName(message)) !== SPELL_KEY) return;

        registerPendingCast(uid, {
            casterActorId: message.speaker?.actor ?? "",
            casterName:    message.speaker?.alias ?? "Lançador",
            // T20 já computou a penalidade total em flags.tormenta20.effects[]
            // (respeita "1PM: -2 base" + "2PM × N: cada nível adiciona -1").
            // Se nenhum aprimoramento for selecionado, vem 0 → sem AE de penalidade.
            undeadPenalty: computeUndeadPenaltyFromMessage(message),
        });
    });

    // 2. Template criado:
    //    - se foi criado por nós (autor) e há pending → reclamamos via doc.update
    //      (a aplicação de AEs vem via updateMeasuredTemplate quando o flag chega)
    //    - se já vem com flag Consagrar (cena recarregada/import) → GM aplica AEs
    Hooks.on("createMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc = args[0] as {
            id: string; uuid: string; x: number; y: number; distance: number;
            user?: string | { id?: string };
            author?: { id?: string };
            flags?: Record<string, Record<string, unknown>>;
            update(data: Record<string, unknown>): Promise<unknown>;
        };
        const triggerUserId = typeof args[2] === "string" ? args[2] as string : undefined;
        const currentUid    = game.user?.id;
        const hasConsagrar  = tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY;

        // Claim: só o autor do template tenta reclamar (evita race entre clientes)
        if (currentUid && !hasConsagrar) {
            const authorUid =
                tplDoc.author?.id
                ?? (typeof tplDoc.user === "string" ? tplDoc.user : tplDoc.user?.id)
                ?? triggerUserId;
            if (authorUid === currentUid) {
                const pending = _pendingCasts.get(currentUid);
                if (pending && Date.now() - pending.ts < PENDING_WINDOW_MS) {
                    clearPending(currentUid);
                    void claimTemplate(tplDoc, pending);
                    // applyAEs virá via updateMeasuredTemplate quando o flag propagar.
                    refreshSkillsMenu();
                    return;
                }
            }
        }

        if (hasConsagrar && isActiveGM()) {
            void applyAEsForTemplate(tplDoc);
        }
        refreshSkillsMenu();
    });

    // 3. Template deletado → GM remove AEs criados por ele
    Hooks.on("deleteMeasuredTemplate", (...args: unknown[]) => {
        const template = args[0] as { id: string; flags?: Record<string, Record<string, unknown>> };
        if (template.flags?.[MODULE_ID]?.[FLAG_SPELL] !== SPELL_KEY) return;
        void removeAEsForTemplate(template.id);
        refreshSkillsMenu();
    });

    // 4. Token atualizado → resincroniza com todos os templates Consagrar.
    //    QUIRK DE FOUNDRY v13: quando este hook dispara, `tokenDoc.x/y` ainda
    //    estão na posição ANTIGA — o DESTINO está em `changes.x/y`. Só depois
    //    da animação inteira (centenas de ms) é que doc.x/y converge para o
    //    destino. Passamos `changes.x/y` como override de posição pro sync,
    //    senão o cálculo "inside" usa a posição antiga e o AE não aplica/sai.
    Hooks.on("updateToken", (...args: unknown[]) => {
        if (getConsagrarTemplates().length === 0) return;
        const tokenDoc = args[0] as { object?: FoundryToken; flags?: Record<string, Record<string, unknown>> };
        // Skip esfera-flamejante (token sintético da Bola de Fogo, não é criatura)
        if (tokenDoc.flags?.[MODULE_ID]?.["spell"] === "bola-de-fogo-esfera") return;
        const changes  = args[1] as Record<string, unknown> | undefined;
        const token    = tokenDoc.object;
        if (!token) return;
        const destX = typeof changes?.["x"] === "number" ? (changes["x"] as number) : undefined;
        const destY = typeof changes?.["y"] === "number" ? (changes["y"] as number) : undefined;
        const overrideXY = (destX !== undefined || destY !== undefined)
            ? { x: destX, y: destY }
            : undefined;
        void syncTokenWithTemplates(token, overrideXY);
    });

    // 4b. AE criada em qualquer ator:
    //     Se for "Penalidade em Mortos-Vivos" (vinda do botão `chat-apply-ae`
    //     do card T20) e o ator estiver dentro de uma área Consagrar:
    //       - se JÁ existe uma AE nossa pra esse template → deleta a nova
    //         (é a duplicada); caso contrário, ADOTA a nova marcando com
    //         nossa flag de origem.
    //     Evita o cenário de duplicação reportado quando o usuário clica
    //     no botão de aplicar efeito do chat APÓS o nosso auto-apply.
    Hooks.on("createActiveEffect", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const ae = args[0] as FoundryItemEffect & {
            parent?: FoundryActor;
            update?(d: Record<string, unknown>): Promise<unknown>;
        };
        // Pula AE que já é nossa (já tem origem Consagrar)
        if ((ae.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN]) return;
        const name = ae.name ?? "";
        if (
            name !== "Penalidade em Mortos-Vivos" &&
            !/^Consagrar\s*[—\-:]\s*Penalidade/i.test(name)
        ) return;
        const actor = ae.parent;
        if (!actor) return;

        const templates = getConsagrarTemplates();
        if (templates.length === 0) return;

        type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
        const cv = canvas as unknown as CanvasLike;
        const tokens = cv.tokens?.placeables ?? [];
        // Acha o token deste ator (linked ou unlinked) na cena
        const myToken = tokens.find(t =>
            t.actor === actor ||
            (t.actor as unknown as { id?: string })?.id === (actor as unknown as { id?: string }).id
        );
        if (!myToken) return;

        for (const template of templates) {
            if (!isTokenInsideTemplate(myToken, template)) continue;
            const oursForThisTpl = (actor.effects?.contents ?? []).find(e =>
                e.id !== ae.id &&
                (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_EFFECT_ORIGIN] === template.id
            );
            if (oursForThisTpl) {
                // Já temos AE pra esse template → a recém-criada é duplicada → deleta
                void (actor as FoundryActor & {
                    deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
                }).deleteEmbeddedDocuments("ActiveEffect", [ae.id]);
            } else {
                // Adota: marca a AE recém-criada como nossa
                void ae.update?.({ [`flags.${MODULE_ID}.${FLAG_EFFECT_ORIGIN}`]: template.id });
            }
            return;
        }
    });

    // 5. FASE 2: Token criado na cena → checa se cai em algum template Consagrar
    Hooks.on("createToken", (...args: unknown[]) => {
        const tokenDoc = args[0] as { object?: FoundryToken };
        if (getConsagrarTemplates().length === 0) return;
        const token = tokenDoc.object;
        if (!token) return;
        void syncTokenWithTemplates(token);
    });

    // 6. Template atualizado:
    //    a) Flag Consagrar foi recém-adicionado (claim do T20-template) → GM aplica AEs
    //    b) Posição/tamanho mudou → re-sync de todos os tokens da cena
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc  = args[0] as {
            id: string; uuid: string; x: number; y: number; distance: number;
            flags?: Record<string, Record<string, unknown>>;
        };
        const changes = args[1] as Record<string, unknown>;

        // (a) Flag Consagrar acabou de ser adicionada
        const flagChange = (changes["flags"] as Record<string, Record<string, unknown>> | undefined)?.[MODULE_ID];
        if (flagChange && flagChange[FLAG_SPELL] === SPELL_KEY) {
            if (isActiveGM()) void applyAEsForTemplate(tplDoc);
            refreshSkillsMenu();
            return;
        }

        // (b) Mudança geométrica em template Consagrar já existente
        if (tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] !== SPELL_KEY) return;
        if (changes["x"] === undefined && changes["y"] === undefined && changes["distance"] === undefined) return;
        if (!isActiveGM()) return;
        type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
        const cv = canvas as unknown as CanvasLike;
        const tokens = cv.tokens?.placeables ?? [];
        void (async () => {
            for (const token of tokens) {
                if (!token.actor) continue;
                const inside = isTokenInsideTemplate(token, tplDoc);
                const has    = tokenHasEffectFromTemplate(token.actor, tplDoc.id);
                if (inside && !has)  await applyEffectToToken(token, tplDoc);
                if (!inside && has)  await removeEffectFromToken(token, tplDoc.id);
            }
        })();
    });

    // 7. FASE 3: Ao carregar/trocar cena → sincroniza tokens com templates existentes
    // canvasReady dispara tanto no start do mundo quanto ao trocar de cena
    Hooks.on("canvasReady", () => {
        // Botão de remover precisa refletir o estado da cena recém-carregada
        // (vale para GM e jogadores; por isso vem antes do early-return de GM).
        refreshSkillsMenu();

        if (!isActiveGM()) return;
        const templates = getConsagrarTemplates();
        if (templates.length === 0) return;
        type CanvasLike = { tokens?: { placeables?: FoundryToken[] } };
        const cv = canvas as unknown as CanvasLike;
        const tokens = cv.tokens?.placeables ?? [];
        void (async () => {
            for (const token of tokens) {
                if (!token.actor) continue;
                await syncTokenWithTemplates(token);
            }
            ui.notifications?.info(`Consagrar: ${templates.length} área(s) ativa(s) restaurada(s)`);
        })();
    });

    // 8b. Toolbar re-render / ready / canvasReady: cobertos pelo skills-menu
    //     setup global — não precisamos duplicar aqui.

    // 8. FASE 3: Tempo do mundo avança → remove templates cujo 1 dia expirou
    const ONE_DAY_SECONDS = 86400;
    Hooks.on("updateWorldTime", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const worldTime = args[0] as number;
        const templates = getConsagrarTemplates();
        if (templates.length === 0) return;
        type SceneLike = {
            deleteEmbeddedDocuments?(t: string, ids: string[]): Promise<unknown>;
        };
        const scene = (canvas as unknown as { scene?: SceneLike }).scene;
        for (const template of templates) {
            const createdAt = template.flags?.[MODULE_ID]?.["createdAtGameTime"] as number | undefined;
            if (createdAt == null) continue;
            if (worldTime - createdAt >= ONE_DAY_SECONDS) {
                void scene?.deleteEmbeddedDocuments?.("MeasuredTemplate", [template.id]);
                ui.notifications?.info("Consagrar: área expirou após 1 dia de jogo e foi removida");
            }
        }
    });
}
