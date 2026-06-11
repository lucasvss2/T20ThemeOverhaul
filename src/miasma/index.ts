/**
 * Miasma Mefítico — Divina 2 (Necromancia). Automação dos APRIMORAMENTOS
 * (a versão padrão já funciona via fluxo de resistência existente):
 *
 *  - "+2 PM: aumenta o dano em +1d6" → NATIVO (AE on-use `dano=1d6` do item;
 *    o T20 aplica no roll). Nada a fazer.
 *  - "+3 PM: muda o tipo do dano para trevas" → a AE do compêndio vem com
 *    changes VAZIAS (não-funcional). Consertamos a AE no item com a key nativa
 *    `tipoDano` (mode OVERRIDE) — o T20 então troca `5d6[acido]` → `[trevas]`
 *    no próprio roll. (Mesma lição do Kiai: corrigir a AE, não duplicar.)
 *  - "Truque" → fluxo dedicado completo:
 *      · valida ANTES do cast (patch AbilityUseDialog → return null cancela
 *        sem gastar PM): exatamente 1 alvo com PV ≤ 0, alvo não-imune, e
 *        componente material Pó de Ônix no inventário (consumido no cast);
 *      · após o card: rola Fortitude do alvo vs CD da magia;
 *        FALHOU → alvo MORRE (status "morto") + conjurador ganha +2 na CD de
 *        magias por 1 dia (AE em system.attributes.cd, duração 86400s);
 *        PASSOU → alvo fica imune a este truque por 1 dia (flag worldTime);
 *      · o modal genérico de resistência é suprimido (one-shot).
 *
 * Também cria o COMPÊNDIO de mundo "T20 Overhaul — Itens" com o item
 * "Pó de Ônix" (consumível, T$ 10) para o GM distribuir quando quiser.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import {
    extractSpellName,
    normalizeCondName,
    extractCD,
    parseResistance,
    getTargetUserId,
    dispatchSpellResistanceToTarget,
} from "@/spell-resistance/index";
import type { SpellResistPreRollRequest, SpellConditionData } from "@/spell-resistance/types";
import { tokensInTemplate } from "@/_shared";
import { onSocketReady } from "@/socket";

const SPELL_NORM = "miasma mefitico";
const PO_NORM = "po de onix";
const IMMUNE_FLAG = "miasmaImmuneUntil";
const ONE_DAY_S = 86400;
const PACK_ID = "world.aeris-itens";
const PACK_LABEL = "T20 Overhaul — Itens";

// ── Helpers puros (testáveis) ─────────────────────────────────────────────────

/** A entrada de onUseEffects é o Truque do Miasma? */
export function isTruqueDescription(desc: string): boolean {
    return /alcance\s+para\s+toque/i.test(desc) && /0\s*PV/i.test(desc);
}

/** O Truque foi selecionado no cast? */
export function hasTruqueSelected(onUseEffects: unknown): boolean {
    if (!Array.isArray(onUseEffects)) return false;
    return onUseEffects.some((e) => {
        const entry = e as { description?: unknown; qty?: unknown };
        const qty = Number(entry.qty ?? 0);
        return qty >= 1 && isTruqueDescription(String(entry.description ?? ""));
    });
}

/** O alvo está imune ao Truque? (`until` é worldTime salvo na flag.) */
export function isTruqueImmune(until: unknown, nowWorldTime: number): boolean {
    return typeof until === "number" && until > nowWorldTime;
}

// ── Detecção ────────────────────────────────────────────────────────────────

interface ItemLike { type?: string; name?: string; parent?: FoundryActor | null }

function isMiasma(item: ItemLike | null | undefined): boolean {
    return !!item && item.type === "magia" && normalizeCondName(item.name ?? "").includes(SPELL_NORM);
}

function messageAuthorId(message: ChatMessage): string | undefined {
    return (message as { author?: { id?: string }; user?: string | { id?: string } }).author?.id
        ?? (typeof message.user === "string" ? message.user : message.user?.id);
}

function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const ids = (game.users?.contents ?? []).filter((u) => u.isGM && u.active).map((u) => u.id).sort();
    return ids[0] === myId;
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Fix da AE "trevas" (changes vazias no compêndio) ───────────────────────────

async function ensureTrevasChange(item: FoundryItem): Promise<void> {
    const ae = (item.effects?.contents ?? []).find(
        (e) => /tipo\s+do\s+dano\s+para\s+trevas/i.test(e.name ?? "") && (e.changes ?? []).length === 0,
    );
    if (!ae) return;
    await ae.update({
        changes: [{ key: "tipoDano", value: "trevas", mode: 5, priority: 20 }],
    }, { render: false });
    log(`Miasma: AE "trevas" consertada (tipoDano override) em ${item.parent?.name ?? "item"}.`);
}

/** Varre atores do mundo consertando AEs "trevas" vazias (uma vez, GM eleito). */
async function sweepTrevasFix(): Promise<void> {
    for (const a of game.actors?.contents ?? []) {
        const miasmas = (a.items?.contents ?? []).filter((i) => isMiasma(i as ItemLike));
        for (const m of miasmas) await ensureTrevasChange(m);
    }
}

// ── Pó de Ônix: localizar / consumir ───────────────────────────────────────────

function findPoDeOnix(actor: FoundryActor | null | undefined): FoundryItem | null {
    if (!actor) return null;
    return (actor.items?.contents ?? []).find((i) => {
        if (!["consumivel", "tesouro", "equipamento"].includes(i.type)) return false;
        if (!normalizeCondName(i.name ?? "").includes(PO_NORM)) return false;
        const qty = Number((i.system as { quantidade?: unknown })?.quantidade ?? 1);
        return qty >= 1;
    }) ?? null;
}

async function consumePoDeOnix(item: FoundryItem, actor: FoundryActor): Promise<void> {
    const qty = Number((item.system as { quantidade?: unknown })?.quantidade ?? 1);
    if (qty > 1) {
        await (item as unknown as { update(d: Record<string, unknown>): Promise<unknown> })
            .update({ "system.quantidade": qty - 1 });
    } else {
        await actor.deleteEmbeddedDocuments("Item", [item.id], { render: false });
    }
    ui.notifications?.info("Miasma (Truque): 1 Pó de Ônix consumido.");
}

// ── Truque: contexto pendente (wrapper → handler do card) ─────────────────────

interface PendingTruque {
    casterActorId: string;
    targetTokenId: string;
    targetName: string;
    ts: number;
}
let _pending: PendingTruque | null = null;

/** Validações do Truque ANTES do cast. Retorna o contexto ou null (cancela). */
function validateTruque(casterActor: FoundryActor | null): PendingTruque | null {
    const targets = Array.from(game.user?.targets ?? []) as FoundryToken[];
    if (targets.length !== 1 || !targets[0].actor) {
        ui.notifications?.warn("Miasma (Truque): selecione exatamente 1 alvo.");
        return null;
    }
    const tok = targets[0];
    const tActor = tok.actor!;
    const pv = Number((tActor.system?.attributes as { pv?: { value?: number } } | undefined)?.pv?.value ?? 0);
    if (pv > 0) {
        ui.notifications?.warn(`Miasma (Truque): o alvo precisa estar com 0 PV ou menos (${tActor.name} tem ${pv} PV).`);
        return null;
    }
    const now = game.time?.worldTime ?? 0;
    const until = (tActor.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[IMMUNE_FLAG];
    if (isTruqueImmune(until, now)) {
        ui.notifications?.warn(`Miasma (Truque): ${tActor.name} está imune a este truque (passou na resistência há menos de 1 dia).`);
        return null;
    }
    const po = findPoDeOnix(casterActor);
    if (!po) {
        ui.notifications?.warn("Miasma (Truque): requer componente material — Pó de Ônix (T$ 10) no inventário.");
        return null;
    }
    return {
        casterActorId: casterActor?.id ?? "",
        targetTokenId: tok.id,
        targetName: tActor.name,
        ts: Date.now(),
    };
}

// ── Patch do AbilityUseDialog (validação pré-cast) ─────────────────────────────

function patchAbilityUseDialog(): void {
    type DlgLike = { create: (item: unknown, ...a: unknown[]) => Promise<unknown>; _bg3PatchedMiasma?: boolean };
    const Dlg = (game as unknown as { tormenta20?: { applications?: { AbilityUseDialog?: DlgLike } } })
        .tormenta20?.applications?.AbilityUseDialog;
    if (!Dlg) { warn("Miasma: AbilityUseDialog não encontrado — Truque sem validação pré-cast."); return; }
    if (Dlg._bg3PatchedMiasma) return;
    const orig = Dlg.create.bind(Dlg);
    Dlg.create = async function (item: unknown, ...args: unknown[]): Promise<unknown> {
        const result = await orig(item, ...args);
        if (!result || typeof result !== "object") return result;
        if (!isMiasma(item as ItemLike)) return result;
        const onUse = (result as { onUseEffects?: unknown }).onUseEffects;
        if (!hasTruqueSelected(onUse)) return result;

        const casterActor = (item as ItemLike).parent ?? null;
        const ctx = validateTruque(casterActor);
        if (!ctx) return null; // cancela o cast — sem PM, sem card

        const po = findPoDeOnix(casterActor);
        if (po && casterActor) await consumePoDeOnix(po, casterActor);
        _pending = ctx;
        return result;
    };
    Dlg._bg3PatchedMiasma = true;
}

// ── Resolução do Truque (após o card do cast) ──────────────────────────────────

async function resolveTruque(message: ChatMessage): Promise<void> {
    const ctx = _pending;
    _pending = null;
    if (!ctx || Date.now() - ctx.ts > 30000) return;

    type Lyr = { get(id: string): FoundryToken | undefined };
    const tok = ((canvas as unknown as { tokens?: Lyr }).tokens)?.get(ctx.targetTokenId);
    const tActor = tok?.actor;
    if (!tActor) { warn("Miasma (Truque): alvo não encontrado na cena."); return; }
    const casterActor = game.actors?.get(ctx.casterActorId) ?? null;
    const casterName = message.speaker?.alias ?? casterActor?.name ?? "Conjurador";

    const cd = extractCD(message);
    const fort = Number((tActor.system?.pericias as Record<string, { value?: number }> | undefined)?.["fort"]?.value ?? 0);
    const roll = new Roll(`1d20+${fort}`);
    await roll.evaluate();
    const passed = (roll.total ?? 0) >= cd;

    let outcomeHtml: string;
    if (passed) {
        // Imune a este truque por 1 dia (worldTime).
        const now = game.time?.worldTime ?? 0;
        await tActor.update({ [`flags.${MODULE_ID}.${IMMUNE_FLAG}`]: now + ONE_DAY_S }, { render: false });
        outcomeHtml =
            `<div style="color:#6ecf7a;font-weight:700;">PASSOU — ${esc(tActor.name)} resiste e fica imune a este truque por 1 dia.</div>`;
    } else {
        // Morre + conjurador ganha +2 CD por 1 dia.
        await tActor.toggleStatusEffect("morto", { active: true, overlay: true });
        if (casterActor) {
            await casterActor.createEmbeddedDocuments("ActiveEffect", [{
                name: "Miasma Mefítico — vítima consumida (+2 CD de magias)",
                icon: "icons/magic/death/skull-poison-green.webp",
                transfer: false,
                disabled: false,
                changes: [{ key: "system.attributes.cd", value: "2", mode: 2, priority: 20 }],
                duration: { seconds: ONE_DAY_S },
                flags: { [MODULE_ID]: { miasmaCdBuff: true } },
            }], { render: false });
        }
        outcomeHtml =
            `<div style="color:#cc4444;font-weight:700;">FALHOU — ${esc(tActor.name)} MORRE.</div>` +
            `<div style="color:#c8a96e;">${esc(casterName)} recebe +2 na CD de magias por 1 dia.</div>`;
    }

    let rendered = "";
    try { rendered = await roll.render({ flavor: `Fortitude (${esc(tActor.name)}) vs CD ${cd}` }); } catch { /* ignore */ }
    await ChatMessage.create({
        speaker: { alias: casterName },
        content:
            `<div style="border-left:3px solid #7a4ecf;padding:6px 10px;">` +
            `<div style="color:#b08ae8;font-weight:700;letter-spacing:0.05em;">☠️ Miasma Mefítico — Truque</div>` +
            `<div style="color:#9a8e7a;font-size:0.85em;">Alvo: ${esc(tActor.name)} · Fortitude anula · CD ${cd}</div>` +
            rendered + outcomeHtml +
            `</div>`,
        rolls: [roll.toJSON?.() ?? roll] as unknown[],
        flags: { [MODULE_ID]: { miasmaTruqueCard: true } },
    } as Record<string, unknown>);
    log(`Miasma Truque resolvido: ${tActor.name} ${passed ? "passou (imune 1 dia)" : "morreu"} (fort ${fort} vs CD ${cd}).`);
}

// ── Compêndio: Pó de Ônix ─────────────────────────────────────────────────────

async function ensurePoDeOnixCompendium(): Promise<void> {
    if (!game.user?.isGM || !isActiveGM()) return;
    try {
        type Packs = {
            get(id: string): {
                getIndex(): Promise<Array<{ _id: string; name: string }>>;
            } | undefined;
        };
        const packs = (game as unknown as { packs?: Packs }).packs;
        let pack = packs?.get(PACK_ID);
        if (!pack) {
            const CC = (globalThis as unknown as {
                CompendiumCollection?: { createCompendium(d: Record<string, unknown>): Promise<unknown> };
            }).CompendiumCollection;
            if (!CC) return;
            await CC.createCompendium({ label: PACK_LABEL, name: "aeris-itens", type: "Item" });
            pack = packs?.get(PACK_ID);
        }
        if (!pack) return;
        const idx = await pack.getIndex();
        if (idx.some((e) => normalizeCondName(e.name).includes(PO_NORM))) return;
        const ItemCls = (globalThis as unknown as {
            Item?: { create(d: Record<string, unknown>, ctx?: Record<string, unknown>): Promise<unknown> };
        }).Item;
        await ItemCls?.create({
            name: "Pó de Ônix",
            type: "consumivel",
            img: "icons/commodities/materials/bowl-powder-grey.webp",
            system: {
                preco: 10,
                quantidade: 1,
                description: {
                    value: "<p>Pó de ônix no valor de T$ 10 — componente material do <b>Truque</b> do Miasma Mefítico.</p>",
                },
            },
        }, { pack: PACK_ID });
        log(`Compêndio "${PACK_LABEL}" pronto com Pó de Ônix.`);
    } catch (e) {
        warn("Miasma: falha ao garantir compêndio do Pó de Ônix:", e);
    }
}

// ── Área (base): template → dano em quem está dentro do grid ──────────────────
//
// Espelha a Coluna de Chamas: registra o cast pendente, reivindica o template
// que o T20 cria (user posiciona o grid), dispara o modal de resistência pra
// cada token DENTRO da área, e remove grid + animação quando TODOS resolvem
// (resolveNotify por alvo; fallback de tempo de segurança).

const SPELL_KEY           = "miasma-mefitico";
const FLAG_SPELL          = "spell";
const SOCKET_RESOLVED     = "miasma/resolved";
const PENDING_WINDOW_MS   = 30_000;
const RESOLVE_FALLBACK_MS = 90_000;
const EMPTY_LINGER_MS     = 2_500;

interface AreaPending {
    casterName: string;
    casterUserId: string;
    messageId: string;
    damageTotal: number;
    damageFormula: string;
    cd: number;
    resistTxt: string;
    ts: number;
}
const _areaPending = new Map<string, AreaPending>(); // key: casterUserId

type TplLike = {
    id: string; x: number; y: number; distance: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
    delete?(): Promise<unknown>;
};

type Resolution = { remaining: number; tpl: TplLike; timer: ReturnType<typeof setTimeout> | null };
const _resolutions = new Map<string, Resolution>();

async function removeTemplateAndAnim(tpl: TplLike): Promise<void> {
    try { await tpl.delete?.(); } catch (e) { warn("Miasma: falha ao remover template:", e); }
}

function onTargetResolved(castId: string): void {
    const res = _resolutions.get(castId);
    if (!res) return;
    res.remaining -= 1;
    if (res.remaining > 0) return;
    if (res.timer) clearTimeout(res.timer);
    _resolutions.delete(castId);
    void removeTemplateAndAnim(res.tpl);
    log("Miasma: todos os alvos resolveram — grid e animação removidos.");
}

/** Condição "enjoado por 1 rodada" (se o status existir no CONFIG). */
function enjoadoCondition(): SpellConditionData[] {
    const st = ((CONFIG as unknown as { statusEffects?: Array<{ id: string; name?: string; label?: string }> })
        .statusEffects ?? []).find((s) => /enjoad/i.test(`${s.id}${s.name ?? s.label ?? ""}`));
    if (!st) return [];
    return [{ statusId: st.id, label: st.name ?? st.label ?? "Enjoado", durationRounds: 1 }];
}

async function dispatchMiasmaArea(tplDoc: TplLike): Promise<void> {
    const flags = tplDoc.flags?.[MODULE_ID];
    if (!flags || flags[FLAG_SPELL] !== SPELL_KEY || flags["dispatched"] === true) return;
    try { await tplDoc.update({ [`flags.${MODULE_ID}.dispatched`]: true }); } catch (e) { warn("Miasma: dispatched flag:", e); }

    const casterName    = (flags["casterName"]    as string) ?? "Lançador";
    const casterUserId  = (flags["casterUserId"]  as string) ?? "";
    const messageId     = (flags["messageId"]     as string) ?? "";
    const damageTotal   = (flags["damageTotal"]   as number) ?? 0;
    const damageFormula = (flags["damageFormula"] as string) ?? "";
    const cd            = (flags["cd"]            as number) ?? 0;
    const resistTxt     = (flags["resistTxt"]     as string) ?? "Fortitude (veja texto)";
    const { skill, outcome } = parseResistance(resistTxt);
    const conditions = enjoadoCondition();

    const tokens = tokensInTemplate({ x: tplDoc.x, y: tplDoc.y, distance: tplDoc.distance });
    const rid = (globalThis as unknown as { randomID?: () => string }).randomID
        ?? (() => Math.random().toString(36).slice(2, 18));

    let dispatched = 0;
    for (const token of tokens) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        const targetUserId = getTargetUserId(targetActor);
        if (!targetUserId) {
            ui.notifications?.warn(`Miasma: nenhum usuário ativo para ${targetActor.name}.`);
            continue;
        }
        const preReq: SpellResistPreRollRequest = {
            type: "spell-resist-preroll",
            requestId: rid(),
            targetUserId,
            casterUserId,
            targetActorId: targetActor.id,
            targetActorUuid: targetActor.uuid,
            casterName,
            spellName: "Miasma Mefítico",
            resistTxt,
            resistSkill: skill,
            resistOutcome: outcome,
            cd,
            messageId,
            damageTotal,
            damageFormula,
            isHeal: false,
            maxHealValue: 0,
            removeFadiga: false,
            truqueAtivo: false,
            conditions,
            customEffectNames: [],
            resolveNotify: { socketName: SOCKET_RESOLVED, userId: casterUserId, payload: tplDoc.id },
        };
        dispatchSpellResistanceToTarget(preReq);
        dispatched++;
    }

    if (dispatched === 0) {
        ui.notifications?.info(`Miasma Mefítico: nenhum alvo na área (${damageTotal} de dano rolado).`);
        setTimeout(() => void removeTemplateAndAnim(tplDoc), EMPTY_LINGER_MS);
        return;
    }
    ui.notifications?.info(`Miasma Mefítico! ${damageTotal} de dano em ${dispatched} alvo(s).`);
    const timer = setTimeout(() => {
        if (!_resolutions.has(tplDoc.id)) return;
        _resolutions.delete(tplDoc.id);
        void removeTemplateAndAnim(tplDoc);
        warn("Miasma: fallback de tempo — grid removido sem todos os alvos responderem.");
    }, RESOLVE_FALLBACK_MS);
    _resolutions.set(tplDoc.id, { remaining: dispatched, tpl: tplDoc, timer });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupMiasma(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_RESOLVED, (...args: unknown[]) => {
            const castId = args[0] as string;
            if (castId) onTargetResolved(castId);
        });
    });

    Hooks.once("ready", () => {
        patchAbilityUseDialog();
        void ensurePoDeOnixCompendium();
        if (isActiveGM()) void sweepTrevasFix();
    });

    // Item adicionado a uma ficha → conserta AE trevas (autor do add).
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as FoundryItem & ItemLike;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;
        if (!isMiasma(item)) return;
        void ensureTrevasChange(item);
    });

    // Card do cast (autor): Truque pendente → resolve; senão → registra pending
    // de ÁREA (o T20 cria o template; o user posiciona o grid).
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessage;
        if (messageAuthorId(message) !== game.user?.id) return;
        if (!message.getFlag?.("tormenta20", "itemData")) return;
        if (!normalizeCondName(extractSpellName(message)).includes(SPELL_NORM)) return;

        if (_pending) { void resolveTruque(message); return; }

        // Base/área: precisa de damage roll.
        const dmgRolls = (message.rolls ?? []).filter(
            (r) => (r.options as Record<string, unknown>)?.["type"] === "damage",
        );
        if (!dmgRolls.length) return;
        const itemData = message.getFlag("tormenta20", "itemData") as Record<string, unknown>;
        const resist = itemData["resistencia"] as { txt?: string; cd?: number } | undefined;
        let cd = Number(resist?.cd ?? 0);
        const cdHtml = extractCD(message);
        if (cdHtml > 0) cd = cdHtml;

        _areaPending.set(game.user?.id ?? "", {
            casterName: message.speaker?.alias ?? "Lançador",
            casterUserId: game.user?.id ?? "",
            messageId: message.id,
            damageTotal: dmgRolls.reduce((s, r) => s + (r.total ?? 0), 0),
            damageFormula: dmgRolls.map((r) => r.formula).filter(Boolean).join(" + "),
            cd,
            resistTxt: String(resist?.txt ?? "Fortitude (veja texto)"),
            ts: Date.now(),
        });
    });

    // Template criado pelo T20 → o autor reivindica.
    Hooks.on("createMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc = args[0] as TplLike & { user?: string | { id?: string }; author?: { id?: string } };
        const triggerUserId = typeof args[2] === "string" ? (args[2] as string) : undefined;
        const me = game.user?.id;
        if (!me) return;
        if (tplDoc.flags?.[MODULE_ID]?.[FLAG_SPELL] === SPELL_KEY) return;
        const authorUid = tplDoc.author?.id
            ?? (typeof tplDoc.user === "string" ? tplDoc.user : tplDoc.user?.id)
            ?? triggerUserId;
        if (authorUid !== me) return;
        const pending = _areaPending.get(me);
        if (!pending || Date.now() - pending.ts >= PENDING_WINDOW_MS) return;
        _areaPending.delete(me);
        void tplDoc.update({
            [`flags.${MODULE_ID}`]: {
                [FLAG_SPELL]: SPELL_KEY,
                casterName: pending.casterName,
                casterUserId: pending.casterUserId,
                messageId: pending.messageId,
                damageTotal: pending.damageTotal,
                damageFormula: pending.damageFormula,
                cd: pending.cd,
                resistTxt: pending.resistTxt,
                dispatched: false,
            },
        }).catch((e: unknown) => warn("Miasma: falha ao reclamar template:", e));
    });

    // Flag recém-adicionada → o CASTER dispara o dano/resistência na área.
    Hooks.on("updateMeasuredTemplate", (...args: unknown[]) => {
        const tplDoc = args[0] as TplLike;
        const changes = args[1] as Record<string, unknown> | undefined;
        const flags = tplDoc.flags?.[MODULE_ID];
        if (!flags || flags[FLAG_SPELL] !== SPELL_KEY || flags["dispatched"] === true) return;
        const changedFlags = (changes?.["flags"] as Record<string, unknown> | undefined)?.[MODULE_ID];
        if (!changedFlags) return;
        if (flags["casterUserId"] !== game.user?.id) return;
        void dispatchMiasmaArea(tplDoc);
    });

    log("Miasma Mefítico (área + trevas + Truque + Pó de Ônix) instalado.");
}
