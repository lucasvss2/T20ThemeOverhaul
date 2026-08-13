import { MODULE_ID } from "@/constants";
import { warn } from "@/utils/logging";

/**
 * Registro compartilhado de ações de skills ativas + acesso aos compêndios
 * do módulo — consumido pela aba "T20 Overhaul" na sidebar nativa
 * (`T20OverhaulTab.ts`, ver `sidebar.d.ts` pro mecanismo de registro de aba).
 *
 * Cada sistema (Consagrar, Aura Sagrada, etc.) registra ações via
 * `registerSkillAction({ id, label, icon, isVisible, onClick })` em seu
 * `setup*()` — API inalterada desde v1.8.0. `isVisible()` é avaliada SOB
 * DEMANDA toda vez que a aba re-renderiza, então mudanças de estado (área
 * aplicada/removida, troca de cena, etc.) aparecem corretamente sem precisar
 * re-registrar nada.
 *
 * v1.112.0: o botão consolidado saiu da toolbar de scene-controls (esquerda)
 * pra virar um ícone na barra de abas da sidebar (direita), abrindo um
 * Dialog. v1.113.0: deixou de ser um Dialog — agora é uma aba DE VERDADE
 * (`T20OverhaulTab`), então este arquivo virou só o REGISTRO puro (sem DOM
 * nenhum); `refreshSkillsMenu()` apenas pede pra `ui.t20Overhaul` (se já
 * existir) re-renderizar.
 */

export interface SkillAction {
    /** ID único da ação (e.g. "consagrar-remove", "aura-sagrada-cancel"). */
    id: string;
    /** Label curto exibido no menu (e.g. "Remover Consagrar"). */
    label: string;
    /** Classe Font Awesome (e.g. "fa-solid fa-circle-xmark"). */
    icon: string;
    /** Cor opcional do ícone (e.g. "#ffb84d"). */
    color?: string;
    /**
     * Função síncrona: deve a ação estar visível AGORA pro usuário atual?
     * Costuma checar GM-ness + ownership de templates do próprio usuário.
     */
    isVisible(): boolean;
    /** Execução da ação (geralmente abre um Dialog de confirmação/picker). */
    onClick(): void | Promise<void>;
}

const _actions = new Map<string, SkillAction>();

export function registerSkillAction(action: SkillAction): void {
    _actions.set(action.id, action);
    refreshSkillsMenu();
}

export function unregisterSkillAction(id: string): void {
    _actions.delete(id);
    refreshSkillsMenu();
}

/** Ações atualmente visíveis pro usuário corrente (avaliação sob demanda — nunca cacheada). */
export function getVisibleActions(): SkillAction[] {
    const out: SkillAction[] = [];
    for (const a of _actions.values()) {
        try {
            if (a.isVisible()) out.push(a);
        } catch (err) {
            warn(`skills-menu: isVisible() falhou para ${a.id}:`, err);
        }
    }
    return out;
}

/** Executa a ação `id` se ainda estiver visível (revalida — evita rodar algo que sumiu entre o render e o clique). */
export async function executeSkillAction(id: string): Promise<void> {
    const a = _actions.get(id);
    if (!a?.isVisible()) return;
    try {
        await a.onClick();
    } catch (err) {
        warn(`skills-menu: ação ${id} falhou:`, err);
    }
}

// ── Compêndios do módulo ────────────────────────────────────────────────────

export interface PackInfo { id: string; label: string }

interface PackLike {
    metadata: { packageName?: string; label?: string };
    collection: string;
    visible?: boolean;
    render: (force: boolean) => void;
}

function getPacksCollection(): { contents?: PackLike[]; get?: (id: string) => PackLike | undefined } | undefined {
    return (game as unknown as { packs?: { contents?: PackLike[]; get?: (id: string) => PackLike | undefined } }).packs;
}

/** Compêndios empacotados no módulo que o usuário atual tem permissão de ver (mesma checagem que a aba Compêndios nativa usa). */
export function getVisiblePacks(): PackInfo[] {
    const packs = getPacksCollection()?.contents ?? [];
    const out: PackInfo[] = [];
    for (const p of packs) {
        if (p.metadata?.packageName !== MODULE_ID) continue;
        if (p.visible === false) continue;
        out.push({ id: p.collection, label: p.metadata.label ?? p.collection });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Puro/testável — o rótulo de cada pack já vem prefixado "T20 Overhaul — "
 * (nome do módulo, ver module.json); redundante DENTRO da própria aba T20
 * Overhaul, então some daqui (não mexe no metadata real do pack). Fica neste
 * arquivo (e não em `T20OverhaulTab.ts`) porque este é livre de referências
 * a `foundry.*` no escopo do módulo — importável em teste sem mockar nada.
 */
export function stripPackLabelPrefix(label: string): string {
    return label.replace(/^T20 Overhaul — /, "");
}

/** Abre o browser nativo do compêndio (mesmo efeito de clicar nele na aba Compêndios). */
export function openCompendium(id: string): void {
    try {
        getPacksCollection()?.get?.(id)?.render(true);
    } catch (err) {
        warn(`skills-menu: falha ao abrir o compêndio ${id}:`, err);
    }
}

// ── Refresh ──────────────────────────────────────────────────────────────────

/** Pede pra aba "T20 Overhaul" (se já instanciada em `ui.t20Overhaul`) re-renderizar. No-op antes do boot terminar. */
export function refreshSkillsMenu(): void {
    const tab = (ui as unknown as { t20Overhaul?: { render: (opts?: { force?: boolean }) => unknown } }).t20Overhaul;
    try {
        tab?.render();
    } catch (err) {
        warn("skills-menu: falha ao re-renderizar a aba T20 Overhaul:", err);
    }
}

/**
 * Liga listeners genéricos pra refrescar a aba quando o cenário muda.
 * Sistemas individuais ainda chamam `refreshSkillsMenu()` em seus próprios
 * eventos relevantes (criação/remoção de template, etc.).
 */
export function setupSkillsMenu(): void {
    Hooks.on("renderSidebar", () => refreshSkillsMenu());
    Hooks.once("ready", () => refreshSkillsMenu());
    Hooks.on("canvasReady", () => refreshSkillsMenu());
}
