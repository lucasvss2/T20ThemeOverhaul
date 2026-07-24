/**
 * Indicador de combate + "Finalizar Turno". Decisão do usuário: só o GM
 * inicia/encerra um encontro de verdade; o jogador só vê o estado
 * (read-only). API confirmada lendo `client/documents/combat.mjs` do
 * Foundry v13.351 instalado: `combat.started = round > 0`,
 * `combat.endCombat()` já abre a confirmação nativa (`DialogV2.confirm`) e
 * deleta o documento; criar um encontro do zero replica
 * `CombatTracker#_onCombatCreate` (`Combat.create()` + `activate()`).
 */
export interface CombatVM {
    active: boolean;
    isMyTurn: boolean;
    canToggle: boolean;
}

interface CombatantLike { players?: Array<{ id: string }> }
interface CombatLike {
    started: boolean;
    combatant?: CombatantLike | null;
    startCombat(): Promise<unknown>;
    endCombat(): Promise<unknown>;
    nextTurn(): Promise<unknown>;
    activate?(opts?: { render?: boolean }): unknown;
}

function getCombat(): CombatLike | null {
    return (game as unknown as { combat?: CombatLike | null }).combat ?? null;
}

export function getCombatState(): CombatVM {
    const combat = getCombat();
    const active = !!combat?.started;
    const myId = game.user?.id;
    const isMyTurn = !!myId && !!combat?.combatant?.players?.some(p => p.id === myId);
    return { active, isMyTurn, canToggle: !!game.user?.isGM };
}

/** GM: inicia (cria se necessário) ou encerra o encontro. No-op para não-GM. */
export async function toggleCombatState(): Promise<void> {
    if (!game.user?.isGM) return;
    const combat = getCombat();
    if (combat?.started) { await combat.endCombat(); return; }
    if (combat) { await combat.startCombat(); return; }
    const CombatCls = (globalThis as unknown as { Combat: { create: () => Promise<CombatLike> } }).Combat;
    const created = await CombatCls.create();
    created.activate?.({ render: false });
    await created.startCombat();
}

/** Avança para o próximo turno (botão "Finalizar Turno"). */
export async function nextTurn(): Promise<void> {
    await getCombat()?.nextTurn();
}
