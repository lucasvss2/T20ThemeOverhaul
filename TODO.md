# TODO — Funcionalidades adiadas (baixa prioridade)

Itens conscientemente adiados. Sem ordem de prioridade entre si — todos baixa
prioridade. Quando forem retomados, seguir o fluxo de deploy do CLAUDE.md.

## Novo modal de resistência para PODERES

Hoje o modal de resistência automatizado (`src/spell-resistance/`) é disparado
apenas por **magias** (`itemData.tipo ∈ arc/div/uni`). Vários **poderes**
(`type:"poder"`) também forçam testes de resistência no alvo (CD própria,
perícia de resistência, efeito on-fail). Criar um fluxo equivalente para esses
poderes — provavelmente reusando os helpers de `spell-resistance` (`parseResistance`,
`extractCD`, `getTargetUserId`, `dispatchSpellResistanceToTarget`) mas com a
detecção/parsing adaptados ao shape de poder.

## Reações ainda não implementadas

Restos da epic de reações (resolvido pular por baixa prioridade):

- **Proteção Fraterna (2 PM)** — você e o aliado rolam a resistência e usam o
  **melhor** resultado. Padrão de coordenação com aliado, parente do
  **Amigo Protetor** (já implementado em v1.60.0). Provável integração no modal
  de resistência (`spell-resistance/`) + auto-damage, reusando o picker de
  aliado (`pickAllyDialog`).
- **Égide Sagrada nv 11+ (5 PM)** — reroll de resistência contra magia para o
  conjurador, com possível **redirect ao conjurador** se passar e a magia for
  single-target. Depende do fluxo de Égide Sagrada já existente
  (`src/area-spells/egide-sagrada.ts`) + modal de resistência.
