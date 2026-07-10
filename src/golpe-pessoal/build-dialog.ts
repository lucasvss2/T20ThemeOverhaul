/**
 * Golpe Pessoal — dialog de CONSTRUÇÃO do golpe.
 *
 * Aberto: (a) ao adicionar o poder na ficha (createItem), (b) no prompt de
 * level-up, (c) pelo botão do GM na ficha do item. Grava o build em
 * `flags.<MODULE_ID>.golpePessoal` do ITEM do poder e espelha um resumo na
 * descrição (bloco marcado, idempotente).
 */

import { MODULE_ID } from "@/constants";
import { warn } from "@/utils/logging";
import { norm } from "@/inspiracao/format";
import {
    GOLPE_EFFECTS, GOLPE_ELEMENTS, computeGolpeCost, validateBuild, buildSummary,
    type GolpeBuild, type GolpeEffectPick, type GolpeElement,
} from "./effects";

export const GOLPE_FLAG = "golpePessoal";
const STYLES_ID = "t20-golpe-build-styles";

const CSS = `
.t20-golpe-build { max-height: 70vh; overflow-y: auto; padding-right: 4px; }
.t20-golpe-build .gp-weapon { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.t20-golpe-build .gp-weapon input { flex:1; }
.t20-golpe-build .gp-effect { display:flex; gap:6px; align-items:flex-start; padding:4px 6px; border-bottom:1px solid rgba(200,169,110,.15); }
.t20-golpe-build .gp-effect:hover { background: rgba(200,169,110,.06); }
.t20-golpe-build .gp-effect input[type=checkbox] { margin-top:3px; }
.t20-golpe-build .gp-main { flex:1; }
.t20-golpe-build .gp-label { font-weight:bold; color:#c8a96e; }
.t20-golpe-build .gp-pm { color:#9a8e7a; font-size:11px; margin-left:4px; }
.t20-golpe-build .gp-desc { font-size:11px; color:#9a8e7a; }
.t20-golpe-build .gp-extra { margin-top:3px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:12px; }
.t20-golpe-build .gp-extra select, .t20-golpe-build .gp-extra input[type=number] { width:auto; min-width:60px; height:22px; }
.t20-golpe-build .gp-el-qty { width:44px !important; }
.t20-golpe-build .gp-total { position:sticky; bottom:0; background:#1c1209; padding:6px 8px; margin-top:6px; border-top:1px solid #c8a96e; font-weight:bold; color:#f0ebe0; }
.t20-golpe-build .gp-total .gp-warn { color:#cc4444; font-weight:normal; font-size:11px; display:block; }
`;

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STYLES_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

interface ActorForBuild {
    name?: string;
    items?: { contents: Array<{ id?: string; type?: string; name?: string; system?: { circulo?: number; ativacao?: { custo?: number | null } } }> };
    system?: { attributes?: { nivel?: { value?: number } } };
}

interface ItemForBuild {
    id?: string | null;
    name?: string;
    getFlag?: (scope: string, key: string) => unknown;
    setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
    system?: { description?: { value?: string } };
}

export function actorLevel(actor: ActorForBuild): number {
    return Number(actor.system?.attributes?.nivel?.value) || 0;
}

function actorWeaponNames(actor: ActorForBuild): string[] {
    const names = (actor.items?.contents ?? [])
        .filter((i) => i.type === "arma" && i.name)
        .map((i) => i.name as string);
    return [...new Set(names)];
}

function actorLowCircleSpells(actor: ActorForBuild): Array<{ id: string; name: string; custo: number }> {
    return (actor.items?.contents ?? [])
        .filter((i) => i.type === "magia" && (Number(i.system?.circulo) || 0) <= 2 && i.name)
        .map((i) => ({ id: i.id ?? "", name: i.name as string, custo: Math.max(0, Number(i.system?.ativacao?.custo) || 0) }));
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderContent(actor: ActorForBuild, prev: GolpeBuild | null): string {
    const weapons = actorWeaponNames(actor);
    const spells = actorLowCircleSpells(actor);
    const prevPick = (key: string): GolpeEffectPick | undefined => prev?.effects?.find((p) => p.key === key);
    const prevElQty = (el: GolpeElement): number =>
        (prev?.effects ?? []).filter((p) => p.key === "elemental" && p.element === el)
            .reduce((a, p) => a + Math.max(1, Number(p.qty) || 1), 0);

    const rows = GOLPE_EFFECTS.map((def) => {
        const picked = !!prevPick(def.key);
        const pmTxt = def.key === "conjurador" ? "custo da magia +1 PM"
            : `${def.pm >= 0 ? "+" : "−"}${Math.abs(def.pm)} PM${def.maxQty > 1 ? " cada" : ""}`;
        let extra = "";
        if (def.key === "elemental") {
            const els = GOLPE_ELEMENTS.map((el) =>
                `<label>${el} <input type="number" class="gp-el-qty" data-el="${el}" min="0" max="6" value="${prevElQty(el)}"></label>`).join(" ");
            extra = `<div class="gp-extra">${els}</div>`;
        } else if (def.key === "letal") {
            const q = Math.max(1, Number(prevPick("letal")?.qty) || 1);
            extra = `<div class="gp-extra"><label>Escolhas: <select data-letal-qty>
                <option value="1" ${q < 2 ? "selected" : ""}>1× (+2 margem, 2 PM)</option>
                <option value="2" ${q >= 2 ? "selected" : ""}>2× (+5 margem, 4 PM)</option>
            </select></label></div>`;
        } else if (def.key === "conjurador") {
            const sel = prevPick("conjurador")?.spellId ?? "";
            const opts = spells.length
                ? spells.map((s) => `<option value="${esc(s.id)}" data-custo="${s.custo}" ${s.id === sel ? "selected" : ""}>${esc(s.name)} (${s.custo} PM)</option>`).join("")
                : `<option value="">— sem magias de 1º/2º círculo na ficha —</option>`;
            extra = `<div class="gp-extra"><label>Magia: <select data-conj-spell>${opts}</select></label></div>`;
        }
        return `<div class="gp-effect" data-key="${def.key}">
            <input type="checkbox" data-effect="${def.key}" ${picked && def.key !== "elemental" ? "checked" : ""} ${def.key === "elemental" ? "style=\"display:none\"" : ""}>
            <div class="gp-main">
                <span class="gp-label">${esc(def.label)}</span><span class="gp-pm">(${pmTxt})</span>
                <div class="gp-desc">${esc(def.desc)}</div>
                ${extra}
            </div>
        </div>`;
    }).join("");

    const dl = weapons.map((w) => `<option value="${esc(w)}">`).join("");
    return `<div class="t20-golpe-build">
        <div class="gp-weapon">
            <label><b>Arma do golpe:</b></label>
            <input type="text" name="gp-weapon" list="gp-weapon-list" placeholder="ex.: Espada longa" value="${esc(prev?.weaponName ?? "")}">
            <datalist id="gp-weapon-list">${dl}</datalist>
        </div>
        <p class="gp-desc" style="margin:2px 0 6px 0;">Escolha os efeitos do seu Golpe Pessoal. O custo é a soma dos efeitos (mínimo 1 PM). Os efeitos ficam travados até você subir de nível.</p>
        ${rows}
        <div class="gp-total"><span class="gp-total-txt">Custo total: 1 PM</span><span class="gp-warn"></span></div>
    </div>`;
}

/** Lê o build do DOM do dialog. */
function readBuildFromForm(root: HTMLElement, level: number): GolpeBuild {
    const effects: GolpeEffectPick[] = [];
    root.querySelectorAll<HTMLInputElement>("input[data-effect]").forEach((cb) => {
        const key = cb.dataset.effect as GolpeEffectPick["key"];
        if (key === "elemental") return; // tratado pelos inputs por elemento
        if (!cb.checked) return;
        const pick: GolpeEffectPick = { key };
        if (key === "letal") {
            const q = Number(root.querySelector<HTMLSelectElement>("select[data-letal-qty]")?.value) || 1;
            pick.qty = q;
        }
        if (key === "conjurador") {
            const sel = root.querySelector<HTMLSelectElement>("select[data-conj-spell]");
            const opt = sel?.selectedOptions?.[0];
            if (opt?.value) {
                pick.spellId = opt.value;
                pick.spellName = opt.textContent?.replace(/\s*\(\d+\s*PM\)\s*$/, "").trim() ?? "";
                pick.spellCost = Number(opt.dataset.custo) || 0;
            }
        }
        effects.push(pick);
    });
    root.querySelectorAll<HTMLInputElement>("input.gp-el-qty").forEach((inp) => {
        const q = Math.max(0, Math.min(6, Number(inp.value) || 0));
        if (q > 0) effects.push({ key: "elemental", qty: q, element: inp.dataset.el as GolpeElement });
    });
    const weaponName = root.querySelector<HTMLInputElement>('input[name="gp-weapon"]')?.value?.trim() ?? "";
    return { weaponName, effects, builtAtLevel: level };
}

function wireLiveTotal(root: HTMLElement, level: number): void {
    const refresh = (): void => {
        const build = readBuildFromForm(root, level);
        const cost = computeGolpeCost(build);
        const txt = root.querySelector(".gp-total-txt");
        if (txt) txt.textContent = `Custo total: ${cost} PM`;
        const warnEl = root.querySelector(".gp-warn");
        if (warnEl) {
            warnEl.textContent = level > 0 && cost > level
                ? `⚠ Custo acima do seu limite de PM por rodada (${level}) — o golpe não poderá ser usado.` : "";
        }
    };
    root.querySelectorAll("input, select").forEach((el) => {
        el.addEventListener("change", refresh);
        el.addEventListener("input", refresh);
    });
    refresh();
}

/** Bloco de resumo espelhado na descrição do item (idempotente). */
function summaryBlock(build: GolpeBuild): string {
    return `<div class="t20-golpe-build-summary" style="border-left:3px solid #c8a96e;padding:4px 8px;margin-top:6px;">`
        + `<strong>Golpe construído (nível ${build.builtAtLevel}):</strong> `
        + `${esc(build.weaponName ? `Arma: ${build.weaponName}. ` : "Qualquer arma. ")}`
        + `${esc(buildSummary(build))}</div>`;
}

async function persistBuild(item: ItemForBuild, build: GolpeBuild): Promise<void> {
    await item.setFlag?.(MODULE_ID, GOLPE_FLAG, build);
    try {
        const cur = item.system?.description?.value ?? "";
        const stripped = cur.replace(/<div class="t20-golpe-build-summary"[\s\S]*?<\/div>/g, "").trim();
        await item.update?.({ "system.description.value": `${stripped}${summaryBlock(build)}` });
    } catch (e) { warn("golpe-pessoal: falha ao espelhar resumo na descrição:", e); }
}

/**
 * Abre o dialog de construção. `reason` só muda o texto do cabeçalho.
 * Resolve true se salvou.
 */
export async function openGolpeBuildDialog(
    actor: ActorForBuild,
    item: ItemForBuild,
    reason: "novo" | "levelup" | "gm" = "novo",
): Promise<boolean> {
    ensureStyles();
    const level = actorLevel(actor);
    const prev = (item.getFlag?.(MODULE_ID, GOLPE_FLAG) ?? null) as GolpeBuild | null;
    const header = reason === "levelup"
        ? `<p><b>${esc(actor.name ?? "")}</b> subiu de nível — você pode reconstruir o Golpe Pessoal.</p>`
        : reason === "gm" ? `<p>Edição do Golpe Pessoal (GM).</p>` : "";

    return new Promise<boolean>((resolve) => {
        const dlg = new Dialog({
            title: `Golpe Pessoal — ${item.name ?? "construção"}`,
            content: header + renderContent(actor, prev),
            buttons: {
                ok: {
                    icon: '<i class="fas fa-hammer"></i>',
                    label: "Salvar golpe",
                    callback: async (html: JQuery | HTMLElement) => {
                        const root = ((html as JQuery)[0] ?? html) as HTMLElement;
                        const build = readBuildFromForm(root, level);
                        const errors = validateBuild(build);
                        if (errors.length) {
                            ui.notifications?.warn(`Golpe Pessoal: ${errors[0]}`);
                            // reabre preservando o que dava — simples: reabrir do zero com prev
                            const again = await openGolpeBuildDialog(actor, item, reason);
                            resolve(again);
                            return;
                        }
                        await persistBuild(item, build);
                        ui.notifications?.info(`Golpe Pessoal salvo: ${buildSummary(build)}`);
                        resolve(true);
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Agora não", callback: () => resolve(false) },
            },
            default: "ok",
            render: (html: JQuery | HTMLElement) => {
                const root = ((html as JQuery)[0] ?? html) as HTMLElement;
                wireLiveTotal(root.closest(".window-content") as HTMLElement ?? root, level);
            },
            close: () => resolve(false),
        }, { classes: ["dialog", "t20-dialog"], width: 560 });
        dlg.render(true);
    });
}

/** O item é o poder Golpe Pessoal? (detecção por nome, funciona p/ cópias) */
export function isGolpePessoalPower(item: { type?: string; name?: string } | null | undefined): boolean {
    return !!item && item.type === "poder" && norm(item.name).includes("golpe pessoal");
}
