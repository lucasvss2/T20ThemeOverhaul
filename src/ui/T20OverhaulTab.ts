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
import { matchesCompendiumSearch, normalizeCompendiumSearch, searchCompendiumContents } from "./compendium-search";
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
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildContentHtml(query: string): string {
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
            ${packRows ? `<div class="t20-skills-menu-section-title">Compêndios</div>
                <div class="t20-compendium-search" role="search" aria-label="Buscar nos compêndios T20">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <input type="search" aria-label="Buscar compêndios e conteúdos" placeholder="Buscar compêndios e conteúdos…" value="${esc(query)}" autocomplete="off">
                    <button type="button" data-clear-search aria-label="Limpar busca" title="Limpar busca"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
                <div class="t20-skills-menu-list t20-pack-list">${packRows}</div>
                <div class="t20-search-status" role="status" aria-live="polite"></div>
                <div class="t20-skills-menu-list t20-search-results"></div>` : ""}
        </div>`;
}

const Base = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sidebar.AbstractSidebarTab);

export class T20OverhaulTab extends Base {
    private searchQuery = "";
    private searchTimer?: ReturnType<typeof setTimeout>;
    private searchGeneration = 0;
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
        wrapper.innerHTML = buildContentHtml(this.searchQuery);
        return { [TAB_NAME]: wrapper };
    }

    override async _onRender(context: unknown, options: unknown): Promise<void> {
        await super._onRender(context, options);
        const root = this.element;
        const input = root.querySelector<HTMLInputElement>(".t20-compendium-search input");
        const clear = root.querySelector<HTMLButtonElement>("[data-clear-search]");
        input?.addEventListener("input", () => { this.searchQuery = input.value; this.updateSearch(root); });
        input?.addEventListener("keydown", e => {
            // Typing here must not trigger Foundry's canvas/hotbar shortcuts.
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); input.value = ""; this.searchQuery = ""; this.updateSearch(root); }
        });
        clear?.addEventListener("click", () => {
            if (!input) return;
            input.value = ""; this.searchQuery = ""; this.updateSearch(root); input.focus();
        });
        root.querySelector(".t20-search-results")?.addEventListener("click", e => {
            const button = (e.target as Element).closest<HTMLButtonElement>("[data-document-uuid]");
            if (!button?.dataset.documentUuid) return;
            void this.openSearchResult(button.dataset.documentUuid);
        });
        this.updateSearch(root);
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

    private async openSearchResult(uuid: string): Promise<void> {
        try {
            const resolver = (globalThis as unknown as { fromUuid(uuid: string): Promise<{ sheet?: { render(force: boolean): unknown } } | null> }).fromUuid;
            const document = await resolver(uuid);
            if (document?.sheet) document.sheet.render(true);
            else ui.notifications.warn("Documento não encontrado ou sem permissão de acesso.");
        } catch (error) { warn("t20-overhaul-tab: não foi possível abrir o resultado:", error); }
    }

    private updateSearch(root: HTMLElement): void {
        clearTimeout(this.searchTimer);
        const generation = ++this.searchGeneration;
        const query = normalizeCompendiumSearch(this.searchQuery);
        const results = root.querySelector<HTMLElement>(".t20-search-results");
        const status = root.querySelector<HTMLElement>(".t20-search-status");
        const clear = root.querySelector<HTMLButtonElement>("[data-clear-search]");
        if (!results || !status || !clear) return;
        clear.hidden = !this.searchQuery;
        results.replaceChildren();
        root.querySelectorAll<HTMLButtonElement>(".t20-pack-list [data-pack-id]").forEach(button => {
            button.hidden = !!query && !matchesCompendiumSearch(button.textContent ?? "", query);
        });
        status.textContent = query.length === 1 ? "Digite ao menos 2 caracteres para buscar conteúdos." : query ? "Buscando conteúdos…" : "";
        if (query.length < 2) return;
        this.searchTimer = setTimeout(() => {
            void searchCompendiumContents(query).then(found => {
                if (generation !== this.searchGeneration || !root.isConnected) return;
                status.textContent = (found.total ? `${found.total} conteúdo(s) encontrado(s).${found.total > 60 ? " Exibindo os primeiros 60; refine a busca." : ""}`
                    : "Nenhum conteúdo encontrado.") + (found.failed ? ` ${found.failed} compêndio(s) indisponível(is).` : "");
                results.innerHTML = found.results.map(entry => `<button type="button" class="skill-row t20-search-result" data-document-uuid="${esc(entry.uuid)}">
                    <i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>${esc(entry.name)}<small>${esc(entry.packLabel)}</small></span></button>`).join("");
            }).catch(error => {
                if (generation !== this.searchGeneration || !root.isConnected) return;
                status.textContent = "Não foi possível buscar. Tente novamente.";
                warn("t20-overhaul-tab: busca falhou:", error);
            });
        }, 200);
    }
}

/** Registra a aba (`CONFIG.ui`/`Sidebar.TABS`). Chamar no hook `init`, ANTES de `Game#initializeUI()` (mesma exigência do `registerFooterHud()`). */
export function registerT20OverhaulTab(): void {
    (CONFIG as unknown as { ui: Record<string, unknown> }).ui[TAB_NAME] = T20OverhaulTab;
    foundry.applications.sidebar.Sidebar.TABS[TAB_NAME] = {
        tooltip: "T20 Overhaul",
        icon: "t20-sidebar-icon",
    };
}
