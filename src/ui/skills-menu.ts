import MENU_STYLES from "./skills-menu.css?inline";
import { MODULE_ID } from "@/constants";
import { warn } from "@/utils/logging";

/**
 * T20 Overhaul — botão único na barra de abas da sidebar (direita) que
 * condensa (a) todas as ações de skills ativas e (b) atalhos pros
 * compêndios empacotados no módulo. Antes (v1.8.0–v1.10x) vivia na toolbar
 * de scene-controls (esquerda, `menu#scene-controls-layers`); movido pra
 * `#sidebar-tabs` a pedido do usuário — não é uma aba REAL registrada no
 * Foundry (não tem painel próprio pra trocar), só um botão com a MESMA
 * aparência dos ícones de aba (chat/combate/atores/...), que abre nosso
 * Dialog `.t20-dialog` em vez de trocar de painel.
 *
 * Cada sistema (Consagrar, Aura Sagrada, etc.) registra ações via
 * `registerSkillAction({ id, label, icon, isVisible, onClick })` — API
 * inalterada. Diferente do modelo antigo, o botão SEMPRE aparece (mesmo com
 * zero ações visíveis, pois os compêndios sempre existem) e clicar SEMPRE
 * abre o menu consolidado — sem mais o atalho "1 ação visível = executa
 * direto", pra manter o comportamento previsível agora que o botão também é
 * a porta de entrada pros compêndios.
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

const MENU_BTN_ID    = "t20-overhaul-menu-btn";
const MENU_STYLES_ID = "t20-skills-menu-styles";



function ensureMenuStyles(): void {
    if (document.getElementById(MENU_STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = MENU_STYLES_ID;
    el.textContent = MENU_STYLES;
    document.head.appendChild(el);
}

/** `#sidebar-tabs` = a nav de ícones da sidebar nativa (chat/combate/atores/...), à direita. */
function findSidebarTabsMenu(): Element | null {
    return (
        document.querySelector("#sidebar-tabs menu") ??
        document.querySelector("nav#sidebar-tabs") ??
        document.querySelector("#ui-right nav.tabs")
    );
}

function injectBtn(): void {
    let btn = document.getElementById(MENU_BTN_ID) as HTMLButtonElement | null;
    if (!btn) {
        const menu = findSidebarTabsMenu();
        if (!menu) return;
        btn = document.createElement("button");
        btn.id = MENU_BTN_ID;
        btn.type = "button";
        // Mesmo estilo visual dos botões de aba nativos (ui-control plain icon),
        // só com um tom dourado pra sinalizar "isso não é uma aba de verdade".
        btn.className = "ui-control plain icon fa-solid fa-wand-magic-sparkles";
        btn.style.color = "#ffd86b";
        btn.setAttribute("data-tooltip-direction", "LEFT");
        const li = document.createElement("li");
        li.appendChild(btn);
        menu.appendChild(li);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            void openMenu();
        });
    }
    const activeCount = getVisibleActions().length;
    const tooltip = activeCount > 0
        ? `T20 Overhaul (${activeCount} ${activeCount === 1 ? "ação ativa" : "ações ativas"})`
        : "T20 Overhaul";
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

interface PackInfo { id: string; label: string }

interface PackLike {
    metadata: { packageName?: string; label?: string };
    collection: string;
    visible?: boolean;
    render: (force: boolean) => void;
}

function getPacksCollection(): { contents?: PackLike[]; get?: (id: string) => PackLike | undefined } | undefined {
    return (game as unknown as { packs?: { contents?: PackLike[]; get?: (id: string) => PackLike | undefined } }).packs;
}

/** Compêndios empacotados no módulo que o usuário atual tem permissão de ver (mesma checagem que a aba Compêndios nativa usa). */
function getVisiblePacks(): PackInfo[] {
    const packs = getPacksCollection()?.contents ?? [];
    const out: PackInfo[] = [];
    for (const p of packs) {
        if (p.metadata?.packageName !== MODULE_ID) continue;
        if (p.visible === false) continue;
        out.push({ id: p.collection, label: p.metadata.label ?? p.collection });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function refreshSkillsMenu(): void {
    ensureMenuStyles();
    injectBtn();
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function openMenu(): Promise<void> {
    const actions = getVisibleActions();
    const packs = getVisiblePacks();
    return new Promise<void>((resolve) => {
        const actionRows = actions.map(a => `
            <button type="button" class="skill-row" data-skill-id="${esc(a.id)}">
                <i class="${esc(a.icon)}"${a.color ? ` style="color:${esc(a.color)}"` : ""}></i>
                <span>${esc(a.label)}</span>
            </button>
        `).join("");
        const packRows = packs.map(p => `
            <button type="button" class="skill-row" data-pack-id="${esc(p.id)}">
                <i class="fa-solid fa-book-atlas"></i>
                <span>${esc(p.label)}</span>
            </button>
        `).join("");

        const sections = [
            actionRows
                ? `<div class="t20-skills-menu-section-title">Ações</div><div class="t20-skills-menu-list">${actionRows}</div>`
                : "",
            packRows
                ? `<div class="t20-skills-menu-section-title">Compêndios</div><div class="t20-skills-menu-list">${packRows}</div>`
                : "",
        ].join("");

        const dlg = new Dialog({
            title: "T20 Overhaul",
            content: sections,
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
                        const skillId = btn.getAttribute("data-skill-id");
                        const packId = btn.getAttribute("data-pack-id");
                        try { await dlg.close(); } catch { /* ignore */ }
                        if (skillId) {
                            const a = _actions.get(skillId);
                            if (a?.isVisible()) {
                                try {
                                    await a.onClick();
                                } catch (err) {
                                    warn(`skills-menu: ação ${skillId} falhou:`, err);
                                }
                            }
                        } else if (packId) {
                            try {
                                getPacksCollection()?.get?.(packId)?.render(true);
                            } catch (err) {
                                warn(`skills-menu: falha ao abrir o compêndio ${packId}:`, err);
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
    Hooks.on("renderSidebar", () => refreshSkillsMenu());
    Hooks.once("ready", () => refreshSkillsMenu());
    Hooks.on("canvasReady", () => refreshSkillsMenu());
}
