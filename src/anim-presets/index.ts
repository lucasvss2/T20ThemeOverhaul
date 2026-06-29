/**
 * Memória de animações de skills (Automated Animations) — v1.67.0
 *
 * Memoriza a config de animação (`item.flags.autoanimations`) por magia/poder e
 * oferece reaplicá-la quando a skill é adicionada a um personagem (ou quando já
 * está na ficha mas sem animação). Duas camadas (decisão do usuário):
 *   - BUNDLED: `bundled-presets.ts` (distribuído no módulo).
 *   - OVERRIDE do mundo: setting `animPresets` (capturas/edições por mundo).
 *   World vence bundled no merge.
 *
 * Portabilidade (decisão do usuário): guardamos a config COMPLETA, incluindo a
 * referência de macro. Se a macro/módulo não existir no mundo de destino, o
 * prompt avisa, mas a config é aplicável mesmo assim (anima quando as deps
 * estiverem presentes).
 *
 * Gatilhos:
 *   - `createItem` (magia/poder adicionada) → oferece aplicar (1 vez).
 *   - Ação no skills-menu "Animações: verificar ficha" → varre a ficha
 *     selecionada e oferece para magias sem animação que tenham preset.
 *   - Checkbox "não oferecer novamente" → setting `animPresetsDontAsk`.
 *
 * Captura inicial: `game.modules.get(MODULE_ID).api.captureActorAnimations(actor)`
 * lê os `flags.autoanimations` das magias/poderes do ator e salva no override.
 */

import { MODULE_ID } from "@/constants";
import { normalizeCondName } from "@/spell-resistance/index";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import { log, warn } from "@/utils/logging";
import { BUNDLED_ANIM_PRESETS, type AnimPreset } from "./bundled-presets";

const SETTING_PRESETS  = "animPresets";        // world override (Object)
const SETTING_DONTASK  = "animPresetsDontAsk"; // world (Object: { [norm]: true })
const SETTING_ENABLED  = "animPresets.enabled"; // world Boolean (gate do prompt)

type AAItem = {
    name: string;
    type: string;
    flags?: Record<string, unknown>;
    parent?: { documentName?: string } | null;
    update(data: Record<string, unknown>): Promise<unknown>;
};

// ── Settings ─────────────────────────────────────────────────────────────────

function getWorldPresets(): Record<string, AnimPreset> {
    return (game.settings?.get(MODULE_ID, SETTING_PRESETS) as Record<string, AnimPreset>) ?? {};
}
async function setWorldPresets(v: Record<string, AnimPreset>): Promise<void> {
    await game.settings?.set(MODULE_ID, SETTING_PRESETS, v);
}
function getDontAsk(): Record<string, boolean> {
    return (game.settings?.get(MODULE_ID, SETTING_DONTASK) as Record<string, boolean>) ?? {};
}
async function addDontAsk(norm: string): Promise<void> {
    const cur = getDontAsk();
    cur[norm] = true;
    await game.settings?.set(MODULE_ID, SETTING_DONTASK, cur);
}
function promptEnabled(): boolean {
    return game.settings?.get(MODULE_ID, SETTING_ENABLED) !== false;
}

/** Merge bundled + override do mundo (world vence). */
function getMergedPresets(): Record<string, AnimPreset> {
    return { ...BUNDLED_ANIM_PRESETS.presets, ...getWorldPresets() };
}
function getPreset(name: string): AnimPreset | undefined {
    return getMergedPresets()[normalizeCondName(name)];
}

// ── Módulos / item ───────────────────────────────────────────────────────────

function moduleActive(id: string): boolean {
    return !!game.modules?.get(id)?.active;
}
function missingModules(preset: AnimPreset): string[] {
    return (preset.requiredModules ?? []).filter(id => !moduleActive(id));
}
function itemHasAnimation(item: AAItem): boolean {
    return !!item.flags?.["autoanimations"];
}

// ── Captura ──────────────────────────────────────────────────────────────────

/** Lê os flags.autoanimations das magias/poderes do ator → salva no override. */
async function captureActorAnimations(actor: {
    name?: string;
    items?: { contents?: AAItem[] } | AAItem[];
}): Promise<number> {
    const items: AAItem[] = Array.isArray(actor?.items)
        ? actor.items
        : (actor?.items?.contents ?? []);
    const world = getWorldPresets();
    let n = 0;
    for (const it of items) {
        if (it.type !== "magia" && it.type !== "poder") continue;
        const aa = it.flags?.["autoanimations"] as Record<string, unknown> | undefined;
        if (!aa) continue;
        const raw = JSON.stringify(aa);
        const mods = new Set<string>(["sequencer", "autoanimations"]);
        for (const m of raw.matchAll(/modules\/([A-Za-z0-9_-]+)\//g)) mods.add(m[1]!);
        world[normalizeCondName(it.name)] = {
            displayName:     it.name,
            itemType:        it.type,
            requiredModules: Array.from(mods),
            autoanimations:  aa,
        };
        n++;
    }
    if (n > 0) await setWorldPresets(world);
    log(`anim-presets: capturadas ${n} animação(ões) de "${actor?.name ?? "?"}".`);
    return n;
}

// ── Aplicação + prompt ───────────────────────────────────────────────────────

async function applyPreset(item: AAItem, preset: AnimPreset): Promise<void> {
    try {
        await item.update({ "flags.autoanimations": preset.autoanimations });
        ui.notifications?.info(`Animação aplicada a "${item.name}".`);
    } catch (err) {
        warn(`anim-presets: falha ao aplicar animação em "${item.name}":`, err);
    }
}

function escHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Oferece aplicar a animação memorizada de `item`, se houver preset, o item
 * estiver SEM animação e a magia não estiver em "não oferecer novamente".
 */
async function offerForItem(item: AAItem): Promise<void> {
    if (!promptEnabled()) return;
    if (item.type !== "magia" && item.type !== "poder") return;
    if (itemHasAnimation(item)) return;
    const norm = normalizeCondName(item.name);
    if (getDontAsk()[norm]) return;
    const preset = getPreset(item.name);
    if (!preset) return;

    const missing = missingModules(preset);
    const modsHtml = (preset.requiredModules ?? []).map(id => {
        const ok = moduleActive(id);
        return `<li style="color:${ok ? "#6ecf7a" : "#cc4444"}">${ok ? "✓" : "✗"} ${escHtml(id)}</li>`;
    }).join("");
    const missingNote = missing.length
        ? `<p style="color:#cc4444;margin:.4em 0 0">Módulos ausentes: <strong>${missing.map(escHtml).join(", ")}</strong>. A config será salva mesmo assim e animará quando eles estiverem instalados/ativos.</p>`
        : `<p style="color:#6ecf7a;margin:.4em 0 0">Todos os módulos necessários estão ativos.</p>`;

    const content = `
        <div class="t20-anim-preset-prompt">
            <p>Há uma animação memorizada para <strong>${escHtml(preset.displayName)}</strong>. Deseja aplicá-la a este item?</p>
            <p style="margin:.3em 0 .1em;color:#9a8e7a">Módulos de animação necessários:</p>
            <ul style="margin:.1em 0 .2em 1.1em;padding:0">${modsHtml}</ul>
            ${missingNote}
            <label style="display:flex;gap:.4em;align-items:center;margin-top:.6em;color:#9a8e7a">
                <input type="checkbox" name="dontask"/> Não oferecer novamente para esta magia
            </label>
        </div>`;

    return new Promise<void>((resolve) => {
        const DialogCls = (globalThis as { Dialog?: unknown }).Dialog as {
            new (cfg: unknown, opts?: unknown): { render(force: boolean): void };
        };
        const readDontAsk = (html: unknown): boolean => {
            const root = (html as { find?: (s: string) => { is?: (s: string) => boolean }[] });
            try {
                const el = (root as unknown as { 0?: HTMLElement })[0]
                    ?? (root as unknown as HTMLElement);
                const cb = (el as HTMLElement)?.querySelector?.('input[name="dontask"]') as HTMLInputElement | null;
                return !!cb?.checked;
            } catch { return false; }
        };
        const dlg = new DialogCls({
            title: `Animação memorizada — ${preset.displayName}`,
            content,
            buttons: {
                apply: {
                    label: "Aplicar",
                    callback: async (html: unknown) => {
                        if (readDontAsk(html)) await addDontAsk(norm);
                        await applyPreset(item, preset);
                        resolve();
                    },
                },
                no: {
                    label: "Agora não",
                    callback: async (html: unknown) => {
                        if (readDontAsk(html)) await addDontAsk(norm);
                        resolve();
                    },
                },
            },
            default: "apply",
            close: () => resolve(),
        }, { classes: ["t20-dialog", "t20-anim-preset-dialog"] });
        dlg.render(true);
    });
}

/** Varre a ficha e oferece (sequencial) para magias sem animação com preset. */
async function scanActorForOffers(actor: {
    name?: string; items?: { contents?: AAItem[] } | AAItem[];
}): Promise<void> {
    const items: AAItem[] = Array.isArray(actor?.items) ? actor.items : (actor?.items?.contents ?? []);
    const dontAsk = getDontAsk();
    const candidates = items.filter(it =>
        (it.type === "magia" || it.type === "poder") &&
        !itemHasAnimation(it) &&
        !dontAsk[normalizeCondName(it.name)] &&
        getPreset(it.name)
    );
    if (candidates.length === 0) {
        ui.notifications?.info("Nenhuma magia sem animação com preset disponível nesta ficha.");
        return;
    }
    for (const it of candidates) await offerForItem(it); // sequencial
}

function resolveScanTarget(): { name?: string; items?: { contents?: AAItem[] } } | null {
    const controlled = (canvas?.tokens?.controlled ?? []) as Array<{ actor?: unknown }>;
    if (controlled[0]?.actor) return controlled[0].actor as { name?: string; items?: { contents?: AAItem[] } };
    const ch = (game.user as { character?: unknown } | undefined)?.character;
    return (ch as { name?: string; items?: { contents?: AAItem[] } }) ?? null;
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function setupAnimPresets(): void {
    game.settings?.register(MODULE_ID, SETTING_ENABLED, {
        name: "Animações: oferecer ao adicionar skills",
        hint: "Quando ativo, ao adicionar uma magia/poder com animação memorizada, o módulo oferece aplicá-la.",
        scope: "world", config: true, type: Boolean, default: true,
    });
    game.settings?.register(MODULE_ID, SETTING_PRESETS, {
        scope: "world", config: false, type: Object, default: {},
    });
    game.settings?.register(MODULE_ID, SETTING_DONTASK, {
        scope: "world", config: false, type: Object, default: {},
    });

    // Skills-menu: varrer a ficha selecionada (cobre magias já adicionadas).
    registerSkillAction({
        id:    "anim-presets-scan",
        label: "Animações: verificar ficha",
        icon:  "fa-wand-magic-sparkles",
        color: "#c8a96e",
        isVisible: () => promptEnabled() && Object.keys(getMergedPresets()).length > 0,
        onClick: () => {
            const target = resolveScanTarget();
            if (!target) { ui.notifications?.warn("Selecione um token (ou defina seu personagem) para verificar as animações."); return; }
            void scanActorForOffers(target);
        },
    });

    // Magia/poder adicionada → oferece (só no cliente que adicionou).
    Hooks.on("createItem", (...args: unknown[]) => {
        const item   = args[0] as AAItem;
        const userId = args[2] as string | undefined;
        if (userId && userId !== game.user?.id) return;
        if (item?.parent?.documentName !== "Actor") return;
        if (item.type !== "magia" && item.type !== "poder") return;
        // Defer: deixa o item assentar antes de abrir o diálogo.
        setTimeout(() => void offerForItem(item), 200);
    });

    refreshSkillsMenu();
    log("anim-presets: memória de animações de skills ativa.");
}

// API exposta no ready (main.ts).
export { captureActorAnimations, scanActorForOffers };
