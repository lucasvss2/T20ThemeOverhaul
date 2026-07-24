/**
 * Resolve o "ator ativo" da HUD: token controlado tem prioridade sobre
 * `game.user.character` (mesmo padrão de `armamento-aberrante/index.ts` e
 * `anim-presets/index.ts`). Sem nenhum dos dois → null (a HUD se esconde,
 * ver `T20FooterHud._renderHTML`).
 */
export function getActiveActor(): FoundryActor | null {
    const controlled = canvas?.tokens?.controlled ?? [];
    const controlledActor = controlled[0]?.actor;
    if (controlledActor) return controlledActor;
    const ch = (game.user as unknown as { character?: FoundryActor | null } | null)?.character;
    return ch ?? null;
}
