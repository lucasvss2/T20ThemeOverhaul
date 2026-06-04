/**
 * Coluna de Chamas (magia divina de evocação, círculo 3) — área one-shot.
 *
 * Texto: "Um pilar de fogo sagrado desce dos céus, causando 6d6 de dano de fogo
 * mais 6d6 de dano de luz nas criaturas e objetos livres na área (cilindro de 3m
 * de raio). Reflexos reduz à metade." Aprimoramentos: +1 PM → +1d6 fogo; +1 PM
 * → +1d6 luz (T20 já soma esses dados ao roll no cast — mesma face d6, sem o bug
 * de face estrangeira).
 *
 * Arquitetura — espelha o BASE da Bola de Fogo (explosão one-shot):
 *   1. createChatMessage → detecta o cast, captura dano/CD/resistência,
 *      registra um pending (o T20 cria o MeasuredTemplate da área; o user
 *      posiciona).
 *   2. createMeasuredTemplate → o autor reivindica o template (adiciona flags).
 *   3. updateMeasuredTemplate (flag recém-adicionada) → o CASTER dispara a
 *      resistência por alvo DENTRO da área (só quem está na região selecionada),
 *      reusando o mesmo damageRoll (Reflexos reduz à metade).
 *
 * Diferença-chave em relação à Bola de Fogo: o grid (template) + a animação NÃO
 * somem por timer fixo — somem quando TODOS os alvos terminam a interação de
 * resistência. Cada modal de resistência, ao fechar, emite um socket de volta
 * ao caster (via resolveNotify); ao zerar a contagem, deletamos o template
 * (o que também encerra a animação do autoanimations atrelada a ele). Há um
 * fallback de segurança caso algum alvo nunca responda.
 */

import { MODULE_ID } from "@/constants";
import {
    extractSpellName, normalizeCondName, getMsgAuthorId,
    parseResistance, extractCD, getTargetUserId, dispatchSpellResistanceToTarget,
} from "@/spell-resistance/index";
import type { SpellResistPreRollRequest } from "@/spell-resistance/types";
import { tokensInTemplate } from "@/_shared";
import { onSocketReady } from "@/socket";
import { log, warn } from "@/utils/logging";

const SPELL_KEY             = "coluna-de-chamas";
const SPELL_NAME_NORMALIZED = "coluna de chamas";
const FLAG_SPELL            = "spell";
const SOCKET_RESOLVED       = "coluna-de-chamas/resolved";
const PENDING_WINDOW_MS     = 30_000;
const RESOLVE_FALLBACK_MS   = 90_000; // segurança: remove o grid mesmo se um alvo nunca responder
const EMPTY_LINGER_MS       = 2_500;  // sem alvos: deixa a animação tocar um pouco antes de remover

// ── Estado ───────────────────────────────────────────────────────────────────

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
const _pendingCasts = new Map<string, PendingCast>(); // key: casterUserId

type TplLike = {
    id: string; uuid: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
    delete?(): Promise<unknown>;
};

// Resoluções pendentes por template id (castId). Vive no cliente do CASTER.
type Resolution = { remaining: number; tpl: TplLike; timer: ReturnType<typeof setTimeout> | null };
const _resolutions = new Map<string, Resolution>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function registerPendingCast(uid: string, cast: Omit<PendingCast, "ts">): void {
    _pendingCasts.set(uid, { ...cast, ts: Date.now() });
}

function buildFlags(meta: PendingCast): Record<string, unknown> {
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

async function claimTemplate(tplDoc: TplLike, pending: PendingCast): Promise<void> {
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}`]: buildFlags(pending) });
    } catch (err) {
        warn(`Coluna de Chamas: falha ao reclamar template:`, err);
    }
}

/** Remove o template (grid) — encerra também a animação do autoanim atrelada a ele. */
async function removeTemplateAndAnim(tpl: TplLike): Promise<void> {
    try {
        await tpl.delete?.();
    } catch (err) {
        warn(`Coluna de Chamas: falha ao remover template:`, err);
    }
}

/** Chamado (no cliente do caster) sempre que UM alvo termina a resistência. */
function onTargetResolved(castId: string): void {
    const res = _resolutions.get(castId);
    if (!res) return;
    res.remaining -= 1;
    if (res.remaining > 0) return;
    // Todos resolveram → limpa o fallback e remove o grid + animação.
    if (res.timer) clearTimeout(res.timer);
    _resolutions.delete(castId);
    void removeTemplateAndAnim(res.tpl);
    log(`Coluna de Chamas: todos os alvos resolveram — grid e animação removidos.`);
}

/** Dispara a resistência pra cada alvo dentro da área e arma o tracking de conclusão. */
async function dispatchColuna(tplDoc: TplLike): Promise<void> {
    const flags = tplDoc.flags?.[MODULE_ID];
    if (!flags || flags[FLAG_SPELL] !== SPELL_KEY || flags["dispatched"] === true) return;
    try {
        await tplDoc.update({ [`flags.${MODULE_ID}.dispatched`]: true });
    } catch (err) {
        warn(`Coluna de Chamas: falha ao marcar dispatched:`, err);
    }

    const casterName    = (flags["casterName"]    as string) ?? "Lançador";
    const casterUserId  = (flags["casterUserId"]  as string) ?? "";
    const messageId     = (flags["messageId"]     as string) ?? "";
    const damageTotal   = (flags["damageTotal"]   as number) ?? 0;
    const damageFormula = (flags["damageFormula"] as string) ?? "";
    const cd            = (flags["cd"]            as number) ?? 0;
    const resistTxt     = (flags["resistTxt"]     as string) ?? "Reflexos reduz à metade";
    const spellName     = (flags["spellName"]     as string) ?? "Coluna de Chamas";
    const { skill, outcome } = parseResistance(resistTxt);

    // Só atinge quem está DENTRO da região selecionada (centro do token no raio).
    const tokens = tokensInTemplate({ x: tplDoc.x, y: tplDoc.y, distance: tplDoc.distance });

    type RandomIDFn = () => string;
    const rid = (globalThis as unknown as { randomID?: RandomIDFn }).randomID
             ?? (() => Math.random().toString(36).slice(2, 18));

    let dispatched = 0;
    for (const token of tokens) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        const targetUserId = getTargetUserId(targetActor);
        if (!targetUserId) {
            ui.notifications?.warn(`Coluna de Chamas: nenhum usuário ativo para ${targetActor.name}.`);
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
            // Quando este alvo terminar, avisa o caster (pra contagem de conclusão).
            resolveNotify:     { socketName: SOCKET_RESOLVED, userId: casterUserId, payload: tplDoc.id },
        };
        dispatchSpellResistanceToTarget(preReq);
        dispatched++;
    }

    if (dispatched === 0) {
        ui.notifications?.info(`Coluna de Chamas: nenhum alvo na área (${damageTotal} de dano rolado).`);
        // Nada a aguardar — deixa a animação tocar brevemente e remove.
        setTimeout(() => void removeTemplateAndAnim(tplDoc), EMPTY_LINGER_MS);
        return;
    }

    ui.notifications?.info(`Coluna de Chamas desce! ${damageTotal} de dano em ${dispatched} alvo(s).`);
    // Arma o tracking: o grid/animação só somem quando todos resolverem.
    const timer = setTimeout(() => {
        if (!_resolutions.has(tplDoc.id)) return;
        _resolutions.delete(tplDoc.id);
        void removeTemplateAndAnim(tplDoc);
        warn(`Coluna de Chamas: fallback de tempo atingido — grid removido sem todos os alvos terem respondido.`);
    }, RESOLVE_FALLBACK_MS);
    _resolutions.set(tplDoc.id, { remaining: dispatched, tpl: tplDoc, timer });
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function setupColunaDeChamas(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_RESOLVED, (...args: unknown[]) => {
            const castId = args[0] as string;
            if (castId) onTargetResolved(castId);
        });
    });

    // 1. Detecta o cast (só o autor processa).
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        const uid = getMsgAuthorId(message);
        if (uid !== game.user?.id) return;
        if (!normalizeCondName(extractSpellName(message)).includes(SPELL_NAME_NORMALIZED)) return;

        const itemData = message.getFlag("tormenta20", "itemData") as Record<string, unknown> | undefined;
        if (!itemData) return;

        // Soma TODOS os rolls de dano (6d6 fogo + 6d6 luz + aprimoramentos).
        const dmgRolls = (message.rolls ?? []).filter(
            r => (r.options as Record<string, unknown>)?.["type"] === "damage",
        );
        if (dmgRolls.length === 0) {
            warn(`Coluna de Chamas castada mas sem damage roll na msg.`);
            return;
        }
        const damageTotal   = dmgRolls.reduce((s, r) => s + (r.total ?? 0), 0);
        const damageFormula = dmgRolls.map(r => r.formula).filter(Boolean).join(" + ");

        const resist = itemData["resistencia"] as Record<string, unknown> | undefined;
        let cd = Number(resist?.["cd"] ?? 0);
        const cdFromHtml = extractCD(message);
        if (cdFromHtml > 0) cd = cdFromHtml; // HTML inclui todos os bônus de poder
        const resistTxt = String(resist?.["txt"] ?? "Reflexos reduz à metade");

        registerPendingCast(uid, {
            casterActorId: message.speaker?.actor ?? "",
            casterName:    message.speaker?.alias ?? "Lançador",
            casterUserId:  uid,
            messageId:     message.id,
            damageTotal,
            damageFormula,
            cd,
            resistTxt,
            spellName:     "Coluna de Chamas",
        });
    });

    // 2. Template criado pelo T20 (área da magia) → o autor reivindica.
    Hooks.on("createMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc = args[0] as TplLike & { user?: string | { id?: string }; author?: { id?: string } };
        const triggerUserId = typeof args[2] === "string" ? (args[2] as string) : undefined;
        const currentUid = game.user?.id;
        if (!currentUid) return;
        if (tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY) return; // já é nosso

        const authorUid =
            tplDoc.author?.id
            ?? (typeof tplDoc.user === "string" ? tplDoc.user : tplDoc.user?.id)
            ?? triggerUserId;
        if (authorUid !== currentUid) return;

        const pending = _pendingCasts.get(currentUid);
        if (!pending || Date.now() - pending.ts >= PENDING_WINDOW_MS) return;
        _pendingCasts.delete(currentUid);
        void claimTemplate(tplDoc, pending);
    });

    // 3. Flag recém-adicionada → o CASTER dispara a resistência por alvo.
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc  = args[0] as TplLike;
        const changes = args[1] as Record<string, unknown> | undefined;
        const flags   = tplDoc.flags?.[MODULE_ID];
        if (!flags || flags[FLAG_SPELL] !== SPELL_KEY || flags["dispatched"] === true) return;
        const changedFlags = (changes?.["flags"] as Record<string, unknown> | undefined)?.[MODULE_ID];
        if (!changedFlags) return;
        if (flags["casterUserId"] !== game.user?.id) return;
        void dispatchColuna(tplDoc);
    });
}
