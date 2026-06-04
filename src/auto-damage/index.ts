import type { AutoDamageRequest, AttackRerollRequest, AttackMissNotify } from "./types";
import { getSocket, onSocketReady } from "@/socket";
import {
    getAuraInvencibilidadeContextForActor,
    markAuraInvencibilidadeUsed,
} from "@/area-spells/aura-sagrada";
import { getMsgAuthorId } from "@/spell-resistance/index";
import { isGritoOnUseActive, getSamuraiLevel, getBonusDie, getBonusDieMax, computeEffectiveCriticoX, computeEffectiveCriticoM, getKeptD20Natural } from "@/grito-kiai/index";
import AUTO_DAMAGE_STYLES from "./auto-damage.css?inline";

// ── socketlib handler names ──────────────────────────────────────────────────

const SOCKET_DAMAGE_REQUEST = "auto-damage/request";
const SOCKET_REROLL_REQUEST = "auto-damage/reroll-request";
const SOCKET_MISS_NOTIFY    = "auto-damage/miss-notify";

// ── CSS ───────────────────────────────────────────────────────────────────────

const AUTO_DAMAGE_STYLES_ID = "bg3-t20-auto-damage-styles";

function ensureStyles(): void {
    if (!document.getElementById(AUTO_DAMAGE_STYLES_ID)) {
        const el = document.createElement("style");
        el.id = AUTO_DAMAGE_STYLES_ID;
        el.textContent = AUTO_DAMAGE_STYLES;
        document.head.appendChild(el);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findPlayerOwner(actor: FoundryActor): FoundryUser | undefined {
    const owners = Object.entries(actor.ownership ?? {})
        .filter(([, level]) => (level as number) >= 3)
        .map(([userId]) => userId);
    return (game.users?.contents ?? []).find(
        (u) => !u.isGM && u.active && owners.includes(u.id),
    );
}

function findActiveGM(): FoundryUser | undefined {
    return (game.users?.contents ?? []).find((u) => u.isGM && u.active);
}

function getTargetUserId(actor: FoundryActor): string | null {
    const player = findPlayerOwner(actor);
    if (player) return player.id;
    const gm = findActiveGM();
    return gm?.id ?? null;
}

function getDef(actor: FoundryActor): number {
    return actor.system?.attributes?.defesa?.value ?? 10;
}

function readPmInput(root: HTMLElement): number {
    return parseInt(root.querySelector<HTMLInputElement>('[name="pmCost"]')?.value ?? "", 10) || 0;
}

function readRdInput(root: HTMLElement): number {
    return Math.max(0, parseInt(root.querySelector<HTMLInputElement>('[name="rd"]')?.value ?? "", 10) || 0);
}

/** Aplica RD ao dano, garantindo mínimo 0 (nunca negativo). */
function applyRd(amount: number, rd: number): number {
    return Math.max(0, amount - rd);
}

// ── Token actor resolution ────────────────────────────────────────────────────
//
// game.actors.get(id) returns the PROTOTYPE (pv = 0 base value).
// For unlinked NPC tokens the real per-token HP lives in the canvas Token.
// canvas.tokens.get(tokenId).actor is the live synthetic actor whose
// update() proxies through the TokenDocument — the correct target.

function resolveActor(targetTokenId: string, targetActorId: string): FoundryActor | null {
    type CanvasTokenLayer = { get(id: string): { actor: FoundryActor | null } | undefined };
    const layer = (canvas as unknown as { tokens?: CanvasTokenLayer }).tokens;
    const canvasActor = layer?.get(targetTokenId)?.actor ?? null;
    return canvasActor ?? game.actors?.get(targetActorId) ?? null;
}

// ── Damage & PM application ───────────────────────────────────────────────────

async function applyDamage(targetTokenId: string, targetActorId: string, amount: number, pmCost: number): Promise<void> {
    const actor = resolveActor(targetTokenId, targetActorId);
    if (!actor) return;

    const pv         = actor.system?.attributes?.pv;
    const currentTemp = pv?.temp  ?? 0;
    const currentHp   = pv?.value ?? 0;

    let remaining = Math.max(0, amount);
    let newTemp   = currentTemp;

    if (newTemp > 0) {
        const used = Math.min(newTemp, remaining);
        remaining -= used;
        newTemp   -= used;
    }

    const newHp = Math.max(0, currentHp - remaining);

    const update: Record<string, unknown> = {
        "system.attributes.pv.temp":  newTemp,
        "system.attributes.pv.value": newHp,
    };

    if (pmCost > 0) {
        const currentPm = actor.system?.attributes?.pm?.value ?? 0;
        update["system.attributes.pm.value"] = Math.max(0, currentPm - pmCost);
    }

    await actor.update(update);
}

// ── Reroll handling (runs on attacker's client) ───────────────────────────────

async function buildRerollContent(rollLabel: string, attackRoll: Roll, damageRoll?: Roll): Promise<string> {
    const attackHtml = await attackRoll.render({ flavor: "Ataque" });
    const damageHtml = damageRoll ? await damageRoll.render({ flavor: "Dano" }) : "";
    return `<div class="bg3-reroll-header">↺ Rerolagem — ${esc(rollLabel)}</div>${attackHtml}${damageHtml}`;
}

/**
 * Detecta se um Roll já avaliado foi rolado com maximize (todos os dados na face
 * máxima). Usado para descobrir post-hoc se Kiai Divino (ou outro AE com value:"max")
 * foi aplicado na rolagem original — essa flag é necessária pra reroll respeitar
 * a mesma semântica.
 *
 * Heurística: cada Die term tem .results[].result === .faces para TODOS os
 * resultados ativos, E há ≥2 dados no total (evita falso positivo de 1d20=20
 * natural). Maximize por aprimoramento sempre envolve múltiplos dados de dano.
 */
export function isRollMaximized(roll: Roll): boolean {
    let totalDice = 0;
    for (const term of roll.terms) {
        const t = term as unknown as { faces?: number; results?: Array<{ result: number; active: boolean }> };
        if (!t.faces || !t.results) continue;
        for (const r of t.results) {
            if (r.active === false) continue;
            totalDice++;
            if (r.result !== t.faces) return false;
        }
    }
    return totalDice >= 2;
}

/**
 * Decomposes a critted damage formula into two parts:
 *
 *  base      — weapon dice (each ÷ criticoX) + flat modifiers.
 *              To re-crit: apply critifyFormula(base, criticoX).
 *
 *  critOnly  — crit-only bonus dice whose count is NOT divisible by criticoX.
 *              T20 adds these AFTER its crit multiplication (e.g. Cruel's
 *              1d6[danoCritico], reverberante post-crit dice). They must be
 *              re-added as-is when the reroll also crits, and omitted otherwise.
 *
 * Example: "12d6 + 5 + 1 + 1d6 + 2" with criticoX=3
 *   → base "4d6 + 5 + 1 + 2", critOnly "1d6"
 */
export function deriveBaseDamageFormula(dmgRoll: Roll, criticoX: number): { base: string; critOnly: string } {
    const allExpr = dmgRoll.terms.map(t => (t as { expression?: string }).expression ?? "").join(" ").trim();
    if (criticoX <= 1) return { base: allExpr, critOnly: "" };

    type Term = { expression?: string; faces?: number; number?: number };
    const terms = dmgRoll.terms as unknown as Term[];

    // Indices of non-divisible dice (crit-only) AND their preceding operator
    const skipForBase = new Set<number>();
    const critOnlyDiceIndices = new Set<number>();
    terms.forEach((t, i) => {
        if (typeof t.faces === "number" && typeof t.number === "number") {
            if (t.number % criticoX !== 0) {
                critOnlyDiceIndices.add(i);
                skipForBase.add(i);
                if (i > 0) skipForBase.add(i - 1); // operator before this die
            }
        }
    });

    const baseParts: string[] = [];
    const critOnlyParts: string[] = [];

    terms.forEach((t, i) => {
        if (typeof t.faces === "number" && typeof t.number === "number") {
            if (critOnlyDiceIndices.has(i)) {
                // Collect just the dice expression (operator stripped — joined with " + " below)
                critOnlyParts.push(t.expression ?? `${t.number}d${t.faces}`);
            } else if (!skipForBase.has(i)) {
                baseParts.push(`${t.number / criticoX}d${t.faces}`);
            }
        } else if (!skipForBase.has(i)) {
            const expr = (t.expression ?? "").trim();
            if (expr) baseParts.push(expr);
        }
    });

    return {
        base:     baseParts.join(" ").trim(),
        critOnly: critOnlyParts.join(" + ").trim(),
    };
}

/**
 * Re-applies a critical multiplier to a base damage formula string.
 * "4d6 + 5" with criticoX=3 → "12d6 + 5"
 */
export function critifyFormula(baseFormula: string, criticoX: number): string {
    if (criticoX <= 1) return baseFormula;
    return baseFormula.replace(/(\d+)d(\d+)/g, (_, n, f) => `${parseInt(n, 10) * criticoX}d${f}`);
}

async function handleReroll(req: AttackRerollRequest): Promise<void> {
    const speaker = { alias: req.attackerName };
    const gritoActive   = req.gritoActive ?? false;
    const samuraiLvl    = req.samuraiLevel ?? 1;
    const critX         = req.effectiveCriticoX ?? 2;
    const critM         = req.effectiveCriticoM ?? 20;

    // Primary attack roll. If the formula already carries native advantage (2d20kh),
    // the single roll IS the advantage roll — read the kept d20, no separate 2nd die.
    const attackRoll = new Roll(req.attackFormula);
    await attackRoll.evaluate({ async: true });

    const isNativeAdvantage = /kh/i.test(req.attackFormula);
    let grito2Roll: Roll | null = null;
    let effectiveNatural = getKeptD20Natural(attackRoll);
    let newAttackTotal = attackRoll.total ?? 0;

    if (gritoActive && !isNativeAdvantage) {
        // Legacy fallback: roll a separate second d20 and take the better
        grito2Roll = new Roll(req.attackFormula);
        await grito2Roll.evaluate({ async: true });
        const t2 = grito2Roll.total ?? 0;
        if (t2 > newAttackTotal) {
            newAttackTotal   = t2;
            effectiveNatural = getKeptD20Natural(grito2Roll);
        }
    }

    // Missed on reroll — post attack rolls to chat, notify both sides
    if (newAttackTotal < req.targetDef) {
        const rollsForMiss: object[] = [attackRoll.toJSON()];
        if (grito2Roll) rollsForMiss.push(grito2Roll.toJSON());
        const atkHtml  = await attackRoll.render({ flavor: "Ataque" });
        const g2Html   = grito2Roll
            ? await grito2Roll.render({ flavor: "Grito de Kiai — Segundo Dado" })
            : "";
        await ChatMessage.create({
            content: await buildRerollContent(req.rollLabel, attackRoll) + g2Html,
            rolls:   rollsForMiss,
            type:    5,
            speaker,
        });
        void atkHtml; // suppress unused warning — buildRerollContent renders it

        const missPayload: AttackMissNotify = {
            type:         "attack-miss-notify",
            targetUserId: req.targetUserId,
            attackerName: req.attackerName,
            attackTotal:  newAttackTotal,
            targetDef:    req.targetDef,
        };

        if (req.targetUserId === game.user?.id) {
            ui.notifications.info(
                `Ataque de ${req.attackerName} errou no reroll! (${newAttackTotal} vs DEF ${req.targetDef})`,
            );
        } else {
            void getSocket()?.executeAsUser(
                SOCKET_MISS_NOTIFY,
                req.targetUserId,
                missPayload,
            );
        }
        return;
    }

    // Still hits — rebuild damage formula correctly.
    // baseDamageFormula is the non-critted weapon formula (set when original attack was a crit).
    // If not present, damageFormula already is the base (original was not a crit).
    // Then re-apply crit only if the NEW roll actually crits.
    const isCritReroll   = effectiveNatural >= critM;
    const critMultReroll = isCritReroll ? critX : 1;

    const baseDmgFormula   = req.baseDamageFormula ?? req.damageFormula;
    // Re-apply crit to weapon dice; then re-append crit-only bonus dice (Cruel, reverberante, etc.)
    // that T20 injects AFTER its own crit multiplier — they appear only when a crit actually lands.
    const crittedWeapon    = isCritReroll ? critifyFormula(baseDmgFormula, critX) : baseDmgFormula;
    const critOnly         = req.critOnlyDmgFormula ?? "";
    const weaponDmgFormula = (isCritReroll && critOnly) ? `${crittedWeapon} + ${critOnly}` : crittedWeapon;

    let rerollDmgFormula = weaponDmgFormula;
    if (gritoActive) {
        const bonusDieStr  = getBonusDie(samuraiLvl);
        const bonusFaces   = getBonusDieMax(bonusDieStr);
        const bonusExpr    = critMultReroll > 1 ? `${critMultReroll}d${bonusFaces}` : bonusDieStr;
        rerollDmgFormula   = `${rerollDmgFormula} + ${bonusExpr}`;
    }

    const damageRoll = new Roll(rerollDmgFormula);
    await damageRoll.evaluate({ maximize: req.damageMaximized });

    const rerollRolls: object[] = [attackRoll.toJSON()];
    if (grito2Roll) rerollRolls.push(grito2Roll.toJSON());
    rerollRolls.push(damageRoll.toJSON());

    const g2HtmlHit = grito2Roll
        ? await grito2Roll.render({ flavor: "Grito de Kiai — Segundo Dado" })
        : "";
    await ChatMessage.create({
        content: await buildRerollContent(req.rollLabel, attackRoll, damageRoll) + g2HtmlHit,
        rolls:   rerollRolls,
        type:    5,
        speaker,
    });

    const newPayload: AutoDamageRequest = {
        type:           "auto-damage-request",
        requestId:      randomID(),
        targetUserId:   req.targetUserId,
        attackerUserId: game.user?.id ?? "",
        targetActorId:  req.targetActorId,
        targetTokenId:  req.targetTokenId,
        attackerName:   req.attackerName,
        rollLabel:      req.rollLabel,
        attackTotal:    newAttackTotal,
        targetDef:      req.targetDef,
        damageTotal:    damageRoll.total ?? 0,
        attackFormula:  req.attackFormula,
        damageFormula:      rerollDmgFormula,
        damageMaximized:    req.damageMaximized,
        baseDamageFormula:  baseDmgFormula,
        critOnlyDmgFormula: critOnly || undefined,
        gritoActive,
        samuraiLevel:       samuraiLvl,
        effectiveCriticoX:  critX,
        effectiveCriticoM:  critM,
    };

    if (req.targetUserId === game.user?.id) {
        openDamagePrompt(newPayload);
    } else {
        void getSocket()?.executeAsUser(
            SOCKET_DAMAGE_REQUEST,
            req.targetUserId,
            newPayload,
        );
    }
}

// ── Damage prompt dialog ──────────────────────────────────────────────────────

function openDamagePrompt(req: AutoDamageRequest): void {
    ensureStyles();

    const targetActor = resolveActor(req.targetTokenId, req.targetActorId);
    const targetName  = targetActor?.name ?? "Alvo";
    const halfDmg     = Math.floor(req.damageTotal / 2);

    // Aura de Invencibilidade — quando o alvo está dentro de uma aura cujo
    // caster tem o aprimoramento E ainda não usou nesta cena, oferecemos um
    // botão extra que ignora 100% do dano (e do RD) e marca o uso.
    const invencContext = getAuraInvencibilidadeContextForActor(req.targetActorId, req.targetTokenId);
    const hasInvenc     = invencContext.length > 0;
    const invencCasters = invencContext.map(c => c.casterName).join(" + ");

    const invencBadgeHtml = hasInvenc
        ? `<div class="aad-invenc-badge">
                <b>Aura de Invencibilidade</b> disponível — <b>${esc(invencCasters)}</b> permite
                ignorar este dano (primeira vez na cena).
            </div>`
        : "";

    const content = `
        <div class="aad-body">
            <div class="aad-banner">
                <div class="aad-label-sm">ALVO ATINGIDO</div>
                <div class="aad-target-name">${esc(targetName)}</div>
            </div>
            <div class="aad-divider"></div>
            <div class="aad-row">
                <span class="aad-label-sm">ATACANTE</span>
                <span class="aad-value-lg">${esc(req.attackerName)}</span>
            </div>
            <div class="aad-row">
                <span class="aad-label-sm">ATAQUE</span>
                <span class="aad-attack-val">${req.attackTotal}</span>
                <span class="aad-label-sm">vs DEF</span>
                <span class="aad-def-val">${req.targetDef}</span>
            </div>
            <div class="aad-divider"></div>
            <div class="aad-damage-display">
                <div class="aad-label-sm">DANO</div>
                <div class="aad-damage-total">${req.damageTotal}</div>
            </div>
            ${invencBadgeHtml}
            <div class="aad-pm-row">
                <span class="aad-label-sm">RD</span>
                <input type="number" name="rd" value="0" min="0" max="999" class="aad-pm-input" />
            </div>
            <div class="aad-divider"></div>
            <div class="aad-pm-row">
                <span class="aad-label-sm">CUSTO DE MANA (PM)</span>
                <input type="number" name="pmCost" value="0" min="0" max="999" class="aad-pm-input" />
            </div>
        </div>
    `;

    const buttons: foundry.applications.api.DialogV2Button[] = [
        {
            type:    "submit",
            action:  "full",
            label:   `Aplicar Integral (${req.damageTotal})`,
            icon:    "fas fa-sword",
            default: true,
            callback: (_event, _button, dialog) => {
                const root     = dialog.element;
                const finalDmg = applyRd(req.damageTotal, readRdInput(root));
                void applyDamage(req.targetTokenId, req.targetActorId, finalDmg, readPmInput(root));
            },
        },
        {
            type:   "submit",
            action: "half",
            label:  `Aplicar Metade (${halfDmg})`,
            icon:   "fas fa-shield-halved",
            callback: (_event, _button, dialog) => {
                const root     = dialog.element;
                const finalDmg = applyRd(halfDmg, readRdInput(root));
                void applyDamage(req.targetTokenId, req.targetActorId, finalDmg, readPmInput(root));
            },
        },
        {
            type:   "submit",
            action: "none",
            label:  "Não Aplicar",
            icon:   "fas fa-ban",
            callback: (_event, _button, dialog) => {
                const root = dialog.element;
                const pm   = readPmInput(root);
                if (pm > 0) void applyDamage(req.targetTokenId, req.targetActorId, 0, pm);
            },
        },
    ];

    if (hasInvenc) {
        buttons.push({
            type:   "submit",
            action: "invenc",
            label:  "Ignorar (Aura de Invencibilidade)",
            icon:   "fas fa-shield-heart",
            callback: (_event, _button, dialog) => {
                const root = dialog.element;
                const pm   = readPmInput(root);
                void markAuraInvencibilidadeUsed({
                    actorId:       req.targetActorId,
                    tokenId:       req.targetTokenId,
                    casterName:    invencCasters,
                    targetName,
                    damageIgnored: req.damageTotal,
                });
                if (pm > 0) void applyDamage(req.targetTokenId, req.targetActorId, 0, pm);
            },
        });
    }

    buttons.push({
        type:   "submit",
        action: "reroll",
        label:  "Forçar Rerolar Ataque",
        icon:   "fas fa-dice-d20",
        callback: () => {
            const rerollReq: AttackRerollRequest = {
                type:           "attack-reroll-request",
                requestId:      req.requestId,
                attackerUserId: req.attackerUserId,
                targetUserId:   req.targetUserId,
                targetActorId:  req.targetActorId,
                targetTokenId:  req.targetTokenId,
                attackFormula:  req.attackFormula,
                damageFormula:  req.damageFormula,
                attackerName:   req.attackerName,
                rollLabel:      req.rollLabel,
                targetDef:      req.targetDef,
                damageMaximized:    req.damageMaximized,
                baseDamageFormula:  req.baseDamageFormula,
                critOnlyDmgFormula: req.critOnlyDmgFormula,
                gritoActive:        req.gritoActive,
                samuraiLevel:       req.samuraiLevel,
                effectiveCriticoX:  req.effectiveCriticoX,
                effectiveCriticoM:  req.effectiveCriticoM,
            };

            if (req.attackerUserId === game.user?.id) {
                void handleReroll(rerollReq);
            } else {
                void getSocket()?.executeAsUser(SOCKET_REROLL_REQUEST, req.attackerUserId, rerollReq);
            }
        },
    });

    void foundry.applications.api.DialogV2.wait({
        id:      `auto-damage-${req.requestId}`,
        classes: ["bg3-dialog", "aad-dialog"],
        window:  { title: `Dano — ${targetName}` },
        position: { width: 380 },
        content,
        buttons,
        render: (_event, dialog) => {
            const root    = dialog.element;
            const rdInput = root.querySelector<HTMLInputElement>('[name="rd"]');
            const fullBtn = root.querySelector<HTMLButtonElement>('button[data-action="full"]');
            const halfBtn = root.querySelector<HTMLButtonElement>('button[data-action="half"]');

            const refresh = (): void => {
                const rd        = readRdInput(root);
                const fullDmg   = applyRd(req.damageTotal, rd);
                const halfFinal = applyRd(halfDmg, rd);
                if (fullBtn) fullBtn.innerHTML = `<i class="fas fa-sword"></i> Aplicar Integral (${fullDmg})`;
                if (halfBtn) halfBtn.innerHTML = `<i class="fas fa-shield-halved"></i> Aplicar Metade (${halfFinal})`;
            };

            rdInput?.addEventListener("input", refresh);
        },
        rejectClose: false,
    });
}

// ── Socket handler ────────────────────────────────────────────────────────────

function setupSocket(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_DAMAGE_REQUEST, (...args: unknown[]) => {
            openDamagePrompt(args[0] as AutoDamageRequest);
        });
        socket.register(SOCKET_REROLL_REQUEST, (...args: unknown[]) => {
            void handleReroll(args[0] as AttackRerollRequest);
        });
        socket.register(SOCKET_MISS_NOTIFY, (...args: unknown[]) => {
            const data = args[0] as AttackMissNotify;
            ui.notifications.info(
                `Ataque de ${data.attackerName} errou no reroll! (${data.attackTotal} vs DEF ${data.targetDef})`,
            );
        });
    });
}

// ── createChatMessage hook ────────────────────────────────────────────────────

function setupCreateChatHook(): void {
    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;

        // Require attack + damage rolls — sufficient to identify a weapon attack.
        // We intentionally do NOT check itemData here: for weapon attacks in T20 v13
        // the itemData flag may be null or empty even for valid attack messages.
        const rolls = message.rolls;
        if (!rolls?.length) return;

        const attackRoll = rolls.find((r) => (r.options as Record<string, unknown>)?.["type"] === "attack");
        const damageRoll = rolls.find((r) => (r.options as Record<string, unknown>)?.["type"] === "damage");
        if (!attackRoll || !damageRoll) return;

        const attackTotal   = attackRoll.total ?? 0;
        const damageTotal   = damageRoll.total ?? 0;
        // roll.formula returns cached _formula (pre-crit value) — T20's alter() on
        // terms[0] modifies the Die's .number but doesn't update _formula.
        // Reconstruct from terms so critical multiplier (e.g. 4d6→20d6) is preserved.
        const attackFormula = attackRoll.terms.map((t) => t.expression).join(" ").trim()
            || attackRoll.formula || "1d20";
        const damageFormula = damageRoll.terms.map((t) => t.expression).join(" ").trim()
            || damageRoll.formula || "";
        // Detecta se o dano foi maximizado (Kiai Divino seleciona AE com value:"max"
        // → T20 chama roll.evaluate({maximize:true}) → todos os dados saem na face
        // máxima). Reroll precisa preservar essa semântica.
        const damageMaximized = isRollMaximized(damageRoll);

        // Resolve attacker actor once for Grito-related computations
        const spkTokenId = (message.speaker as Record<string, unknown>)?.token as string | undefined ?? "";
        const spkActorId = (message.speaker as Record<string, unknown>)?.actor as string | undefined ?? "";
        type CanvasTokenLyrAD = { get(id: string): { actor: FoundryActor | null } | undefined };
        const tokenLyrAD = (canvas as unknown as { tokens?: CanvasTokenLyrAD }).tokens;
        const atkActor = tokenLyrAD?.get(spkTokenId)?.actor ?? game.actors?.get(spkActorId) ?? null;

        type ItemDataFlagsAD = { criticoX?: number };
        const iFlags = message.getFlag("tormenta20", "itemData") as ItemDataFlagsAD | null | undefined;
        const gritoActive = isGritoOnUseActive(message);
        const samuraiLvl  = gritoActive && atkActor ? getSamuraiLevel(atkActor) : 1;
        // Resolve weapon item so computeEffectiveCriticoM can factor in weapon AEs (e.g. Medalhão)
        const msgItemIdAD = (message.content as string | undefined)?.match(/data-item-id="([^"]+)"/)?.[1] ?? "";
        const weaponItemAD = msgItemIdAD && atkActor ? atkActor.items?.get(msgItemIdAD) ?? null : null;
        // Always compute both — effCriticoX is also needed for deriveBaseDamageFormula
        const effCriticoX = computeEffectiveCriticoX(message, atkActor, typeof iFlags?.criticoX === "number" ? iFlags.criticoX : 2);
        const effCriticoM = computeEffectiveCriticoM(message, atkActor, weaponItemAD);

        // Natural die result for crit detection — read the KEPT d20 (advantage rolls
        // are 2d20kh; results[0] may be the discarded die).
        const naturalDieVal = getKeptD20Natural(attackRoll);
        const originalIsCrit = naturalDieVal >= effCriticoM;

        // Kiai Divino + Grito de Kiai simultâneos: o dado bônus do Grito é
        // maximizado e somado ao total. O Grito card mostra "incluído no dano auto".
        let effectiveDamageTotal = damageTotal;
        if (damageMaximized && gritoActive) {
            effectiveDamageTotal += getBonusDieMax(getBonusDie(samuraiLvl)) * (originalIsCrit ? effCriticoX : 1);
        }

        // Decompose critted formula: weapon base (÷ criticoX) + crit-only bonus dice.
        // Stored so reroll can re-evaluate with correct crit status.
        const derived = originalIsCrit ? deriveBaseDamageFormula(damageRoll, effCriticoX) : undefined;
        const baseDamageFormula  = derived?.base;
        const critOnlyDmgFormula = derived?.critOnly || undefined;

        const attackerName  = message.speaker?.alias ?? "Atacante";
        const rollLabel     = message.flavor || "Ataque";

        // ── Apenas o autor da mensagem processa (usa os targets de quem lançou) ──
        // Garante que o GM com T em algum token não interfere no roll do jogador.
        if (getMsgAuthorId(message) !== game.user?.id) return;

        const targets = game.user?.targets;
        if (!targets?.size) return;

        const attackerUserId = game.user?.id ?? "";

        for (const token of targets) {
            const targetActor = token.actor;
            if (!targetActor) continue;

            const targetDef = getDef(targetActor);
            if (attackTotal < targetDef) {
                ui.notifications.info(
                    `${attackerName} errou ${targetActor.name}! (${attackTotal} vs DEF ${targetDef})`,
                );
                continue;
            }

            const targetUserId = getTargetUserId(targetActor);
            if (!targetUserId) {
                ui.notifications.warn(
                    `Nenhum usuário ativo para receber o dano de ${targetActor.name}.`,
                );
                continue;
            }

            const payload: AutoDamageRequest = {
                type:          "auto-damage-request",
                requestId:     randomID(),
                targetUserId,
                attackerUserId,
                targetActorId: targetActor.id,
                targetTokenId: token.id,
                attackerName,
                rollLabel,
                attackTotal,
                targetDef,
                damageTotal:       effectiveDamageTotal,
                attackFormula,
                damageFormula,
                damageMaximized,
                baseDamageFormula,
                critOnlyDmgFormula,
                gritoActive,
                samuraiLevel:       samuraiLvl,
                effectiveCriticoX:  effCriticoX,
                effectiveCriticoM:  effCriticoM,
            };

            if (targetUserId === game.user?.id) {
                openDamagePrompt(payload);
            } else {
                void getSocket()?.executeAsUser(
                    SOCKET_DAMAGE_REQUEST,
                    targetUserId,
                    payload,
                );
            }
        }
    });
}

// ── Public entry ──────────────────────────────────────────────────────────────

export function setupAutoDamage(): void {
    ensureStyles();
    setupSocket();
    setupCreateChatHook();
}
