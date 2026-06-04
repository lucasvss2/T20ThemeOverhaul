import DIALOG_STYLES from "./bg3-dialog.css?inline";

/**
 * BG3-style visual restyling for Tormenta20 roll dialogs.
 */

const DIALOG_STYLES_ID = "bg3-t20-dialog-styles";

// ── CSS ───────────────────────────────────────────────────────────────────────



// ── Attribute / ability name table (t20 keys → Portuguese display names) ─────

const T20_ABILITY_LABELS: Record<string, string> = {
    // Atributos
    for: "Força",   str: "Força",
    des: "Destreza", dex: "Destreza",
    con: "Constituição",
    int: "Inteligência",
    sab: "Sabedoria", wis: "Sabedoria",
    car: "Carisma",   cha: "Carisma",
    // Resistências
    fort: "Fortitude",
    ref:  "Reflexos",
    vont: "Vontade",  will: "Vontade",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDialogStyles(): void {
    if (!document.getElementById(DIALOG_STYLES_ID)) {
        const el = document.createElement("style");
        el.id = DIALOG_STYLES_ID;
        el.textContent = DIALOG_STYLES;
        document.head.appendChild(el);
    }
}

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractLabel(title: string): string {
    const colonIdx = title.lastIndexOf(":");
    if (colonIdx !== -1) return title.slice(colonIdx + 1).trim();
    return title.trim();
}

function isValidName(v: unknown): v is string {
    return typeof v === "string" && v.trim().length > 0 && v.trim().toLowerCase() !== "undefined";
}

const PLACEHOLDER_IMGS = [
    "icons/svg/mystery-man.svg",
    "icons/svg/item-bag.svg",
    "icons/svg/coin.svg",
];

/**
 * Try to map an ability key (e.g. "for", "fort") to its display name.
 * Returns empty string when no match is found.
 */
function abilityKeyToLabel(key: unknown): string {
    if (typeof key !== "string" || !key) return "";
    return T20_ABILITY_LABELS[key.toLowerCase()] ?? "";
}

/**
 * Look for an attribute/ability key in every plausible location on the app
 * object or in the rendered DOM, then return the Portuguese display name.
 */
function resolveAbilityName(app: AppLike, el: HTMLElement): string {
    const a = app as Record<string, unknown>;
    const opts = a.options as Record<string, unknown> | undefined;

    // t20 AbilityUseDialog: item.id is the raw attribute key (e.g. "des", "for")
    // item.parts is a dice parts array like ["1d20", "@des"] — join and parse the @key
    const appItem = app.item;
    if (appItem) {
        const label = abilityKeyToLabel(appItem.id);
        if (label) return label;

        const rawParts = appItem.parts;
        const parts = Array.isArray(rawParts) ? rawParts.join(",") : (rawParts ?? "");
        const atMatch = parts.match(/@([a-z]+)/i);
        if (atMatch) {
            const fromParts = abilityKeyToLabel(atMatch[1]);
            if (fromParts) return fromParts;
        }
    }

    // Direct properties and options
    for (const v of [
        a.ability, a.attribute, a.save, a.skill, a.type,
        opts?.ability, opts?.attribute, opts?.save, opts?.skill, opts?.itemType,
    ]) {
        const label = abilityKeyToLabel(v);
        if (label) return label;
    }

    // Hidden inputs — t20 often serialises the ability key into the form
    for (const inp of el.querySelectorAll<HTMLInputElement>("input[type=hidden]")) {
        const label = abilityKeyToLabel(inp.value) || abilityKeyToLabel(inp.name);
        if (label) return label;
    }

    // Data-attribute shortcuts on arbitrary elements
    for (const attr of ["data-ability", "data-attribute", "data-save", "data-skill"]) {
        const val = el.querySelector(`[${attr}]`)?.getAttribute(attr);
        if (val) {
            const label = abilityKeyToLabel(val);
            if (label) return label;
        }
    }

    return "";
}

/**
 * Force readable text color on all text-bearing descendants of the dialog.
 * Uses inline style with priority "important" to beat any system !important rule.
 * Called immediately on render AND scheduled for 200 ms later to cover any
 * post-render DOM mutations performed by the t20 system.
 */
function forceTextVisibility(el: HTMLElement): void {
    el.querySelectorAll<HTMLElement>(
        "td, td *, tr td *, p, span, small, li, h1, h2, h3, h4, h5, h6, label"
    ).forEach((node) => {
        if (node.matches(
            "input, select, button, " +
            ".bg3-skill-name, .bg3-skill-divider, .bg3-skill-banner, .bg3-banner-row, .bg3-skill-img"
        )) return;
        node.style.setProperty("color", "#c8bfa0", "important");
    });

    // Restore muted gold for form-row field-name labels
    el.querySelectorAll<HTMLElement>(".form-group > label").forEach((node) => {
        node.style.setProperty("color", "#8a7450", "important");
    });

    // Restore gold for the banner name
    el.querySelectorAll<HTMLElement>(".bg3-skill-name").forEach((node) => {
        node.style.setProperty("color", "#c8a96e", "important");
    });
}

type AppLike = {
    options?: { title?: string };
    title?: string;
    object?: { name?: string; img?: string };
    item?: { name?: string; img?: string; id?: string; parts?: string | string[] };
};

/**
 * Add the BG3 class + inject a skill-name banner (with optional image).
 * Accepts optional template data from hook args[2].
 */
function stylizeDialog(
    app: AppLike,
    htmlArg: unknown,
    templateData?: Record<string, unknown>,
): void {
    let el: HTMLElement | null = null;
    if (htmlArg instanceof HTMLElement) {
        el = htmlArg;
    } else if (htmlArg && typeof htmlArg === "object") {
        el = (htmlArg as Record<string, unknown>)[0] as HTMLElement | null;
    }
    if (!el) return;

    el.classList.add("bg3-dialog");

    // Apply immediately and again after 200 ms to catch any post-render DOM updates
    forceTextVisibility(el);
    const elRef = el;
    setTimeout(() => forceTextVisibility(elRef), 200);

    if (el.querySelector(".bg3-skill-banner")) return;

    // ── Resolve item name ────────────────────────────────────────────────────

    const tdItem = templateData?.["item"] as { name?: string; img?: string } | undefined;
    const opts = (app as Record<string, unknown>).options as Record<string, unknown> | undefined;
    const optsItem = opts?.["item"] as { name?: string; img?: string } | undefined;

    const nameSources: unknown[] = [
        app.object?.name, app.item?.name,
        tdItem?.name, optsItem?.name,
        opts?.["ability"], opts?.["skill"],
    ];
    const itemName = (nameSources.find(isValidName) as string | undefined) ?? "";

    // ── Resolve item image ───────────────────────────────────────────────────

    const imgSources = [app.object?.img, app.item?.img, tdItem?.img, optsItem?.img];
    const itemImg =
        imgSources.find(
            (s): s is string =>
                typeof s === "string" &&
                s.length > 0 &&
                !PLACEHOLDER_IMGS.some((p) => s.includes(p)),
        ) ?? "";

    // ── Resolve display label ────────────────────────────────────────────────

    const rawTitle: string = app.title ?? app.options?.title ?? "";
    const titleLabel = extractLabel(rawTitle);

    let label = isValidName(titleLabel) ? titleLabel : itemName;

    // Last resort for attribute rolls: scan the app object and DOM for ability key
    if (!label) {
        label = resolveAbilityName(app, el);
    }

    if (!label) return;

    // ── Fix window title if t20 left "undefined" in it ──────────────────────
    const titleEl = el.querySelector<HTMLElement>(".window-title");
    const titleTextNode = titleEl?.childNodes[0];
    if (titleTextNode && titleEl?.textContent?.toLowerCase().includes("undefined")) {
        titleTextNode.textContent = titleEl.textContent.replace("undefined", label);
    }

    // ── Build and inject banner ──────────────────────────────────────────────

    const imgHtml = itemImg
        ? `<img class="bg3-skill-img" src="${itemImg}" alt="" />`
        : "";

    const banner = document.createElement("div");
    banner.className = "bg3-skill-banner";
    banner.innerHTML = `
        <div class="bg3-banner-row">
            ${imgHtml}
            <div class="bg3-skill-name">${esc(label)}</div>
        </div>
        <div class="bg3-skill-divider"></div>
    `;

    const target =
        el.querySelector("form") ??
        el.querySelector(".window-content") ??
        el;
    target.prepend(banner);
}

// ── Resize + scroll helpers ───────────────────────────────────────────────────

function syncContentHeight(appEl: HTMLElement): void {
    const header = appEl.querySelector<HTMLElement>(".window-header");
    const content = appEl.querySelector<HTMLElement>(".window-content");
    if (!content) return;
    const headerH = header?.offsetHeight ?? 32;
    const h = Math.max(80, appEl.offsetHeight - headerH);
    content.style.setProperty("height", `${h}px`, "important");
    content.style.setProperty("overflow-y", "auto", "important");
}

function attachResizeDrag(handle: HTMLElement, appEl: HTMLElement): void {
    handle.dataset.bg3Resize = "1";
    handle.addEventListener("mousedown", (startEvent: MouseEvent) => {
        startEvent.preventDefault();
        startEvent.stopPropagation();
        const startX = startEvent.clientX;
        const startY = startEvent.clientY;
        const startW = appEl.offsetWidth;
        const startH = appEl.offsetHeight;
        const onMove = (ev: MouseEvent): void => {
            const newW = Math.max(480, startW + ev.clientX - startX);
            const newH = Math.max(300, startH + ev.clientY - startY);
            appEl.style.setProperty("width", `${newW}px`, "important");
            appEl.style.setProperty("height", `${newH}px`, "important");
            syncContentHeight(appEl);
        };
        const onUp = (): void => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });
}

function ensureResizeHandle(appEl: HTMLElement): void {
    let handle = appEl.querySelector<HTMLElement>(".window-resizable-handle");
    if (!handle) {
        handle = document.createElement("div");
        handle.className = "window-resizable-handle";
        appEl.appendChild(handle);
    }
    if (!handle.dataset.bg3Resize) attachResizeDrag(handle, appEl);
}

// ── Public setup ──────────────────────────────────────────────────────────────

export function setupDialogStyling(): void {
    ensureDialogStyles();

    // Patch AbilityUseDialog to be resizable with a sensible initial height.
    // Must run after ready so game.tormenta20.applications is populated.
    Hooks.once("ready", (): void => {
        const cls = (game as Record<string, unknown> as Record<string, Record<string, Record<string, unknown>>>)
            .tormenta20?.applications?.AbilityUseDialog as (new (...a: unknown[]) => unknown) & { defaultOptions?: unknown } | undefined;
        if (!cls) return;
        const parentCls = Object.getPrototypeOf(cls) as { defaultOptions?: Record<string, unknown> };
        Object.defineProperty(cls, "defaultOptions", {
            get() {
                return { ...(parentCls?.defaultOptions ?? {}), resizable: true, height: 680 };
            },
            configurable: true,
        });
    });

    Hooks.on("renderAbilityUseDialog", (...args: unknown[]): void => {
        const app = args[0] as Record<string, unknown>;
        const htmlArg = args[1];

        let appEl: HTMLElement | null = null;
        if (htmlArg instanceof HTMLElement) appEl = htmlArg;
        else if (htmlArg && typeof htmlArg === "object")
            appEl = (htmlArg as Record<string, unknown>)[0] as HTMLElement | null;

        if (appEl) {
            ensureResizeHandle(appEl);
            if (appEl.offsetWidth > 800) {
                appEl.style.setProperty("width", "600px", "important");
            }
            // Sync after layout settles so offsetHeight is final
            const el = appEl;
            requestAnimationFrame(() => syncContentHeight(el));

            // Force-override inline colours on T20's "Custo de Mana Total" and
            // every other readout/input.  T20 ships these with dark text colours
            // that are illegible on our dark gradient.  setProperty(...,'important')
            // is the only way to reliably beat T20's inline styles.
            requestAnimationFrame(() => {
                el.querySelectorAll<HTMLElement>(
                    "input, output, progress, meter"
                ).forEach((field) => {
                    field.style.setProperty("color", "#f0e0b0", "important");
                    field.style.setProperty("font-weight", "700", "important");
                    field.style.setProperty("text-shadow", "0 0 4px rgba(0,0,0,0.6)", "important");
                });
            });
        }

        stylizeDialog(
            app as AppLike,
            htmlArg,
            args[2] as Record<string, unknown> | undefined,
        );
    });

    Hooks.on("renderDialog", (...args: unknown[]): void => {
        const htmlArg = args[1];
        let el: HTMLElement | null = null;
        if (htmlArg instanceof HTMLElement) el = htmlArg;
        else if (htmlArg && typeof htmlArg === "object")
            el = (htmlArg as Record<string, unknown>)[0] as HTMLElement | null;

        if (!el) return;
        if (!el.classList.contains("tormenta20") && !el.querySelector(".tormenta20")) return;

        stylizeDialog(
            args[0] as AppLike,
            htmlArg,
            args[2] as Record<string, unknown> | undefined,
        );
    });
}
