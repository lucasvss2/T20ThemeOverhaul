/**
 * T20OverhaulTab — aba própria na sidebar nativa (direita), ao lado de
 * Chat/Combate/Atores/Itens/Diário/etc. Reúne as ações de skills ativas do
 * módulo + atalhos pros compêndios empacotados (ver `skills-menu.ts` pro
 * registro/dados).
 *
 * v1.113.0 — pedido do usuário: o botão consolidado (v1.112.0) abria um
 * Dialog flutuante; agora é uma aba DE VERDADE, registrada no mecanismo
 * nativo do Foundry (`Sidebar.TABS` + `CONFIG.ui`, ver `sidebar.mjs`/
 * `sidebar-tab.mjs` lidos direto da instalação — MESMO padrão usado pra
 * Chat/Combate/Configurações). Clicar no ícone abre/fecha o painel dentro da
 * PRÓPRIA sidebar, exatamente como qualquer outra aba nativa — não mais um
 * Dialog separado.
 *
 * `Sidebar.TABS`/`CONFIG.ui` precisam ser mutados ANTES de
 * `Game#initializeUI()` instanciar `ui.sidebar`/`ui.t20Overhaul` — por isso
 * `registerT20OverhaulTab()` roda no hook `init` (mesma exigência de timing
 * de `registerFooterHud()`, ver `hud/index.ts`).
 *
 * Mistura `HandlebarsApplicationMixin` (necessário — `ApplicationV2` puro
 * tem `_renderHTML`/`_replaceHTML` abstratos; sem o mixin a aba nem seria
 * "renderable") mas nunca deixa o template real compilar: `PARTS` aponta pra
 * um `.hbs` vazio (nunca lido de fato, só existe pra o preload não dar 404)
 * e `_renderHTML` é sobrescrito com string-builder puro — MESMO truque de
 * `T20FooterHud` (ver `hud/T20FooterHud.ts`), que também pega carona numa
 * classe nativa já com o mixin aplicado.
 */
import { MODULE_ID } from "@/constants";
import { warn } from "@/utils/logging";
import STYLES from "./skills-menu.css?inline";
import {
    executeSkillAction, getVisibleActions, getVisiblePacks, openCompendium, stripPackLabelPrefix,
} from "./skills-menu";

const STYLES_ID = "t20-overhaul-tab-styles";
const TAB_NAME = "t20Overhaul";

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildContentHtml(): string {
    const actionRows = getVisibleActions().map(a => `
        <button type="button" class="skill-row" data-skill-id="${esc(a.id)}">
            <i class="${esc(a.icon)}"${a.color ? ` style="color:${esc(a.color)}"` : ""}></i>
            <span>${esc(a.label)}</span>
        </button>
    `).join("");
    const packRows = getVisiblePacks().map(p => `
        <button type="button" class="skill-row" data-pack-id="${esc(p.id)}">
            <i class="fa-solid fa-book-atlas"></i>
            <span>${esc(stripPackLabelPrefix(p.label))}</span>
        </button>
    `).join("");

    return `
        <div class="t20-overhaul-root">
            ${actionRows
            ? `<div class="t20-skills-menu-section-title">Ações</div><div class="t20-skills-menu-list">${actionRows}</div>`
            : `<div class="t20-overhaul-empty">Nenhuma ação ativa no momento.</div>`}
            ${packRows ? `<div class="t20-skills-menu-section-title">Compêndios</div><div class="t20-skills-menu-list">${packRows}</div>` : ""}
        </div>`;
}

const Base = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sidebar.AbstractSidebarTab);

export class T20OverhaulTab extends Base {
    static override tabName = TAB_NAME;

    static DEFAULT_OPTIONS = {
        id: TAB_NAME,
        classes: ["t20-overhaul-tab"],
        window: { title: "T20 Overhaul" },
    };

    // Nunca lido de verdade — ver doc do arquivo. Precisa existir (e ser o
    // PRIMEIRO/único part) pro preload do HandlebarsApplicationMixin não 404.
    static override PARTS = {
        [TAB_NAME]: { root: true, template: `modules/${MODULE_ID}/templates/t20-overhaul-tab.hbs` },
    };

    override async _renderHTML(
        _context: unknown, _options: { parts: string[] },
    ): Promise<Record<string, HTMLElement>> {
        ensureStyles();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = buildContentHtml();
        return { [TAB_NAME]: wrapper };
    }

    override async _onRender(context: unknown, options: unknown): Promise<void> {
        await super._onRender(context, options);
        const root = this.element;
        root.querySelectorAll<HTMLButtonElement>(".skill-row").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const skillId = btn.getAttribute("data-skill-id");
                const packId = btn.getAttribute("data-pack-id");
                if (skillId) {
                    void executeSkillAction(skillId)
                        .catch((err) => warn(`t20-overhaul-tab: ação ${skillId} falhou:`, err))
                        .finally(() => void this.render());
                } else if (packId) {
                    openCompendium(packId);
                }
            });
        });
    }
}

/** Registra a aba (`CONFIG.ui`/`Sidebar.TABS`). Chamar no hook `init`, ANTES de `Game#initializeUI()` (mesma exigência do `registerFooterHud()`). */
export function registerT20OverhaulTab(): void {
    (CONFIG as unknown as { ui: Record<string, unknown> }).ui[TAB_NAME] = T20OverhaulTab;
    foundry.applications.sidebar.Sidebar.TABS[TAB_NAME] = {
        tooltip: "T20 Overhaul",
        icon: "fa-solid fa-wand-magic-sparkles",
    };
}
