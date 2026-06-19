import MENU_STYLES from "./skills-menu.css?inline";
import { warn } from "@/utils/logging";

/**
 * Skills Menu — botão único da toolbar que agrega ações de skills ativas.
 *
 * Cada sistema (Consagrar, Aura Sagrada, etc.) registra ações via
 * `registerSkillAction({ id, label, icon, isVisible, onClick })`. O menu:
 *  - Esconde o botão da toolbar se NENHUMA ação está visível.
 *  - Se exatamente 1 ação visível: clicar executa direto (sem dialog).
 *  - Se 2+ ações visíveis: clicar abre um picker (Dialog com .t20-dialog) e
 *    o usuário escolhe qual ação rodar.
 *
 * `isVisible()` é avaliada SOB DEMANDA — toda vez que o menu re-renderiza
 * (refresh()) ou que o botão é clicado. Garante que mudanças de estado
 * (área aplicada/removida, troca de cena, etc.) aparecem corretamente.
 *
 * Sistemas chamam `refreshSkillsMenu()` toda vez que o conjunto de ações
 * visíveis pode ter mudado (criação/remoção de template, cena recarregada,
 * GM ativo mudou, etc.).
 */


export interface SkillAction {
    /** ID único da ação (e.g. "consagrar-remove", "aura-sagrada-cancel"). */
    id: string;
    /** Label curto exibido no menu (e.g. "Remover Consagrar"). */
    label: string;
    /** Classe Font Awesome (e.g. "fa-solid fa-circle-xmark"). */
    icon: string;
    /** Cor opcional do ícone (e.g. "#ffb84d"). */
    color?: string;
    /**
     * Função síncrona: deve a ação estar visível AGORA pro usuário atual?
     * Costuma checar GM-ness + ownership de templates do próprio usuário.
     */
    isVisible(): boolean;
    /** Execução da ação (geralmente abre um Dialog de confirmação/picker). */
    onClick(): void | Promise<void>;
}

const _actions = new Map<string, SkillAction>();

export function registerSkillAction(action: SkillAction): void {
    _actions.set(action.id, action);
    refreshSkillsMenu();
}

export function unregisterSkillAction(id: string): void {
    _actions.delete(id);
    refreshSkillsMenu();
}

// ── DOM ──────────────────────────────────────────────────────────────────────

const MENU_BTN_ID    = "t20-skills-menu-btn";
const MENU_STYLES_ID = "t20-skills-menu-styles";



function ensureMenuStyles(): void {
    if (document.getElementById(MENU_STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = MENU_STYLES_ID;
    el.textContent = MENU_STYLES;
    document.head.appendChild(el);
}

function findSceneControlsMenu(): Element | null {
    return (
        document.querySelector("menu#scene-controls-layers") ??
        document.querySelector("aside#scene-controls menu") ??
        document.querySelector("#ui-left menu")
    );
}

function removeBtn(): void {
    const btn = document.getElementById(MENU_BTN_ID);
    btn?.parentElement?.remove();
}

function injectBtn(visible: SkillAction[]): void {
    if (visible.length === 0) {
        removeBtn();
        return;
    }
    let btn = document.getElementById(MENU_BTN_ID) as HTMLButtonElement | null;
    if (!btn) {
        const menu = findSceneControlsMenu();
        if (!menu) return;
        btn = document.createElement("button");
        btn.id = MENU_BTN_ID;
        btn.type = "button";
        // Sparkles = "habilidades" em geral
        btn.className = "control ui-control layer icon fa-solid fa-wand-magic-sparkles";
        btn.style.color = "#ffd86b";
        const li = document.createElement("li");
        li.appendChild(btn);
        menu.appendChild(li);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            void onClickMenu();
        });
    }
    // Atualiza tooltip refletindo o número de ações
    const tooltip = visible.length === 1
        ? visible[0].label
        : `Skills ativas (${visible.length})`;
    btn.setAttribute("data-tooltip", tooltip);
    btn.setAttribute("aria-label", tooltip);
}

function getVisibleActions(): SkillAction[] {
    const out: SkillAction[] = [];
    for (const a of _actions.values()) {
        try {
            if (a.isVisible()) out.push(a);
        } catch (err) {
            warn(`skills-menu: isVisible() falhou para ${a.id}:`, err);
        }
    }
    return out;
}

export function refreshSkillsMenu(): void {
    ensureMenuStyles();
    const visible = getVisibleActions();
    injectBtn(visible);
}

async function onClickMenu(): Promise<void> {
    const visible = getVisibleActions();
    if (visible.length === 0) {
        refreshSkillsMenu(); // remove o botão (estado stale)
        return;
    }
    if (visible.length === 1) {
        await visible[0].onClick();
        refreshSkillsMenu();
        return;
    }
    // 2+: picker
    await openPicker(visible);
    refreshSkillsMenu();
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function openPicker(actions: SkillAction[]): Promise<void> {
    return new Promise<void>((resolve) => {
        const rows = actions.map(a => `
            <button type="button" class="skill-row" data-skill-id="${esc(a.id)}">
                <i class="${esc(a.icon)}"${a.color ? ` style="color:${esc(a.color)}"` : ""}></i>
                <span>${esc(a.label)}</span>
            </button>
        `).join("");

        const dlg = new Dialog({
            title: "Skills ativas",
            content: `<div class="t20-skills-menu-list">${rows}</div>`,
            buttons: {
                cancel: {
                    icon:  '<i class="fas fa-times"></i>',
                    label: "Fechar",
                    callback: () => resolve(),
                },
            },
            default: "cancel",
            close:   () => resolve(),
            render: ($html: JQuery) => {
                const root = ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
                root.querySelectorAll<HTMLButtonElement>(".skill-row").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        e.preventDefault();
                        const id = btn.getAttribute("data-skill-id") ?? "";
                        const a = _actions.get(id);
                        try { await dlg.close(); } catch { /* ignore */ }
                        if (a?.isVisible()) {
                            try {
                                await a.onClick();
                            } catch (err) {
                                warn(`skills-menu: ação ${id} falhou:`, err);
                            }
                        }
                        resolve();
                    });
                });
            },
        }, { classes: ["t20-dialog"] });
        dlg.render(true);
    });
}

// ── Setup ────────────────────────────────────────────────────────────────────

/**
 * Liga listeners genéricos pra refrescar o menu quando o cenário muda.
 * Sistemas individuais ainda chamam `refreshSkillsMenu()` em seus próprios
 * eventos relevantes (criação/remoção de template, etc.).
 */
export function setupSkillsMenu(): void {
    Hooks.on("renderSceneControls", () => refreshSkillsMenu());
    Hooks.once("ready", () => refreshSkillsMenu());
    Hooks.on("canvasReady", () => refreshSkillsMenu());
}
