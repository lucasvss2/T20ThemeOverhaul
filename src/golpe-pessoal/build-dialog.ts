/**
 * Golpe Pessoal — dialog de CONSTRUÇÃO do golpe.
 *
 * Aberto: (a) ao adicionar o poder na ficha (createItem), (b) no prompt de
 * level-up, (c) pelo botão do GM na ficha do item. Grava o build em
 * `flags.<MODULE_ID>.golpePessoal` do ITEM do poder e espelha um resumo na
 * descrição (bloco marcado, idempotente).
 *
 * UI (v1.85.1): efeitos em DUAS COLUNAS; dropdowns largos; a magia do
 * Conjurador vem de TODOS os compêndios de Item (sistema + Ameaças +
 * Suplementos de Arton) com busca; a arma usa um search sobre a base
 * empacotada do Armamento Aberrante (+ armas da ficha) — escolher "Maça de
 * guerra" casa com "Maça de guerra (Aberrante)" no uso (match por inclusão).
 */

import { MODULE_ID } from "@/constants";
import { warn } from "@/utils/logging";
import { norm } from "@/inspiracao/format";
import { ABERRANT_WEAPONS } from "@/armamento-aberrante/weapons";
import {
    GOLPE_EFFECTS, GOLPE_ELEMENTS, computeGolpeCost, validateBuild, buildSummary,
    type GolpeBuild, type GolpeEffectPick, type GolpeElement,
} from "./effects";

export const GOLPE_FLAG = "golpePessoal";
const STYLES_ID = "t20-golpe-build-styles";

const CSS = `
.window-app.t20-dialog:has(.t20-golpe-build), .application.t20-dialog:has(.t20-golpe-build) { width: 820px !important; max-width: 96vw !important; }
.t20-golpe-build { max-height: 72vh; overflow-y: auto; padding-right: 4px; }
.t20-golpe-build .gp-top { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; margin-bottom: 8px; }
.t20-golpe-build .gp-box { border:1px solid rgba(200,169,110,.35); border-radius:4px; padding:6px 8px; }
.t20-golpe-build .gp-box > label { font-weight:bold; color:#c8a96e; display:block; margin-bottom:4px; }
.t20-golpe-build .gp-box input[type=text] { width:100%; box-sizing:border-box; height:26px; }
.t20-golpe-build .gp-weapon-list { max-height:110px; overflow-y:auto; margin-top:4px; border:1px solid rgba(200,169,110,.2); border-radius:3px; }
.t20-golpe-build .gp-weapon-list .gp-w-opt { padding:2px 6px; cursor:pointer; font-size:12px; }
.t20-golpe-build .gp-weapon-list .gp-w-opt:hover { background:rgba(200,169,110,.15); }
.t20-golpe-build .gp-weapon-list .gp-w-opt.selected { background:rgba(200,169,110,.28); color:#f0ebe0; }
.t20-golpe-build .gp-w-src { color:#9a8e7a; font-size:10px; margin-left:4px; }
.t20-golpe-build .gp-effects-grid { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 0 14px; }
.t20-golpe-build .gp-effect { display:flex; gap:6px; align-items:flex-start; padding:5px 6px; border-bottom:1px solid rgba(200,169,110,.15); }
.t20-golpe-build .gp-effect:hover { background: rgba(200,169,110,.06); }
.t20-golpe-build .gp-effect input[type=checkbox] { margin-top:3px; flex:0 0 auto; }
.t20-golpe-build .gp-effect.gp-wide { grid-column: 1 / -1; }
.t20-golpe-build .gp-main { flex:1; min-width:0; overflow:hidden; }
.t20-golpe-build .gp-label { font-weight:bold; color:#c8a96e; }
.t20-golpe-build .gp-pm { color:#9a8e7a; font-size:11px; margin-left:4px; }
.t20-golpe-build .gp-desc { font-size:11px; color:#9a8e7a; }
.t20-golpe-build .gp-extra { margin-top:4px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:12px; }
.t20-golpe-build .gp-extra label { display:flex; align-items:center; gap:4px; }
.t20-golpe-build .gp-extra select { min-width:230px; max-width:100%; height:26px; font-size:12px; }
.t20-golpe-build .gp-extra select[data-letal-qty] { min-width:200px; }
.t20-golpe-build .gp-el-qty { width:48px !important; height:24px; }
.t20-golpe-build .gp-spell-search { flex:1 1 100%; height:26px; box-sizing:border-box; min-width:0; }
.t20-golpe-build .gp-spell-select { flex:1 1 100%; width:100%; max-width:100%; min-width:0 !important; box-sizing:border-box; }
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

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Fontes: magias (ficha + TODOS os compêndios de Item) ─────────────────────

export interface SpellChoice {
    name: string;
    custo: number;
    circulo: number;
    /** id do item na FICHA (preferido no cast). */
    itemId?: string;
    /** uuid do doc de compêndio (importado no cast se não estiver na ficha). */
    uuid?: string;
    source: string;
}

async function collectSpellChoices(actor: ActorForBuild): Promise<SpellChoice[]> {
    const out: SpellChoice[] = [];
    const seen = new Set<string>();
    // 1) Magias da ficha (têm prioridade)
    for (const i of actor.items?.contents ?? []) {
        if (i.type !== "magia" || !i.name) continue;
        const circ = Number(i.system?.circulo) || 0;
        if (circ > 2) continue;
        const key = norm(i.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: i.name, custo: Math.max(0, Number(i.system?.ativacao?.custo) || 0), circulo: circ, itemId: i.id, source: "Ficha" });
    }
    // 2) Compêndios de Item (sistema + módulos: Ameaças, Suplementos de Arton, ...)
    try {
        const packs = (game as unknown as { packs?: { contents: Array<{
            collection: string; title?: string;
            metadata?: { type?: string; label?: string };
            getIndex: (o?: { fields?: string[] }) => Promise<Iterable<Record<string, unknown>>>;
        }> } }).packs?.contents ?? [];
        for (const pack of packs) {
            if ((pack.metadata?.type ?? "") !== "Item") continue;
            let idx: Iterable<Record<string, unknown>>;
            try {
                idx = await pack.getIndex({ fields: ["type", "system.circulo", "system.ativacao.custo"] });
            } catch { continue; }
            const label = pack.metadata?.label ?? pack.title ?? pack.collection;
            for (const e of idx) {
                if ((e["type"] as string) !== "magia") continue;
                const sys = e["system"] as { circulo?: number; ativacao?: { custo?: number } } | undefined;
                const circ = Number(sys?.circulo) || 0;
                if (circ < 1 || circ > 2) continue;
                const name = String(e["name"] ?? "");
                if (!name) continue;
                const key = norm(name);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({
                    name,
                    custo: Math.max(0, Number(sys?.ativacao?.custo) || 0),
                    circulo: circ,
                    uuid: String(e["uuid"] ?? `Compendium.${pack.collection}.Item.${e["_id"]}`),
                    source: label,
                });
            }
        }
    } catch (e) { warn("golpe-pessoal: coleta de magias dos compêndios falhou:", e); }
    out.sort((a, b) => (a.source === "Ficha" ? -1 : b.source === "Ficha" ? 1 : 0)
        || a.circulo - b.circulo || a.name.localeCompare(b.name));
    return out;
}

// ── Fontes: armas (base do Armamento Aberrante + armas da ficha) ─────────────

interface WeaponChoice { name: string; source: string }

function collectWeaponChoices(actor: ActorForBuild): WeaponChoice[] {
    const out: WeaponChoice[] = [];
    const seen = new Set<string>();
    for (const i of actor.items?.contents ?? []) {
        if (i.type !== "arma" || !i.name) continue;
        const key = norm(i.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: i.name, source: "na ficha" });
    }
    for (const w of ABERRANT_WEAPONS) {
        const key = norm(w.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: w.name, source: "" });
    }
    return out;
}

// ── Render ────────────────────────────────────────────────────────────────────

function spellOptionsHtml(spells: SpellChoice[], selectedName: string, filter: string): string {
    const f = norm(filter);
    const list = spells.filter((s) => !f || norm(s.name).includes(f));
    if (!list.length) return `<option value="">— nenhuma magia encontrada —</option>`;
    return list.map((s) => {
        const sel = norm(s.name) === norm(selectedName) ? "selected" : "";
        return `<option value="${esc(s.name)}" data-custo="${s.custo}" data-item-id="${esc(s.itemId ?? "")}" data-uuid="${esc(s.uuid ?? "")}" ${sel}>`
            + `${esc(s.name)} — ${s.circulo}º círc., ${s.custo} PM (${esc(s.source)})</option>`;
    }).join("");
}

function weaponListHtml(weapons: WeaponChoice[], filter: string, current: string): string {
    const f = norm(filter);
    const list = weapons.filter((w) => !f || norm(w.name).includes(f)).slice(0, 40);
    if (!list.length) return `<div class="gp-w-opt" style="cursor:default;color:#9a8e7a;">— nenhuma arma encontrada —</div>`;
    return list.map((w) => `<div class="gp-w-opt${norm(w.name) === norm(current) ? " selected" : ""}" data-name="${esc(w.name)}">`
        + `${esc(w.name)}${w.source ? `<span class="gp-w-src">(${esc(w.source)})</span>` : ""}</div>`).join("");
}

function renderContent(prev: GolpeBuild | null, spells: SpellChoice[], weapons: WeaponChoice[]): string {
    const prevPick = (key: string): GolpeEffectPick | undefined => prev?.effects?.find((p) => p.key === key);
    const prevElQty = (el: GolpeElement): number =>
        (prev?.effects ?? []).filter((p) => p.key === "elemental" && p.element === el)
            .reduce((a, p) => a + Math.max(1, Number(p.qty) || 1), 0);

    const rows = GOLPE_EFFECTS.map((def) => {
        const picked = !!prevPick(def.key);
        const pmTxt = def.key === "conjurador" ? "custo da magia +1 PM"
            : `${def.pm >= 0 ? "+" : "−"}${Math.abs(def.pm)} PM${def.maxQty > 1 ? " cada" : ""}`;
        let extra = "";
        let wide = false;
        if (def.key === "elemental") {
            wide = true;
            const els = GOLPE_ELEMENTS.map((el) =>
                `<label>${el} <input type="number" class="gp-el-qty" data-el="${el}" min="0" max="6" value="${prevElQty(el)}"></label>`).join(" ");
            extra = `<div class="gp-extra">${els}</div>`;
        } else if (def.key === "letal") {
            const q = Math.max(1, Number(prevPick("letal")?.qty) || 1);
            extra = `<div class="gp-extra"><label>Escolhas: <select data-letal-qty>
                <option value="1" ${q < 2 ? "selected" : ""}>1× (+2 na margem, 2 PM)</option>
                <option value="2" ${q >= 2 ? "selected" : ""}>2× (+5 na margem, 4 PM)</option>
            </select></label></div>`;
        } else if (def.key === "conjurador") {
            wide = true;
            const selName = prevPick("conjurador")?.spellName ?? "";
            extra = `<div class="gp-extra">
                <input type="text" class="gp-spell-search" placeholder="Buscar magia (1º/2º círculo — ficha, sistema, Ameaças, Suplementos de Arton)...">
                <select data-conj-spell class="gp-spell-select">${spellOptionsHtml(spells, selName, "")}</select>
            </div>`;
        }
        return `<div class="gp-effect${wide ? " gp-wide" : ""}" data-key="${def.key}">
            <input type="checkbox" data-effect="${def.key}" ${picked && def.key !== "elemental" ? "checked" : ""} ${def.key === "elemental" ? "style=\"display:none\"" : ""}>
            <div class="gp-main">
                <span class="gp-label">${esc(def.label)}</span><span class="gp-pm">(${pmTxt})</span>
                <div class="gp-desc">${esc(def.desc)}</div>
                ${extra}
            </div>
        </div>`;
    }).join("");

    return `<div class="t20-golpe-build">
        <div class="gp-top">
            <div class="gp-box">
                <label>Arma do golpe</label>
                <input type="text" name="gp-weapon" placeholder="Buscar arma..." value="${esc(prev?.weaponName ?? "")}" autocomplete="off">
                <div class="gp-weapon-list">${weaponListHtml(weapons, prev?.weaponName ?? "", prev?.weaponName ?? "")}</div>
            </div>
            <div class="gp-box">
                <label>Como funciona</label>
                <div class="gp-desc">O custo é a soma dos efeitos (mínimo 1 PM). Os efeitos ficam travados até você subir de nível. Você não pode gastar mais PM em golpes pessoais numa rodada do que seu nível. Com "Qualquer Arma", a arma escolhida é ignorada. Armas do Armamento Aberrante contam (ex.: "Maça de guerra" casa com "Maça de guerra (Aberrante)").</div>
            </div>
        </div>
        <div class="gp-effects-grid">${rows}</div>
        <div class="gp-total"><span class="gp-total-txt">Custo total: 1 PM</span><span class="gp-warn"></span></div>
    </div>`;
}

// ── Leitura do form ───────────────────────────────────────────────────────────

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
                pick.spellName = opt.value;
                pick.spellId = opt.dataset.itemId || undefined;
                pick.spellUuid = opt.dataset.uuid || undefined;
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

function wireForm(root: HTMLElement, level: number, spells: SpellChoice[], weapons: WeaponChoice[]): void {
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

    // Busca de magia: refiltra as options preservando a seleção quando possível.
    const spellSearch = root.querySelector<HTMLInputElement>(".gp-spell-search");
    const spellSelect = root.querySelector<HTMLSelectElement>("select[data-conj-spell]");
    spellSearch?.addEventListener("input", () => {
        if (!spellSelect) return;
        const current = spellSelect.selectedOptions?.[0]?.value ?? "";
        spellSelect.innerHTML = spellOptionsHtml(spells, current, spellSearch.value);
        refresh();
    });
    // Selecionar magia marca o Conjurador automaticamente.
    spellSelect?.addEventListener("change", () => {
        const cb = root.querySelector<HTMLInputElement>('input[data-effect="conjurador"]');
        if (cb && !cb.checked) { cb.checked = true; refresh(); }
    });

    // Busca de arma: lista clicável.
    const wInput = root.querySelector<HTMLInputElement>('input[name="gp-weapon"]');
    const wList = root.querySelector<HTMLElement>(".gp-weapon-list");
    const renderWeapons = (): void => {
        if (!wList || !wInput) return;
        wList.innerHTML = weaponListHtml(weapons, wInput.value, wInput.value);
    };
    wInput?.addEventListener("input", renderWeapons);
    wList?.addEventListener("click", (ev) => {
        const opt = (ev.target as HTMLElement).closest<HTMLElement>(".gp-w-opt");
        const name = opt?.dataset?.name;
        if (!name || !wInput) return;
        wInput.value = name;
        renderWeapons();
        refresh();
    });

    refresh();
}

// ── Persistência ──────────────────────────────────────────────────────────────

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
    const spells = await collectSpellChoices(actor);
    const weapons = collectWeaponChoices(actor);
    const header = reason === "levelup"
        ? `<p><b>${esc(actor.name ?? "")}</b> subiu de nível — você pode reconstruir o Golpe Pessoal.</p>`
        : reason === "gm" ? `<p>Edição do Golpe Pessoal (GM).</p>` : "";

    return new Promise<boolean>((resolve) => {
        const dlg = new Dialog({
            title: `Golpe Pessoal — ${item.name ?? "construção"}`,
            content: header + renderContent(prev, spells, weapons),
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
                wireForm((root.closest(".window-content") as HTMLElement) ?? root, level, spells, weapons);
            },
            close: () => resolve(false),
        }, { classes: ["dialog", "t20-dialog"], width: 820 });
        dlg.render(true);
    });
}

/** O item é o poder Golpe Pessoal? (detecção por nome, funciona p/ cópias) */
export function isGolpePessoalPower(item: { type?: string; name?: string } | null | undefined): boolean {
    return !!item && item.type === "poder" && norm(item.name).includes("golpe pessoal");
}
