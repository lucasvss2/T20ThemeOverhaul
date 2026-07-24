/**
 * Estado de UI da HUD (aba ativa do painel direito, página de cada seção,
 * nº de linhas do grid). `rows` persiste via client setting (`hud.rows`,
 * registrado em `index.ts`); o resto é client-local, não persiste entre
 * reloads. Uma única instância — a HUD mostra só o ator ativo do cliente
 * por vez.
 */
import { MODULE_ID } from "@/constants";
import type { RightTabKey } from "./right-panel";

const ROWS_SETTING = "hud.rows";
export const MIN_ROWS = 1;
export const MAX_ROWS = 4;
export const DEFAULT_ROWS = 2;

interface HudUiState {
    rightTab: RightTabKey;
    skillsPage: number;
    rightPage: number;
}

const state: HudUiState = { rightTab: "poderes", skillsPage: 0, rightPage: 0 };

export function getRightTab(): RightTabKey { return state.rightTab; }
export function setRightTab(tab: RightTabKey): void { state.rightTab = tab; state.rightPage = 0; }

export function getSkillsPage(): number { return state.skillsPage; }
export function setSkillsPage(page: number): void { state.skillsPage = page; }

export function getRightPage(): number { return state.rightPage; }
export function setRightPage(page: number): void { state.rightPage = page; }

/** Registra o client setting de nº de linhas do grid. Chamar em `setupFooterHud()`. */
export function registerRowsSetting(): void {
    game.settings.register(MODULE_ID, ROWS_SETTING, {
        scope: "client", config: false, type: Number, default: DEFAULT_ROWS,
    });
}

export function getRows(): number {
    const v = Number(game.settings.get(MODULE_ID, ROWS_SETTING));
    return Number.isFinite(v) && v >= MIN_ROWS && v <= MAX_ROWS ? v : DEFAULT_ROWS;
}

export async function setRows(rows: number): Promise<void> {
    const clamped = Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows));
    await game.settings.set(MODULE_ID, ROWS_SETTING, clamped);
    state.skillsPage = 0;
    state.rightPage = 0;
}
