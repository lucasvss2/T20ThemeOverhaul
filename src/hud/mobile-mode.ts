/**
 * Modo mobile da HUD — layout compacto de tela cheia pra jogador acessando
 * pelo celular (sem app nativo: mesmo Foundry, mesma sessão, só uma UI
 * diferente acima de certa largura). Fase 1: setting + detecção + toggle +
 * esconder o chrome desktop (canvas/sidebar/scene-controls). A reestruturação
 * vertical do próprio painel da HUD (perícias/inventário como abas únicas de
 * tela cheia) é Fase 2 — depende de verificação ao vivo, não entra aqui.
 */
import { MODULE_ID } from "@/constants";

const SETTING_KEY = "hud.mobileMode";

/** Abaixo desta largura (px), o modo "auto" considera a tela como celular. Mesmo corte já usado no container query do modal de resistência (`.smf-body`, 600px). */
export const MOBILE_BREAKPOINT_PX = 600;

export type MobileModeSetting = "auto" | "mobile" | "desktop";
const MODES: MobileModeSetting[] = ["auto", "mobile", "desktop"];

/** Registra o client setting do modo mobile. Chamar em `setupFooterHud()`. */
export function registerMobileModeSetting(): void {
    game.settings.register(MODULE_ID, SETTING_KEY, {
        scope: "client", config: false, type: String, default: "auto",
    });
}

export function getMobileModeSetting(): MobileModeSetting {
    const v = game.settings.get(MODULE_ID, SETTING_KEY);
    return (MODES as string[]).includes(v as string) ? v as MobileModeSetting : "auto";
}

/** Avança auto → mobile → desktop → auto e persiste. Retorna o novo valor. */
export async function cycleMobileModeSetting(): Promise<MobileModeSetting> {
    const cur = getMobileModeSetting();
    const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length]!;
    await game.settings.set(MODULE_ID, SETTING_KEY, next);
    return next;
}

/**
 * Pura/testável: o modo explícito sempre vence (`mobile`/`desktop` força);
 * `auto` decide pela largura real da viewport contra `MOBILE_BREAKPOINT_PX`.
 */
export function isMobileModeActive(viewportWidth: number, setting: MobileModeSetting): boolean {
    if (setting === "mobile") return true;
    if (setting === "desktop") return false;
    return viewportWidth < MOBILE_BREAKPOINT_PX;
}

export function mobileModeIcon(setting: MobileModeSetting): string {
    if (setting === "mobile") return "fa-mobile-screen-button";
    if (setting === "desktop") return "fa-desktop";
    return "fa-arrows-rotate";
}

export function mobileModeLabel(setting: MobileModeSetting): string {
    if (setting === "mobile") return "Modo celular forçado — clique pra automático";
    if (setting === "desktop") return "Modo desktop forçado — clique pra automático";
    return "Automático (por largura de tela) — clique pra forçar celular";
}

const ROOT_CLASS = "t20-mobile-mode";

/** Aplica/remove a classe no <html> conforme o modo resolvido pra viewport atual. */
export function applyMobileModeClass(): void {
    const active = isMobileModeActive(window.innerWidth, getMobileModeSetting());
    document.documentElement.classList.toggle(ROOT_CLASS, active);
}

let reactivityWired = false;

/** Liga a reatividade a resize de janela (idempotente — chamar em `setupFooterHud()`). */
export function wireMobileModeReactivity(): void {
    if (reactivityWired) return;
    reactivityWired = true;
    applyMobileModeClass();
    window.addEventListener("resize", () => applyMobileModeClass());
}
