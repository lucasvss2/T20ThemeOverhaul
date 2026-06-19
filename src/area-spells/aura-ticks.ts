/**
 * Aura Sagrada — tick aprimoramentos: Aura de Cura (heal) and Aura Ardente
 * (light damage). Extracted from aura-sagrada.ts (Phase 4). The per-turn
 * orchestration (combatTurnChange) lives in the main module and calls these.
 */
import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import {
    findTokenForActor, getTokenDisposition, isAuraTarget, isTokenInsideTemplate, escHtml,
} from "@/_shared";
import { warn } from "@/utils/logging";
import {
    FLAG_CASTER, FLAG_CASTER_AID, HEALING_AURA_NORMALIZED, BURNING_AURA_NORMALIZED,
    type AuraTpl,
} from "./aura-shared";

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
export function hasAuraDeCura(actor: FoundryActor | null | undefined): boolean {
    if (!actor) return false;
    const items = actor.items?.contents ?? [];
    return items.some(it => normalizeCondName(it.name ?? "") === HEALING_AURA_NORMALIZED);
}

/** CHA do caster: lemos do baseEffectData (T20 já calculou no momento do cast). */
export function getCasterChaFromTemplate(template: AuraTpl): number {
    const base = template.flags?.[MODULE_ID]?.["baseEffectData"] as
        | { changes?: Array<{ value?: string | number }> } | undefined;
    const raw = base?.changes?.[0]?.value;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

export type HealCandidate = {
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
export function resolveActorForCandidate(c: { tokenId: string; actorId: string }): FoundryActor | null {
    const tok = canvas?.tokens?.get(c.tokenId);
    if (tok?.actor) return tok.actor;
    return game.actors?.get(c.actorId) ?? null;
}

/** Lista tokens elegíveis pra cura por uma aura — caster + aliados FRIENDLY dentro. */
export function listHealCandidates(template: AuraTpl, healAmount: number): HealCandidate[] {
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

export async function applyHealsAndPostCard(opts: {
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
            warn(`Aura de Cura: falha ao curar ${c.actorName}:`, err);
        }
    }
    if (applied.length === 0) return;

    // Chat card resumo
    const rows = applied.map(c => `
        <li style="display:flex;justify-content:space-between;padding:2px 0;">
            <span>${escHtml(c.actorName)}</span>
            <span style="color:var(--t20-color-success);font-weight:700;">+${c.healed}</span>
        </li>`).join("");
    const content = `
        <div class="tormenta20 chat-card item-card" style="border-color:var(--t20-accent);">
            <header class="card-header flexrow">
                <h3 class="item-name"><div>Aura de Cura — ${escHtml(casterName)}</div></h3>
            </header>
            <div class="card-content" style="padding: 6px 10px;">
                <p style="margin: 0 0 6px;color:var(--t20-text-muted);font-size:0.85rem;">
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
export function pickHealTargetsDialog(opts: {
    casterName: string;
    candidates: HealCandidate[];
}): Promise<HealCandidate[] | null> {
    return new Promise<HealCandidate[] | null>((resolve) => {
        if (opts.candidates.length === 0) { resolve([]); return; }
        const rows = opts.candidates.map((c, i) => `
            <label class="heal-row">
                <input type="checkbox" data-idx="${i}" checked />
                <span>${escHtml(c.actorName)} <small style="color:var(--t20-accent-muted);">(${c.pvBefore}/${c.pvMax})</small></span>
                <span class="heal-amount">+${c.healed}</span>
            </label>`).join("");
        new Dialog({
            title: `Aura de Cura — ${opts.casterName}`,
            content: `
                <div class="t20-aura-cura-picker">
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
        }, { classes: ["t20-dialog"] }).render(true);
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
export function hasAuraArdente(actor: FoundryActor | null | undefined): boolean {
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
export function isUndeadOrSpirit(actor: FoundryActor): boolean {
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

export type BurnCandidate = {
    actorId:   string;
    actorName: string;
    tokenId:   string;
    pvBefore:  number;
    damage:    number;  // dano final (sem RD — passamos applyRD=false)
};

/** Lista mortos-vivos e espíritos dentro da aura. */
export function listBurnCandidates(template: AuraTpl, damage: number): BurnCandidate[] {
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

export async function applyBurnsAndPostCard(opts: {
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
            warn(`Aura Ardente: falha ao aplicar dano em ${c.actorName}:`, err);
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
                <p style="margin: 0 0 6px;color:var(--t20-text-muted);font-size:0.85rem;">
                    Dano de luz: <b>${damage}</b>
                </p>
                <ul style="list-style:none;padding:0;margin:0;">${rows}</ul>
            </div>
        </div>`;
    try {
        await ChatMessage.create({ content, speaker: { alias: casterName } });
    } catch { /* ignore — dano já aplicado */ }
}

export function pickBurnTargetsDialog(opts: {
    casterName: string;
    candidates: BurnCandidate[];
}): Promise<BurnCandidate[] | null> {
    return new Promise<BurnCandidate[] | null>((resolve) => {
        if (opts.candidates.length === 0) { resolve([]); return; }
        const rows = opts.candidates.map((c, i) => `
            <label class="burn-row">
                <input type="checkbox" data-idx="${i}" checked />
                <span>${escHtml(c.actorName)} <small style="color:var(--t20-accent-muted);">(${c.pvBefore} PV)</small></span>
                <span class="burn-amount">-${c.damage}</span>
            </label>`).join("");
        new Dialog({
            title: `Aura Ardente — ${opts.casterName}`,
            content: `
                <div class="t20-aura-ardente-picker">
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
        }, { classes: ["t20-dialog"] }).render(true);
    });
}
