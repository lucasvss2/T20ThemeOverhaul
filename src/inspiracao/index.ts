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
import {
    isInspiracaoPower,
    inspiracaoImprovementOf,
    maxBonusForLevel,
    pmCostForBonus,
    gaitaCD,
    computeFinalBonus,
    espirituosaPmTemp,
    arteMagicaCdChanges,
    adjustInspiracaoCost,
    clarimResistChanges,
    tamboreteMoveChanges,
    norm,
    type InspiracaoImprovement,
} from "./format";
import STYLES from "./inspiracao.css?inline";

const STYLES_ID = "t20-inspiracao-styles";
const FLAG_KEY = "inspiracao"; // flags.<MODULE_ID>.inspiracao (na AE)
const ESPIRITUOSA_FLAG = "inspEspirituosaCombat"; // flags.<MODULE_ID> (no bardo): combatId da última Espirituosa
const CORNAMUSA_FLAG = "cornamusaPenalty"; // flag na AE de −2 Defesa da Cornamusa
const SOCKET_APPLY = "inspiracao/apply";

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
    casterExtraChanges: AEChange[]; // Arte Mágica: +2 CD SÓ na AE do bardo
    tempPv: number;      // Revigorante: 5× bônus (0 = sem)
    tempPm: number;      // Espirituosa: = bônus, 1ª vez no combate (0 = sem)
    acoRubi: boolean;    // Aço-Rubi: marca a AE do alvo com proteção vs crítico
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

/** Combate ATIVO em andamento → seu id, ou null (fora de combate). */
function activeCombatId(): string | null {
    const c = (game as unknown as { combat?: { id?: string; started?: boolean } }).combat;
    return c?.started ? (c.id ?? null) : null;
}

/**
 * Inspiração Espirituosa: é a 1ª vez que este bardo usa Inspiração NESTE combate?
 * Fora de combate → false (a regra é "em cada combate").
 */
function isFirstEspirituosaUseInCombat(actor: FoundryActor): boolean {
    const cid = activeCombatId();
    if (!cid) return false;
    const last = (actor.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[ESPIRITUOSA_FLAG];
    return last !== cid;
}

async function markEspirituosaUsed(actor: FoundryActor): Promise<void> {
    const cid = activeCombatId();
    if (!cid) return;
    await actor.update({ [`flags.${MODULE_ID}.${ESPIRITUOSA_FLAG}`]: cid });
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

/** Algum instrumento equipado cujo nome normalizado inclui `key`? */
function hasEquippedInstrument(actor: FoundryActor, key: string): boolean {
    return actorItems(actor).some((it) => isEquipped(it) && norm(it.name).includes(key));
}

/**
 * Algum instrumento musical EQUIPADO com o material `materialKey` no slot de
 * material do T20 (`system.upgrades.material`, igual às armas). O efeito fica
 * **ligado ao item** — NÃO detectamos por nome (o material tem que estar
 * selecionado no aprimoramento). Ver `src/adamante`, que registra os materiais
 * (`tools.<key>`) como Automatizado para ferramentas.
 * Keys T20 (`CONFIG.T20.specialMaterials`): adamant, ruby-steel, dark-wood, mithril.
 */
function hasInstrumentMaterial(actor: FoundryActor, materialKey: string): boolean {
    return actorItems(actor).some((it) => {
        if (!isEquipped(it) || !isInstrumentName(it.name)) return false;
        const mat = (it.system as { upgrades?: { material?: string } } | undefined)?.upgrades?.material;
        return mat === materialKey;
    });
}

const hasAdamanteInstrument = (actor: FoundryActor): boolean => hasInstrumentMaterial(actor, "adamant");

/**
 * Reduções de custo da Inspiração: Cornamusa de Doherimm (instrumento vestido)
 * e Madeira Tollon (material). −1 PM cada; o piso de 1 é aplicado por
 * `adjustInspiracaoCost`.
 */
function costReductions(actor: FoundryActor): number {
    return (hasEquippedInstrument(actor, "cornamusa") ? 1 : 0)
        + (hasInstrumentMaterial(actor, "dark-wood") ? 1 : 0);
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

// ── Diálogo de uso (imagem 1 reformulada) ─────────────────────────────────────

function openUseDialog(actor: FoundryActor, realItem: ItemLike): void {
    ensureStyles();
    const level = bardLevel(actor);
    const pm = currentPm(actor);
    const maxByLevel = maxBonusForLevel(level);
    const reductions = costReductions(actor); // Cornamusa + Madeira Tollon (−1 cada)
    const costFor = (b: number): number => adjustInspiracaoCost(pmCostForBonus(b), reductions);

    // Maior bônus base (limitado por nível) que os PM pagam já com o desconto.
    let maxBase = 0;
    for (let b = 1; b <= maxByLevel; b++) if (costFor(b) <= pm) maxBase = b;

    if (maxBase < 1) {
        ui.notifications?.warn(`Inspiração: PM insuficiente (precisa de ${costFor(1)} PM; você tem ${pm}).`);
        return;
    }

    const gaita = hasGaitaDeFoles(actor);
    const adam = hasAdamanteInstrument(actor);
    const clarim = hasEquippedInstrument(actor, "clarim");
    const tamborete = hasEquippedInstrument(actor, "tamborete");
    const cornamusa = hasEquippedInstrument(actor, "cornamusa");
    const madeiraTollon = hasInstrumentMaterial(actor, "dark-wood");
    const mitral = hasInstrumentMaterial(actor, "mithril");
    const acoRubi = hasInstrumentMaterial(actor, "ruby-steel");
    const imps = knownImprovements(actor);
    const extraNotes: string[] = [];
    if (imps.has("marcial")) extraNotes.push("Marcial (+bônus no dano)");
    if (imps.has("resoluta")) extraNotes.push("Resoluta (+bônus na Defesa)");
    if (imps.has("revigorante")) extraNotes.push("Revigorante (PV temp. 5×)");
    if (imps.has("espirituosa")) extraNotes.push("Espirituosa (PM temp. na 1ª do combate)");
    if (imps.has("artemagica")) extraNotes.push("Arte Mágica (+2 CD das habilidades)");
    if (adam) extraNotes.push("Adamante (+1)");
    if (gaita) extraNotes.push("Gaita de Foles (teste de Atuação → +1)");
    if (clarim) extraNotes.push("Clarim (+1 resistência)");
    if (tamborete) extraNotes.push("Tamborete (+3 m deslocamento)");
    if (cornamusa) extraNotes.push("Cornamusa (custo −1 PM, −2 Defesa)");
    if (madeiraTollon) extraNotes.push("Madeira Tollon (custo −1 PM)");
    if (acoRubi) extraNotes.push("Aço-Rubi (25% de evitar dano extra de crítico)");
    if (mitral) extraNotes.push("Mitral (ação de movimento)");

    const options = [];
    for (let b = 1; b <= maxByLevel; b++) {
        if (costFor(b) > pm) continue;
        options.push(`<option value="${b}" ${b === maxBase ? "selected" : ""}>+${b} (custo ${costFor(b)} PM)</option>`);
    }

    const notesHtml = extraNotes.length
        ? `<div class="insp-notes"><b>Automático:</b> ${esc(extraNotes.join(" · "))}</div>`
        : "";

    const content = `
        <div class="insp-modal">
            <div class="insp-intro">Inspire aliados: <b>marque-os com T</b> (o alcance de 9 m é controlado por você). Você sempre é incluído.
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
                    const base = Math.max(1, Math.min(Math.floor(chosen || 0), maxByLevel));
                    if (costFor(base) > currentPm(actor)) { ui.notifications?.warn("Inspiração: PM insuficiente."); return; }
                    // Qualquer erro no fluxo vira notificação (nunca falha em silêncio).
                    fireInspiracao(actor, realItem, base).catch((e) => {
                        warn("Inspiração: fireInspiracao falhou:", e);
                        ui.notifications?.error(`Inspiração falhou: ${String((e as { message?: string })?.message ?? e)}`);
                    });
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
    const totalPm = adjustInspiracaoCost(pmCostForBonus(base), costReductions(actor)); // Cornamusa/Madeira Tollon
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
        ui.notifications?.warn(`Inspiração: Gaita de Foles falhou no teste de Atuação — nenhum efeito (${totalPm} PM gastos).`);
        await postCard(actor.name, { failed: true, base, totalPm, gaita: "falha", targets: [] });
        return;
    }

    // 4. Bônus final.
    const bonus = computeFinalBonus({ base, gaitaPassed, adamante: adam });

    // 5. Alvos: o bardo (VOCÊ) SEMPRE — via ATOR, independente de ter token na
    //    cena — + TODOS os tokens marcados com T. **Sem filtro de alcance**: o
    //    controle de alcance (9 m) é feito manualmente pelo usuário ao escolher
    //    quem marca com T (pedido do usuário). Dedupe por uuid de ator.
    const targetsList: Array<{ uuid: string; name: string }> = [];
    const seen = new Set<string>();
    if (actor.uuid) { targetsList.push({ uuid: actor.uuid, name: actor.name }); seen.add(actor.uuid); }
    for (const t of Array.from(game.user?.targets ?? []) as FoundryToken[]) {
        const ta = t.actor;
        if (!ta || !ta.uuid) continue;
        if (seen.has(ta.uuid)) continue; // já incluído (é o próprio bardo)
        targetsList.push({ uuid: ta.uuid, name: ta.name });
        seen.add(ta.uuid);
    }

    // 6. Monta changes conforme melhorias.
    const imps = knownImprovements(actor);
    const changes: AEChange[] = [
        { key: "system.modificadores.pericias.geral", mode: 2, value: String(bonus), priority: 20 },
    ];
    if (imps.has("marcial")) changes.push({ key: "system.modificadores.dano.geral", mode: 2, value: String(bonus), priority: 20 });
    if (imps.has("resoluta")) changes.push({ key: "system.attributes.defesa.bonus", mode: 2, value: String(bonus), priority: 20 });
    // Instrumentos/materiais que buffam os alvos sob a Inspiração.
    const clarim = hasEquippedInstrument(actor, "clarim");
    const tamborete = hasEquippedInstrument(actor, "tamborete");
    const cornamusa = hasEquippedInstrument(actor, "cornamusa");
    const madeiraTollon = hasInstrumentMaterial(actor, "dark-wood");
    const mitral = hasInstrumentMaterial(actor, "mithril");
    const acoRubi = hasInstrumentMaterial(actor, "ruby-steel");
    changes.push(...clarimResistChanges(clarim));    // Clarim: +1 resistência
    changes.push(...tamboreteMoveChanges(tamborete)); // Tamborete: +3 m deslocamento
    const tempPv = imps.has("revigorante") ? 5 * bonus : 0;

    // Arte Mágica: +2 CD só na AE do bardo (enquanto sob a própria Inspiração).
    const casterExtraChanges = arteMagicaCdChanges(imps.has("artemagica"));

    // Inspiração Espirituosa: PM temp = bônus na 1ª vez do combate (caster + aliados).
    const firstEspirituosa = imps.has("espirituosa") && isFirstEspirituosaUseInCombat(actor);
    const tempPm = espirituosaPmTemp(bonus, firstEspirituosa);
    if (firstEspirituosa) await markEspirituosaUsed(actor);

    // 7. Aplica (GM-side; roteia via socket se jogador).
    const payload: ApplyPayload = {
        casterActorId: actor.id ?? "",
        casterName: actor.name,
        bonus,
        targetUuids: targetsList.map((t) => t.uuid),
        changes,
        casterExtraChanges,
        tempPv,
        tempPm,
        acoRubi, // Aço-Rubi: proteção 25% vs dano extra de crítico (marcada na AE do alvo)
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
        tempPm,
        arteMagica: casterExtraChanges.length > 0,
        clarim, tamborete, cornamusa, madeiraTollon, mitral, acoRubi,
        targets: targetsList.map((t) => t.name),
    });
    refreshSkillsMenu();
    ui.notifications?.info(`Inspiração +${bonus} aplicada em: ${targetsList.map((t) => t.name).join(", ")}.`);
    log(`Inspiração: +${bonus} (base ${base}, ${totalPm} PM) em ${targetsList.length} alvo(s).`);
}

/** Aplica GM-side ou delega ao GM via socket. */
async function applyInspiracao(payload: ApplyPayload): Promise<void> {
    if (game.user?.isGM) { await applyInspiracaoGM(payload); return; }
    const sock = getSocket();
    if (!sock) { ui.notifications?.warn("Inspiração: socketlib indisponível — GM precisa estar online."); return; }
    await sock.executeAsGM(SOCKET_APPLY, payload);
}

/** Execução GM-side: cria a AE + seta PV/PM temp em cada alvo. */
async function applyInspiracaoGM(payload: ApplyPayload): Promise<void> {
    if (!game.user?.isGM) return;
    for (const uuid of payload.targetUuids) {
        const actor = fromUuidSync(uuid) as FoundryActor | null;
        if (!actor) continue;
        try {
            // Remove Inspiração anterior deste caster no alvo (não empilha).
            await removeInspiracaoFrom(actor, payload.casterActorId);
            // Arte Mágica: changes extras (+2 CD) só vão na AE do PRÓPRIO bardo.
            const isCaster = actor.id === payload.casterActorId;
            const aeChanges = isCaster && payload.casterExtraChanges.length
                ? [...payload.changes, ...payload.casterExtraChanges]
                : payload.changes;
            const ae = {
                name: payload.aeName,
                label: payload.aeName, // compat legada
                icon: payload.aeIcon,
                img: payload.aeIcon,
                changes: aeChanges,
                duration: { seconds: 86400, startTime: game.time?.worldTime ?? 0 },
                flags: {
                    [MODULE_ID]: {
                        [FLAG_KEY]: {
                            casterActorId: payload.casterActorId,
                            casterName: payload.casterName,
                            bonus: payload.bonus,
                            createdWorldTime: payload.createdWorldTime,
                            acoRubi: payload.acoRubi,
                        },
                    },
                },
            };
            await (actor as FoundryActor & {
                createEmbeddedDocuments(t: string, d: unknown[], o?: Record<string, unknown>): Promise<unknown>;
            }).createEmbeddedDocuments("ActiveEffect", [ae]);

            const attrs = actor.system?.attributes as { pv?: { temp?: number }; pm?: { temp?: number } } | undefined;
            const upd: Record<string, unknown> = {};
            if (payload.tempPv > 0) {
                const cur = Number(attrs?.pv?.temp ?? 0);
                if (payload.tempPv > cur) upd["system.attributes.pv.temp"] = payload.tempPv;
            }
            if (payload.tempPm > 0) {
                const cur = Number(attrs?.pm?.temp ?? 0);
                if (payload.tempPm > cur) upd["system.attributes.pm.temp"] = payload.tempPm;
            }
            if (Object.keys(upd).length) await actor.update(upd);
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

/**
 * Aço-Rubi — contexto de proteção do ATOR (alvo). Retorna os casters cujas
 * Inspirações ativas nele têm o material Aço-Rubi (`acoRubi:true`). Consumido
 * pelo auto-damage: no crítico, oferece 1d4 → no 1, ignora o dano extra.
 * Prefere resolver o ator pelo TOKEN (NPCs unlinked têm actor sintético).
 */
export function getAcoRubiContextForActor(actorId: string, tokenId?: string): Array<{ casterName: string }> {
    const tok = tokenId ? canvas?.tokens?.get(tokenId) : null;
    const actor = (tok?.actor ?? game.actors?.get(actorId)) as FoundryActor | null;
    if (!actor) return [];
    const out: Array<{ casterName: string }> = [];
    for (const e of inspEffectsOf(actor)) {
        const meta = (e.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[FLAG_KEY] as
            | { acoRubi?: boolean; casterName?: string } | undefined;
        if (meta?.acoRubi) out.push({ casterName: meta.casterName ?? "Bardo" });
    }
    return out;
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
    tempPm?: number;
    arteMagica?: boolean;
    clarim?: boolean;
    tamborete?: boolean;
    cornamusa?: boolean;
    madeiraTollon?: boolean;
    mitral?: boolean;
    acoRubi?: boolean;
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
    if (info.tempPm) extras.push(`PM temp. ${info.tempPm}`);
    if (info.arteMagica) extras.push("+2 CD (Arte Mágica)");
    if (info.clarim) extras.push("+1 resist. (Clarim)");
    if (info.tamborete) extras.push("+3 m desloc. (Tamborete)");
    if (info.cornamusa) extras.push("custo −1 (Cornamusa)");
    if (info.madeiraTollon) extras.push("custo −1 (Madeira Tollon)");
    if (info.acoRubi) extras.push("25% vs crítico (Aço-Rubi)");
    if (info.mitral) extras.push("ação de movimento (Mitral)");
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

// ── Materiais de instrumento: registra em CONFIG.T20.upgrades.tools ────────────
// Faz "Aço-Rubi / Madeira Tollon / Mitral" aparecerem como Automatizado no slot
// de material das ferramentas (igual ao `tools.adamant` do src/adamante). São
// MARCADORES (sem changes) — os efeitos reais são lógica custom (Aço-Rubi no
// auto-damage; Madeira Tollon no custo; Mitral é informativo).

function injectInspiracaoMaterials(): void {
    const upgrades = (CONFIG as unknown as { T20?: { upgrades?: { tools?: Record<string, unknown> & { status?: Record<string, string> } } } }).T20?.upgrades;
    const tools = upgrades?.tools;
    if (!tools) { warn("Inspiração: CONFIG.T20.upgrades.tools não encontrado — materiais não registrados."); return; }
    const mats: Array<[string, string, string]> = [
        ["ruby-steel", "Aço-Rubi", "Aço-Rubi: criaturas sob sua Inspiração têm 25% de evitar o dano extra de acerto crítico e ataques furtivos."],
        ["dark-wood", "Madeira Tollon", "Madeira Tollon: reduz em −1 PM (mín. 1) o custo das habilidades de bardo."],
        ["mithril", "Mitral", "Mitral: a ação para usar Inspiração é reduzida em um passo (padrão → movimento)."],
    ];
    tools.status ??= {};
    for (const [key, label, desc] of mats) {
        tools[key] = {
            name: label, description: desc, tint: "#8a2b3a", changes: [],
            flags: { tormenta20: { onuse: false, durationScene: false, upgrade: key, self: false } },
            disabled: false, transfer: true,
        };
        tools.status[key] = "DONE";
    }
}

// ── Cornamusa de Doherimm: −2 Defesa enquanto vestida ─────────────────────────
// Penalidade PERSISTENTE do instrumento (não do cast). Sincronizada por equip:
// AE no ator com nosso flag, criada quando a cornamusa está equipada e removida
// quando não está. Roda no cliente do DONO (idempotente pelo check de existência).

function cornamusaPenaltyAE(actor: FoundryActor): InspEffect | undefined {
    const effects = (actor as { effects?: { contents: InspEffect[] } }).effects?.contents ?? [];
    return effects.find((e) => (e.flags?.[MODULE_ID] as { [k: string]: unknown } | undefined)?.[CORNAMUSA_FLAG]);
}

async function syncCornamusaPenalty(actor: FoundryActor | null | undefined): Promise<void> {
    if (!actor || actor.type !== "character") return;
    const has = hasEquippedInstrument(actor, "cornamusa");
    const existing = cornamusaPenaltyAE(actor);
    try {
        if (has && !existing) {
            await (actor as FoundryActor & {
                createEmbeddedDocuments(t: string, d: unknown[]): Promise<unknown>;
            }).createEmbeddedDocuments("ActiveEffect", [{
                name: "Cornamusa de Doherimm (−2 Defesa)",
                label: "Cornamusa de Doherimm (−2 Defesa)",
                icon: "icons/svg/downgrade.svg",
                img: "icons/svg/downgrade.svg",
                changes: [{ key: "system.attributes.defesa.bonus", mode: 2, value: "-2", priority: 20 }],
                flags: { [MODULE_ID]: { [CORNAMUSA_FLAG]: true } },
            }]);
        } else if (!has && existing?.id) {
            await (actor as FoundryActor & {
                deleteEmbeddedDocuments(t: string, ids: string[]): Promise<unknown>;
            }).deleteEmbeddedDocuments("ActiveEffect", [existing.id]);
        }
    } catch (err) { warn(`Inspiração: sync da penalidade da Cornamusa falhou:`, err); }
}

function isMyUser(userId: string | undefined): boolean {
    return !!userId && userId === game.user?.id;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupInspiracao(): void {
    // Registra os materiais de instrumento (Aço-Rubi/Madeira Tollon/Mitral) como
    // Automatizado — mesmo momento (hook setup) em que o src/adamante roda.
    try { injectInspiracaoMaterials(); } catch (e) { warn("Inspiração: injeção de materiais falhou:", e); }

    onSocketReady((socket) => {
        socket.register(SOCKET_APPLY, (payload: unknown) => applyInspiracaoGM(payload as ApplyPayload));
    });

    registerCancelAction();

    Hooks.once("ready", () => {
        ensureStyles();
        patchAbilityUseDialog();
        // Sincroniza a penalidade da Cornamusa nos personagens que possuo.
        for (const a of (game.actors?.contents ?? [])) {
            if (a.type === "character" && (a as { isOwner?: boolean }).isOwner) void syncCornamusaPenalty(a);
        }
    });

    // Cornamusa: (des)equipar / adicionar / remover → re-sincroniza a −2 Defesa.
    Hooks.on("createItem", (...a: unknown[]) => { if (isMyUser(a[2] as string)) void syncCornamusaPenalty((a[0] as { parent?: FoundryActor })?.parent); });
    Hooks.on("deleteItem", (...a: unknown[]) => { if (isMyUser(a[2] as string)) void syncCornamusaPenalty((a[0] as { parent?: FoundryActor })?.parent); });
    Hooks.on("updateItem", (...a: unknown[]) => { if (isMyUser(a[3] as string)) void syncCornamusaPenalty((a[0] as { parent?: FoundryActor })?.parent); });

    Hooks.on("deleteCombat", () => { void onCombatEnd(); });

    // Botão de cancelar aparece/some conforme cenas carregam.
    Hooks.on("canvasReady", () => refreshSkillsMenu());
}
