/**
 * Footer HUD — substitui a hotbar/macro-bar nativa do Foundry por uma HUD
 * customizada (orbes de PV/PM, retrato, grid de perícias/poderes/magias/
 * inventário/macros). Ver plano em `C:\Users\lucas\.claude\plans\modular-sprouting-goose.md`.
 *
 * O override de `CONFIG.ui.hotbar` PRECISA acontecer no hook `init`, antes de
 * `Game#initializeUI()` instanciar `ui.hotbar` — por isso `registerFooterHud()`
 * é chamado a partir do hook `init` já existente em `main.ts`, não do `setup`.
 */
import { getActiveActor } from "./active-actor";
import { registerMobileModeSetting, wireMobileModeReactivity } from "./mobile-mode";
import { registerCustomOrderSetting, registerRowsSetting } from "./state";
import { T20FooterHud } from "./T20FooterHud";

/** Registra a classe da HUD em CONFIG.ui.hotbar. Chamar no hook `init`. */
export function registerFooterHud(): void {
    (CONFIG as unknown as { ui: Record<string, unknown> }).ui["hotbar"] = T20FooterHud;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Re-renderiza a HUD, debounced (evita rajadas de hooks disparando renders redundantes). */
function scheduleHudRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        refreshTimer = null;
        const hotbar = (ui as unknown as { hotbar?: { render: (opts?: { force?: boolean }) => void } }).hotbar;
        hotbar?.render();
    }, 24);
}

/** true se `candidateId` é o ator (ou ator-dono do item) atualmente ativo na HUD. */
function affectsActiveActor(candidateActorId: string | undefined | null): boolean {
    if (!candidateActorId) return false;
    return getActiveActor()?.id === candidateActorId;
}

/** Liga listeners/hooks adicionais da HUD. Chamar no hook `setup`. */
export function setupFooterHud(): void {
    registerRowsSetting();
    registerCustomOrderSetting();
    registerMobileModeSetting();
    wireMobileModeReactivity();

    Hooks.on("controlToken", () => scheduleHudRefresh());
    Hooks.on("canvasReady", () => scheduleHudRefresh());
    Hooks.on("updateUser", () => scheduleHudRefresh());

    Hooks.on("updateActor", (...args: unknown[]) => {
        const doc = args[0] as { id?: string } | undefined;
        if (affectsActiveActor(doc?.id)) scheduleHudRefresh();
    });

    const onItemChange = (...args: unknown[]): void => {
        const item = args[0] as { actor?: { id?: string } | null; parent?: { id?: string } | null } | undefined;
        const actorId = item?.actor?.id ?? item?.parent?.id;
        if (affectsActiveActor(actorId)) scheduleHudRefresh();
    };
    Hooks.on("createItem", onItemChange);
    Hooks.on("updateItem", onItemChange);
    Hooks.on("deleteItem", onItemChange);

    // Indicador de combate + "Finalizar Turno" (Fase 6): qualquer mudança no
    // encontro ativo pode afetar `combat.started`/`combat.combatant.players`.
    Hooks.on("combatStart", () => scheduleHudRefresh());
    Hooks.on("combatTurnChange", () => scheduleHudRefresh());
    Hooks.on("deleteCombat", () => scheduleHudRefresh());
    Hooks.on("updateCombat", () => scheduleHudRefresh());
}
