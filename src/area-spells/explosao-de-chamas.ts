/**
 * Explosão de Chamas (Arcana 1, Evocação) — área one-shot em CONE.
 *
 * Texto: "Um leque de chamas irrompe de suas mãos, causando 2d6 pontos de dano
 * de fogo às criaturas na área." Alcance: pessoal (o cone parte SEMPRE do token
 * do conjurador — não é de posicionamento livre). Área: cone de 6m que some
 * após a resistência ser resolvida. Resistência: Reflexos reduz à metade.
 *
 * Aprimoramentos:
 *   - +1 PM: +1d6 de dano (o T20 já soma ao roll no cast → engine soma todos os
 *     rolls de dano automaticamente).
 *   - +1 PM: "Reflexos parcial" — o DANO é igual (metade ao passar, integral ao
 *     falhar), mas ao FALHAR a criatura fica **Em Chamas**. Essa condição é
 *     aplicada automaticamente pelo modal de resistência via `conditions-map`
 *     (entrada "explosao de chamas", gated no aprimoramento). O tick de 1d6 de
 *     fogo por turno enquanto Em Chamas é cuidado por `conditions/em-chamas.ts`.
 *
 * Toda a mecânica de grid/alvos/resistência/limpeza vem do `area-engine`. Aqui
 * só declaramos a magia: cone ancorado no conjurador, limpeza após todos
 * resolverem o modal (igual Coluna de Chamas).
 *
 * Truque (curto, alvo de 1 objeto, sem dano) NÃO é automatizado — sem área em
 * cone não há template a reivindicar; o cast simplesmente não dispara o engine.
 */

import { registerAreaSpell } from "./area-engine";

export function setupExplosaoDeChamas(): void {
    registerAreaSpell({
        key:            "explosao-de-chamas",
        nameNormalized: "explosao de chamas",
        displayName:    "Explosão de Chamas",
        defaultResistTxt: "Reflexos reduz à metade",
        anchorToCaster: true,
        cleanup:        { mode: "after-resolve" },
    });
}
