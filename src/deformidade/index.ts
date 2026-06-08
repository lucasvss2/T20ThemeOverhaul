/**
 * Deformidade — poder racial do Lefou.
 *
 * Texto: "Todo Lefou possui defeitos físicos … Você recebe +2 em duas perícias
 * a sua escolha. … Você pode trocar um desses bônus por um poder da Tormenta a
 * sua escolha."
 *
 * Ao adicionar o poder Deformidade a um personagem, abrimos um modal para o
 * jogador escolher 1 ou 2 perícias (ou marcar um slot como "Poder da Tormenta",
 * que ele adiciona à parte). Cada perícia escolhida recebe +2 PERMANENTE, via
 * uma AE no próprio item (`system.pericias.<key>.bonus` +2, transfer). A AE
 * on-use nativa do compêndio (+2 em qualquer rolagem de perícia) é removida para
 * não duplicar o bônus.
 *
 * Sequência com o Lefou: ao selecionar a raça Lefou, o T20 (1) abre o modal
 * "Atributos Dinâmicos" e só DEPOIS (2) cria os poderes raciais (Cria da
 * Tormenta + Deformidade). Logo o nosso `createItem` já dispara após os
 * atributos. Por robustez, se o modal de atributos ainda estiver aberto,
 * aguardamos ele fechar antes de abrir o nosso.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";
import DEFORMIDADE_STYLES from "./deformidade.css?inline";

const DEFORMIDADE_NAME = "deformidade";
const DEFORMIDADE_FLAG = "deformidade";
const SKILL_BONUS = 2;
const STYLES_ID = "bg3-t20-deformidade-styles";

// ── CSS ───────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = DEFORMIDADE_STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Detecção / dados (puros, testáveis) ───────────────────────────────────────

interface ItemLike { type?: string; name?: string }

export function isDeformidadePoder(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    return normalizeCondName(item.name ?? "").includes(DEFORMIDADE_NAME);
}

interface AEChange { key: string; value: string; mode: number; priority: number }

/** Changes de AE para +2 em cada perícia escolhida (deduplicadas). */
export function buildSkillBonusChanges(skillKeys: string[]): AEChange[] {
    const seen = new Set<string>();
    const out: AEChange[] = [];
    for (const k of skillKeys) {
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push({ key: `system.pericias.${k}.bonus`, value: String(SKILL_BONUS), mode: 2, priority: 20 });
    }
    return out;
}

// ── Skill list ────────────────────────────────────────────────────────────────

interface SkillOption { key: string; label: string }

function getSkillOptions(): SkillOption[] {
    const cfg = (CONFIG as unknown as { T20?: { pericias?: Record<string, { label?: string }> } }).T20?.pericias ?? {};
    return Object.entries(cfg)
        .map(([key, v]) => ({ key, label: v?.label ?? key }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function skillLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { pericias?: Record<string, { label?: string }> } }).T20?.pericias;
    return cfg?.[key]?.label ?? key;
}

// ── AE management ─────────────────────────────────────────────────────────────

interface EffectLike {
    id?: string | null;
    origin?: string | null;
    flags?: { tormenta20?: { onuse?: boolean; skill?: boolean }; [k: string]: unknown };
}
interface ActorLike {
    effects?: { contents?: EffectLike[] };
    createEmbeddedDocuments?: (type: string, data: object[], ctx?: object) => Promise<unknown>;
    deleteEmbeddedDocuments?: (type: string, ids: string[], ctx?: object) => Promise<unknown>;
}
interface DeformidadeItem {
    id?: string | null;
    uuid?: string;
    parent?: (ActorLike & { type?: string }) | null;
    effects?: { contents?: EffectLike[] };
    deleteEmbeddedDocuments?: (type: string, ids: string[], ctx?: object) => Promise<unknown>;
}

/**
 * A AE vai no ATOR (transfer:false, disabled:false) — o T20 não transfere AEs
 * de item como o Foundry padrão (ele copia a on-use pro ator). `origin` aponta
 * pro item de Deformidade para permitir limpeza no deleteItem.
 */
function buildDeformidadeAE(skillKeys: string[], itemUuid: string): Record<string, unknown> {
    const labels = skillKeys.map(skillLabel).join(", ");
    return {
        name: `Deformidade — +${SKILL_BONUS} ${labels}`,
        icon: "systems/tormenta20/icons/svg/skills.svg",
        origin: itemUuid,
        transfer: false,
        disabled: false,
        changes: buildSkillBonusChanges(skillKeys),
        flags: { [MODULE_ID]: { [DEFORMIDADE_FLAG]: true } },
    };
}

/** AEs a remover: on-use nativa da Deformidade (no item e no ator) + AE nossa anterior. */
function deformidadeAEsToRemove(effects: EffectLike[], itemId: string): string[] {
    return effects
        .filter(e => {
            const native = e.flags?.tormenta20?.onuse && e.flags?.tormenta20?.skill
                && (e.origin ?? "").includes(`Item.${itemId}`);
            const itemOwn = e.flags?.tormenta20?.onuse && e.flags?.tormenta20?.skill && !e.origin;
            const ours = Boolean(e.flags?.[MODULE_ID]);
            return native || itemOwn || ours;
        })
        .map(e => e.id)
        .filter((id): id is string => Boolean(id));
}

/** Aplica a escolha: remove a AE on-use nativa (item+ator) + nossa anterior, cria a permanente no ator. */
async function applyDeformidade(item: DeformidadeItem, skillKeys: string[]): Promise<void> {
    const actor = item.parent;
    if (!actor) { warn("Deformidade: poder sem ator."); return; }
    const itemId = item.id ?? "";

    // remove on-use nativa que ficou no PRÓPRIO item (evita re-transferência pelo T20)
    const itemDel = deformidadeAEsToRemove(item.effects?.contents ?? [], itemId);
    if (itemDel.length) await item.deleteEmbeddedDocuments?.("ActiveEffect", itemDel, { render: false });

    // remove on-use nativa copiada pro ATOR + nossa AE anterior
    const actorDel = deformidadeAEsToRemove(actor.effects?.contents ?? [], itemId);
    if (actorDel.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", actorDel, { render: false });

    if (skillKeys.length) {
        await actor.createEmbeddedDocuments?.("ActiveEffect", [buildDeformidadeAE(skillKeys, item.uuid ?? "")], { render: false });
    }
    const names = skillKeys.map(skillLabel).join(", ");
    ui.notifications?.info(skillKeys.length
        ? `Deformidade: +${SKILL_BONUS} em ${names}.`
        : "Deformidade: nenhuma perícia selecionada (use o(s) Poder(es) da Tormenta).");
    log(`Deformidade aplicada: [${skillKeys.join(", ")}].`);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openDeformidadeModal(item: DeformidadeItem): void {
    ensureStyles();
    const skills = getSkillOptions();
    const options = skills.map(s => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("");

    const slot = (i: number) => `
        <div class="def-slot">
            <label class="def-slot-label">Bônus ${i}</label>
            <select name="def-skill-${i}" class="def-select">${options}</select>
            <label class="def-power-toggle">
                <input type="checkbox" name="def-power-${i}" /> Poder da Tormenta
            </label>
        </div>`;

    const content = `
        <div class="def-modal">
            <div class="def-intro">Você recebe <b>+${SKILL_BONUS}</b> em duas perícias à sua escolha. Pode trocar
            um dos bônus por um <b>Poder da Tormenta</b> (marque a caixa — adicione o poder à parte).</div>
            ${slot(1)}
            ${slot(2)}
        </div>`;

    const dlg = new Dialog({
        title: "Deformidade — Escolha das Perícias",
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-check"></i>',
                label: "Confirmar",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const keys: string[] = [];
                    for (const i of [1, 2]) {
                        const isPower = root.querySelector<HTMLInputElement>(`input[name="def-power-${i}"]`)?.checked;
                        if (isPower) continue;
                        const k = root.querySelector<HTMLSelectElement>(`select[name="def-skill-${i}"]`)?.value;
                        if (k) keys.push(k);
                    }
                    void applyDeformidade(item, keys);
                },
            },
        },
        default: "confirm",
        render: ($html: JQuery) => {
            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            // desabilita o dropdown quando "Poder da Tormenta" está marcado
            for (const i of [1, 2]) {
                const cb = root.querySelector<HTMLInputElement>(`input[name="def-power-${i}"]`);
                const sel = root.querySelector<HTMLSelectElement>(`select[name="def-skill-${i}"]`);
                cb?.addEventListener("change", () => { if (sel) sel.disabled = !!cb.checked; });
            }
        },
    }, { classes: ["bg3-dialog", "bg3-deformidade-dialog"], width: 440 });
    dlg.render(true);
}

// ── Sequência com o modal de Atributos Dinâmicos do Lefou ─────────────────────

function attributeDialogOpen(): boolean {
    const instances = (foundry as unknown as { applications?: { instances?: Map<string, { title?: string }> } })
        .applications?.instances;
    for (const app of instances?.values?.() ?? []) {
        if (/atributos\s*din[âa]micos/i.test(app.title ?? "")) return true;
    }
    return false;
}

/** Resolve quando não há modal "Atributos Dinâmicos" aberto (timeout de segurança ~60s). */
async function waitForAttributeDialog(): Promise<void> {
    if (!attributeDialogOpen()) return;
    const start = Date.now();
    await new Promise<void>(resolve => {
        const check = (): void => {
            if (!attributeDialogOpen() || Date.now() - start > 60000) resolve();
            else setTimeout(check, 200);
        };
        setTimeout(check, 200);
    });
}

async function onDeformidadeAdded(item: DeformidadeItem): Promise<void> {
    try {
        await waitForAttributeDialog();
        openDeformidadeModal(item);
    } catch (err) {
        warn(`Deformidade: falha ao abrir modal:`, err);
    }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupDeformidade(): void {
    Hooks.once("ready", () => ensureStyles());
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & DeformidadeItem;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;       // só quem adicionou abre o modal
        if (!isDeformidadePoder(item)) return;
        if (item.parent?.type !== "character") return;          // só em personagens
        void onDeformidadeAdded(item);
    });
    // Limpeza: ao remover o poder Deformidade, apaga a AE de bônus que criamos no ator.
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { uuid?: string; parent?: ActorLike | null };
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;
        if (!isDeformidadePoder(item)) return;
        const actor = item.parent;
        if (!actor) return;
        const ours = (actor.effects?.contents ?? [])
            .filter(e => e.flags?.[MODULE_ID] && (e.origin === item.uuid || !item.uuid))
            .map(e => e.id)
            .filter((id): id is string => Boolean(id));
        if (ours.length) void actor.deleteEmbeddedDocuments?.("ActiveEffect", ours, { render: false });
    });
}
