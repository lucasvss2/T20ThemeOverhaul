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

const CUSTOM_ORDER_SETTING = "hud.customOrder";
type CustomOrderMap = Record<string, Record<string, string[]>>; // actorId -> listKey ("skills"|RightTabKey) -> ordered keys

/** Aba do modo mobile (Fase 2) — inclui "pericias" (não existe no painel direito desktop, que fica ao lado da grade de perícias, não misturado com ela). Estado independente do `rightTab` desktop — trocar de aba num modo não deve mexer no outro. */
export type MobileTabKey = RightTabKey | "pericias";

interface HudUiState {
    rightTab: RightTabKey;
    skillsPage: number;
    rightPage: number;
    mobileTab: MobileTabKey;
    mobilePage: number;
}

const state: HudUiState = { rightTab: "poderes", skillsPage: 0, rightPage: 0, mobileTab: "pericias", mobilePage: 0 };

export function getRightTab(): RightTabKey { return state.rightTab; }
export function setRightTab(tab: RightTabKey): void { state.rightTab = tab; state.rightPage = 0; }

export function getSkillsPage(): number { return state.skillsPage; }
export function setSkillsPage(page: number): void { state.skillsPage = page; }

export function getRightPage(): number { return state.rightPage; }
export function setRightPage(page: number): void { state.rightPage = page; }

export function getMobileTab(): MobileTabKey { return state.mobileTab; }
export function setMobileTab(tab: MobileTabKey): void { state.mobileTab = tab; state.mobilePage = 0; }

export function getMobilePage(): number { return state.mobilePage; }
export function setMobilePage(page: number): void { state.mobilePage = page; }

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

/** Registra o client setting de ordem customizada (drag-and-drop) dos grids. Chamar em `setupFooterHud()`. */
export function registerCustomOrderSetting(): void {
    game.settings.register(MODULE_ID, CUSTOM_ORDER_SETTING, {
        scope: "client", config: false, type: Object, default: {},
    });
}

function readOrderMap(): CustomOrderMap {
    const raw = game.settings.get(MODULE_ID, CUSTOM_ORDER_SETTING);
    return raw && typeof raw === "object" ? raw as CustomOrderMap : {};
}

/** Ordem customizada (chaves) salva pro `actorId`+`listKey` ("skills" ou uma `RightTabKey"). Vazio = sem customização. */
export function getCustomOrder(actorId: string | undefined, listKey: string): string[] {
    if (!actorId) return [];
    return readOrderMap()[actorId]?.[listKey] ?? [];
}

export async function setCustomOrder(actorId: string, listKey: string, order: string[]): Promise<void> {
    const map = readOrderMap();
    map[actorId] = { ...(map[actorId] ?? {}), [listKey]: order };
    await game.settings.set(MODULE_ID, CUSTOM_ORDER_SETTING, map);
}
