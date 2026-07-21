/**
 * Encontros Aleatórios — ferramenta de GM (Apêndice D, Ameaças de Arton).
 *
 * Botão GM-only na toolbar. O modal tem:
 *  - Terreno (18 tabelas) e Patamar (Iniciante/Veterano/Campeão/Lenda).
 *  - Gatilho: rola 1d20 + modificador acumulado. Em 20+ ocorre um encontro e o
 *    modificador zera; caso contrário, o modificador cresce +1 (persistido em
 *    setting world → sobrevive a reiniciar o Foundry). Botão de resetar o
 *    contador manualmente.
 *  - Ao ocorrer o encontro, rola 1d100 + modificador do patamar e resolve na
 *    tabela do terreno. No patamar Lenda, um 100 natural no d100 dispara o
 *    Rhandomm (1d4; no 1, substitui o encontro).
 *  - Botão "Consultar tabela" abre a tabela completa do terreno (como no modal
 *    de tesouro).
 */

import {
    TERRAINS, PATAMARES, getTerrain, getPatamar, findEncounterRow,
    validateTerrains, RHANDOMM_TEXT, type TerrainDef, type PatamarDef,
} from "./encounter-data";
import ENCOUNTER_STYLES from "./encounter-roller.css?inline";
import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";

const BTN_ID    = "t20-encounter-btn";
const STYLES_ID = "t20-encounter-styles";
/** Setting world (config:false) que guarda o modificador acumulado do gatilho. */
const SETTING_TRIGGER_MOD = "encounterTriggerMod";

// ── CSS ───────────────────────────────────────────────────────────────────────

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = ENCOUNTER_STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Setting do gatilho (persistente) ───────────────────────────────────────────

function getTriggerMod(): number {
    try {
        const v = Number(game.settings.get(MODULE_ID, SETTING_TRIGGER_MOD));
        return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    } catch { return 0; }
}

async function setTriggerMod(v: number): Promise<void> {
    try { await game.settings.set(MODULE_ID, SETTING_TRIGGER_MOD, Math.max(0, Math.floor(v))); }
    catch (err) { warn("encounter-roller: falha ao salvar modificador do gatilho:", err); }
}

// ── Rolagem pura do encontro (dado o patamar) ──────────────────────────────────

export interface EncounterOutcome {
    terrainLabel: string;
    patamarLabel: string;
    d100: number;       // natural (1-100)
    patamarMod: number;
    total: number;      // d100 + patamarMod
    rangeLabel: string;
    encounter: string;
    rhandomm: boolean;  // true se substituído pelo Rhandomm (Lenda + 100 nat + 1d4=1)
    rhandommRoll?: number;
}

/**
 * Resolve o encontro. `d100` e `d4` são injetáveis para teste; se ausentes,
 * usa Foundry Rolls. Rhandomm só no patamar Lenda.
 */
export async function resolveEncounter(
    terrain: TerrainDef,
    patamar: PatamarDef,
    d100?: number,
    d4?: number,
): Promise<EncounterOutcome | null> {
    const nat = d100 ?? (await rollDie(100));
    const total = nat + patamar.mod;
    const row = findEncounterRow(terrain, total);
    if (!row) return null;
    let encounter = row.encounter;
    let rhandomm = false;
    let rhandommRoll: number | undefined;
    if (patamar.id === "lenda" && nat === 100) {
        rhandommRoll = d4 ?? (await rollDie(4));
        if (rhandommRoll === 1) { encounter = RHANDOMM_TEXT; rhandomm = true; }
    }
    return {
        terrainLabel: terrain.label,
        patamarLabel: patamar.label,
        d100: nat,
        patamarMod: patamar.mod,
        total,
        rangeLabel: row.label,
        encounter,
        rhandomm,
        rhandommRoll,
    };
}

async function rollDie(faces: number): Promise<number> {
    const RollCtor = Roll as unknown as new (f: string) => Roll;
    const roll = new RollCtor(`1d${faces}`);
    await (roll as unknown as { evaluate: (o?: object) => Promise<unknown> }).evaluate();
    return roll.total ?? 1;
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function findSceneControlsMenu(): Element | null {
    return (
        document.querySelector("menu#scene-controls-layers") ??
        document.querySelector("aside#scene-controls menu") ??
        document.querySelector("#ui-left menu")
    );
}
function removeBtn(): void { document.getElementById(BTN_ID)?.parentElement?.remove(); }

function injectBtn(): void {
    if (!game.user?.isGM) { removeBtn(); return; }
    if (document.getElementById(BTN_ID)) return;
    const menu = findSceneControlsMenu();
    if (!menu) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "control ui-control layer icon fa-solid fa-dragon";
    btn.style.color = "#d98a4a";
    btn.setAttribute("data-tooltip", "Encontros Aleatórios");
    btn.setAttribute("aria-label", "Encontros Aleatórios");
    const li = document.createElement("li");
    li.appendChild(btn);
    menu.appendChild(li);
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openEncounterDialog(); });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function buildModalContent(): string {
    const terrainOpts = TERRAINS.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("");
    const patamarOpts = PATAMARES.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
    const mod = getTriggerMod();
    return `
        <div class="enc-modal">
            <div class="enc-grid2">
                <div class="enc-row">
                    <label class="enc-label">Terreno / Região</label>
                    <select name="enc-terrain" class="enc-select">${terrainOpts}</select>
                </div>
                <div class="enc-row">
                    <label class="enc-label">Patamar do grupo</label>
                    <select name="enc-patamar" class="enc-select">${patamarOpts}</select>
                </div>
            </div>
            <div class="enc-trigger-bar">
                <span class="enc-trigger-info">Gatilho: 1d20 + <b data-role="enc-mod">${mod}</b> (acumulado)</span>
                <button type="button" class="enc-reset-btn" title="Zerar o modificador acumulado">
                    <i class="fas fa-rotate-left"></i> Resetar contador
                </button>
            </div>
            <div class="enc-btn-row">
                <button type="button" class="enc-roll-btn" data-role="enc-trigger">
                    <i class="fas fa-dice-d20"></i> Rolar Gatilho
                </button>
                <button type="button" class="enc-roll-btn enc-secondary" data-role="enc-force">
                    <i class="fas fa-bolt"></i> Forçar encontro
                </button>
            </div>
            <button type="button" class="enc-consult-btn"><i class="fas fa-book-open"></i> Consultar tabela do terreno</button>
            <div class="enc-result" data-empty="true"></div>
        </div>
    `;
}

function renderNoEncounter(d20: number, prevMod: number, newMod: number): string {
    const total = d20 + prevMod;
    return `
        <div class="enc-res-card enc-res-miss">
            <div class="enc-res-top">
                <span class="enc-res-d100">1d20: ${d20} + ${prevMod} = ${total}</span>
                <span class="enc-res-meta">&lt; 20 · sem encontro</span>
            </div>
            <div class="enc-res-encounter">Nenhum encontro. Modificador do gatilho agora <b>+${newMod}</b>.</div>
        </div>`;
}

function renderEncounter(out: EncounterOutcome, trigger?: { d20: number; prevMod: number }): string {
    const trg = trigger
        ? `<span class="enc-res-d100">1d20: ${trigger.d20} + ${trigger.prevMod} = ${trigger.d20 + trigger.prevMod} ≥ 20 ✓</span>`
        : `<span class="enc-res-d100">Encontro forçado</span>`;
    const rh = out.rhandomm
        ? `<div class="enc-res-flavor">100 natural + 1d4=${out.rhandommRoll} → <b style="color:#c084fc;">Rhandomm!</b></div>`
        : "";
    return `
        <div class="enc-res-card${out.rhandomm ? " enc-res-rhandomm" : ""}">
            <div class="enc-res-top">
                ${trg}
                <span class="enc-res-meta">${esc(out.terrainLabel)} · ${esc(out.patamarLabel)}</span>
            </div>
            <div class="enc-res-title">d100: ${out.d100} + ${out.patamarMod} = ${out.total} · faixa ${esc(out.rangeLabel)}</div>
            ${rh}
            <div class="enc-res-encounter">${esc(out.encounter)}</div>
        </div>`;
}

/** Sussurro secreto ao próprio GM. */
async function postSecretWhisper(flavor: string): Promise<void> {
    try {
        const uid = game.user?.id;
        await ChatMessage.create({
            flavor,
            speaker: { alias: "Encontros Aleatórios (GM)" },
            whisper: uid ? [uid] : [],
            blind: true,
        } as unknown as Record<string, unknown>);
    } catch (err) {
        warn("encounter-roller: falha ao registrar sussurro (resultado já no modal):", err);
    }
}

function openEncounterDialog(): void {
    ensureStyles();
    const dlg = new Dialog({
        title: "Encontros Aleatórios",
        content: buildModalContent(),
        buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
        default: "close",
        render: ($html: JQuery) => {
            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            const terrSel = root.querySelector<HTMLSelectElement>('select[name="enc-terrain"]');
            const patSel  = root.querySelector<HTMLSelectElement>('select[name="enc-patamar"]');
            const modEl   = root.querySelector<HTMLElement>('[data-role="enc-mod"]');
            const resultBox = root.querySelector<HTMLElement>(".enc-result");
            const triggerBtn = root.querySelector<HTMLButtonElement>('[data-role="enc-trigger"]');
            const forceBtn   = root.querySelector<HTMLButtonElement>('[data-role="enc-force"]');
            const resetBtn   = root.querySelector<HTMLButtonElement>(".enc-reset-btn");
            const consultBtn = root.querySelector<HTMLButtonElement>(".enc-consult-btn");
            if (!terrSel || !patSel || !modEl || !resultBox || !triggerBtn || !forceBtn || !resetBtn || !consultBtn) return;

            const refreshMod = (): void => { modEl.textContent = String(getTriggerMod()); };
            const show = (html: string): void => { resultBox.dataset["empty"] = "false"; resultBox.innerHTML = html; };
            const selected = (): { terrain: TerrainDef; patamar: PatamarDef } | null => {
                const terrain = getTerrain(terrSel.value); const patamar = getPatamar(patSel.value);
                return terrain && patamar ? { terrain, patamar } : null;
            };

            // Gatilho: 1d20 + mod. ≥20 → encontro + reset; senão mod+1.
            triggerBtn.addEventListener("click", () => void (async () => {
                const sel = selected(); if (!sel) return;
                const prevMod = getTriggerMod();
                const d20 = await rollDie(20);
                if (d20 + prevMod >= 20) {
                    await setTriggerMod(0); refreshMod();
                    const out = await resolveEncounter(sel.terrain, sel.patamar);
                    if (!out) { show(`<div class="enc-res-card enc-res-error">Falha ao resolver o encontro.</div>`); return; }
                    show(renderEncounter(out, { d20, prevMod }));
                    void postSecretWhisper(`Encontro! ${out.terrainLabel} (${out.patamarLabel}) · d100 ${out.d100}+${out.patamarMod}=${out.total} · ${out.rangeLabel}: ${out.encounter}`);
                    log(`Encontro: ${out.terrainLabel} ${out.patamarLabel} d100=${out.d100}+${out.patamarMod} → ${out.rangeLabel}: ${out.encounter}`);
                } else {
                    const newMod = prevMod + 1;
                    await setTriggerMod(newMod); refreshMod();
                    show(renderNoEncounter(d20, prevMod, newMod));
                }
            })());

            // Forçar encontro: rola direto o d100 (não mexe no contador).
            forceBtn.addEventListener("click", () => void (async () => {
                const sel = selected(); if (!sel) return;
                const out = await resolveEncounter(sel.terrain, sel.patamar);
                if (!out) { show(`<div class="enc-res-card enc-res-error">Falha ao resolver o encontro.</div>`); return; }
                show(renderEncounter(out));
                void postSecretWhisper(`Encontro forçado — ${out.terrainLabel} (${out.patamarLabel}) · d100 ${out.d100}+${out.patamarMod}=${out.total} · ${out.rangeLabel}: ${out.encounter}`);
            })());

            resetBtn.addEventListener("click", () => void (async () => {
                await setTriggerMod(0); refreshMod();
                show(`<div class="enc-res-card"><div class="enc-res-encounter">Contador do gatilho zerado (+0).</div></div>`);
            })());

            consultBtn.addEventListener("click", () => openConsultDialog(terrSel.value, patSel.value));
        },
    }, { classes: ["t20-dialog", "t20-encounter-dialog"], width: 480 });
    dlg.render(true);
}

// ── Consulta de tabela ──────────────────────────────────────────────────────────

function renderConsultTable(terrainId: string, patamarId: string): string {
    const terrain = getTerrain(terrainId);
    if (!terrain) return "";
    const patamar = getPatamar(patamarId);
    const mod = patamar?.mod ?? 0;
    // d100 que cai nesta faixa considerando o patamar: [min-mod, max-mod] ∩ [1,100].
    const d100Hint = (min: number, max: number | null): string => {
        const lo = Math.max(1, min - mod);
        const hi = max === null ? 100 : Math.min(100, max - mod);
        if (hi < 1 || lo > 100) return "—";
        return lo === hi ? `${lo}` : `${lo}-${hi}`;
    };
    const rows = terrain.rows.map(r =>
        `<tr><td class="enc-nd-cell">${esc(r.label)}</td><td class="enc-d100-cell">${d100Hint(r.min, r.max)}</td><td>${esc(r.encounter)}</td></tr>`
    ).join("");
    return `<table class="enc-table">
        <thead><tr><th>Faixa (d%+pat.)</th><th>d100 (${esc(patamar?.label ?? "")})</th><th>Encontro</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
}

function openConsultDialog(terrainId: string, patamarId: string): void {
    ensureStyles();
    const terrainOpts = TERRAINS.map(t => `<option value="${esc(t.id)}"${t.id === terrainId ? " selected" : ""}>${esc(t.label)}</option>`).join("");
    const patamarOpts = PATAMARES.map(p => `<option value="${esc(p.id)}"${p.id === patamarId ? " selected" : ""}>${esc(p.label)}</option>`).join("");
    const content = `
        <div class="enc-consult">
            <div class="enc-grid2">
                <div class="enc-row"><label class="enc-label">Terreno</label><select name="enc-c-terrain" class="enc-select">${terrainOpts}</select></div>
                <div class="enc-row"><label class="enc-label">Patamar (coluna d100)</label><select name="enc-c-patamar" class="enc-select">${patamarOpts}</select></div>
            </div>
            <div class="enc-consult-body"></div>
        </div>`;
    const dlg = new Dialog({
        title: "Consultar Tabela de Encontros",
        content,
        buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
        default: "close",
        render: ($html: JQuery) => {
            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            const tSel = root.querySelector<HTMLSelectElement>('select[name="enc-c-terrain"]');
            const pSel = root.querySelector<HTMLSelectElement>('select[name="enc-c-patamar"]');
            const body = root.querySelector<HTMLElement>(".enc-consult-body");
            if (!tSel || !pSel || !body) return;
            const refresh = (): void => { body.innerHTML = renderConsultTable(tSel.value, pSel.value); };
            tSel.addEventListener("change", refresh);
            pSel.addEventListener("change", refresh);
            refresh();
        },
    }, { classes: ["t20-dialog", "t20-encounter-dialog", "t20-encounter-consult"], width: 720 });
    dlg.render(true);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupEncounterRoller(): void {
    try {
        game.settings.register(MODULE_ID, SETTING_TRIGGER_MOD, {
            scope: "world",
            config: false,
            type: Number,
            default: 0,
        });
    } catch (err) {
        warn("encounter-roller: falha ao registrar setting do gatilho:", err);
    }

    Hooks.once("ready", () => {
        ensureStyles();
        injectBtn();
        const problems = validateTerrains();
        if (problems.length) {
            warn(`encounter-roller: tabela de terrenos com ${problems.length} problema(s):\n` + problems.join("\n"));
        }
    });
    Hooks.on("renderSceneControls", () => { ensureStyles(); injectBtn(); });
    Hooks.on("canvasReady", () => injectBtn());
}
