/**
 * Inspiração do Bardo — Fase 1
 *
 * Substitui o modal genérico do T20 (imagem "Configuração de Uso de Poder")
 * por um diálogo próprio que expõe APENAS o aumento de PM/bônus — todo o resto
 * (bônus por nível, melhorias Marcial/Resoluta/Revigorante, Gaita, Adamante) é
 * automático. Ao usar, aplica a Inspiração no bardo + nos tokens marcados com T
 * a até 9 m, com o bônus resolvido.
 *
 * Padrão: igual à Baforada Dracônica — dá patch em `AbilityUseDialog.create`,
 * cancela o fluxo nativo (`return null`) e roda o nosso.
 *
 * Melhorias cobertas nesta fase (detectadas por NOME entre os poderes do bardo;
 * conteúdo vem do módulo Suplementos de Arton do usuário — nosso código roda em
 * instalação limpa):
 *  - Inspiração Marcial  → bônus também em dano (`modificadores.dano.geral`)
 *  - Inspiração Resoluta → bônus também na Defesa (`attributes.defesa.bonus`)
 *  - Inspiração Revigorante → PV temporários = 5× bônus (set direto, não AE)
 *  - Gaita de Foles (instrumento) → teste de Atuação (CD 20 + PM), +1 se passar
 *  - Adamante (material do instrumento) → +1 no bônus
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { computeSkillTotal } from "@/hidden-test/skills";
import { T20Overlay } from "@/overlay/T20Overlay";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { getSocket, onSocketReady } from "@/socket";
import { getTokenCenterPx } from "@/_shared";
import {
    isInspiracaoPower,
    inspiracaoImprovementOf,
    maxBonusForLevel,
    maxAffordableBonus,
    resolveBaseBonus,
    pmCostForBonus,
    gaitaCD,
    computeFinalBonus,
    norm,
    type InspiracaoImprovement,
} from "./format";
import STYLES from "./inspiracao.css?inline";

const STYLES_ID = "t20-inspiracao-styles";
const FLAG_KEY = "inspiracao"; // flags.<MODULE_ID>.inspiracao (na AE)
const SOCKET_APPLY = "inspiracao/apply";
const RANGE_SQUARES = 6; // 9 m = 6 quadrados (independente da escala da cena)

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ItemLike {
    type?: string;
    name?: string;
    id?: string | null;
    uuid?: string;
    img?: string;
    parent?: FoundryActor | null;
    system?: Record<string, unknown>;
}

interface AEChange { key: string; mode: number; value: string; priority?: number }

interface ApplyPayload {
    casterActorId: string;
    casterName: string;
    bonus: number;
    targetUuids: string[];
    changes: AEChange[];
    tempPv: number;      // Revigorante: 5× bônus (0 = sem)
    aeName: string;
    aeIcon: string;
    createdWorldTime: number;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Leitura do ator ─────────────────────────────────────────────────────────

function actorItems(actor: FoundryActor): FoundryItem[] {
    return (actor as { items?: { contents: FoundryItem[] } }).items?.contents ?? [];
}

/** Nível de bardo (classe cujo nome inclui "bardo"); fallback = soma de níveis. */
function bardLevel(actor: FoundryActor): number {
    const classes = actorItems(actor).filter((i) => i.type === "classe");
    const bard = classes.find((c) => norm(c.name).includes("bardo"));
    if (bard) return Number((bard.system as { niveis?: number })?.niveis ?? 0);
    return classes.reduce((s, c) => s + Number((c.system as { niveis?: number })?.niveis ?? 0), 0);
}

function currentPm(actor: FoundryActor): number {
    return Number((actor.system?.attributes as { pm?: { value?: number } } | undefined)?.pm?.value ?? 0);
}

/** Melhorias de Inspiração que o bardo conhece (poderes). */
function knownImprovements(actor: FoundryActor): Set<InspiracaoImprovement> {
    const set = new Set<InspiracaoImprovement>();
    for (const it of actorItems(actor)) {
        if (it.type !== "poder") continue;
        const imp = inspiracaoImprovementOf(it.name);
        if (imp) set.add(imp);
    }
    return set;
}

/** True se `it` é um equipamento equipado. */
function isEquipped(it: FoundryItem): boolean {
    const sys = it.system as { equipado?: unknown; equipped?: unknown } | undefined;
    return it.type === "equipamento" && !!(sys?.equipado || sys?.equipped);
}

/** Gaita de Foles equipada? */
function hasGaitaDeFoles(actor: FoundryActor): boolean {
    return actorItems(actor).some((it) => isEquipped(it) && norm(it.name).includes("gaita de foles"));
}

/**
 * Algum instrumento equipado de Adamante? Detecta pelo slot de material do T20
 * (`upgrades.material === "adamant"`) OU pelo NOME (ex.: "Gaita de Foles de
 * Adamante") — muitos itens do usuário trazem o material só no nome, sem o
 * upgrade nativo preenchido.
 */
function hasAdamanteInstrument(actor: FoundryActor): boolean {
    return actorItems(actor).some((it) => {
        if (!isEquipped(it) || !isInstrumentName(it.name)) return false;
        const mat = (it.system as { upgrades?: { material?: string } } | undefined)?.upgrades?.material;
        return mat === "adamant" || norm(it.name).includes("adamant");
    });
}

/** Nomes de instrumentos musicais reconhecidos (para o gate do Adamante). */
const INSTRUMENT_NAMES = [
    "gaita de foles", "clarim", "citara", "cornamusa", "flauta", "tamborete",
    "trombeta", "violino", "alaude", "lira", "tambor", "harpa", "instrumento",
];
function isInstrumentName(name: string | undefined): boolean {
    const n = norm(name);
    return INSTRUMENT_NAMES.some((k) => n.includes(k));
}

// ── Distância (token → token) em QUADRADOS ─────────────────────────────────────
// Contagem em quadrados (Chebyshev) — casa com a regra "9 m = 6 quadrados" e é
// robusta à escala da cena (`grid.distance` varia: 1,5 m, 50, etc.).

function squaresBetween(a: FoundryToken, b: FoundryToken): number {
    const ca = getTokenCenterPx(a);
    const cb = getTokenCenterPx(b);
    const size = canvas?.scene?.grid?.size ?? 100;
    const dxSq = Math.abs(ca.x - cb.x) / size;
    const dySq = Math.abs(ca.y - cb.y) / size;
    return Math.max(dxSq, dySq);
}

function casterToken(actor: FoundryActor): FoundryToken | null {
    const active = (actor as { getActiveTokens?: () => FoundryToken[] }).getActiveTokens?.() ?? [];
    return active[0] ?? null;
}

// ── Diálogo de uso (imagem 1 reformulada) ─────────────────────────────────────

function openUseDialog(actor: FoundryActor, realItem: ItemLike): void {
    ensureStyles();
    const level = bardLevel(actor);
    const pm = currentPm(actor);
    const maxByLevel = maxBonusForLevel(level);
    const maxAfford = maxAffordableBonus(pm);
    const maxBase = Math.min(maxByLevel, maxAfford);

    if (maxBase < 1) {
        ui.notifications?.warn(`Inspiração: PM insuficiente (precisa de 2 PM; você tem ${pm}).`);
        return;
    }

    const gaita = hasGaitaDeFoles(actor);
    const adam = hasAdamanteInstrument(actor);
    const imps = knownImprovements(actor);
    const extraNotes: string[] = [];
    if (imps.has("marcial")) extraNotes.push("Marcial (+bônus no dano)");
    if (imps.has("resoluta")) extraNotes.push("Resoluta (+bônus na Defesa)");
    if (imps.has("revigorante")) extraNotes.push("Revigorante (PV temp. 5×)");
    if (adam) extraNotes.push("Adamante (+1)");
    if (gaita) extraNotes.push("Gaita de Foles (teste de Atuação → +1)");

    const options = [];
    for (let b = 1; b <= maxBase; b++) {
        options.push(`<option value="${b}" ${b === maxBase ? "selected" : ""}>+${b} (custo ${pmCostForBonus(b)} PM)</option>`);
    }

    const notesHtml = extraNotes.length
        ? `<div class="insp-notes"><b>Automático:</b> ${esc(extraNotes.join(" · "))}</div>`
        : "";

    const content = `
        <div class="insp-modal">
            <div class="insp-intro">Inspire aliados a até <b>9 m</b> (marque com <b>T</b>). Você sempre é incluído.
            Bônus base por nível: até <b>+${maxByLevel}</b> (nível de bardo ${level}).</div>
            <div class="insp-row">
                <label>Bônus / gasto de PM:</label>
                <select name="insp-bonus" class="insp-bonus-input">${options.join("")}</select>
            </div>
            ${notesHtml}
            <div class="insp-hint">PM atual: ${pm}. O bônus dura até o fim da cena (cancele pelo menu de skills).</div>
        </div>`;

    const dlg = new Dialog({
        title: "Inspiração",
        content,
        buttons: {
            use: {
                icon: '<i class="fas fa-music"></i>',
                label: "Usar Habilidade",
                callback: (($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const chosen = Number(root.querySelector<HTMLSelectElement>('select[name="insp-bonus"]')?.value ?? "1");
                    const base = resolveBaseBonus(chosen, level, currentPm(actor));
                    if (base < 1) { ui.notifications?.warn("Inspiração: PM insuficiente."); return; }
                    void fireInspiracao(actor, realItem, base);
                }) as (html: JQuery) => void,
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" },
        },
        default: "use",
    }, { classes: ["t20-dialog", "t20-inspiracao-dialog"], width: 460 });
    dlg.render(true);
}

// ── Execução ──────────────────────────────────────────────────────────────────

async function fireInspiracao(actor: FoundryActor, realItem: ItemLike, base: number): Promise<void> {
    const totalPm = pmCostForBonus(base);
    const gaitaEquipped = hasGaitaDeFoles(actor);
    const adam = hasAdamanteInstrument(actor);

    // 1. Gaita de Foles — teste de Atuação (CD 20 + PM). Falha → sem efeito, mas gasta PM.
    let gaitaPassed = false;
    if (gaitaEquipped) {
        const cd = gaitaCD(totalPm);
        const bonus = computeSkillTotal(actor, "atua");
        const roll = new Roll("1d20 + @b", { b: bonus });
        await roll.evaluate();
        gaitaPassed = (roll.total ?? 0) >= cd;

        // Card + overlay do teste (não casa o parser T20 → sem overlay duplicado).
        try {
            await ChatMessage.create({
                speaker: { alias: actor.name, actor: actor.id },
                flavor: `Inspiração — Gaita de Foles (Atuação vs CD ${cd})`,
                rolls: [roll.toJSON?.() ?? roll] as unknown[],
                flags: { [MODULE_ID]: { inspiracaoGaita: true } },
            } as Record<string, unknown>);
        } catch { /* ignore */ }
        T20Overlay.show(
            { category: "Inspiração", subcategory: `Gaita de Foles — Atuação (CD ${cd})` },
            roll,
            gaitaPassed ? "sucesso" : "falha",
        );
    }

    // 2. Gasta PM (origin p/ sheet-log).
    const pmVal = currentPm(actor);
    await actor.update(
        { "system.attributes.pm.value": Math.max(0, pmVal - totalPm) },
        { [MODULE_ID]: { origin: { kind: "pm-cost", source: "Inspiração" } } } as Record<string, unknown>,
    );

    // 3. Gaita falhou → habilidade sem efeito (PM já gastos). Aborta a aplicação.
    if (gaitaEquipped && !gaitaPassed) {
        await postCard(actor.name, { failed: true, base, totalPm, gaita: "falha", targets: [] });
        return;
    }

    // 4. Bônus final.
    const bonus = computeFinalBonus({ base, gaitaPassed, adamante: adam });

    // 5. Alvos: caster + tokens T a ≤9 m.
    const cToken = casterToken(actor);
    const targetTokens: FoundryToken[] = [];
    const dropped: string[] = [];
    if (cToken) targetTokens.push(cToken);
    for (const t of Array.from(game.user?.targets ?? []) as FoundryToken[]) {
        if (cToken && t.id === cToken.id) continue; // já incluído
        if (!t.actor) continue;
        if (cToken && squaresBetween(cToken, t) > RANGE_SQUARES + 0.05) { dropped.push(t.actor.name); continue; }
        targetTokens.push(t);
    }
    if (dropped.length) ui.notifications?.warn(`Inspiração: fora de 9 m / 6 quadrados (ignorado): ${dropped.join(", ")}.`);

    // 6. Monta changes conforme melhorias.
    const imps = knownImprovements(actor);
    const changes: AEChange[] = [
        { key: "system.modificadores.pericias.geral", mode: 2, value: String(bonus), priority: 20 },
    ];
    if (imps.has("marcial")) changes.push({ key: "system.modificadores.dano.geral", mode: 2, value: String(bonus), priority: 20 });
    if (imps.has("resoluta")) changes.push({ key: "system.attributes.defesa.bonus", mode: 2, value: String(bonus), priority: 20 });
    const tempPv = imps.has("revigorante") ? 5 * bonus : 0;

    // 7. Aplica (GM-side; roteia via socket se jogador).
    const payload: ApplyPayload = {
        casterActorId: actor.id ?? "",
        casterName: actor.name,
        bonus,
        targetUuids: targetTokens.map((t) => t.actor?.uuid).filter(Boolean) as string[],
        changes,
        tempPv,
        aeName: `Inspiração (+${bonus})`,
        aeIcon: realItem.img || "icons/svg/sound.svg",
        createdWorldTime: game.time?.worldTime ?? 0,
    };
    await applyInspiracao(payload);

    await postCard(actor.name, {
        failed: false, base, totalPm, bonus,
        gaita: gaitaEquipped ? "sucesso" : "",
        adamante: adam,
        imps: Array.from(imps),
        tempPv,
        targets: targetTokens.map((t) => t.actor?.name ?? "?"),
    });
    refreshSkillsMenu();
    log(`Inspiração: +${bonus} (base ${base}, ${totalPm} PM) em ${targetTokens.length} alvo(s).`);
}

/** Aplica GM-side ou delega ao GM via socket. */
async function applyInspiracao(payload: ApplyPayload): Promise<void> {
    if (game.user?.isGM) { await applyInspiracaoGM(payload); return; }
    const sock = getSocket();
    if (!sock) { ui.notifications?.warn("Inspiração: socketlib indisponível — GM precisa estar online."); return; }
    await sock.executeAsGM(SOCKET_APPLY, payload);
}

/** Execução GM-side: cria a AE + seta PV temp (Revigorante) em cada alvo. */
async function applyInspiracaoGM(payload: ApplyPayload): Promise<void> {
    if (!game.user?.isGM) return;
    for (const uuid of payload.targetUuids) {
        const actor = fromUuidSync(uuid) as FoundryActor | null;
        if (!actor) continue;
        try {
            // Remove Inspiração anterior deste caster no alvo (não empilha).
            await removeInspiracaoFrom(actor, payload.casterActorId);
            const ae = {
                name: payload.aeName,
                label: payload.aeName, // compat legada
                icon: payload.aeIcon,
                img: payload.aeIcon,
                changes: payload.changes,
                duration: { seconds: 86400, startTime: game.time?.worldTime ?? 0 },
                flags: {
                    [MODULE_ID]: {
                        [FLAG_KEY]: {
                            casterActorId: payload.casterActorId,
                            casterName: payload.casterName,
                            bonus: payload.bonus,
                            createdWorldTime: payload.createdWorldTime,
                        },
                    },
                },
            };
            await (actor as FoundryActor & {
                createEmbeddedDocuments(t: string, d: unknown[], o?: Record<string, unknown>): Promise<unknown>;
            }).createEmbeddedDocuments("ActiveEffect", [ae]);

            if (payload.tempPv > 0) {
                const cur = Number((actor.system?.attributes as { pv?: { temp?: number } } | undefined)?.pv?.temp ?? 0);
                if (payload.tempPv > cur) await actor.update({ "system.attributes.pv.temp": payload.tempPv });
            }
        } catch (err) {
            warn(`Inspiração: falha ao aplicar em ${actor.name}:`, err);
        }
    }
    ui.notifications?.info(`Inspiração (+${payload.bonus}) aplicada em ${payload.targetUuids.length} alvo(s).`);
}

// ── Remoção / cancelamento ─────────────────────────────────────────────────────

interface InspEffect { id?: string; flags?: Record<string, Record<string, unknown>> }

function inspEffectsOf(actor: FoundryActor, casterActorId?: string): InspEffect[] {
    const effects = (actor as { effects?: { contents: InspEffect[] } }).effects?.contents ?? [];
    return effects.filter((e) => {
        const meta = (e.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[FLAG_KEY] as
            | { casterActorId?: string } | undefined;
        if (!meta) return false;
        return casterActorId ? meta.casterActorId === casterActorId : true;
    });
}

async function removeInspiracaoFrom(actor: FoundryActor, casterActorId?: string): Promise<number> {
    const ids = inspEffectsOf(actor, casterActorId).map((e) => e.id).filter(Boolean) as string[];
    if (!ids.length) return 0;
    try {
        await (actor as FoundryActor & {
            deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
        }).deleteEmbeddedDocuments("ActiveEffect", ids);
    } catch (err) { warn(`Inspiração: falha ao remover de ${actor.name}:`, err); }
    return ids.length;
}

/** Atores relevantes (world + sintéticos de tokens do canvas). */
function relevantActors(): FoundryActor[] {
    const out = new Map<string, FoundryActor>();
    for (const a of (game.actors?.contents ?? [])) if (a.id) out.set(a.id, a);
    for (const t of (canvas?.tokens?.placeables ?? [])) {
        const a = t.actor;
        if (a) out.set(a.uuid ?? a.id ?? Math.random().toString(), a);
    }
    return Array.from(out.values());
}

/** Cancela toda a Inspiração de um caster (varre atores relevantes). */
async function cancelInspiracaoOfCaster(casterActorId: string): Promise<void> {
    let total = 0;
    for (const a of relevantActors()) total += await removeInspiracaoFrom(a, casterActorId);
    ui.notifications?.info(`Inspiração cancelada (${total} alvo(s)).`);
    refreshSkillsMenu();
}

/** Casters com Inspiração ativa visível ao usuário atual. */
function activeCasters(): Array<{ id: string; name: string }> {
    const map = new Map<string, string>();
    for (const a of relevantActors()) {
        for (const e of inspEffectsOf(a)) {
            const meta = (e.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[FLAG_KEY] as
                | { casterActorId?: string; casterName?: string } | undefined;
            if (meta?.casterActorId) map.set(meta.casterActorId, meta.casterName ?? "Bardo");
        }
    }
    // GM vê todos; jogador vê só os casters que ele controla.
    const out: Array<{ id: string; name: string }> = [];
    for (const [id, name] of map) {
        const caster = game.actors?.get(id);
        const canManage = game.user?.isGM || (caster as { isOwner?: boolean } | undefined)?.isOwner;
        if (canManage) out.push({ id, name });
    }
    return out;
}

// ── Card no chat ────────────────────────────────────────────────────────────

interface CardInfo {
    failed: boolean;
    base: number;
    totalPm: number;
    bonus?: number;
    gaita?: string;             // "sucesso" | "falha" | ""
    adamante?: boolean;
    imps?: InspiracaoImprovement[];
    tempPv?: number;
    targets: string[];
}

async function postCard(casterName: string, info: CardInfo): Promise<void> {
    ensureStyles();
    if (info.failed) {
        const content =
            `<div class="t20-inspiracao-card is-fail">` +
            `<div class="insp-card-title">🎵 Inspiração — ${esc(casterName)}</div>` +
            `<div class="insp-card-sub">Gaita de Foles: <b>falhou</b> no teste de Atuação — sem efeito (${info.totalPm} PM gastos).</div>` +
            `</div>`;
        await ChatMessage.create({ speaker: { alias: casterName }, content, flags: { [MODULE_ID]: { inspiracaoCard: true } } } as Record<string, unknown>);
        return;
    }
    const extras: string[] = [];
    if (info.gaita === "sucesso") extras.push("Gaita +1");
    if (info.adamante) extras.push("Adamante +1");
    if (info.imps?.includes("marcial")) extras.push("dano");
    if (info.imps?.includes("resoluta")) extras.push("Defesa");
    if (info.tempPv) extras.push(`PV temp. ${info.tempPv}`);
    const extraHtml = extras.length ? `<div class="insp-card-extra">${esc(extras.join(" · "))}</div>` : "";
    const tgts = info.targets.length ? esc(info.targets.join(", ")) : "nenhum alvo em alcance";
    const content =
        `<div class="t20-inspiracao-card">` +
        `<div class="insp-card-title">🎵 Inspiração — ${esc(casterName)}</div>` +
        `<div class="insp-card-sub">Bônus <b>+${info.bonus}</b> em testes de perícia · ${info.totalPm} PM</div>` +
        extraHtml +
        `<div class="insp-card-targets">Alvos: ${tgts}</div>` +
        `</div>`;
    await ChatMessage.create({ speaker: { alias: casterName }, content, flags: { [MODULE_ID]: { inspiracaoCard: true } } } as Record<string, unknown>);
}

// ── Patch do AbilityUseDialog (cancela o fluxo nativo) ────────────────────────

function onInspiracaoUse(cloneItem: ItemLike): void {
    const actor = cloneItem.parent as (FoundryActor & { items?: { contents: FoundryItem[] } }) | null;
    if (!actor) return;
    // O item recebido pelo AbilityUseDialog.create é um CLONE efêmero (id null).
    // Resolve o item real do ator (para img/flags reais).
    const real = (actorItems(actor).find((i) => isInspiracaoPower(i as ItemLike)) as ItemLike | undefined) ?? cloneItem;
    openUseDialog(actor, real);
}

function patchAbilityUseDialog(): void {
    type DlgLike = { create: (item: unknown, ...a: unknown[]) => Promise<unknown>; _t20PatchedInspiracao?: boolean };
    type T20Global = { applications?: { AbilityUseDialog?: DlgLike } };
    const Dlg = (game as unknown as { tormenta20?: T20Global }).tormenta20?.applications?.AbilityUseDialog;
    if (!Dlg) { warn("Inspiração: AbilityUseDialog não encontrado — patch não aplicado."); return; }
    if (Dlg._t20PatchedInspiracao) return;
    const orig = Dlg.create.bind(Dlg);
    Dlg.create = async function (item: unknown, ...args: unknown[]): Promise<unknown> {
        if (isInspiracaoPower(item as ItemLike)) {
            setTimeout(() => { try { onInspiracaoUse(item as ItemLike); } catch (e) { warn("Inspiração: onUse falhou:", e); } }, 0);
            return null;
        }
        return orig(item, ...args);
    };
    Dlg._t20PatchedInspiracao = true;
    log("Inspiração: AbilityUseDialog.create patcheado.");
}

// ── Skills-menu: cancelar ──────────────────────────────────────────────────────

function registerCancelAction(): void {
    registerSkillAction({
        id: "inspiracao-cancel",
        label: "Cancelar Inspiração",
        icon: "fa-solid fa-music",
        color: "#c8a96e",
        isVisible: () => activeCasters().length > 0,
        onClick: () => {
            const casters = activeCasters();
            if (casters.length === 0) return;
            if (casters.length === 1) {
                new Dialog({
                    title: "Cancelar Inspiração",
                    content: `<p>Encerrar a Inspiração de <b>${esc(casters[0].name)}</b>?</p>`,
                    buttons: {
                        yes: { icon: '<i class="fas fa-check"></i>', label: "Encerrar", callback: () => void cancelInspiracaoOfCaster(casters[0].id) },
                        no: { icon: '<i class="fas fa-times"></i>', label: "Voltar" },
                    },
                    default: "yes",
                }, { classes: ["t20-dialog", "t20-inspiracao-dialog"] }).render(true);
                return;
            }
            const rows = casters.map((c) => `
                <label class="insp-pick"><input type="checkbox" value="${esc(c.id)}" checked/> ${esc(c.name)}</label>`).join("");
            new Dialog({
                title: "Cancelar Inspiração",
                content: `<div class="insp-modal"><div class="insp-intro">Encerrar quais Inspirações?</div>${rows}</div>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>', label: "Encerrar",
                        callback: (($html: JQuery) => {
                            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                            const ids = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map((i) => i.value);
                            for (const id of ids) void cancelInspiracaoOfCaster(id);
                        }) as (html: JQuery) => void,
                    },
                    no: { icon: '<i class="fas fa-times"></i>', label: "Voltar" },
                },
                default: "yes",
            }, { classes: ["t20-dialog", "t20-inspiracao-dialog"], width: 420 }).render(true);
        },
    });
}

// ── deleteCombat: expira no fim do encontro ────────────────────────────────────
// Varre TODOS os atores relevantes (os `combatants` já foram apagados junto com o
// combate quando o hook async roda) e remove qualquer Inspiração ativa — casa com
// "até o fim da cena": encontro encerrou → buffs de Inspiração caem.

async function onCombatEnd(): Promise<void> {
    // Qualquer GM limpa (remoção da PRÓPRIA AE é idempotente) — NÃO usamos
    // isActiveGM aqui: se o GM eleito estiver com bundle velho/sessão morta, a
    // limpeza precisa acontecer no GM que está de fato rodando este código.
    if (!game.user?.isGM) return;
    let total = 0;
    for (const a of relevantActors()) total += await removeInspiracaoFrom(a);
    if (total > 0) log(`Inspiração: ${total} buff(s) expirado(s) no fim do combate.`);
    refreshSkillsMenu();
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupInspiracao(): void {
    onSocketReady((socket) => {
        socket.register(SOCKET_APPLY, (payload: unknown) => applyInspiracaoGM(payload as ApplyPayload));
    });

    registerCancelAction();

    Hooks.once("ready", () => { ensureStyles(); patchAbilityUseDialog(); });

    Hooks.on("deleteCombat", () => { void onCombatEnd(); });

    // Botão de cancelar aparece/some conforme cenas carregam.
    Hooks.on("canvasReady", () => refreshSkillsMenu());
}
