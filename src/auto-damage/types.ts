import type { GolpePayload } from "@/golpe-pessoal/index";

export interface AutoDamageRequest {
    type: "auto-damage-request";
    requestId: string;
    targetUserId: string;
    attackerUserId: string;
    targetActorId: string;
    /** Canvas TokenDocument ID — used to resolve the real token actor via
     *  canvas.tokens.get(id).actor, which works for unlinked NPC tokens.
     *  game.actors.get(actorId) returns the prototype (HP=0), not the token. */
    targetTokenId: string;
    attackerName: string;
    /** Token/ator do ATACANTE (para aplicar dano de contra-ataque nele). */
    attackerTokenId?: string;
    attackerActorId?: string;
    rollLabel: string;
    attackTotal: number;
    targetDef: number;
    damageTotal: number;
    /** Tipo de dano primário do roll (perfuracao, fogo, …) para auto-RD. null = sem tipo. */
    damageType?: string | null;
    attackFormula: string;
    damageFormula: string;
    /** Was the original damage roll maximized (e.g. via Kiai Divino)?
     *  Reroll must apply the same maximize flag to evaluate. */
    damageMaximized: boolean;
    /** Non-critted base weapon damage formula (divisible dice ÷ criticoX + flat mods).
     *  Set only when the original attack was a critical hit. Lets reroll
     *  re-apply crit (or not) correctly instead of always using the critted formula. */
    baseDamageFormula?: string;
    /** Crit-only bonus dice stripped from the original formula (e.g. Cruel's 1d6[danoCritico],
     *  reverberante post-crit dice). These have count NOT divisible by criticoX because T20
     *  adds them AFTER crit multiplication. Re-added to reroll formula only when reroll also crits. */
    critOnlyDmgFormula?: string;
    /** Grito de Kiai was active — reroll should use advantage (2d20, best). */
    gritoActive?: boolean;
    /** Samurai level for Grito bonus die table. */
    samuraiLevel?: number;
    /** Effective criticoX (base + actor AE deltas from onUseEffects). */
    effectiveCriticoX?: number;
    /** Effective criticoM (base from itemData + onUseEffects AE deltas). */
    effectiveCriticoM?: number;
    /** Golpe Pessoal ativo neste ataque (Penetrante/Sifão/Atordoante/Impactante/tracking). */
    golpe?: GolpePayload;
}

export interface AttackRerollRequest {
    type: "attack-reroll-request";
    requestId: string;
    attackerUserId: string;
    targetUserId: string;
    targetActorId: string;
    targetTokenId: string;
    attackFormula: string;
    damageFormula: string;
    attackerName: string;
    rollLabel: string;
    targetDef: number;
    /** Tipo de dano primário (para auto-RD após reroll). */
    damageType?: string | null;
    damageMaximized: boolean;
    /** Non-critted base weapon formula — same semantics as in AutoDamageRequest. */
    baseDamageFormula?: string;
    /** Crit-only bonus dice — same semantics as in AutoDamageRequest. */
    critOnlyDmgFormula?: string;
    gritoActive?: boolean;
    samuraiLevel?: number;
    effectiveCriticoX?: number;
    effectiveCriticoM?: number;
    /** Reação "Reparar Injustiça": mantém o PIOR entre rolagem original e nova. */
    keepWorst?: boolean;
    /** Total do ataque original (para o keepWorst). */
    originalAttackTotal?: number;
}

export interface AttackMissNotify {
    type: "attack-miss-notify";
    targetUserId: string;
    attackerName: string;
    attackTotal: number;
    targetDef: number;
}

/** Prompt de contra-ataque NO ERRO (Contra-Ataque) enviado ao dono do alvo. */
export interface MissCounterRequest {
    type: "miss-counter-request";
    requestId: string;
    targetUserId: string;
    targetActorId: string;
    targetTokenId: string;
    attackerName: string;
    attackerTokenId?: string;
    attackerActorId?: string;
    attackTotal: number;
    targetDef: number;
    /** kind: "counter" (contra-ataque) ou "debuff" (Bloqueio Desconcertante → Desprevenido). */
    options: Array<{ key: string; label: string; pm: number; kind?: "counter" | "debuff" }>;
}

