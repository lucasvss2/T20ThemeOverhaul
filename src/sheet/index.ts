import { MODULE_ID } from "@/constants";
import { log } from "@/utils/logging";
import SHEET_STYLES from "./sheet.css?inline";



// ── JS Enhancements ───────────────────────────────────────────────────────────

// Track which spell sheets have already received their initial size so we don't
// snap them back to default on subsequent re-renders (e.g. after field edits).
const _resizedSpellSheets = new WeakSet<object>();

function injectVitalBars(root: HTMLElement): void {
    root.querySelectorAll(".t20-vital-bar").forEach((el) => el.remove());

    const buildBar = (el: HTMLElement, valueSelector: string, maxSelector: string, tempSelector: string, cls: string) => {
        const cur  = parseInt(el.querySelector<HTMLInputElement>(valueSelector)?.value ?? "0") || 0;
        const max  = Math.max(1, parseInt(el.querySelector<HTMLInputElement>(maxSelector)?.value  ?? "1") || 1);
        const temp = Math.max(0, parseInt(el.querySelector<HTMLInputElement>(tempSelector)?.value ?? "0") || 0);
        const total = max + temp;
        const regPct  = Math.min(100, Math.max(0, (cur  / total) * 100));
        const tempPct = Math.min(100 - regPct, Math.max(0, (temp / total) * 100));
        const bar = document.createElement("div");
        bar.className = `t20-vital-bar ${cls}`;
        bar.innerHTML =
            `<div class="t20-vital-bar__fill" style="width:${regPct.toFixed(1)}%"></div>` +
            (temp > 0 ? `<div class="t20-vital-bar__fill-temp" style="width:${tempPct.toFixed(1)}%"></div>` : "");
        const footer = el.querySelector(".attribute-footer");
        if (footer) el.insertBefore(bar, footer);
        else el.appendChild(bar);
    };

    const healthEl = root.querySelector<HTMLElement>(".attribute.health");
    if (healthEl) buildBar(healthEl, 'input[name*="pv.value"]', 'input[name*="pv.max"]', 'input[name*="pv.temp"]', "t20-vital-bar--hp");

    const manaEl = root.querySelector<HTMLElement>(".attribute.mana");
    if (manaEl) buildBar(manaEl, 'input[name*="pm.value"]', 'input[name*="pm.max"]', 'input[name*="pm.temp"]', "t20-vital-bar--pm");
}

function injectTraitSections(root: HTMLElement): void {
    const traits = root.querySelector<HTMLElement>(".traits");
    if (!traits) return;

    traits.querySelectorAll<HTMLElement>("h3").forEach((h3) => {
        // Skip if already wrapped
        if (h3.nextElementSibling?.classList.contains("t20-section-content")) return;

        const wrapper = document.createElement("div");
        wrapper.className = "t20-section-content";

        const siblings: Element[] = [];
        let el = h3.nextElementSibling;
        while (el && el.tagName !== "H3" && el.tagName !== "TEXTAREA") {
            siblings.push(el);
            el = el.nextElementSibling;
        }

        if (siblings.length > 0) {
            h3.after(wrapper);
            siblings.forEach((s) => wrapper.appendChild(s));
        }
    });
}

function injectCollapsibles(root: HTMLElement): void {
    const makeToggle = (collapsed: boolean) => {
        const btn = document.createElement("button");
        btn.className = "t20-toggle";
        btn.setAttribute("type", "button");
        btn.textContent = collapsed ? "+" : "—";
        btn.title = "Minimizar/Expandir";
        return btn;
    };

    // Skills section
    const skillsHeader = root.querySelector<HTMLElement>(".skills-list .skill.item-header .item-name");
    if (skillsHeader && !skillsHeader.querySelector(".t20-toggle")) {
        const btn = makeToggle(false);
        skillsHeader.prepend(btn);
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            const list = root.querySelector(".skills-list");
            if (!list) return;
            const items = list.querySelectorAll<HTMLElement>(".skill:not(.item-header)");
            const nowHidden = btn.textContent === "—";
            items.forEach((it) => it.classList.toggle("t20-section-hidden", nowHidden));
            btn.textContent = nowHidden ? "+" : "—";
        });
    }

    // Item-list sections (powers, inventory, spells)
    root.querySelectorAll<HTMLElement>(".item-list .item-header, ol.item-list .item-header").forEach((header) => {
        if (header.querySelector(".t20-toggle")) return;
        const nameEl = header.querySelector<HTMLElement>(".item-name, .flex2");
        if (!nameEl) return;
        const btn = makeToggle(false);
        nameEl.prepend(btn);
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            const list = header.parentElement;
            if (!list) return;
            const items = list.querySelectorAll<HTMLElement>(".item:not(.item-header)");
            const nowHidden = btn.textContent === "—";
            items.forEach((it) => it.classList.toggle("t20-section-hidden", nowHidden));
            btn.textContent = nowHidden ? "+" : "—";
        });
    });

    // Trait section h3 headers (Outras Características, Proficiências)
    root.querySelectorAll<HTMLElement>(".traits h3").forEach((h3) => {
        if (h3.querySelector(".t20-toggle")) return;
        const btn = makeToggle(false);
        h3.prepend(btn);
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            const content = h3.nextElementSibling;
            if (!content?.classList.contains("t20-section-content")) return;
            const nowHidden = btn.textContent === "—";
            content.classList.toggle("t20-section-hidden", nowHidden);
            btn.textContent = nowHidden ? "+" : "—";
        });
    });

    // Effects sections
    root.querySelectorAll<HTMLElement>(".tab.effects .items-header h3").forEach((h3) => {
        if (h3.querySelector(".t20-toggle")) return;
        const btn = makeToggle(false);
        h3.prepend(btn);
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            const section = h3.closest(".items-header");
            if (!section) return;
            const effectsList = section.nextElementSibling;
            if (!effectsList?.classList.contains("effects-list")) return;
            const nowHidden = btn.textContent === "—";
            effectsList.classList.toggle("t20-section-hidden", nowHidden);
            btn.textContent = nowHidden ? "+" : "—";
        });
    });
}

function adjustNameFontSize(root: HTMLElement): void {
    const input = root.querySelector<HTMLInputElement>(".charname input");
    if (!input) return;
    input.style.fontSize = "1.3rem";
    // Reduce until no overflow
    while (input.scrollWidth > input.clientWidth + 2 && parseFloat(input.style.fontSize) > 0.72) {
        input.style.fontSize = (parseFloat(input.style.fontSize) - 0.04).toFixed(2) + "rem";
    }
}

function enhanceSheet(root: HTMLElement): void {
    injectVitalBars(root);
    injectTraitSections(root);
    injectCollapsibles(root);
    adjustNameFontSize(root);
    fixBrokenPericiaLabels(root);
    sortPericiaRows(root);
}

/**
 * NPCs (ameaças) tipicamente têm slots de perícias customizadas
 * (Ofício "ofiN", Profissão "_pcN", etc.) cujo `label` fica vazio ou
 * com o próprio `key` ("ofi0", "_pc0") quando o GM não preenche.
 * T20 system renderiza o key bruto como nome — visual quebrado.
 *
 * Aqui detectamos rows da skills tab cujo nome bate com o padrão
 * de "key bruta de perícia customizada" e:
 *   • escondemos a row se o label nunca foi preenchido (sem dados úteis)
 *   • mantemos visíveis as que TÊM label válido (ex: "Alquimista")
 */
function fixBrokenPericiaLabels(root: HTMLElement): void {
    const rawKeyRe = /^(?:ofi|_pc|prof)\d+$/i;
    root.querySelectorAll<HTMLElement>(".skill.flexrow").forEach(row => {
        const itemId = row.dataset["itemId"];
        if (!itemId || !rawKeyRe.test(itemId)) return;
        const nameDiv = row.querySelector(".item-name");
        const text = nameDiv?.textContent?.trim().replace(/\s+/g, " ") ?? "";
        // Limpa marcadores trailing (*/+) pra comparação
        const stripped = text.replace(/[+*\s]+$/, "");
        if (stripped !== itemId) return;
        // Label nunca foi preenchido — esconder a row para não poluir a UI
        row.classList.add("t20-pericia-broken");
        row.style.setProperty("display", "none", "important");
    });
}

/**
 * T20's NPC template appends custom pericias (Ofícios, etc.) at the end of the
 * skills list instead of ordering them alphabetically. This reorders all rows
 * so they match the alphabetical layout players see on the character sheet.
 *
 * Safe for PC sheets too (already sorted — appending in same order is a no-op).
 */
function sortPericiaRows(root: HTMLElement): void {
    const skillsList = root.querySelector<HTMLUListElement>("ul.skills-list");
    if (!skillsList) return;

    const rows = Array.from(
        skillsList.querySelectorAll<HTMLElement>(".skill.flexrow:not(.item-header)")
    );
    if (rows.length < 2) return;

    const getLabel = (el: HTMLElement): string => {
        const txt = el.querySelector(".item-name")?.textContent ?? "";
        // Strip *, +, whitespace; lowercase for stable sort
        return txt.replace(/[*+\s]+/g, " ").trim().toLowerCase();
    };

    rows.sort((a, b) => getLabel(a).localeCompare(getLabel(b), "pt-BR"));

    // Re-append rows in sorted order; the header (.item-header) stays first
    // because we never move it.
    rows.forEach(row => skillsList.appendChild(row));
}

// ── Auto-apply per-item toggle buttons (GM only) ─────────────────────────────
// Flag armazenada NO ATOR (não no item) como mapa { [itemId]: boolean }
// sob a chave "autoApplyItems". Isso evita depender de lookups frágeis
// de item em mensagens de chat e garante consistência com o actor disponível.

type AutoApplyMap = Record<string, boolean>;

function injectAutoApplyItemButtons(root: HTMLElement, actor: FoundryActor | undefined): void {
    if (!game.user?.isGM) return;
    if (!actor || (actor as unknown as { type?: string }).type !== "character") return;

    type ActorWithFlags = FoundryActor & {
        getFlag(scope: string, key: string): unknown;
        setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    };
    const actorF = actor as ActorWithFlags;

    root.querySelectorAll<HTMLElement>("[data-item-id]").forEach(row => {
        const itemId = row.dataset["itemId"];
        if (!itemId) return;

        // Evita injeção dupla ao re-renderizar
        if (row.querySelector(".t20-aa-item-btn")) return;

        const item = actor.items?.get(itemId);
        if (!item) return;

        const itype = (item as unknown as { type?: string }).type;
        if (itype !== "magia" && itype !== "poder") return;

        // Lê estado atual do mapa no ator
        const map  = (actorF.getFlag(MODULE_ID, "autoApplyItems") as AutoApplyMap | undefined) ?? {};
        const isOn = map[itemId] ?? false;

        const btn = document.createElement("a");
        btn.className = `t20-aa-item-btn${isOn ? " t20-aa-on" : ""}`;
        btn.title = isOn
            ? "Auto-apply buff: LIGADO (clique para desligar)"
            : "Auto-apply buff: DESLIGADO (clique para ligar)";
        btn.innerHTML = `<i class="fas fa-bolt-lightning"></i>`;

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Relê o mapa atual para não perder mudanças concorrentes
            const cur  = (actorF.getFlag(MODULE_ID, "autoApplyItems") as AutoApplyMap | undefined) ?? {};
            const next = !(cur[itemId] ?? false);
            void actorF.setFlag(MODULE_ID, "autoApplyItems", { ...cur, [itemId]: next }).then(() => {
                btn.classList.toggle("t20-aa-on", next);
                btn.title = next
                    ? "Auto-apply buff: LIGADO (clique para desligar)"
                    : "Auto-apply buff: DESLIGADO (clique para ligar)";
            });
        });

        // Injeta ANTES de .item-controls (como irmão, não filho)
        // → fica sempre visível sem depender do hover que mostra as controls
        const controls = row.querySelector(".item-controls");
        if (controls) {
            row.insertBefore(btn, controls);
        } else {
            row.appendChild(btn);
        }
    });
}

// ── Public entry point ────────────────────────────────────────────────────────

const SHEET_STYLES_ID = "t20-sheet-redesign-styles";

export function setupSheetRedesign(): void {
    if (!document.getElementById(SHEET_STYLES_ID)) {
        const el = document.createElement("style");
        el.id = SHEET_STYLES_ID;
        el.textContent = SHEET_STYLES;
        document.head.appendChild(el);
    }

    Hooks.on("renderActorSheet", (...args: unknown[]): void => {
        const app     = args[0] as { actor?: FoundryActor };
        const htmlArg = args[1] as unknown;
        let root: HTMLElement | undefined;
        if (htmlArg instanceof HTMLElement) root = htmlArg;
        else if (Array.isArray(htmlArg)) root = htmlArg[0] as HTMLElement | undefined;
        else if (htmlArg && typeof htmlArg === "object")
            root = (htmlArg as Record<string, unknown>)[0] as HTMLElement | undefined;
        if (!(root instanceof HTMLElement)) return;
        enhanceSheet(root);
        injectAutoApplyItemButtons(root, app?.actor);
    });

    // Spell sheets have many details fields (728px+ of content) so the generic
    // 620×480 default leaves the window too wide and the details tab cramped.
    // Apply a better initial size only on first render; respect later user resizes.
    Hooks.on("renderItemSheetT20", (...hookArgs: unknown[]): void => {
        const app = hookArgs[0] as Record<string, unknown>;
        const item = app.item as Record<string, unknown> | undefined;
        if (item?.type !== "magia") return;
        if (_resizedSpellSheets.has(app)) return;
        _resizedSpellSheets.add(app);
        const setPos = app.setPosition as ((opts: Record<string, number>) => void) | undefined;
        setPos?.call(app, { width: 520, height: 620 });
    });

    log("Sheet redesign ativo.");
}
