/**
 * Concentração de Combate (Arcana 1, Adivinhação) — automação.
 *
 * Base (livre, pessoal, 1 rodada): quando VOCÊ faz um teste de ataque, rola
 * dois dados e usa o MELHOR (vantagem → `rollKeep:"khd20"` no d20Roll nativo,
 * mjs ~4819).
 * Aprimoramentos (aditivos — o jogador seleciona os que couber):
 *  - +2 PM: execução padrão, duração CENA. (Req. 2º círculo)
 *  - +5 PM: ao atacar VOCÊ, o inimigo rola dois dados e usa o PIOR
 *           (desvantagem imposta → `rollKeep:"kld20"`). (Req. 3º)
 *  - +9 PM: alcance curto, alvo = criaturas escolhidas (recebem a vantagem em
 *           vez de você), duração CENA. (Req. 4º)
 *  - +14 PM: duração 1 DIA; +10 Defesa e Reflexos; imune a Surpreendido e
 *            Desprevenido; sexto sentido (informativo). (Req. 5º)
 *
 * O T20 debita o PM nativamente (`automaticManaSpend`). A magia é `self` → sem
 * template. Detecção por nome; funciona em instalação limpa (o conteúdo da
 * magia vem do compêndio do sistema/suplemento; o CÓDIGO é bundled).
 */
import { combineAdvantage, registerAdvantageSource, resolveRollKeep } from "@/_shared/advantage";
import { MODULE_ID } from "@/constants";
import { norm } from "@/inspiracao/format";
import { getSocket, onSocketReady } from "@/socket";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { log, warn } from "@/utils/logging";

const SPELL_NAME = "concentracao de combate";
const FLAG = "concentracaoCombate";
const AE_NAME = "Concentração de Combate";
const AE_ICON = "icons/svg/eye.svg";

// ── Helpers puros (testáveis) ─────────────────────────────────────────────────

export interface OnUseEntry { cost?: unknown; description?: string; qty?: number }

export interface Tiers { t2: boolean; t5: boolean; t9: boolean; t14: boolean }

/** É a magia Concentração de Combate? (nome normalizado) */
export function isConcentracaoCombate(name: string | undefined | null): boolean {
    return norm(name ?? "").includes(SPELL_NAME);
}

/** Quais aprimoramentos foram selecionados (por custo, com fallback na descrição). */
export function parseTiers(onUseEffects: OnUseEntry[] | undefined | null): Tiers {
    const t: Tiers = { t2: false, t5: false, t9: false, t14: false };
    for (const e of onUseEffects ?? []) {
        const cost = Number(e.cost);
        const d = norm(e.description ?? "");
        if (cost === 2 || (Number.isNaN(cost) && /duracao para (a )?cena/.test(d) && /execucao para padrao/.test(d) && !/curto|criaturas|dia/.test(d))) t.t2 = true;
        if (cost === 5 || /pior resultado/.test(d)) t.t5 = true;
        if (cost === 9 || /criaturas escolhidas|alcance para curto/.test(d)) t.t9 = true;
        if (cost === 14 || /sexto sentido|imune|um dia/.test(d)) t.t14 = true;
    }
    return t;
}

export interface ConcentracaoConfig {
    advantage: true;
    imposesDisadvantage: boolean; // +5
    targetsOthers: boolean;       // +9 (aplica nos alvos escolhidos, não em você)
    duration: "round" | "scene" | "day";
    defReflBonus: number;         // +14 → 10
    immunities: boolean;          // +14
    sixthSense: boolean;          // +14
}

/** Deriva a configuração final a partir dos tiers selecionados (aditivo). */
export function computeConfig(t: Tiers): ConcentracaoConfig {
    const duration: ConcentracaoConfig["duration"] = t.t14 ? "day" : (t.t2 || t.t9) ? "scene" : "round";
    return {
        advantage: true,
        imposesDisadvantage: t.t5,
        targetsOthers: t.t9,
        duration,
        defReflBonus: t.t14 ? 10 : 0,
        immunities: t.t14,
        sixthSense: t.t14,
    };
}

/**
 * Qual `rollKeep` aplicar num teste de ataque. Vantagem (própria) e
 * desvantagem (imposta pelo alvo, ex.: Concentração +5 dele) se CANCELAM
 * quando as duas estão presentes — teste normal (1d20), igual a qualquer
 * outro par vantagem/desvantagem no jogo (ver `@/_shared/advantage`). Não
 * empilha: múltiplas fontes do mesmo sinal continuam valendo como uma só.
 */
export function resolveAttackRollKeep(
    attackerHasAdvantage: boolean,
    targetImposesDisadvantage: boolean,
): "khd20" | "kld20" | undefined {
    return combineAdvantage(attackerHasAdvantage, targetImposesDisadvantage);
}

// ── Estado no ator (Active Effect flagada) ────────────────────────────────────

interface FlagData {
    advantage?: boolean;
    imposesDisadvantage?: boolean;
    casterActorId?: string;
    casterName?: string;
    expireKind?: "round" | "scene" | "day";
    combatId?: string;
    appliedRound?: number;
}

interface EffectLike { id?: string; name?: string; disabled?: boolean; flags?: Record<string, Record<string, unknown>> }
interface ActorLike {
    id?: string;
    name?: string;
    uuid?: string;
    effects?: { contents: EffectLike[] };
    createEmbeddedDocuments?: (t: string, d: Record<string, unknown>[]) => Promise<unknown[]>;
    deleteEmbeddedDocuments?: (t: string, ids: string[]) => Promise<unknown[]>;
}

function concentracaoEffects(actor: ActorLike | null | undefined): EffectLike[] {
    return (actor?.effects?.contents ?? []).filter(
        (e) => !e.disabled && !!(e.flags?.[MODULE_ID] as { [FLAG]?: FlagData } | undefined)?.[FLAG],
    );
}

function actorFlag(e: EffectLike): FlagData {
    return ((e.flags?.[MODULE_ID] as { [FLAG]?: FlagData } | undefined)?.[FLAG]) ?? {};
}

/** O ator tem Concentração ativa concedendo vantagem nos próprios ataques? */
export function actorHasAdvantage(actor: ActorLike | null | undefined): boolean {
    return concentracaoEffects(actor).some((e) => actorFlag(e).advantage === true);
}

/** O ator impõe desvantagem a quem o ataca (Concentração +5)? */
export function actorImposesDisadvantage(actor: ActorLike | null | undefined): boolean {
    return concentracaoEffects(actor).some((e) => actorFlag(e).imposesDisadvantage === true);
}

// ── Patch do teste de ataque (rollKeep) ───────────────────────────────────────

type RollAttackFn = (this: unknown, arg?: { options?: Record<string, unknown> }) => Promise<unknown>;
let _attackPatched = false;

function anyTargetImposesDisadvantage(attackerActorId: string | undefined): boolean {
    try {
        const targets = (game.user as unknown as { targets?: Set<{ actor?: ActorLike }> } | null)?.targets;
        if (!targets || targets.size === 0) return false;
        for (const tok of targets) {
            const ta = tok.actor;
            if (!ta || ta.id === attackerActorId) continue;
            if (actorImposesDisadvantage(ta)) return true;
        }
        return false;
    } catch { return false; }
}

function installAttackPatch(): void {
    const ItemCls = (CONFIG as unknown as { Item?: { documentClass?: { prototype: Record<string, unknown> } } }).Item?.documentClass;
    const proto = ItemCls?.prototype;
    if (!proto || _attackPatched) return;
    const orig = proto["rollAttack"] as RollAttackFn;
    if (typeof orig !== "function") return;
    _attackPatched = true;
    proto["rollAttack"] = async function (this: { actor?: ActorLike }, arg: { options?: Record<string, unknown> } = {}) {
        try {
            const options = (arg.options ??= {});
            if (!options["rollKeep"]) {
                const attacker = this.actor;
                // Via registro compartilhado: agrega TODAS as fontes de vantagem/desvantagem
                // de ataque (não só a nossa) e cancela quando ambas presentes.
                const rk = resolveRollKeep({ actor: attacker, kind: "attack" });
                if (rk) options["rollKeep"] = rk;
            }
        } catch (e) { warn("concentracao: patch de ataque falhou (seguindo nativo):", e); }
        return orig.call(this, arg);
    };
}

function registerAdvantageSourceConcentracao(): void {
    registerAdvantageSource({
        id: "concentracao-combate",
        hasAdvantage: (q) => q.kind === "attack" && actorHasAdvantage(q.actor as ActorLike),
        hasDisadvantage: (q) => q.kind === "attack" && anyTargetImposesDisadvantage((q.actor as ActorLike)?.id),
    });
}

// ── Aplicação do buff ─────────────────────────────────────────────────────────

function buildAE(cfg: ConcentracaoConfig, flag: FlagData): Record<string, unknown> {
    const changes: Array<{ key: string; mode: number; value: string }> = [];
    if (cfg.defReflBonus > 0) {
        changes.push({ key: "system.attributes.defesa.bonus", mode: 2, value: String(cfg.defReflBonus) });
        changes.push({ key: "system.pericias.refl.bonus", mode: 2, value: String(cfg.defReflBonus) });
    }
    const seconds = cfg.duration === "day" ? 86400 : cfg.duration === "scene" ? 3600 : 12;
    return {
        name: AE_NAME,
        icon: AE_ICON,
        img: AE_ICON,
        changes,
        duration: { seconds },
        transfer: false,
        flags: { [MODULE_ID]: { [FLAG]: flag } },
    };
}

interface ApplyPayload {
    targetUuids: string[];
    cfg: ConcentracaoConfig;
    flag: FlagData;
    removeSurprised: boolean;
}

async function applyConcentracaoGM(payload: ApplyPayload): Promise<void> {
    for (const uuid of payload.targetUuids) {
        try {
            const actor = (fromUuidSync(uuid)) as ActorLike | null;
            if (!actor) continue;
            // remove Concentração anterior deste alvo (não empilha)
            const old = concentracaoEffects(actor).map((e) => e.id!).filter(Boolean);
            if (old.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", old);
            await actor.createEmbeddedDocuments?.("ActiveEffect", [buildAE(payload.cfg, payload.flag)]);
            // +14: imune a surpreendido/desprevenido → remove os status se presentes
            if (payload.removeSurprised) {
                const toggle = (actor as unknown as { toggleStatusEffect?: (id: string, o: { active: boolean }) => Promise<unknown> }).toggleStatusEffect;
                for (const st of ["surpreendido", "desprevenido"]) {
                    try { await toggle?.call(actor, st, { active: false }); } catch { /* noop */ }
                }
            }
        } catch (e) { warn("concentracao: applyGM falhou p/", uuid, e); }
    }
}

// ── Detecção do cast ──────────────────────────────────────────────────────────

interface MessageLike {
    speaker?: { actor?: string };
    flags?: Record<string, Record<string, unknown>>;
    author?: { id?: string };
    user?: { id?: string };
    content?: string;
}

/**
 * Resolve o item conjurado pelo `data-item-id`/`data-actor-id` do card — o
 * `flags.tormenta20.itemData` de MAGIA NÃO traz `name`/`type` (gotcha do T20),
 * então precisamos olhar o DOM do card e resolver o item no ator.
 */
function resolveCastItem(message: MessageLike): { name?: string; type?: string } | null {
    const actorId = message.content?.match(/data-actor-id="([^"]+)"/)?.[1];
    const itemId = message.content?.match(/data-item-id="([^"]+)"/)?.[1];
    if (!actorId || !itemId) return null;
    const actor = game.actors?.get(actorId) as (ActorLike & { items?: { get(id: string): { name?: string; type?: string } | null } }) | undefined;
    const item = actor?.items?.get(itemId);
    return item ? { name: item.name, type: item.type } : null;
}

const _recentCast = new Map<string, number>();

async function onConcentracaoCast(message: MessageLike): Promise<void> {
    const tormenta = message.flags?.["tormenta20"] as { onUseEffects?: OnUseEntry[] } | undefined;
    if (!tormenta) return;
    const item = resolveCastItem(message);
    if (!item || item.type !== "magia") return;
    if (!isConcentracaoCombate(item.name)) return;

    const casterId = message.speaker?.actor;
    const caster = game.actors?.get(casterId ?? "") as ActorLike | undefined;
    if (!caster) return;

    // debounce (o T20 pode postar >1 msg)
    const now = Date.now();
    const last = _recentCast.get(caster.id ?? "") ?? 0;
    if (now - last < 2000) return;
    _recentCast.set(caster.id ?? "", now);

    const cfg = computeConfig(parseTiers(tormenta?.onUseEffects));

    // Alvos: +9 → criaturas escolhidas (game.user.targets); senão → o conjurador
    const targetActors: ActorLike[] = [];
    if (cfg.targetsOthers) {
        const targets = (game.user as unknown as { targets?: Set<{ actor?: ActorLike }> } | null)?.targets;
        for (const tok of targets ?? []) if (tok.actor) targetActors.push(tok.actor);
        if (targetActors.length === 0) {
            ui.notifications?.warn("Concentração de Combate (+9 PM): marque as criaturas escolhidas (T) antes de conjurar.");
            targetActors.push(caster); // fallback: aplica no conjurador
        }
    } else {
        targetActors.push(caster);
    }

    const combat = (game as unknown as { combat?: { id?: string; round?: number } | null }).combat;
    const flag: FlagData = {
        advantage: true,
        imposesDisadvantage: cfg.imposesDisadvantage,
        casterActorId: caster.id,
        casterName: caster.name,
        expireKind: cfg.duration,
        combatId: combat?.id,
        appliedRound: combat?.round,
    };

    const payload: ApplyPayload = {
        targetUuids: targetActors.map((a) => a.uuid!).filter(Boolean),
        cfg,
        flag,
        removeSurprised: cfg.immunities,
    };
    await getSocket()?.executeAsGM("concentracao/apply", payload);

    postCastCard(caster, cfg, targetActors);
    refreshSkillsMenu();
}

function postCastCard(caster: ActorLike, cfg: ConcentracaoConfig, targets: ActorLike[]): void {
    const dur = cfg.duration === "day" ? "1 dia" : cfg.duration === "scene" ? "a cena" : "1 rodada";
    const bits: string[] = [`<b>Vantagem</b> nos ataques (melhor de 2d20)`];
    if (cfg.imposesDisadvantage) bits.push(`inimigos que atacam <b>rolam o pior</b> de 2d20`);
    if (cfg.defReflBonus) bits.push(`+${cfg.defReflBonus} Defesa e Reflexos`);
    if (cfg.immunities) bits.push(`imune a Surpreendido e Desprevenido`);
    if (cfg.sixthSense) bits.push(`sexto sentido (aviso de perigo)`);
    const alvo = cfg.targetsOthers ? targets.map((t) => t.name).join(", ") : caster.name;
    const content = `
        <div class="t20-cc-card" style="border-left:3px solid #7db8ff;padding:6px 10px;">
            <b style="color:#7db8ff;">Concentração de Combate</b> — ${alvo}
            <div style="font-size:.9em;color:#cfe3ff;margin-top:3px;">${bits.join(" · ")}</div>
            <div style="font-size:.82em;color:#9ab;margin-top:2px;">Duração: ${dur}</div>
        </div>`;
    try {
        (globalThis as unknown as { ChatMessage?: { create: (d: Record<string, unknown>) => Promise<unknown> } }).ChatMessage?.create({
            content,
            speaker: { actor: caster.id },
        });
    } catch (e) { warn("concentracao: card falhou:", e); }
}

// ── Limpeza / expiração ───────────────────────────────────────────────────────

function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter((u) => u.isGM && (u as unknown as { active?: boolean }).active)
        .map((u) => u.id)
        .sort();
    return activeGMs[0] === myId;
}

function relevantActors(): ActorLike[] {
    const out: ActorLike[] = [];
    const seen = new Set<string>();
    for (const a of (game.actors?.contents ?? []) as unknown as ActorLike[]) {
        if (a.id && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
    }
    const tokens = (canvas as unknown as { tokens?: { placeables?: Array<{ actor?: ActorLike; document?: { actorLink?: boolean } }> } } | null)?.tokens?.placeables ?? [];
    for (const t of tokens) {
        if (t.document?.actorLink === false && t.actor) out.push(t.actor);
    }
    return out;
}

async function removeConcentracaoFrom(actor: ActorLike): Promise<number> {
    const ids = concentracaoEffects(actor).map((e) => e.id!).filter(Boolean);
    if (ids.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", ids);
    return ids.length;
}

async function onCombatEnd(): Promise<void> {
    if (!game.user?.isGM) return;
    for (const a of relevantActors()) {
        try { await removeConcentracaoFrom(a); } catch { /* noop */ }
    }
    refreshSkillsMenu();
}

async function onTurnChange(combat: { round?: number; combatant?: { actor?: ActorLike | null } | null }): Promise<void> {
    if (!isActiveGM()) return;
    const current = combat?.combatant?.actor;
    if (!current) return;
    // Expira buffs "1 rodada" no início do turno do dono (rodada avançou desde a aplicação)
    for (const e of concentracaoEffects(current)) {
        const f = actorFlag(e);
        if (f.expireKind === "round" && typeof f.appliedRound === "number" && (combat.round ?? 0) > f.appliedRound) {
            try { await current.deleteEmbeddedDocuments?.("ActiveEffect", [e.id!]); } catch { /* noop */ }
        }
    }
    refreshSkillsMenu();
}

// ── skills-menu: cancelar ─────────────────────────────────────────────────────

function myActiveActor(): ActorLike | null {
    const tok = (canvas as unknown as { tokens?: { controlled?: Array<{ actor?: ActorLike }> } } | null)?.tokens?.controlled?.[0];
    if (tok?.actor) return tok.actor;
    return ((game.user as unknown as { character?: ActorLike | null } | null)?.character) ?? null;
}

function registerCancelAction(): void {
    registerSkillAction({
        id: "concentracao-combate-cancel",
        label: "Cancelar Concentração de Combate",
        icon: "fa-solid fa-eye-slash",
        color: "#7db8ff",
        isVisible() {
            try {
                const a = myActiveActor();
                return !!a && concentracaoEffects(a).length > 0;
            } catch { return false; }
        },
        async onClick() {
            const a = myActiveActor();
            if (!a) return;
            const uuids = [a.uuid!].filter(Boolean);
            await getSocket()?.executeAsGM("concentracao/remove", { targetUuids: uuids });
            refreshSkillsMenu();
        },
    });
}

async function removeConcentracaoGM(payload: { targetUuids: string[] }): Promise<void> {
    for (const uuid of payload.targetUuids) {
        try {
            const actor = (fromUuidSync(uuid)) as ActorLike | null;
            if (actor) await removeConcentracaoFrom(actor);
        } catch (e) { warn("concentracao: removeGM falhou:", e); }
    }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupConcentracaoCombate(): void {
    installAttackPatch();
    registerAdvantageSourceConcentracao();
    registerCancelAction();

    onSocketReady((socket) => {
        socket.register("concentracao/apply", (p) => applyConcentracaoGM(p as ApplyPayload));
        socket.register("concentracao/remove", (p) => removeConcentracaoGM(p as { targetUuids: string[] }));
    });

    Hooks.on("createChatMessage", (message: unknown) => {
        const m = message as MessageLike;
        // só o autor processa
        const authorId = m.author?.id ?? m.user?.id;
        if (authorId && authorId !== game.user?.id) return;
        void onConcentracaoCast(m).catch((e) => warn("concentracao: cast falhou:", e));
    });

    Hooks.on("combatTurnChange", (combat: unknown) => {
        void onTurnChange(combat as { round?: number; combatant?: { actor?: ActorLike | null } | null }).catch(() => undefined);
    });
    Hooks.on("deleteCombat", () => { void onCombatEnd().catch(() => undefined); });

    log("Concentração de Combate: automação registrada.");
}
