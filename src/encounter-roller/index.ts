/**
 * Encontro Aleatório — ferramenta de GM.
 *
 * Adiciona um botão GM-only na toolbar lateral esquerda. Ao clicar, abre um
 * modal onde o GM escolhe um AMBIENTE (esgoto, caverna, estrada, floresta,
 * becos, ruínas) e um NÍVEL (1-8) e pressiona "Rolar". A rolagem é um 1d100
 * SECRETO (só o GM vê) que, combinado com ambiente e nível, resolve o encontro
 * via `encounter-data` e exibe o resultado dentro do próprio modal.
 *
 * O botão é injetado no DOM (`menu#scene-controls-layers`) e re-injetado em
 * renderSceneControls / ready / canvasReady (o Foundry recria a toolbar).
 */

import { ENVIRONMENTS, getEnvironment, maxLevelFor, lookupEncounter, validateEnvironments, type EncounterResult } from "./encounter-data";
import ENCOUNTER_STYLES from "./encounter-roller.css?inline";
import { log, warn } from "@/utils/logging";

const BTN_ID      = "bg3-t20-encounter-btn";
const STYLES_ID   = "bg3-t20-encounter-styles";

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

// ── Toolbar button ────────────────────────────────────────────────────────────

function findSceneControlsMenu(): Element | null {
    return (
        document.querySelector("menu#scene-controls-layers") ??
        document.querySelector("aside#scene-controls menu") ??
        document.querySelector("#ui-left menu")
    );
}

function removeBtn(): void {
    document.getElementById(BTN_ID)?.parentElement?.remove();
}

function injectBtn(): void {
    if (!game.user?.isGM) {
        removeBtn();
        return;
    }
    if (document.getElementById(BTN_ID)) return;
    const menu = findSceneControlsMenu();
    if (!menu) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "control ui-control layer icon fa-solid fa-dragon";
    btn.style.color = "#d98a4a";
    btn.setAttribute("data-tooltip", "Rolar Encontro Aleatório");
    btn.setAttribute("aria-label", "Rolar Encontro Aleatório");
    const li = document.createElement("li");
    li.appendChild(btn);
    menu.appendChild(li);
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEncounterDialog();
    });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function buildModalContent(): string {
    const options = ENVIRONMENTS
        .map(env => `<option value="${esc(env.id)}">${esc(env.label)}</option>`)
        .join("");
    return `
        <div class="enc-modal">
            <div class="enc-row">
                <label class="enc-label">Ambiente</label>
                <select name="enc-env" class="enc-select">${options}</select>
            </div>
            <div class="enc-row">
                <label class="enc-label" data-role="enc-level-label">Nível do grupo (1-8)</label>
                <input type="number" name="enc-level" class="enc-input" min="1" max="8" value="1" />
            </div>
            <button type="button" class="enc-roll-btn"><i class="fas fa-dice-d20"></i> Rolar Encontro</button>
            <div class="enc-result" data-empty="true"></div>
        </div>
    `;
}

function renderResultHtml(res: EncounterResult): string {
    const flavor = res.flavor
        ? `<div class="enc-res-flavor">"${esc(res.flavor)}"</div>`
        : "";
    return `
        <div class="enc-res-card">
            <div class="enc-res-top">
                <span class="enc-res-d100">d100: ${res.roll}</span>
                <span class="enc-res-meta">${esc(res.envLabel)} · Nível ${res.level} · faixa ${esc(res.rangeLabel)}</span>
            </div>
            <div class="enc-res-title">${esc(res.title)}</div>
            ${flavor}
            <div class="enc-res-encounter">${esc(res.encounter)}</div>
        </div>
    `;
}

/** Rola 1d100 secretamente (sem chat público) e devolve o total. */
async function rollSecretD100(): Promise<{ total: number; roll: Roll }> {
    const RollCtor = Roll as unknown as new (f: string) => Roll;
    const roll = new RollCtor("1d100");
    await (roll as unknown as { evaluate: (o?: object) => Promise<unknown> }).evaluate();
    return { total: roll.total ?? 0, roll };
}

/** Posta um registro da rolagem sussurrado só para o próprio GM (secreto). */
async function postSecretWhisper(roll: Roll, res: EncounterResult): Promise<void> {
    try {
        const uid = game.user?.id;
        const flavor = `Encontro Aleatório — ${res.envLabel} (Nível ${res.level})`
            + ` · ${res.rangeLabel} ${res.title}: ${res.encounter}`;
        await ChatMessage.create({
            flavor,
            rolls: [roll.toJSON()],
            speaker: { alias: "Encontro Aleatório (GM)" },
            whisper: uid ? [uid] : [],
            blind: true,
        } as unknown as Record<string, unknown>);
    } catch (err) {
        warn(`encounter-roller: falha ao registrar sussurro (resultado já no modal):`, err);
    }
}

function openEncounterDialog(): void {
    ensureStyles();
    const dlg = new Dialog({
        title: "Encontro Aleatório",
        content: buildModalContent(),
        buttons: {
            close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" },
        },
        default: "close",
        render: ($html: JQuery) => {
            const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            const rollBtn = root.querySelector<HTMLButtonElement>(".enc-roll-btn");
            const envSel  = root.querySelector<HTMLSelectElement>('select[name="enc-env"]');
            const lvlInp  = root.querySelector<HTMLInputElement>('input[name="enc-level"]');
            const lvlLbl  = root.querySelector<HTMLElement>('[data-role="enc-level-label"]');
            const resultBox = root.querySelector<HTMLElement>(".enc-result");
            if (!rollBtn || !envSel || !lvlInp || !resultBox) return;

            // Nível máximo varia por ambiente (deserto vai até 10; demais, 8).
            const envMaxLevel = (): number => {
                const env = getEnvironment(envSel.value);
                return env ? maxLevelFor(env) : 8;
            };
            const syncLevelBounds = (): void => {
                const max = envMaxLevel();
                lvlInp.max = String(max);
                if (lvlLbl) lvlLbl.textContent = `Nível do grupo (1-${max})`;
                const cur = parseInt(lvlInp.value, 10) || 1;
                if (cur > max) lvlInp.value = String(max);
            };
            syncLevelBounds();
            envSel.addEventListener("change", syncLevelBounds);

            rollBtn.addEventListener("click", () => {
                void (async () => {
                    const envId = envSel.value;
                    const level = Math.max(1, Math.min(envMaxLevel(), parseInt(lvlInp.value, 10) || 1));
                    lvlInp.value = String(level);

                    const { total, roll } = await rollSecretD100();
                    const res = lookupEncounter(envId, level, total);
                    if (!res) {
                        resultBox.dataset["empty"] = "false";
                        resultBox.innerHTML = `<div class="enc-res-card enc-res-error">Falha ao resolver o encontro.</div>`;
                        return;
                    }
                    resultBox.dataset["empty"] = "false";
                    resultBox.innerHTML = renderResultHtml(res);
                    void postSecretWhisper(roll, res);
                    log(`Encontro Aleatório: ${res.envLabel} Nv${res.level} d100=${res.roll} → ${res.rangeLabel} ${res.title}: ${res.encounter}`);
                })();
            });
        },
    }, { classes: ["bg3-dialog", "bg3-encounter-dialog"], width: 460 });
    dlg.render(true);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupEncounterRoller(): void {
    Hooks.once("ready", () => {
        ensureStyles();
        injectBtn();
        // Aponta erros de formato caso a tabela de encontros tenha sido expandida.
        const problems = validateEnvironments();
        if (problems.length) {
            warn(`encounter-roller: tabela de encontros com ${problems.length} problema(s):\n` + problems.join("\n"));
        }
    });
    Hooks.on("renderSceneControls", () => { ensureStyles(); injectBtn(); });
    Hooks.on("canvasReady", () => injectBtn());
}
