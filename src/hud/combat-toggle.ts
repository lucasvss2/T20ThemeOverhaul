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

interface CombatantLike { players?: Array<{ id: string }>; actorId?: string | null; tokenId?: string | null }
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

/**
 * "Meu turno" = true em duas situações (qualquer uma vale):
 * 1. `Combatant#players` (nativo — `game.users.filter(u => !u.isGM && ...)`,
 *    ver `client/documents/combatant.mjs`) inclui o usuário atual — cobre o
 *    jogador dono do personagem, mesmo sem token selecionado na cena.
 * 2. O TOKEN atualmente controlado na HUD (`active-actor.ts`) é exatamente
 *    o token do combatente ativo — cobre o GM manobrando esse combatente
 *    diretamente (comum em teste solo/mesa onde o GM controla os PCs), e
 *    também joga certo com NPCs unlinked duplicados (compara por `tokenId`,
 *    não por `actorId` — múltiplas instâncias do mesmo monstro compartilham
 *    `actor.id`, ver gotcha em CLAUDE.md).
 * `players` nativo SEMPRE exclui GMs (`!u.isGM`) — por isso a condição 1
 * sozinha nunca acendia o botão quando o GM testava controlando o próprio
 * personagem; a condição 2 cobre esse caso sem depender de ownership.
 */
export function getCombatState(activeTokenId?: string | null): CombatVM {
    const combat = getCombat();
    const active = !!combat?.started;
    const myId = game.user?.id;
    const combatant = combat?.combatant;
    const ownsAsPlayer = !!myId && !!combatant?.players?.some(p => p.id === myId);
    const controllingToken = !!activeTokenId && !!combatant?.tokenId && activeTokenId === combatant.tokenId;
    const isMyTurn = ownsAsPlayer || controllingToken;
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
