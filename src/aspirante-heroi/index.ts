/**
 * Aspirante a herói — poder (Atlas de Arton): "Você recebe +1 em um atributo à
 * sua escolha".
 *
 * O poder vem do módulo Atlas de Arton sem mecânica. Aqui damos a ele o mesmo
 * comportamento das raças que deixam escolher onde pôr o ponto de atributo (ex.:
 * Humano): ao adicionar o poder a um personagem, abrimos um modal pra escolher 1
 * atributo e aplicamos **+1 PERMANENTE** via uma AE no ATOR
 * (`system.atributos.<attr>.bonus` +1, igual ao padrão do módulo — Mente Divina/
 * Deformidade). Detecção por NOME (não editamos o compêndio de outro módulo);
 * como é código do nosso bundle, funciona em instalação limpa.
 *
 * ⚠️ O T20 NÃO usa o transfer nativo do Foundry — por isso a AE vai direto no
 * ATOR (`transfer:false`, `origin` = uuid do poder) e é limpa no `deleteItem`.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

const ASPIRANTE_NAME = "aspirante a heroi";
const ASPIRANTE_FLAG = "aspiranteHeroi";
const ATTR_BONUS = 1;

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Detecção / dados (puros, testáveis) ───────────────────────────────────────

interface ItemLike { type?: string; name?: string }

export function isAspiranteHeroiPoder(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "poder") return false;
    return normalizeCondName(item.name ?? "").includes(ASPIRANTE_NAME);
}

interface AEChange { key: string; value: string; mode: number; priority: number | null }

/**
 * Change de AE para +1 no atributo escolhido. Mira `system.atributos.<attr>.value`
 * (mode ADD) — EXATAMENTE como o poder nativo "Aumento de Atributo". É o `.value`
 * (não `.bonus`) que as derivadas leem (PM/PV/perícias/Defesa), então só assim o
 * bônus cascateia pra mana e afins. (`.bonus` é recomputado tarde demais.)
 */
export function buildAttrBonusChange(attrKey: string): AEChange {
    return { key: `system.atributos.${attrKey}.value`, value: String(ATTR_BONUS), mode: 2, priority: null };
}

/** Os atributos válidos do T20 (chaves de `CONFIG.T20.atributos`). */
export function isValidAttr(attrKey: string): boolean {
    const cfg = (CONFIG as unknown as { T20?: { atributos?: Record<string, string> } }).T20?.atributos ?? {};
    return Object.prototype.hasOwnProperty.call(cfg, attrKey);
}

// ── Atributos ─────────────────────────────────────────────────────────────────

interface AttrOption { key: string; label: string }
function getAttrOptions(): AttrOption[] {
    const cfg = (CONFIG as unknown as { T20?: { atributos?: Record<string, string> } }).T20?.atributos ?? {};
    return Object.entries(cfg).map(([key, label]) => ({ key, label: label ?? key }));
}
function attrLabel(key: string): string {
    const cfg = (CONFIG as unknown as { T20?: { atributos?: Record<string, string> } }).T20?.atributos;
    return cfg?.[key] ?? key;
}

// ── AE management ─────────────────────────────────────────────────────────────

interface EffectLike { id?: string | null; origin?: string | null; flags?: Record<string, Record<string, unknown> | undefined> }
interface ActorLike {
    type?: string;
    effects?: { contents?: EffectLike[] };
    createEmbeddedDocuments?: (type: string, data: object[], ctx?: object) => Promise<unknown>;
    deleteEmbeddedDocuments?: (type: string, ids: string[], ctx?: object) => Promise<unknown>;
}
interface AspiranteItem {
    id?: string | null;
    uuid?: string;
    parent?: (ActorLike & { type?: string }) | null;
}

function buildAspiranteAE(attrKey: string, itemUuid: string): Record<string, unknown> {
    return {
        name: `Aspirante a herói — +${ATTR_BONUS} ${attrLabel(attrKey)}`,
        icon: "icons/magic/life/heart-cross-blue.webp",
        origin: itemUuid,
        transfer: false,
        disabled: false,
        changes: [buildAttrBonusChange(attrKey)],
        flags: { [MODULE_ID]: { [ASPIRANTE_FLAG]: true } },
    };
}

/** IDs das nossas AEs anteriores deste poder (p/ trocar a escolha sem duplicar). */
function priorAspiranteAEs(actor: ActorLike, itemUuid: string | undefined): string[] {
    return (actor.effects?.contents ?? [])
        .filter(e => (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[ASPIRANTE_FLAG]
            && (e.origin === itemUuid || !itemUuid))
        .map(e => e.id)
        .filter((id): id is string => Boolean(id));
}

async function applyAspirante(item: AspiranteItem, attrKey: string): Promise<void> {
    const actor = item.parent;
    if (!actor) { warn("Aspirante a herói: poder sem ator."); return; }
    if (!isValidAttr(attrKey)) { warn(`Aspirante a herói: atributo inválido "${attrKey}".`); return; }

    const prior = priorAspiranteAEs(actor, item.uuid);
    if (prior.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", prior, { render: false });

    await actor.createEmbeddedDocuments?.("ActiveEffect", [buildAspiranteAE(attrKey, item.uuid ?? "")], { render: false });
    ui.notifications?.info(`Aspirante a herói: +${ATTR_BONUS} em ${attrLabel(attrKey)}.`);
    log(`Aspirante a herói aplicado: +${ATTR_BONUS} ${attrKey}.`);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openAspiranteModal(item: AspiranteItem): void {
    const options = getAttrOptions()
        .map(a => `<option value="${esc(a.key)}">${esc(a.label)}</option>`)
        .join("");
    const content = `
        <div style="padding:4px 2px;line-height:1.5">
            <p>Você recebe <b>+${ATTR_BONUS}</b> em um atributo à sua escolha.</p>
            <div class="form-group">
                <label for="asp-attr">Atributo</label>
                <select id="asp-attr" name="asp-attr" style="width:100%">${options}</select>
            </div>
        </div>`;
    const dlg = new Dialog({
        title: "Aspirante a herói — Escolha do Atributo",
        content,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-check"></i>',
                label: "Confirmar",
                callback: ($html: JQuery) => {
                    const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                    const attr = root.querySelector<HTMLSelectElement>('select[name="asp-attr"]')?.value;
                    if (attr) void applyAspirante(item, attr);
                },
            },
        },
        default: "confirm",
    }, { classes: ["t20-dialog", "t20-aspirante-dialog"], width: 360 });
    dlg.render(true);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupAspiranteHeroi(): void {
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & AspiranteItem;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;       // só quem adicionou escolhe
        if (!isAspiranteHeroiPoder(item)) return;
        if (item.parent?.type !== "character") return;          // só em personagens
        try { openAspiranteModal(item); }
        catch (err) { warn(`Aspirante a herói: falha ao abrir modal:`, err); }
    });

    // Limpeza: ao remover o poder, apaga a AE de bônus que criamos no ator.
    Hooks.on("deleteItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & AspiranteItem;
        const userId = args[2] as string | undefined;
        if (!userId || userId !== game.user?.id) return;
        if (!isAspiranteHeroiPoder(item)) return;
        const actor = item.parent;
        if (!actor) return;
        const ours = priorAspiranteAEs(actor, item.uuid);
        if (ours.length) void actor.deleteEmbeddedDocuments?.("ActiveEffect", ours, { render: false });
    });

    log(`Aspirante a herói: escolha de atributo (+${ATTR_BONUS}) ativa.`);
}
