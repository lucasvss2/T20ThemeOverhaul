/**
 * Shared GM election helper.
 *
 * When several GMs are connected, every GM client receives the same hooks.
 * To avoid duplicate mutations (AE creation, damage application, etc.) we elect
 * a single "active GM": the connected+active GM with the lexicographically
 * smallest user id. This is deterministic across all clients.
 *
 * Extracted verbatim from the per-feature copies that previously lived in
 * consagrar.ts, aura-sagrada.ts, egide-sagrada.ts, bola-de-fogo.ts and
 * _cha-dynamic.ts (Phase 1 helper consolidation).
 */
export function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter(u => u.isGM && u.active)
        .map(u => u.id)
        .sort();
    return activeGMs[0] === myId;
}
