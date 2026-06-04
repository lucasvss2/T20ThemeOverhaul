export type ResistSkill = "fort" | "refl" | "vont";

/**
 * Parsed outcome from resistencia.txt:
 *  - anula   → pass = nenhum efeito, nenhuma condição
 *  - metade  → pass = metade do dano, nenhuma condição
 *  - parcial → mesmo que metade (reduz à metade + evita condição)
 *  - texto   → efeito especificado no texto da magia; exibe todas as opções
 *  - none    → sem teste de resistência (cura sem resistência, etc.)
 */
export type ResistOutcome = "anula" | "metade" | "parcial" | "texto" | "none";

/** Uma condição de status extraída dos efeitos da mensagem de chat */
export interface SpellConditionData {
    /** ID do status em CONFIG.statusEffects, ex: "atordoado", "pasmo" */
    statusId: string;
    /** Label legível, ex: "Atordoado" */
    label: string;
    /** Duração em rodadas (se disponível) */
    durationRounds?: number;
    /** Duração em segundos (se disponível) */
    durationSeconds?: number;
}

/**
 * Fase 1 — enviado do lançador ao controlador do alvo ANTES do roll.
 * Permite que o alvo escolha poderes para boostar sua resistência.
 * Para magias de cura (isHeal=true) não há roll; o dialog de cura abre diretamente.
 */
export interface SpellResistPreRollRequest {
    type: "spell-resist-preroll";
    requestId: string;
    /** ID do usuário controlador do alvo */
    targetUserId: string;
    /** ID do usuário lançador da magia */
    casterUserId: string;
    /** ID do ator alvo (prototype) */
    targetActorId: string;
    /**
     * UUID completo do ator do token alvo, ex:
     *   "Scene.{sceneId}.Token.{tokenId}.Actor.{actorId}" (unlinked)
     *   "Actor.{id}" (linked/world)
     * Necessário para resolver corretamente o ator sintético de tokens unlinked,
     * já que `game.actors.get(targetActorId)` retorna sempre o protótipo.
     */
    targetActorUuid: string;
    casterName: string;
    spellName: string;
    /** Texto original de resistência, ex: "Vontade parcial" */
    resistTxt: string;
    /** Perícia de resistência parseada, ou null se não houver */
    resistSkill: ResistSkill | null;
    /** Tipo de resultado ao passar no teste */
    resistOutcome: ResistOutcome;
    /** CD do teste (extraído do HTML do card, inclui todos os bônus) */
    cd: number;
    /** ID da ChatMessage original — necessário para acessar os efeitos de buff */
    messageId: string;
    /** Total do roll de dano */
    damageTotal: number;
    /** Fórmula do roll de dano */
    damageFormula: string;
    /** true se a magia cura (curapv) — nesse caso vai direto para result dialog */
    isHeal: boolean;
    /** Valor máximo possível da cura com os dados rolados (para checkbox Consagrar) */
    maxHealValue: number;
    /** true se Curar Ferimentos foi castada com o aprimoramento de remover fadiga (+2 PM) */
    removeFadiga?: boolean;
    /**
     * true se Curar Ferimentos foi castada com o aprimoramento "Truque" — vira
     * 1d8 de dano de luz vs morto-vivo (Vontade reduz à metade). damageTotal e
     * maxHealValue já estarão sobrescritos com o roll do d8.
     */
    truqueAtivo?: boolean;
    /** Condições de status a aplicar (extraídas dos effects do chat) */
    conditions: SpellConditionData[];
    /**
     * Nomes de efeitos personalizados da magia que NÃO batem com um status de
     * CONFIG.statusEffects (ex: "Amedrontado", "Sono"). São exibidos no dialog
     * de resultado para o GM escolher o status equivalente manualmente.
     */
    customEffectNames: string[];
    /**
     * Opcional — quando setado, ao fechar o modal de resistência (alvo terminou
     * a interação) emitimos `socketName(payload)` ao usuário `userId`. Usado por
     * magias de área (ex.: Coluna de Chamas) pra saber quando TODOS os alvos
     * terminaram e então remover o grid/animação. Genérico de propósito — o
     * spell-resistance não conhece a magia que pediu a notificação.
     */
    resolveNotify?: { socketName: string; userId: string; payload?: unknown };
}

/**
 * Fase 2 — resultado pós-roll; gerado no cliente do alvo após ele rolar.
 * Abre o dialog de confirmação com opções de aplicar dano/cura/condições.
 */
export interface SpellResistRequest {
    type: "spell-resist-request";
    requestId: string;
    targetUserId: string;
    casterUserId: string;
    targetActorId: string;
    /** UUID completo do ator do token (vide SpellResistPreRollRequest) */
    targetActorUuid: string;
    casterName: string;
    spellName: string;
    resistTxt: string;
    resistSkill: ResistSkill | null;
    resistOutcome: ResistOutcome;
    cd: number;
    /** Total do teste de resistência rolado (1d20 + bônus + poderes) */
    resistRollTotal: number;
    /** Bônus base da perícia (sem poderes) */
    resistBonus: number;
    /** Fórmula completa usada no teste */
    resistFormula: string;
    /** Resultado apenas do d20 */
    d20Result: number;
    /** Labels dos poderes ativados, ex: ["+7 CAR · Audácia (2 PM)"] */
    appliedPowerLabels: string[];
    damageTotal: number;
    damageFormula: string;
    isHeal: boolean;
    maxHealValue: number;
    conditions: SpellConditionData[];
    /** Efeitos personalizados da magia sem status equivalente (para seleção manual pelo GM) */
    customEffectNames: string[];
    passed: boolean;
}

/**
 * Pedido de auto-apply de buff — enviado do cliente do lançador (player) ao GM
 * quando o player não tem permissão para aplicar ActiveEffect em atores arbitrários.
 * O GM recebe e aplica os efeitos diretamente.
 */
export interface AutoApplyBuffRequest {
    type: "auto-apply-buff";
    /** Nome do lançador para notificação */
    casterName: string;
    /** Grupos de ActiveEffect a aplicar (cada grupo = 1 botão chat-apply-ae) */
    effectGroups: Record<string, unknown>[][];
    /** UUIDs dos atores alvo */
    targetUuids: string[];
}

/**
 * Pedido de purificação — enviado do cliente do lançador (player) ao GM
 * para remover condições matching dos alvos. O GM tem permissão de deletar
 * ActiveEffects em atores arbitrários.
 */
export interface PurificationRequest {
    type: "purification";
    casterName: string;
    /** Lista de alvos com os IDs dos efeitos a deletar em cada um */
    targets: { actorUuid: string; effectIds: string[]; effectNames: string[] }[];
}

