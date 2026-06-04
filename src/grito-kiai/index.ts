/**
 * Grito de Kiai — Samurai class ability
 *
 * Texto: "Quando faz um ataque corpo a corpo, você pode gastar 2 PM para rolar
 * dois dados e usar o melhor resultado. Se acertar esse ataque, você recebe
 * +XdY na rolagem de dano. Esse dano extra é multiplicado em caso de acerto
 * crítico."
 *
 * Bônus de dano por nível de Samurai:
 *   Nv 1-4:  +1d4
 *   Nv 5-8:  +1d6
 *   Nv 9-12: +1d8
 *   Nv 13-16:+1d10
 *   Nv 17+:  +1d12
 *
 * ── Arquitetura ───────────────────────────────────────────────────────────────
 *
 * 1. AE no actor (mesmo padrão do Kiai Divino):
 *    `flags.tormenta20.{ onuse: true, attack: true, custo: "2", changes: [] }`
 *    → aparece no AbilityUseDialog de armas via `item.validOnUseEffects`
 *      (T20 filtra actor.effects com onuse+attack para armas — linha 6393-6399)
 *    → T20 debita 2 PM ao selecionar
 *    → entrada em `flags.tormenta20.onUseEffects` no chat msg (via applyOnUseEffects)
 *
 * 2. Detecção em createChatMessage:
 *    Lê `message.flags.tormenta20.onUseEffects` e procura entry com description
 *    matching /grito\s*de\s*kiai/i. Description = ef.sourceName (nome do poder)
 *    ou ef.name (nome da AE) — conforme linha 5866-5868 do T20.
 *
 * 3. Processamento async:
 *    - Rola segundo d20 com a MESMA fórmula do ataque original (mantém bônus).
 *    - Determina qual rolo usar (maior total).
 *    - Lê criticoM/criticoX do itemData do message para detectar crítico.
 *    - Multiplica o dado bônus pelo criticoX se o rolo usado foi crítico.
 *    - Se Kiai Divino também ativo: maximiza o dado bônus em vez de rolar
 *      (auto-damage já inclui esse valor no total quando ambos estão ativos).
 *    - Posta chat card "Grito de Kiai — Vantagem".
 *
 * ── Gotchas ──────────────────────────────────────────────────────────────────
 *
 * • Mesmo problema do Kiai Divino: T20 pode ter AE placeholder nativa no item
 *   do compêndio com transfer:true → força transfer:false via disableItemTransfer.
 *
 * • `ef.description` no onUseEffects: para armas, T20 usa ef.sourceName (nome
 *   do poder via UUID origin). Fallback para ef.name se sourceName for "Unknown"
 *   ou nome do ator. Ambos contêm "Grito de Kiai" → regex /grito\s*de\s*kiai/i.
 *
 * • Level de Samurai: procura item de classe com nome incluindo "samurai" e lê
 *   system.nivel.value. Fallback: actor.system.nivel.value (total).
 *
 * • criticoM em itemData: T20 armazena this.system no flag (linha 7339 do T20),
 *   incluindo o valor pós-applyOnUseEffects. Usar sempre itemData.criticoM; default 20.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName, getMsgAuthorId } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";
import GRITO_STYLES from "./grito-kiai.css?inline";

// ── Constantes ────────────────────────────────────────────────────────────────

const GRITO_FLAG       = "gritoKiai";
const GRITO_PODER_NAME = "grito de kiai";
const GRITO_AE_NAME    = "Grito de Kiai";
const GRITO_NAME_REGEX = /grito\s*de\s*kiai/i;
const KIAI_DIVINO_REGEX = /kiai\s*divino/i;
const STYLES_ID        = "bg3-t20-grito-kiai-styles";

// ── CSS ───────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (!document.getElementById(STYLES_ID)) {
        const el = document.createElement("style");
        el.id = STYLES_ID;
        el.textContent = GRITO_STYLES;
        document.head.appendChild(el);
    }
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Level & Die helpers (exported for auto-damage integration) ────────────────

export function getSamuraiLevel(actor: FoundryActor): number {
    for (const item of actor.items?.contents ?? []) {
        if (item.type !== "classe") continue;
        if (!normalizeCondName(item.name).includes("samurai")) continue;
        const sys = item.system as Record<string, unknown>;
        // T20 multiclass stores per-class level as system.niveis (plural, plain number)
        const niveis = sys["niveis"];
        if (typeof niveis === "number" && niveis > 0) return niveis;
        // Fallback: system.nivel (older single-class format, number or {value})
        const nivel = sys["nivel"];
        const lvl = typeof nivel === "number"
            ? nivel
            : typeof nivel === "object" && nivel !== null
                ? ((nivel as Record<string, unknown>)["value"] as number | undefined)
                : undefined;
        if (typeof lvl === "number" && lvl > 0) return lvl;
    }
    // Last resort: actor total level
    return (actor.system as { nivel?: { value?: number } })?.nivel?.value ?? 1;
}

/**
 * Computes effective criticoX for an attack by adding deltas from actor AEs that
 * were selected in this roll (listed in message.flags.tormenta20.onUseEffects).
 *
 * Background: T20 saves itemData.criticoX as the weapon's stored base (e.g. 2).
 * AEs like "Ataque Preciso" live on the actor with key "criticoX" + mode ADD, and
 * appear in onUseEffects when the player selects them. We scan and sum them here.
 */
export function computeEffectiveCriticoX(
    message: ChatMessage,
    actor: FoundryActor | null,
    baseCriticoX: number,
): number {
    type OnUseEntry = { description?: string };
    const t20 = (message.flags as Record<string, unknown>)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    if (!Array.isArray(raw) || !actor) return baseCriticoX;

    const selectedDescriptions = new Set(
        (raw as OnUseEntry[]).map(ef => ef.description ?? "")
    );

    let bonus = 0;
    for (const ae of actor.effects?.contents ?? []) {
        if (!selectedDescriptions.has(ae.name ?? "")) continue;
        for (const ch of ae.changes ?? []) {
            if (ch.key === "criticoX" && ch.mode === 2) {
                bonus += parseInt(ch.value, 10) || 0;
            }
        }
    }
    return baseCriticoX + bonus;
}

/**
 * Computes the effective criticoM threshold for crit detection.
 * Starts from itemData.criticoM (includes permanent upgrades like "Precisa")
 * then adds deltas from on-use AEs selected in this roll:
 *   - Actor AEs: exact name match against onUseEffects descriptions
 *   - Weapon AEs: " - AEName" substring match in descriptions (T20 format)
 */
export function computeEffectiveCriticoM(
    message: ChatMessage,
    actor: FoundryActor | null,
    weaponItem: FoundryItem | null,
): number {
    type ItemDataM = { criticoM?: number };
    const iFlags = message.getFlag("tormenta20", "itemData") as ItemDataM | null | undefined;
    const baseM = typeof iFlags?.criticoM === "number" ? iFlags.criticoM : 20;

    type OnUseEntry = { description?: string };
    const t20 = (message.flags as Record<string, unknown>)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    if (!Array.isArray(raw)) return baseM;
    const selected = (raw as OnUseEntry[]).map(ef => ef.description ?? "");

    let delta = 0;

    // Actor AEs — exact name match
    for (const ae of actor?.effects?.contents ?? []) {
        if (!selected.includes(ae.name ?? "")) continue;
        for (const ch of ae.changes ?? []) {
            if (ch.key === "criticoM" && ch.mode === 2) delta += parseInt(ch.value, 10) || 0;
        }
    }

    // Weapon AEs — " - AEName" substring match in onUseEffects descriptions
    for (const ae of weaponItem?.effects?.contents ?? []) {
        const aeName = ae.name ?? "";
        if (!aeName || !selected.some(d => d.includes(` - ${aeName}`))) continue;
        for (const ch of ae.changes ?? []) {
            if (ch.key === "criticoM" && ch.mode === 2) delta += parseInt(ch.value, 10) || 0;
        }
    }

    return baseM + delta;
}

export function getBonusDie(level: number): string {
    if (level >= 17) return "1d12";
    if (level >= 13) return "1d10";
    if (level >= 9)  return "1d8";
    if (level >= 5)  return "1d6";
    return "1d4";
}

/** Retorna o valor máximo de uma face de um dado (ex: "1d6" → 6). */
export function getBonusDieMax(die: string): number {
    const m = die.match(/d(\d+)$/);
    return m ? parseInt(m[1], 10) : 4;
}

type D20Result = { result: number; active?: boolean; discarded?: boolean };

/** Lê os resultados do dado d20 de um Roll (suporta 2d20kh/kl da vantagem nativa do T20). */
function getD20Results(roll: Roll): D20Result[] {
    const d20 = (roll.dice ?? []).find(
        d => (d as { faces?: number }).faces === 20,
    ) as { results?: D20Result[] } | undefined;
    return d20?.results ?? [];
}

/**
 * Retorna o resultado natural do d20 MANTIDO (o melhor, em rolagens de vantagem 2d20kh).
 * Para 1d20 normal retorna o único resultado. Essencial para detecção de crítico em
 * rolagens de vantagem nativas — `results[0]` pode ser o dado DESCARTADO.
 */
export function getKeptD20Natural(roll: Roll): number {
    const results = getD20Results(roll);
    if (!results.length) return 0;
    const kept = results.find(r => r.active !== false && !r.discarded);
    return (kept ?? results[0]).result;
}

// ── Poder detection ───────────────────────────────────────────────────────────

function isGritoKiaiPoder(item: FoundryItem): boolean {
    if (item.type !== "poder") return false;
    return normalizeCondName(item.name).includes(GRITO_PODER_NAME);
}

// ── AE data builder ───────────────────────────────────────────────────────────

function buildGritoAEData(itemUuid: string): Record<string, unknown> {
    return {
        name: GRITO_AE_NAME,
        icon: "systems/tormenta20/icons/svg/skills.svg",
        origin: itemUuid,
        disabled: true,
        transfer: false,
        changes: [],
        flags: {
            tormenta20: {
                onuse: true,
                durationScene: false,
                attack: true,
                custo: "2",
            },
            [MODULE_ID]: {
                [GRITO_FLAG]: true,
            },
        },
    };
}

// ── AE management helpers ─────────────────────────────────────────────────────

async function deleteAEs(target: FoundryActor, ids: string[], label: string): Promise<void> {
    if (!ids.length) return;
    try {
        await target.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
    } catch (err) {
        warn(`Grito de Kiai: falha ao deletar ${label}:`, err);
    }
}

function collectGritoActorAEs(actor: FoundryActor, itemUuid: string): FoundryItemEffect[] {
    return (actor.effects?.contents ?? [])
        .filter(e => e.origin === itemUuid && GRITO_NAME_REGEX.test(e.name ?? ""));
}

/**
 * Força transfer:false na AE nativa do item (se existir), para evitar que
 * Foundry recrie uma cópia transferida no actor em reloads — mesmo padrão
 * do Kiai Divino.
 */
async function disableItemTransfer(item: FoundryItem): Promise<void> {
    const nativeAEs = (item.effects?.contents ?? []).filter(ae =>
        GRITO_NAME_REGEX.test(ae.name ?? "") && ae.transfer === true,
    );
    for (const ae of nativeAEs) {
        try {
            await ae.update({ transfer: false }, { render: false });
        } catch (err) {
            warn(`Grito de Kiai: falha ao setar transfer:false na AE nativa:`, err);
        }
    }
}

/**
 * Garante exatamente UMA AE de Grito de Kiai no actor, com os flags corretos.
 * Deduplica cópias transferidas ou antigas.
 */
async function ensureGritoAE(item: FoundryItem): Promise<void> {
    const actor = item.actor;
    if (!actor) return;
    const itemUuid = item.uuid;
    if (!itemUuid) return;

    await disableItemTransfer(item);

    const existing = collectGritoActorAEs(actor, itemUuid);

    if (existing.length === 0) {
        try {
            await actor.createEmbeddedDocuments("ActiveEffect", [buildGritoAEData(itemUuid)], { render: false });
            log(`Grito de Kiai: AE criada em "${actor.name}".`);
        } catch (err) {
            warn(`Grito de Kiai: falha ao criar AE:`, err);
        }
        return;
    }

    // Remove duplicatas
    if (existing.length > 1) {
        const ids = existing.slice(1).map(e => e.id).filter((id): id is string => Boolean(id));
        await deleteAEs(actor, ids, `${ids.length} AE(s) duplicada(s)`);
        log(`Grito de Kiai: ${ids.length} AE(s) duplicada(s) removida(s) de "${actor.name}".`);
    }

    // Garante flag nossa na primary
    const primary = existing[0];
    const hasFlag = Boolean(primary?.flags?.[MODULE_ID]?.[GRITO_FLAG]);
    if (primary && !hasFlag) {
        try {
            await primary.update(
                { [`flags.${MODULE_ID}.${GRITO_FLAG}`]: true },
                { render: false },
            );
        } catch (err) {
            warn(`Grito de Kiai: falha ao atualizar flag na AE:`, err);
        }
    }
}

/** Remove AEs do actor quando o poder é deletado. */
async function cleanupGritoAE(item: FoundryItem): Promise<void> {
    const actor = item.actor ?? item.parent;
    if (!actor) return;
    const itemUuid = item.uuid;
    if (!itemUuid) return;

    const stale = collectGritoActorAEs(actor, itemUuid);
    if (!stale.length) return;

    const ids = stale.map(e => e.id).filter((id): id is string => Boolean(id));
    await deleteAEs(actor, ids, "AE residual (poder deletado)");
    log(`Grito de Kiai: AE residual removida de "${actor.name}".`);
}

// ── onUseEffects detection ────────────────────────────────────────────────────

/**
 * Verifica se o Grito de Kiai foi ativado neste roll.
 *
 * T20 registra os efeitos selecionados em `flags.tormenta20.onUseEffects[]`.
 * Para ataques com arma, a description de AEs do actor é ef.sourceName
 * (nome do poder via origin UUID) ou ef.name se sourceName for inválido.
 * Ambas contêm "Grito de Kiai" → /grito\s*de\s*kiai/i basta.
 */
export function isGritoOnUseActive(message: ChatMessage): boolean {
    type OnUseEntry = { description?: string };
    const t20 = (message.flags as Record<string, unknown>)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    if (!Array.isArray(raw)) return false;
    return (raw as OnUseEntry[]).some(ef => GRITO_NAME_REGEX.test(ef.description ?? ""));
}

function isKiaiDivinoOnUseActive(message: ChatMessage): boolean {
    type OnUseEntry = { description?: string };
    const t20 = (message.flags as Record<string, unknown>)?.tormenta20 as
        | { onUseEffects?: unknown } | undefined;
    const raw = t20?.onUseEffects;
    if (!Array.isArray(raw)) return false;
    return (raw as OnUseEntry[]).some(ef => KIAI_DIVINO_REGEX.test(ef.description ?? ""));
}

// ── Chat processing ───────────────────────────────────────────────────────────

async function processGritoKiaiAttack(message: ChatMessage): Promise<void> {
    ensureStyles();

    const attackRoll = (message.rolls ?? []).find(
        r => (r.options as Record<string, unknown>)?.["type"] === "attack"
    );
    if (!attackRoll) return;

    const attackTotal = attackRoll.total ?? 0;

    // Reconstrói a fórmula de ataque via terms (preserva crítico e todos os bônus)
    const attackFormula = attackRoll.terms
        .map(t => (t as { expression?: string }).expression)
        .join(" ")
        .trim() || attackRoll.formula || "1d20";

    // Resolve actor now (needed for criticoX and level)
    const speakerTokenId = (message.speaker as { token?: string })?.token ?? "";
    const speakerActorId = (message.speaker as { actor?: string })?.actor ?? "";
    type CanvasTokenLyr = { get(id: string): { actor: FoundryActor | null } | undefined };
    const tokenLyr = (canvas as unknown as { tokens?: CanvasTokenLyr }).tokens;
    const actor = tokenLyr?.get(speakerTokenId)?.actor ?? game.actors?.get(speakerActorId) ?? null;

    // Resolve weapon item for criticoM computation (weapon AEs like Medalhão reduce criticoM)
    const msgItemId = (message.content as string | undefined)?.match(/data-item-id="([^"]+)"/)?.[1] ?? "";
    const weaponItem = msgItemId && actor ? actor.items?.get(msgItemId) ?? null : null;

    // criticoM: itemData base (includes permanent upgrades like Precisa) + onUseEffects deltas
    // (e.g. "Ataque Preciso" −2, "Corte da Correnteza" −2, "Medalhão Afiado" −1)
    const criticoM = computeEffectiveCriticoM(message, actor, weaponItem);
    // criticoX: base from itemData + delta from actor AEs in onUseEffects (e.g. "Ataque Preciso" +1)
    type ItemDataFlags = { criticoX?: number };
    const itemFlags = message.getFlag("tormenta20", "itemData") as ItemDataFlags | null | undefined;
    const criticoX = computeEffectiveCriticoX(
        message, actor, typeof itemFlags?.criticoX === "number" ? itemFlags.criticoX : 2
    );

    // ── Determina os dois resultados de d20 ──────────────────────────────────────
    // Preferido: vantagem NATIVA do T20 (rollKeep=khd20 → 2d20kh). T20 já calculou o
    // dano com base no dado MANTIDO (o melhor), então não há descompasso de crítico.
    // Fallback (legado): se o ataque não for vantagem nativa, rolamos um 2º d20.
    const d20Results = getD20Results(attackRoll);
    let nat1: number, nat2: number, total1: number, total2: number;
    let usedIndex: 0 | 1;
    let legacySecondRoll: Roll | null = null;

    if (d20Results.length >= 2) {
        // Vantagem nativa: ambos os d20 estão no mesmo rolo. flatBonus é igual para os dois.
        const keptResult = d20Results.find(r => r.active !== false && !r.discarded) ?? d20Results[0];
        const flatBonus  = attackTotal - keptResult.result;
        nat1 = d20Results[0].result;
        nat2 = d20Results[1].result;
        total1 = nat1 + flatBonus;
        total2 = nat2 + flatBonus;
        usedIndex = (d20Results[0] === keptResult) ? 0 : 1;
    } else {
        // Legado: rola um 2º d20 com a mesma fórmula
        nat1   = getKeptD20Natural(attackRoll);
        total1 = attackTotal;
        legacySecondRoll = new Roll(attackFormula);
        await legacySecondRoll.evaluate({ async: true });
        total2 = legacySecondRoll.total ?? 0;
        nat2   = getKeptD20Natural(legacySecondRoll);
        usedIndex = total2 > total1 ? 1 : 0;
    }

    const effectiveTotal = usedIndex === 0 ? total1 : total2;

    // Detecta crítico em cada rolo
    const isCrit1    = nat1 >= criticoM;
    const isCrit2    = nat2 >= criticoM;
    const isCritUsed = usedIndex === 0 ? isCrit1 : isCrit2;
    const critMult   = isCritUsed ? criticoX : 1;

    // Dado bônus baseado no nível de Samurai (actor já resolvido acima)
    const level = actor ? getSamuraiLevel(actor) : 1;
    const bonusDie = getBonusDie(level);

    // Kiai Divino também ativo? Se sim, maximizamos o dado em vez de rolar.
    // O auto-damage já soma esse valor maximizado no total do prompt.
    const kiaiDivinoActive = isKiaiDivinoOnUseActive(message);

    const bonusDieFaces = getBonusDieMax(bonusDie);
    // Com crítico: multiplica número de dados (ex: 1d4 × 2 = 2d4)
    const bonusExpr = critMult > 1 ? `${critMult}d${bonusDieFaces}` : bonusDie;
    let bonusTotal: number;
    let bonusRollInstance: Roll | null = null;

    if (kiaiDivinoActive) {
        // Kiai Divino maximiza — dano é determinístico
        bonusTotal = bonusDieFaces * critMult;
    } else {
        bonusRollInstance = new Roll(bonusExpr);
        await bonusRollInstance.evaluate({ async: true });
        bonusTotal = bonusRollInstance.total ?? 0;
    }

    const attackerName = (message.speaker as { alias?: string })?.alias ?? "Atacante";

    // Fórmula completa de dano: termos da arma + dado bônus do Grito
    const dmgRollRef = (message.rolls ?? []).find(
        r => (r.options as Record<string, unknown>)?.["type"] === "damage"
    );
    const weaponTermsStr = dmgRollRef
        ? dmgRollRef.terms.map(t => (t as { expression?: string }).expression ?? "").join(" ").trim()
        : "";
    const fullDmgFormula = weaponTermsStr ? `${weaponTermsStr} + ${bonusExpr}` : bonusExpr;

    // Correção de dano: SÓ no caminho legado (2º d20 rolado por nós). Com vantagem
    // nativa o T20 já critou o dano com base no dado mantido, então não há descompasso.
    let correctedDmg: number | null = null;
    if (legacySecondRoll && kiaiDivinoActive && usedIndex === 1 && isCrit2 && !isCrit1) {
        const dmgRoll = (message.rolls ?? []).find(
            r => (r.options as Record<string, unknown>)?.["type"] === "damage"
        );
        if (dmgRoll) {
            let c = 0;
            for (const term of dmgRoll.terms) {
                const t = term as unknown as { faces?: number; number?: number; total?: number };
                if (typeof t.faces === "number" && typeof t.number === "number") {
                    c += t.number * criticoX * t.faces; // dice maximizados × critMult
                } else if (typeof t.total === "number") {
                    c += t.total; // modificadores fixos
                }
            }
            c += bonusDieFaces * critMult; // dado bônus também critado e maximizado
            correctedDmg = c;
        }
    }

    // ── Card HTML ──────────────────────────────────────────────────────────────
    const roll1Class = usedIndex === 0 ? "gk-roll-used" : "gk-roll-discarded";
    const roll2Class = usedIndex === 1 ? "gk-roll-used" : "gk-roll-discarded";

    const critBadge1 = isCrit1 ? '<div class="gk-crit-tag">⚡ CRÍTICO!</div>' : "";
    const critBadge2 = isCrit2 ? '<div class="gk-crit-tag">⚡ CRÍTICO!</div>' : "";

    const bonusDieLabel = isCritUsed ? `${esc(bonusExpr)} ×${critMult}` : esc(bonusDie);
    const bonusNote     = isCritUsed ? "crítico aplicado" : "× em crítico";
    const bonusMaxNote  = kiaiDivinoActive
        ? '<span class="gk-bonus-note gk-maximized">✓ MAXIMIZADO — incluído no dano automático</span>'
        : "";

    const cardHtml = `
        <div class="gk-card">
            <div class="gk-header">
                <i class="fas fa-wind"></i> ${esc(GRITO_AE_NAME)} — Vantagem
            </div>
            <div class="gk-divider"></div>
            <div class="gk-rolls-row">
                <div class="gk-roll-block ${roll1Class}">
                    <div class="gk-roll-label">ROLO 1</div>
                    <div class="gk-roll-total">${total1}</div>
                    <div class="gk-roll-natural">(natural ${nat1})</div>
                    ${usedIndex === 0 ? '<div class="gk-used-tag">✓ USADO</div>' : ""}
                    ${critBadge1}
                </div>
                <div class="gk-vs-label">VS</div>
                <div class="gk-roll-block ${roll2Class}">
                    <div class="gk-roll-label">ROLO 2</div>
                    <div class="gk-roll-total">${total2}</div>
                    <div class="gk-roll-natural">(natural ${nat2})</div>
                    ${usedIndex === 1 ? '<div class="gk-used-tag">✓ USADO</div>' : ""}
                    ${critBadge2}
                </div>
            </div>
            <div class="gk-divider"></div>
            <div class="gk-effective-row">
                <span class="gk-label">ATAQUE EFETIVO</span>
                <span class="gk-effective-total">${effectiveTotal}</span>
            </div>
            <div class="gk-divider"></div>
            <div class="gk-bonus-row">
                <span class="gk-label">DANO BÔNUS (${bonusDieLabel})</span>
                <span class="gk-bonus-total">+${bonusTotal}</span>
                <span class="gk-bonus-note">${bonusNote}</span>
                ${bonusMaxNote}
            </div>
            <div class="gk-formula-row">
                <span class="gk-label">FÓRMULA TOTAL</span>
                <span class="gk-formula-val">${esc(fullDmgFormula)}</span>
            </div>
            ${correctedDmg !== null ? `
            <div class="gk-divider"></div>
            <div class="gk-correction-row">
                <span class="gk-label">⚠️ DANO CORRETO (prompt sem crítico)</span>
                <span class="gk-correction-total">${correctedDmg}</span>
            </div>` : ""}
        </div>
    `;

    // ── Chat message ───────────────────────────────────────────────────────────
    // Vantagem nativa: ambos os d20 já estão no rolo de ataque do T20 (sem 2º rolo).
    // Legado: anexa o 2º d20 que rolamos.
    const rollsForMsg: object[] = [];
    let extraHtml = "";

    if (legacySecondRoll) {
        rollsForMsg.push(legacySecondRoll.toJSON());
        extraHtml += await legacySecondRoll.render({
            flavor: `${GRITO_AE_NAME} — Segundo Ataque (${esc(attackerName)})`,
        });
    }

    if (bonusRollInstance) {
        rollsForMsg.push(bonusRollInstance.toJSON());
        extraHtml += await bonusRollInstance.render({
            flavor: `${GRITO_AE_NAME} — Dano Bônus (${bonusExpr})`,
        });
    }

    await ChatMessage.create({
        content: cardHtml + extraHtml,
        rolls:   rollsForMsg,
        type:    5,
        speaker: { alias: attackerName },
    });

    log(`Grito de Kiai: rolo1=${total1}${isCrit1?"(crit)":""}, rolo2=${total2}${isCrit2?"(crit)":""}, usado=ROLO${usedIndex+1}, efetivo=${effectiveTotal}, bônus=+${bonusTotal} (${bonusExpr})${legacySecondRoll?" [legado 2º d20]":" [vantagem nativa]"}${kiaiDivinoActive?" [KD max]":""}`);
}

// ── Entrada pública ───────────────────────────────────────────────────────────

export function setupGritoKiai(): void {
    Hooks.once("ready", () => {
        ensureStyles();
        const myId = game.user?.id;
        if (!myId) return;
        for (const actorLike of game.actors?.contents ?? []) {
            const actor = actorLike as FoundryActor;
            const ownLevel = (actor.ownership as Record<string, number> | undefined)?.[myId] ?? 0;
            const isOwner     = ownLevel >= 3;
            const isFallbackGM = game.user?.isGM && ownLevel === 0;
            if (!isOwner && !isFallbackGM) continue;
            for (const item of actor.items?.contents ?? []) {
                if (isGritoKiaiPoder(item)) void ensureGritoAE(item);
            }
        }
    });

    Hooks.on("createItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;
        if (!item.parent) return;
        if (!isGritoKiaiPoder(item)) return;
        void ensureGritoAE(item);
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item   = args[0] as FoundryItem;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;
        if (!isGritoKiaiPoder(item)) return;
        void cleanupGritoAE(item);
    });

    // Quando o usuário marca o Grito de Kiai no AbilityUseDialog do T20, força o
    // select "Melhor/Pior de 2d20" para "Melhor de 2d20" (khd20) → vantagem NATIVA.
    // Assim o T20 rola 2d20kh e calcula o dano com base no dado mantido (crítico
    // detectado corretamente, sem descompasso). Ao desmarcar, reverte (se fomos nós
    // que forçamos e o valor ainda é khd20).
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]): void => {
        const app = args[0] as { item?: { actor?: FoundryActor } };
        const htmlArg = args[1];
        let el: HTMLElement | null = null;
        if (htmlArg instanceof HTMLElement) el = htmlArg;
        else if (htmlArg && typeof htmlArg === "object") el = (htmlArg as Record<string, unknown>)[0] as HTMLElement | null;
        if (!el) return;

        const actor = app.item?.actor;
        if (!actor) return;

        // Localiza a AE do Grito de Kiai no actor → o checkbox é aprs.<aeId>.aplica
        const gritoAE = (actor.effects?.contents ?? []).find(
            e => GRITO_NAME_REGEX.test(e.name ?? ""),
        );
        if (!gritoAE?.id) return;

        const cb       = el.querySelector<HTMLInputElement>(`input[name="aprs.${gritoAE.id}.aplica"]`);
        const rollKeep = el.querySelector<HTMLSelectElement>('select[name="rollKeep"]');
        if (!cb || !rollKeep) return;

        const syncAdvantage = (): void => {
            if (cb.checked) {
                if (rollKeep.value !== "khd20") {
                    rollKeep.value = "khd20";
                    rollKeep.dispatchEvent(new Event("change", { bubbles: true }));
                }
                rollKeep.dataset["gritoForced"] = "1";
            } else if (rollKeep.dataset["gritoForced"] === "1") {
                if (rollKeep.value === "khd20") {
                    rollKeep.value = "";
                    rollKeep.dispatchEvent(new Event("change", { bubbles: true }));
                }
                delete rollKeep.dataset["gritoForced"];
            }
        };

        // Aplica imediatamente (cobre estado pré-marcado em re-render) + ao alternar
        syncAdvantage();
        cb.addEventListener("change", syncAdvantage);
    });

    Hooks.on("createChatMessage", (...args: unknown[]): void => {
        const message = args[0] as ChatMessage;
        if (getMsgAuthorId(message) !== game.user?.id) return;
        if (!isGritoOnUseActive(message)) return;

        // Precisa ter rolo de ataque para ser um ataque corpo-a-corpo
        const hasAttack = (message.rolls ?? []).some(
            r => (r.options as Record<string, unknown>)?.["type"] === "attack"
        );
        if (!hasAttack) return;

        void processGritoKiaiAttack(message);
    });
}
