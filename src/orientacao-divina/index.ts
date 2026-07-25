/**
 * Orientação (Divina 1, Adivinhação) — automação.
 *
 * ⚠️ O item do compêndio chama-se só **"Orientação"** — "Divina" descreve o
 * TIPO da magia (`itemData.system.tipo==="div"`), não faz parte do nome.
 * Detecção por nome deve casar "orientacao", NUNCA "orientacao divina" (não
 * bate com nada — bug real da v1.100.0: o cast nunca era detectado, com ou
 * sem aprimoramentos, porque a string procurada não existe no nome real).
 *
 * Base (padrão, curto, 1 criatura, 1 rodada): no PRÓXIMO teste de PERÍCIA do
 * alvo (nunca ataque — mecanismo separado — nem Fortitude/Reflexos/Vontade,
 * que no T20 são "testes de resistência" apesar de viverem em `pericias`), ele
 * rola dois dados e fica com o melhor. Consumida no 1º teste elegível ou
 * expira em 1 rodada.
 *
 * Aprimoramentos (aditivos):
 *  - +2 PM: duração CENA; em vez de "próximo teste", TODO teste baseado num
 *    ATRIBUTO escolhido (não ataque/resistência). Requer 2º círculo.
 *  - +5 PM: como acima, mas escolhe um GRUPO (Físicos: For/Des/Con ou
 *    Mentais: Int/Sab/Car) em vez de um atributo único. Requer 3º círculo.
 *  - +5 PM (independente): muda o alvo para CRIATURAS ESCOLHIDAS (múltiplos).
 *    Requer 3º círculo.
 *
 * O conjurador escolhe o atributo/grupo (quando aplicável) num modal logo
 * após conjurar — mesmo padrão de escolha do conjurador usado em
 * Aspirante a Herói / Inspiração (não é o alvo quem escolhe).
 *
 * Mecanismo de vantagem: `Actor.prototype.rollPericia` NÃO propaga
 * `options.rollKeep` pro `d20Roll` nativo (ao contrário de `rollAttack`, que
 * faz `mergeObject({...}, options)` direto) — só propaga `options.event`
 * inteiro pro `rollConfig.event`, e `d20Roll` lê `event.altKey` como vantagem
 * (mjs ~4819: `options.rollKeep === "khd20" || event.altKey || ...`). Por
 * isso o patch injeta `altKey:true` num `event` sintético em vez de setar
 * `rollKeep` — é o único gancho que de fato chega no `d20Roll` sem reescrever
 * `rollPericia` inteiro.
 */
import { escHtml } from "@/_shared/html";
import { MODULE_ID } from "@/constants";
import { norm } from "@/inspiracao/format";
import { getSocket, onSocketReady } from "@/socket";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { log, warn } from "@/utils/logging";

const SPELL_NAME = "orientacao";
const FLAG = "orientacaoDivina";
const AE_NAME = "Orientação";
const AE_ICON = "icons/magic/holy/prayer-hands-glowing-yellow.webp";

const RESIST_KEYS = new Set(["fort", "refl", "vont"]);
const PHYS_ATTRS = ["for", "des", "con"];
const MENTAL_ATTRS = ["int", "sab", "car"];

// ── Helpers puros (testáveis) ─────────────────────────────────────────────────

export interface OnUseEntry { cost?: unknown; description?: string; qty?: number }

/** É a magia Orientação? (nome normalizado — o item do compêndio NÃO tem "Divina" no nome) */
export function isOrientacaoDivina(name: string | undefined | null): boolean {
    return norm(name ?? "").includes(SPELL_NAME);
}

export interface Tiers { t2: boolean; t5Group: boolean; t5Target: boolean }

/**
 * Quais aprimoramentos foram selecionados. Os dois de custo 5 são
 * distinguidos pela descrição (Físicos/Mentais × criaturas escolhidas) —
 * `cost===5` sozinho é ambíguo entre eles.
 */
export function parseTiers(onUseEffects: OnUseEntry[] | undefined | null): Tiers {
    const t: Tiers = { t2: false, t5Group: false, t5Target: false };
    for (const e of onUseEffects ?? []) {
        const cost = Number(e.cost);
        const d = norm(e.description ?? "");
        const mentionsGroup = /fisic|mental/.test(d);
        const mentionsTarget = /criaturas escolhidas/.test(d);
        if (mentionsGroup) { t.t5Group = true; continue; }
        if (mentionsTarget) { t.t5Target = true; continue; }
        if (cost === 2 || (/duracao para (a )?cena/.test(d) && /atributo/.test(d))) { t.t2 = true; continue; }
        if (cost === 5) { t.t5Target = true; }
    }
    return t;
}

export type ScopeKind = "single" | "group" | null;

export interface OrientacaoConfig {
    mode: "once" | "persistent";
    duration: "round" | "scene";
    needsScopeChoice: boolean;
    scopeKind: ScopeKind;
    multiTarget: boolean;
}

/** Deriva a configuração final a partir dos tiers selecionados (aditivo). */
export function computeConfig(t: Tiers): OrientacaoConfig {
    const persistent = t.t2 || t.t5Group;
    return {
        mode: persistent ? "persistent" : "once",
        duration: persistent ? "scene" : "round",
        needsScopeChoice: persistent,
        scopeKind: persistent ? (t.t5Group ? "group" : "single") : null,
        multiTarget: t.t5Target,
    };
}

/** Testes de ataque nem passam por `rollPericia`; só resta excluir Fort/Refl/Vont ("testes de resistência"). */
export function isEligibleSkill(key: string): boolean {
    return !RESIST_KEYS.has(key);
}

/** Sem escopo (buff "próximo teste" ou sem restrição) → qualquer perícia elegível serve. */
export function attrInScope(attr: string | undefined, scopeAttrs: string[] | null | undefined): boolean {
    if (!scopeAttrs || scopeAttrs.length === 0) return true;
    if (!attr) return false;
    return scopeAttrs.includes(attr);
}

// ── Estado no ator (Active Effect flagada) ────────────────────────────────────

interface FlagData {
    mode?: "once" | "persistent";
    scopeAttrs?: string[] | null;
    casterActorId?: string;
    casterName?: string;
    expireKind?: "round" | "scene";
    combatId?: string;
    appliedRound?: number;
}

interface EffectLike { id?: string; name?: string; disabled?: boolean; flags?: Record<string, Record<string, unknown>> }
interface ActorLike {
    id?: string;
    name?: string;
    uuid?: string;
    effects?: { contents: EffectLike[] };
    system?: { pericias?: Record<string, { atributo?: string }> };
    createEmbeddedDocuments?: (t: string, d: Record<string, unknown>[]) => Promise<unknown[]>;
    deleteEmbeddedDocuments?: (t: string, ids: string[]) => Promise<unknown[]>;
}

function orientacaoEffects(actor: ActorLike | null | undefined): EffectLike[] {
    return (actor?.effects?.contents ?? []).filter(
        (e) => !e.disabled && !!(e.flags?.[MODULE_ID] as { [FLAG]?: FlagData } | undefined)?.[FLAG],
    );
}

function actorFlag(e: EffectLike): FlagData {
    return ((e.flags?.[MODULE_ID] as { [FLAG]?: FlagData } | undefined)?.[FLAG]) ?? {};
}

/** Primeiro buff ativo cujo escopo (se houver) cobre esta perícia. */
function findApplicableEffect(actor: ActorLike, key: string): EffectLike | null {
    const attr = actor.system?.pericias?.[key]?.atributo;
    for (const e of orientacaoEffects(actor)) {
        const f = actorFlag(e);
        if (attrInScope(attr, f.scopeAttrs)) return e;
    }
    return null;
}

// ── Patch do teste de perícia (vantagem via event.altKey) ────────────────────

type RollPericiaFn = (this: ActorLike, key: string, options?: Record<string, unknown>) => Promise<unknown>;
let _periciaPatched = false;

function installPericiaPatch(): void {
    const ActorCls = (CONFIG as unknown as { Actor?: { documentClass?: { prototype: Record<string, unknown> } } }).Actor?.documentClass;
    const proto = ActorCls?.prototype;
    if (!proto || _periciaPatched) return;
    const orig = proto["rollPericia"] as RollPericiaFn;
    if (typeof orig !== "function") return;
    _periciaPatched = true;
    proto["rollPericia"] = async function (this: ActorLike, key: string, options: Record<string, unknown> = {}) {
        let consumeAfter: EffectLike | null = null;
        try {
            if (isEligibleSkill(key)) {
                const eff = findApplicableEffect(this, key);
                if (eff) {
                    const ev = (options["event"] as Record<string, unknown> | undefined) ?? {};
                    options["event"] = { ...ev, altKey: true };
                    if (actorFlag(eff).mode === "once") consumeAfter = eff;
                }
            }
        } catch (e) { warn("orientacao-divina: patch de perícia falhou (seguindo nativo):", e); }
        const result = await orig.call(this, key, options);
        if (consumeAfter && result !== undefined) {
            try { await this.deleteEmbeddedDocuments?.("ActiveEffect", [consumeAfter.id!]); } catch { /* noop */ }
        }
        return result;
    } as RollPericiaFn;
}

// ── Aplicação do buff ─────────────────────────────────────────────────────────

function buildAE(cfg: OrientacaoConfig, scopeAttrs: string[] | null, flag: FlagData): Record<string, unknown> {
    const seconds = cfg.duration === "scene" ? 3600 : 12;
    return {
        name: AE_NAME,
        icon: AE_ICON,
        img: AE_ICON,
        changes: [],
        duration: { seconds },
        transfer: false,
        flags: { [MODULE_ID]: { [FLAG]: { ...flag, scopeAttrs } } },
    };
}

interface ApplyPayload {
    targetUuids: string[];
    cfg: OrientacaoConfig;
    scopeAttrs: string[] | null;
    flag: FlagData;
}

async function applyOrientacaoGM(payload: ApplyPayload): Promise<void> {
    for (const uuid of payload.targetUuids) {
        try {
            const actor = (fromUuidSync(uuid)) as ActorLike | null;
            if (!actor) continue;
            // não empilha: remove Orientação Divina anterior deste alvo
            const old = orientacaoEffects(actor).map((e) => e.id!).filter(Boolean);
            if (old.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", old);
            await actor.createEmbeddedDocuments?.("ActiveEffect", [buildAE(payload.cfg, payload.scopeAttrs, payload.flag)]);
        } catch (e) { warn("orientacao-divina: applyGM falhou p/", uuid, e); }
    }
}

// ── Modal de escolha do conjurador (atributo único ou grupo) ─────────────────

function attrLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { atributos?: Record<string, string> } }).T20?.atributos;
    return cfg?.[key] ?? key;
}
function getAttrOptions(): Array<{ key: string; label: string }> {
    const cfg = (CONFIG as unknown as { T20?: { atributos?: Record<string, string> } }).T20?.atributos ?? {};
    return Object.entries(cfg).map(([key, label]) => ({ key, label: label ?? key }));
}

async function pickScope(kind: "single" | "group"): Promise<string[] | null> {
    return new Promise((resolve) => {
        let content: string;
        if (kind === "group") {
            content = `
                <div style="padding:4px 2px;line-height:1.5">
                    <p>Orientação Divina — escolha o grupo de atributos.</p>
                    <div class="form-group">
                        <label style="display:block;margin-bottom:4px;"><input type="radio" name="od-group" value="fis" checked> Físicos (Força, Destreza, Constituição)</label>
                        <label style="display:block;"><input type="radio" name="od-group" value="men"> Mentais (Inteligência, Sabedoria, Carisma)</label>
                    </div>
                </div>`;
        } else {
            const options = getAttrOptions().map((a) => `<option value="${escHtml(a.key)}">${escHtml(a.label)}</option>`).join("");
            content = `
                <div style="padding:4px 2px;line-height:1.5">
                    <p>Orientação Divina — escolha o atributo.</p>
                    <div class="form-group">
                        <select name="od-attr" style="width:100%">${options}</select>
                    </div>
                </div>`;
        }
        let resolved = false;
        const dlg = new Dialog({
            title: "Orientação Divina — Escolha",
            content,
            buttons: {
                confirm: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Confirmar",
                    callback: ($html: JQuery) => {
                        resolved = true;
                        const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                        if (kind === "group") {
                            const val = root.querySelector<HTMLInputElement>('input[name="od-group"]:checked')?.value;
                            resolve(val === "men" ? MENTAL_ATTRS.slice() : PHYS_ATTRS.slice());
                        } else {
                            const val = root.querySelector<HTMLSelectElement>('select[name="od-attr"]')?.value;
                            resolve(val ? [val] : null);
                        }
                    },
                },
            },
            default: "confirm",
            close: () => { if (!resolved) resolve(null); },
        }, { classes: ["t20-dialog", "t20-od-dialog"], width: 380 });
        dlg.render(true);
    });
}

// ── Detecção do cast ──────────────────────────────────────────────────────────

interface MessageLike {
    speaker?: { actor?: string };
    flags?: Record<string, Record<string, unknown>>;
    author?: { id?: string };
    user?: { id?: string };
    content?: string;
}

/** Resolve o item conjurado pelo `data-item-id`/`data-actor-id` do card (magia sem name no flag — gotcha T20). */
function resolveCastItem(message: MessageLike): { name?: string; type?: string } | null {
    const actorId = message.content?.match(/data-actor-id="([^"]+)"/)?.[1];
    const itemId = message.content?.match(/data-item-id="([^"]+)"/)?.[1];
    if (!actorId || !itemId) return null;
    const actor = game.actors?.get(actorId) as (ActorLike & { items?: { get(id: string): { name?: string; type?: string } | null } }) | undefined;
    const item = actor?.items?.get(itemId);
    return item ? { name: item.name, type: item.type } : null;
}

const _recentCast = new Map<string, number>();

async function onOrientacaoDivinaCast(message: MessageLike): Promise<void> {
    const tormenta = message.flags?.["tormenta20"] as { onUseEffects?: OnUseEntry[] } | undefined;
    if (!tormenta) return;
    const item = resolveCastItem(message);
    if (!item || item.type !== "magia") return;
    if (!isOrientacaoDivina(item.name)) return;

    const casterId = message.speaker?.actor;
    const caster = game.actors?.get(casterId ?? "") as ActorLike | undefined;
    if (!caster) return;

    const now = Date.now();
    const last = _recentCast.get(caster.id ?? "") ?? 0;
    if (now - last < 2000) return;
    _recentCast.set(caster.id ?? "", now);

    const tiers = parseTiers(tormenta.onUseEffects);
    const cfg = computeConfig(tiers);

    let scopeAttrs: string[] | null = null;
    if (cfg.needsScopeChoice && cfg.scopeKind) {
        scopeAttrs = await pickScope(cfg.scopeKind);
        if (!scopeAttrs) {
            ui.notifications?.warn("Orientação Divina: escolha cancelada — nada aplicado.");
            return;
        }
    }

    const targetsSet = (game.user as unknown as { targets?: Set<{ actor?: ActorLike }> } | null)?.targets;
    const allTargets: ActorLike[] = [];
    for (const tok of targetsSet ?? []) if (tok.actor) allTargets.push(tok.actor);
    const targetActors = cfg.multiTarget ? allTargets : allTargets.slice(0, 1);
    if (targetActors.length === 0) {
        ui.notifications?.warn("Orientação Divina: marque o alvo (T) antes de conjurar.");
        return;
    }

    const combat = (game as unknown as { combat?: { id?: string; round?: number } | null }).combat;
    const flag: FlagData = {
        mode: cfg.mode,
        casterActorId: caster.id,
        casterName: caster.name,
        expireKind: cfg.duration,
        combatId: combat?.id,
        appliedRound: combat?.round,
    };

    const payload: ApplyPayload = {
        targetUuids: targetActors.map((a) => a.uuid!).filter(Boolean),
        cfg,
        scopeAttrs,
        flag,
    };
    await getSocket()?.executeAsGM("orientacao-divina/apply", payload);

    postCastCard(caster, cfg, scopeAttrs, targetActors);
    refreshSkillsMenu();
}

function scopeLabel(cfg: OrientacaoConfig, scopeAttrs: string[] | null): string {
    if (!cfg.needsScopeChoice || !scopeAttrs) return "próximo teste de perícia";
    if (cfg.scopeKind === "group") {
        const isFis = scopeAttrs[0] === "for";
        return `qualquer teste baseado em atributos ${isFis ? "Físicos" : "Mentais"}`;
    }
    return `qualquer teste baseado em ${attrLabel(scopeAttrs[0] ?? "")}`;
}

function postCastCard(caster: ActorLike, cfg: OrientacaoConfig, scopeAttrs: string[] | null, targets: ActorLike[]): void {
    const dur = cfg.duration === "scene" ? "a cena" : "1 rodada (ou até usar)";
    const alvo = targets.map((t) => t.name).join(", ");
    const content = `
        <div class="t20-od-card" style="border-left:3px solid #e8c877;padding:6px 10px;">
            <b style="color:#e8c877;">Orientação Divina</b> — ${escHtml(caster.name ?? "")} → ${escHtml(alvo)}
            <div style="font-size:.9em;color:#f0e3bd;margin-top:3px;">Vantagem em ${scopeLabel(cfg, scopeAttrs)}</div>
            <div style="font-size:.82em;color:#baa;margin-top:2px;">Duração: ${dur}</div>
        </div>`;
    try {
        (globalThis as unknown as { ChatMessage?: { create: (d: Record<string, unknown>) => Promise<unknown> } }).ChatMessage?.create({
            content,
            speaker: { actor: caster.id },
        });
    } catch (e) { warn("orientacao-divina: card falhou:", e); }
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

async function removeOrientacaoFrom(actor: ActorLike): Promise<number> {
    const ids = orientacaoEffects(actor).map((e) => e.id!).filter(Boolean);
    if (ids.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", ids);
    return ids.length;
}

async function onCombatEnd(): Promise<void> {
    if (!game.user?.isGM) return;
    for (const a of relevantActors()) {
        try { await removeOrientacaoFrom(a); } catch { /* noop */ }
    }
    refreshSkillsMenu();
}

async function onTurnChange(combat: { round?: number; combatant?: { actor?: ActorLike | null } | null }): Promise<void> {
    if (!isActiveGM()) return;
    const current = combat?.combatant?.actor;
    if (!current) return;
    // Expira buffs "próximo teste" (1 rodada) no início do turno do dono, se ainda não usados.
    for (const e of orientacaoEffects(current)) {
        const f = actorFlag(e);
        if (f.expireKind === "round" && typeof f.appliedRound === "number" && (combat.round ?? 0) > f.appliedRound) {
            try { await current.deleteEmbeddedDocuments?.("ActiveEffect", [e.id!]); } catch { /* noop */ }
        }
    }
    refreshSkillsMenu();
}

// ── skills-menu: cancelar (o próprio recebedor cancela o buff) ───────────────

function myActiveActor(): ActorLike | null {
    const tok = (canvas as unknown as { tokens?: { controlled?: Array<{ actor?: ActorLike }> } } | null)?.tokens?.controlled?.[0];
    if (tok?.actor) return tok.actor;
    return ((game.user as unknown as { character?: ActorLike | null } | null)?.character) ?? null;
}

function registerCancelAction(): void {
    registerSkillAction({
        id: "orientacao-divina-cancel",
        label: "Cancelar Orientação Divina",
        icon: "fa-solid fa-compass-drafting",
        color: "#e8c877",
        isVisible() {
            try {
                const a = myActiveActor();
                return !!a && orientacaoEffects(a).length > 0;
            } catch { return false; }
        },
        async onClick() {
            const a = myActiveActor();
            if (!a) return;
            const uuids = [a.uuid!].filter(Boolean);
            await getSocket()?.executeAsGM("orientacao-divina/remove", { targetUuids: uuids });
            refreshSkillsMenu();
        },
    });
}

async function removeOrientacaoGM(payload: { targetUuids: string[] }): Promise<void> {
    for (const uuid of payload.targetUuids) {
        try {
            const actor = (fromUuidSync(uuid)) as ActorLike | null;
            if (actor) await removeOrientacaoFrom(actor);
        } catch (e) { warn("orientacao-divina: removeGM falhou:", e); }
    }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupOrientacaoDivina(): void {
    installPericiaPatch();
    registerCancelAction();

    onSocketReady((socket) => {
        socket.register("orientacao-divina/apply", (p) => applyOrientacaoGM(p as ApplyPayload));
        socket.register("orientacao-divina/remove", (p) => removeOrientacaoGM(p as { targetUuids: string[] }));
    });

    Hooks.on("createChatMessage", (message: unknown) => {
        const m = message as MessageLike;
        const authorId = m.author?.id ?? m.user?.id;
        if (authorId && authorId !== game.user?.id) return; // só o autor processa
        void onOrientacaoDivinaCast(m).catch((e) => warn("orientacao-divina: cast falhou:", e));
    });

    Hooks.on("combatTurnChange", (combat: unknown) => {
        void onTurnChange(combat as { round?: number; combatant?: { actor?: ActorLike | null } | null }).catch(() => undefined);
    });
    Hooks.on("deleteCombat", () => { void onCombatEnd().catch(() => undefined); });

    log("Orientação Divina: automação registrada.");
}
