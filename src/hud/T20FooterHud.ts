/**
 * T20FooterHud — substitui a hotbar nativa do Foundry (registrada via
 * `CONFIG.ui.hotbar` no hook `init`, ver `index.ts`).
 *
 * Mantém `#slots`/`#page` vivos via `super._prepareContext()` (crítico para
 * as teclas 1-0/PageUp/PageDown e para `chat.mjs`, que fazem
 * `ui.hotbar.slots`/`ui.hotbar.changePage`/`document.getElementById("hotbar")`
 * diretamente — validado ao vivo na Fase 0), mas troca a renderização visual
 * por um markup próprio (string-builder, mesmo padrão de
 * `dialogs/t20-dialog.ts`).
 *
 * NÃO chama `super._onRender()`: `Hotbar#_onRender` chama `_updateToggles()`,
 * que faz `.classList` em botões `mute`/`lock` que não existem no nosso
 * markup e lançaria exceção — inclusive quando chamado de fora
 * (`playlist-directory.mjs` ao destilenciar o volume global). Por isso
 * `_updateToggles()` é sobrescrito como no-op (confirmado sem erro ao vivo).
 */
import { getActiveActor, getActiveTokenId } from "./active-actor";
import { buildCargaVM } from "./capacity";
import { classesForActor } from "./classes";
import { getCombatState, nextTurn } from "./combat-toggle";
import HUD_STYLES from "./hud.css?inline";
import { buildMacroSlotsHtml, wireMacroDragDrop } from "./macros-tab";
import {
    applyMobileMapActiveClass, applyMobileModeClass, cycleMobileModeSetting, getMobileModeSetting,
    isMobileModeElementActive, mobileModeIcon, mobileModeLabel,
} from "./mobile-mode";
import { wireOrbInteractions } from "./orb";
import { buildSkillSlots } from "./pericias-data";
import { portraitUrlFor } from "./portrait";
import { hidePortraitHoverPreview, showPortraitHoverPreview } from "./portrait-hover";
import { applyCustomOrder, computeReorderedKeys } from "./reorder";
import { colsForWidth } from "./responsive";
import { RIGHT_TABS, slotsForTab, type RightTabKey } from "./right-panel";
import { buildSlotGridHtml } from "./slots-grid";
import {
    getCustomOrder, getMobilePage, getMobileTab, getRightPage, getRightTab, getRows, getSkillsPage,
    MAX_ROWS, MIN_ROWS, type MobileTabKey, setCustomOrder, setMobilePage, setMobileTab,
    setRightPage, setRightTab, setRows, setSkillsPage,
} from "./state";
import type { HudRenderContext } from "./types";
import { warn } from "@/utils/logging";

const STYLES_ID = "t20-hud-styles";
const ROOT_CLASS = "t20-footer-hud";
const DEFAULT_COLS = 6; // usado só antes da 1ª medição real do ResizeObserver

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const el = document.createElement("style");
    el.id = STYLES_ID;
    el.textContent = HUD_STYLES;
    document.head.appendChild(el);
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function poolPct(pool: HudRenderContext["pv"]): number {
    if (!pool.max) return 0;
    return Math.max(0, Math.min(100, Math.round(((pool.value + pool.temp) / pool.max) * 100)));
}

function buildOrbHtml(kind: "pv" | "pm", pool: HudRenderContext["pv"], label: string): string {
    return `
        <div class="t20-hud-orb-col ${kind}">
            <div class="t20-hud-orb ${kind}" data-orb="${kind}">
                <div class="t20-hud-orb-fill-wrap">
                    <div class="t20-hud-orb-fill" style="height:${poolPct(pool)}%"></div>
                    <div class="t20-hud-orb-value">${pool.value}${pool.temp ? `+${pool.temp}` : ""}/${pool.max}</div>
                </div>
            </div>
            <div class="t20-hud-orb-label ${kind}">${esc(label)}</div>
        </div>`;
}

function buildTabsHtml(context: HudRenderContext): string {
    return `<div class="t20-hud-tabs">${context.rightTabs.map(t => `
        <button type="button" class="t20-hud-tab${t.active ? " active" : ""}" data-right-tab="${t.key}">${esc(t.label)}</button>
    `).join("")}</div>`;
}

function buildRightSectionBody(context: HudRenderContext, macroSlots: foundry.applications.ui.HotbarSlotData[], rows: number, cols: number): string {
    const tab = getRightTab();
    if (tab === "macros") return buildMacroSlotsHtml(macroSlots);
    const rightSlots = context.rightItems.map(i => ({ key: i.id, label: i.name, iconUrl: i.img }));
    return buildSlotGridHtml(rightSlots, cols, rows, getRightPage(), "item-id", tab);
}

function buildClassesHtml(classes: HudRenderContext["classes"]): string {
    if (!classes.length) return "";
    return `<div class="t20-hud-classes">${classes.map(c => `${esc(c.name)} ${c.level}`).join(" · ")}</div>`;
}

function buildStepperHtml(rows: number): string {
    return `
        <div class="t20-hud-divider has-stepper">
            <div class="t20-hud-stepper">
                <button type="button" class="t20-hud-stepper-btn" data-rows-dir="1" ${rows >= MAX_ROWS ? "disabled" : ""}>+</button>
                <span class="t20-hud-stepper-label">${rows}</span>
                <button type="button" class="t20-hud-stepper-btn" data-rows-dir="-1" ${rows <= MIN_ROWS ? "disabled" : ""}>−</button>
            </div>
        </div>`;
}

function buildNextTurnBtnHtml(combat: HudRenderContext["combat"]): string {
    if (!combat.isMyTurn) return "";
    return `<button type="button" class="t20-hud-next-turn" data-next-turn="1">Finalizar<br/>Turno</button>`;
}

/** Barra de capacidade (Carga/Sobrecarga/Limite) — ao lado do título "Perícias" no desktop; sozinha (sem separador) no cabeçalho mobile. Mesmos dados de `system.attributes.carga` da ficha nativa. */
function buildCargaHtml(carga: HudRenderContext["carga"], withSep = true): string {
    if (!carga) return "";
    const pct = Math.max(0, Math.min(100, carga.pct));
    return `
        ${withSep ? `<span class="t20-hud-title-sep">|</span>` : ""}
        <div class="t20-hud-carga${carga.encumbered ? " encumbered" : ""}" title="Carga: ${carga.value} / Sobrecarga: ${carga.limit} — Limite: ${carga.max}">
            <span class="t20-hud-carga-fill" style="width:${pct}%"></span>
            <span class="t20-hud-carga-label">${carga.value} / ${carga.limit}</span>
        </div>`;
}

/** Toggle explícito auto/mobile/desktop (ver `mobile-mode.ts`) — ao lado da barra de carga no desktop; último item da barra de abas no mobile (sem separador). */
function buildMobileToggleHtml(withSep = true): string {
    const mode = getMobileModeSetting();
    return `
        ${withSep ? `<span class="t20-hud-title-sep">|</span>` : ""}
        <button type="button" class="t20-hud-mobile-toggle" data-mobile-toggle="1" title="${esc(mobileModeLabel(mode))}">
            <i class="fas ${mobileModeIcon(mode)}"></i>
        </button>`;
}

// ── Layout mobile (Fase 2) ───────────────────────────────────────────────────
//
// Empilhamento vertical de tela cheia: cabeçalho (retrato+nome+classes+carga+
// orbes) → banner de turno (se ativo) → conteúdo de UMA aba por vez → barra de
// abas embaixo. "Perícias" vira uma aba a mais ao lado de Inventário/Poderes/
// Magias/Macros (no desktop elas ficam lado a lado; não cabe lado a lado numa
// tela de celular). Reaproveita ao máximo os builders/handlers do desktop
// (buildOrbHtml, buildSlotGridHtml, wireOrbInteractions, o clique em
// [data-skill-key]/[data-item-id], o drag-reorder por [data-drag-key]) — só a
// ARRANJAÇÃO do markup e o estado de aba/página (getMobileTab/getMobilePage,
// independentes do rightTab/rightPage do desktop) são novos.

const MOBILE_TAB_ICONS: Record<MobileTabKey, string> = {
    pericias: "fa-dice-d20",
    mapa: "fa-map",
    inventario: "fa-suitcase",
    poderes: "fa-bolt",
    magias: "fa-hat-wizard",
    macros: "fa-terminal",
};
const MOBILE_TABS: Array<{ key: MobileTabKey; label: string }> = [
    { key: "pericias", label: "Perícias" },
    { key: "mapa", label: "Mapa" },
    ...RIGHT_TABS,
];

function buildMobileHeaderHtml(context: HudRenderContext): string {
    return `
        <div class="t20-hud-mobile-header">
            <div class="t20-hud-portrait" style="background-image:url('${esc(context.portraitUrl)}')">
                <div class="t20-hud-portrait-name">${esc(context.charName)}</div>
            </div>
            <div class="t20-hud-mobile-info">
                ${buildClassesHtml(context.classes)}
                ${buildCargaHtml(context.carga, false)}
            </div>
            <div class="t20-hud-mobile-orbs">
                ${buildOrbHtml("pv", context.pv, "Vida")}
                ${buildOrbHtml("pm", context.pm, "Mana")}
            </div>
        </div>`;
}

/** Rows fixo (não ajustável pelo stepper, que some no mobile) — cols continua vindo do ResizeObserver existente. Ver CLAUDE.md: cálculo dinâmico por altura fica pra um refinamento futuro. */
const MOBILE_ROWS = MAX_ROWS;

function buildMobileContentHtml(context: HudRenderContext, macroSlots: foundry.applications.ui.HotbarSlotData[], cols: number): string {
    const tab = getMobileTab();
    // "mapa" não renderiza grid nenhum — o canvas nativo (`#board`) fica
    // visível ATRÁS desta área (ver CSS `.t20-mobile-map-active`); o conteúdo
    // aqui precisa ficar vazio/transparente pra não tampar o mapa.
    if (tab === "mapa") return "";
    if (tab === "macros") return buildMacroSlotsHtml(macroSlots);
    if (tab === "pericias") {
        const skillSlots = context.skills.map(s => ({ key: s.key, label: s.label, iconUrl: s.iconSvgDataUri, extra: `${s.total >= 0 ? "+" : ""}${s.total}` }));
        return buildSlotGridHtml(skillSlots, cols, MOBILE_ROWS, getMobilePage(), "skill-key", "skills");
    }
    if (!context.actor) return "";
    const items = applyCustomOrder(slotsForTab(context.actor, tab), getCustomOrder(context.actor.id, tab));
    const slots = items.map(i => ({ key: i.key, label: i.label, iconUrl: i.iconUrl }));
    return buildSlotGridHtml(slots, cols, MOBILE_ROWS, getMobilePage(), "item-id", tab);
}

function buildMobileTabBarHtml(): string {
    const active = getMobileTab();
    return `
        <div class="t20-hud-mobile-tabbar">
            ${MOBILE_TABS.map(t => `
                <button type="button" class="t20-hud-mobile-tab${t.key === active ? " active" : ""}" data-mobile-tab="${t.key}">
                    <i class="fas ${MOBILE_TAB_ICONS[t.key]}"></i>
                    <span>${esc(t.label)}</span>
                </button>`).join("")}
            ${buildMobileToggleHtml(false)}
        </div>`;
}

function buildMobileFooterHudHtml(context: HudRenderContext, macroSlots: foundry.applications.ui.HotbarSlotData[], cols: number): string {
    return `
        <div class="t20-hud-mobile-root">
            ${buildMobileHeaderHtml(context)}
            ${buildNextTurnBtnHtml(context.combat)}
            <div class="t20-hud-mobile-content">
                ${buildMobileContentHtml(context, macroSlots, cols)}
            </div>
            ${buildMobileTabBarHtml()}
        </div>`;
}

function buildFooterHudHtml(context: HudRenderContext, macroSlots: foundry.applications.ui.HotbarSlotData[], cols: number): string {
    const rows = getRows();
    const skillSlots = context.skills.map(s => ({ key: s.key, label: s.label, iconUrl: s.iconSvgDataUri, extra: `${s.total >= 0 ? "+" : ""}${s.total}` }));
    return `
        <div class="t20-hud-root">
            ${buildOrbHtml("pv", context.pv, "Vida")}
            <div class="t20-hud-panel">
                <div class="t20-hud-portrait-col">
                    <div class="t20-hud-portrait" style="background-image:url('${esc(context.portraitUrl)}')">
                        <div class="t20-hud-portrait-name">${esc(context.charName)}</div>
                    </div>
                    ${buildClassesHtml(context.classes)}
                </div>
                <div class="t20-hud-divider"></div>
                <div class="t20-hud-section">
                    <div class="t20-hud-section-title-row">
                        <span class="t20-hud-section-title">Perícias</span>
                        ${buildCargaHtml(context.carga)}
                        ${buildMobileToggleHtml()}
                    </div>
                    ${buildSlotGridHtml(skillSlots, cols, rows, getSkillsPage(), "skill-key", "skills")}
                </div>
                ${buildStepperHtml(rows)}
                <div class="t20-hud-section">
                    ${buildTabsHtml(context)}
                    ${buildRightSectionBody(context, macroSlots, rows, cols)}
                </div>
            </div>
            ${buildOrbHtml("pm", context.pm, "Mana")}
            ${buildNextTurnBtnHtml(context.combat)}
        </div>`;
}

function buildHudContext(): HudRenderContext | null {
    const actor = getActiveActor();
    if (!actor) return null;
    const pv = actor.system?.attributes?.pv ?? {};
    const pm = actor.system?.attributes?.pm ?? {};
    const activeTab = getRightTab();
    const orderedSkills = applyCustomOrder(buildSkillSlots(actor), getCustomOrder(actor.id, "skills"));
    const orderedRightItems = applyCustomOrder(slotsForTab(actor, activeTab), getCustomOrder(actor.id, activeTab));
    return {
        actor,
        pv: { value: pv.value ?? 0, max: pv.max ?? 0, temp: pv.temp ?? 0 },
        pm: { value: pm.value ?? 0, max: pm.max ?? 0, temp: pm.temp ?? 0 },
        portraitUrl: portraitUrlFor(actor),
        charName: actor.name,
        classes: classesForActor(actor),
        skills: orderedSkills,
        carga: buildCargaVM(actor),
        rightTabs: RIGHT_TABS.map(t => ({ key: t.key, label: t.label, active: t.key === activeTab })),
        rightItems: orderedRightItems.map(s => ({ id: s.key, name: s.label, img: s.iconUrl, type: activeTab })),
        combat: getCombatState(getActiveTokenId()),
    };
}

interface ActorWithSkillRoll { rollPericia?: (key: string, opts?: Record<string, unknown>) => Promise<unknown> }
interface ItemWithRoll { roll?: (opts?: Record<string, unknown>) => Promise<unknown> }

export class T20FooterHud extends foundry.applications.ui.Hotbar {
    #cols = DEFAULT_COLS;
    #resizeObserver: ResizeObserver | null = null;

    override async _prepareContext(
        options: unknown,
    ): Promise<{ slots: foundry.applications.ui.HotbarSlotData[]; page: number }> {
        // Mantém o bookkeeping nativo de #slots/#page vivo — ver doc acima.
        return super._prepareContext(options);
    }

    override async _renderHTML(_context: unknown, _options: { parts: string[] }): Promise<Record<string, HTMLElement>> {
        ensureStyles();
        const hudContext = buildHudContext();
        // `_replaceHTML` (herdado) faz `content.replaceChildren(...wrapper.children)`
        // para a part `root:true` — retornamos um wrapper cujos FILHOS viram o
        // conteúdo real do <aside id="hotbar">; o wrapper em si é descartado.
        const wrapper = document.createElement("div");
        wrapper.innerHTML = !hudContext ? "" : isMobileModeElementActive()
            ? buildMobileFooterHudHtml(hudContext, this.slots, this.#cols)
            : buildFooterHudHtml(hudContext, this.slots, this.#cols);
        return { hotbar: wrapper };
    }

    override async _onFirstRender(context: unknown, options: unknown): Promise<void> {
        // Mantém `game.macros.apps.push(this)` + `_onResize()` inicial — necessário
        // e inofensivo (nada no nosso markup conflita com isso).
        await super._onFirstRender(context, options);
        this.element.classList.add(ROOT_CLASS);
        this.#connectResizeObserver();
    }

    override async _onRender(_context: unknown, _options: unknown): Promise<void> {
        // Deliberadamente NÃO chama super._onRender() — ver doc da classe.
        this.element.classList.add(ROOT_CLASS);
        wireOrbInteractions(this.element, getActiveActor, () => void this.render());
        this.#wireTabsAndSlots();
        this.#wireDragReorder();
        const isMobile = isMobileModeElementActive();
        const macrosShown = isMobile ? getMobileTab() === "macros" : getRightTab() === "macros";
        if (macrosShown) wireMacroDragDrop(this.element);
        // `#board` nunca é escondido (display/visibility) em modo mobile —
        // só coberto pelo fundo opaco da HUD (ver hud.css) — então não precisa
        // de resize manual ao trocar de aba; o canvas nunca para de desenhar.
        applyMobileMapActiveClass(isMobile && getMobileTab() === "mapa");
        this.#updateHudHeightVar();
    }

    /**
     * Drag-and-drop de REORDENAÇÃO (Perícias e painel direito — Inventário/
     * Poderes/Magias; Macros fica de fora, tem seu próprio drag-and-drop de
     * atribuição em `macros-tab.ts`). Cada slot elegível carrega
     * `data-drag-key`/`data-drag-list` (ver `slots-grid.ts`); soltar um sobre
     * o outro recalcula a ordem completa (`computeReorderedKeys`) e persiste
     * por ator+lista (`state.ts`).
     */
    #wireDragReorder(): void {
        const root = this.element;
        let draggedKey: string | null = null;
        root.querySelectorAll<HTMLElement>("[data-drag-key]").forEach((slot) => {
            slot.addEventListener("dragstart", (e) => {
                draggedKey = slot.dataset["dragKey"] ?? null;
                const dt = (e as DragEvent).dataTransfer;
                if (dt) { dt.setData("text/plain", draggedKey ?? ""); dt.effectAllowed = "move"; }
                slot.classList.add("dragging");
            });
            slot.addEventListener("dragend", () => slot.classList.remove("dragging"));
            slot.addEventListener("dragover", (e) => {
                e.preventDefault();
                const dt = (e as DragEvent).dataTransfer;
                if (dt) dt.dropEffect = "move";
                slot.classList.add("drag-over");
            });
            slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
            slot.addEventListener("drop", (e) => {
                e.preventDefault();
                slot.classList.remove("drag-over");
                const targetKey = slot.dataset["dragKey"];
                const listKey = slot.dataset["dragList"];
                const dKey = draggedKey ?? (e as DragEvent).dataTransfer?.getData("text/plain") ?? null;
                draggedKey = null;
                if (!dKey || !targetKey || !listKey || dKey === targetKey) return;
                void this.#reorderList(listKey, dKey, targetKey).catch((err) => warn("hud: falha ao reordenar:", err));
            });
        });
    }

    async #reorderList(listKey: string, draggedKey: string, targetKey: string): Promise<void> {
        const actor = getActiveActor();
        if (!actor) return;
        const naturalItems: Array<{ key: string }> = listKey === "skills"
            ? buildSkillSlots(actor)
            : slotsForTab(actor, listKey as RightTabKey);
        const currentKeys = applyCustomOrder(naturalItems, getCustomOrder(actor.id, listKey)).map((i) => i.key);
        const next = computeReorderedKeys(currentKeys, draggedKey, targetKey);
        if (!next) return;
        await setCustomOrder(actor.id, listKey, next);
        void this.render();
    }

    /**
     * Expõe a altura real da HUD como `--t20-hud-height` no `:root` para o CSS
     * levantar o input flutuante de chat (`#chat-notifications`) acima da barra.
     * A altura varia com o nº de linhas (stepper) e com o ator ativo (colapsa a
     * ~0 sem ator) — por isso é medida a cada render e a cada resize.
     */
    #updateHudHeightVar(): void {
        const h = Math.round(this.element.getBoundingClientRect().height);
        document.documentElement.style.setProperty("--t20-hud-height", `${h + 6}px`);
    }

    /**
     * `ResizeObserver` sobre `this.element` (não só `_onResize()` nativo, que só
     * reage a resize de JANELA — colapsar/expandir a sidebar de chat muda a
     * largura de `#ui-middle` sem disparar esse evento). Recalcula `cols` pela
     * largura real do container e força um re-render só quando o valor muda.
     */
    #connectResizeObserver(): void {
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = new ResizeObserver((entries) => {
            this.#updateHudHeightVar(); // altura pode mudar sem re-render (fontes/imagens/altura de linha)
            const width = entries[0]?.contentRect.width;
            if (width === undefined) return;
            const next = colsForWidth(width);
            if (next !== this.#cols) {
                this.#cols = next;
                void this.render();
            }
        });
        this.#resizeObserver.observe(this.element);
    }

    #wireTabsAndSlots(): void {
        const root = this.element;

        root.querySelectorAll<HTMLElement>("[data-right-tab]").forEach((btn) => {
            btn.addEventListener("click", () => {
                setRightTab(btn.dataset["rightTab"] as Parameters<typeof setRightTab>[0]);
                void this.render();
            });
        });

        root.querySelectorAll<HTMLElement>("[data-page-dir]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const dir = Number(btn.dataset["pageDir"]);
                if (btn.closest(".t20-hud-mobile-content")) {
                    setMobilePage(getMobilePage() + dir);
                } else {
                    const isSkills = !!btn.closest(".t20-hud-section")?.querySelector("[data-skill-key]");
                    if (isSkills) setSkillsPage(getSkillsPage() + dir);
                    else setRightPage(getRightPage() + dir);
                }
                void this.render();
            });
        });

        root.querySelectorAll<HTMLElement>("[data-mobile-tab]").forEach((btn) => {
            btn.addEventListener("click", () => {
                setMobileTab(btn.dataset["mobileTab"] as MobileTabKey);
                void this.render();
            });
        });

        root.querySelectorAll<HTMLElement>("[data-rows-dir]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const dir = Number(btn.dataset["rowsDir"]);
                void setRows(getRows() + dir).then(() => this.render());
            });
        });

        root.querySelectorAll<HTMLElement>("[data-skill-key]").forEach((slot) => {
            slot.addEventListener("click", () => {
                const actor = getActiveActor() as (FoundryActor & ActorWithSkillRoll) | null;
                const key = slot.dataset["skillKey"];
                if (!actor || !key) return;
                try { void actor.rollPericia?.(key); } catch (err) { warn("hud: falha ao rolar perícia:", err); }
            });
        });

        root.querySelectorAll<HTMLElement>("[data-item-id]").forEach((slot) => {
            slot.addEventListener("click", () => {
                const actor = getActiveActor();
                const id = slot.dataset["itemId"];
                if (!actor || !id) return;
                const item = actor.items?.get(id) as (FoundryItem & ItemWithRoll) | null;
                try { void item?.roll?.(); } catch (err) { warn("hud: falha ao usar item:", err); }
            });
        });

        root.querySelector<HTMLElement>("[data-next-turn]")?.addEventListener("click", () => {
            void nextTurn().catch((err) => warn("hud: falha ao avançar turno:", err));
        });

        root.querySelector<HTMLElement>("[data-mobile-toggle]")?.addEventListener("click", () => {
            void cycleMobileModeSetting().then(() => {
                applyMobileModeClass();
                void this.render();
            }).catch((err) => warn("hud: falha ao alternar modo mobile:", err));
        });

        const portrait = root.querySelector<HTMLElement>(".t20-hud-portrait");
        portrait?.addEventListener("mouseenter", () => showPortraitHoverPreview(getActiveActor()));
        portrait?.addEventListener("mouseleave", () => hidePortraitHoverPreview());
        portrait?.addEventListener("click", () => {
            const actor = getActiveActor() as (FoundryActor & { sheet?: { render: (force?: boolean) => unknown } }) | null;
            try { actor?.sheet?.render(true); } catch (err) { warn("hud: falha ao abrir a ficha:", err); }
        });
    }

    override _onResize(): void {
        super._onResize(); // mantém as classes lg/md/sm/min nativas (outro código nativo depende disso)
    }

    override _updateToggles(): void {
        // no-op — HUD não tem botões mute/lock.
    }
}
