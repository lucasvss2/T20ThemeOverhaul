# T20 Theme Overhaul

Módulo para [Foundry VTT](https://foundryvtt.com) com melhorias visuais e mecânicas para o sistema **Tormenta20** (`tormenta20`). Versão atual: **v1.49.2**.

Depende apenas de [socketlib](https://foundryvtt.com/packages/socketlib) para coordenação cliente↔GM. O Foundry instala automaticamente ao adicionar o módulo.

---

## Instalação

### Via Foundry VTT (recomendado)

1. Abra o Foundry VTT e vá em **Gerenciar Módulos → Instalar Módulo**.
2. Cole o link abaixo no campo **URL do Manifesto** e clique em **Instalar**:

```
https://raw.githubusercontent.com/lucasvss2/T20ThemeOverhaul/master/module.json
```

### Instalação manual

1. Baixe o ZIP da [última release](https://github.com/lucasvss2/T20ThemeOverhaul/releases/latest).
2. Extraia na pasta `Data/modules/` do seu Foundry VTT.
3. Ative o módulo em **Gerenciar Módulos**.

---

## 🧪 Versão Beta

> **Atenção:** a versão beta pode conter bugs. Use apenas para testes — não em sessões de jogo em andamento.

A branch `beta` recebe funcionalidades novas antes de chegarem à versão estável. O CI publica automaticamente um pre-release `beta-latest` a cada push nessa branch.

### Como instalar o beta no Foundry VTT

1. Abra o Foundry VTT e vá em **Gerenciar Módulos → Instalar Módulo**.
2. Cole o link do manifesto beta no campo **URL do Manifesto** e clique em **Instalar**:

```
https://raw.githubusercontent.com/lucasvss2/T20ThemeOverhaul/beta/module.json
```

### Como atualizar para o build beta mais recente

Se você já instalou a versão beta, basta clicar em **Verificar Atualizações** no Foundry. O módulo detectará o novo `beta-latest` e baixará automaticamente.

### Diferença entre versão estável e beta

| | Estável | Beta |
|---|---|---|
| Manifesto | `master/module.json` | `beta/module.json` |
| Release | tag versionada (ex: `v1.18.6`) | tag `beta-latest` (sobrescrita a cada build) |
| ZIP | `aeris-bg3-rolls-t20.zip` | `aeris-bg3-rolls-t20-beta.zip` |
| Indicado para | Sessões de jogo | Testes e feedback |

---

## Funcionalidades

### Tema visual escuro (BG3-inspired)

Redesign completo das fichas do Tormenta20 com paleta preta e dourada inspirada em Baldur's Gate 3.

- **Ficha de Personagem (Jogador)** — barras de PV/PM animadas, botões de colapso por seção, fonte adaptativa no nome
- **Ficha Ameaça (NPC)** — mesmo tema; perícias customizadas sem label são ocultadas automaticamente; linhas de perícias reordenadas alfabeticamente
- **Janelas de item/magia** — tamanho inicial otimizado para o conteúdo
- **Diálogos AbilityUse** — estilo BG3 aplicado via hook `renderApplication`

---

### Overlay cinemático de dados

Toda rolagem T20 interceptada exibe um overlay full-screen escuro com o resultado em destaque. O overlay fecha automaticamente após 3 segundos ou ao clicar.

| Tipo de rolagem | Rótulo no overlay |
|---|---|
| Perícia (Acrobacia, Percepção…) | `Teste de <Perícia>` |
| Resistência (Fortitude / Reflexo / Vontade) | `Resistência de <Resistência>` |
| Ataque com arma / à distância | `Ataque` + nome da arma |
| Ataque mágico | `Ataque Mágico` |
| Iniciativa | `Iniciativa` |
| Teste de atributo (Força, Destreza…) | `Teste de <Atributo>` |

Acerto crítico aparece em dourado — diferenciando **20 natural** de **margem ampliada** (armas/melhorias com crítico 19/18, ex.: Precisa); ataques sem crítico mostram "Sem crítico". Falha crítica (nat 1) em vermelho. Dados 3D do **Dice So Nice** aparecem sempre acima do overlay.

**Rolagens secretas/sussurradas não vazam**: o overlay só aparece para quem pode ver o resultado (GMs do whisper em rolagens blind; autor em rolls privados).

---

### Chat cards estilizados

O tema BG3 é aplicado a **todas** as mensagens do chat — não apenas cards T20:

- Mensagens de rolagem de dados (total em destaque, fórmula, resultado individual do d20)
- Whispers e mensagens OOC
- Critical/fumble com highlight colorido
- Cards de item T20 com borda dourada e tipografia `Modesto Condensed`
- Tooltip de dados expandido com visual escuro

---

### Solicitador de Teste de Perícia Secreto

O GM pode solicitar um teste a qualquer jogador sem revelar a dificuldade. Suporta múltiplos alvos simultaneamente.

**Fluxo:**

1. **GM** seleciona um ou mais tokens como alvo (tecla **T**) e clica no ícone 🎲 na barra lateral esquerda.
2. Modal do GM abre: escolha a perícia, defina a CD e um bônus/penalidade opcional.
3. Cada **jogador** recebe um modal mostrando o nome da perícia e seu bônus base calculado — sem ver a CD.
4. O modal do jogador lista poderes e itens ativáveis que afetam aquela perícia, com custo de PM e bônus de cada um.
5. Jogador seleciona os poderes desejados, lança o teste e o PM é descontado automaticamente.
6. O resultado aparece no chat com card público e overlay cinemático.

**Resultados possíveis:**

| Resultado | Condição | Cor |
|---|---|---|
| Falha Crítica | Nat 1 | Vermelho |
| Falha | Total < CD | Âmbar |
| Sucesso | Total ≥ CD | Verde |
| Sucesso Crítico | Nat 20 | Dourado |

---

### Aplicação Automática de Dano

Após um ataque com arma, se o total do ataque superar a DEF do alvo selecionado com **T**, o módulo abre automaticamente um prompt interativo para o jogador defensor (ou GM, para criaturas sem dono).

**O prompt exibe:**

- Nome do alvo, atacante e total do ataque vs DEF
- Total do dano rolado

**Opções disponíveis:**

| Botão | Efeito |
|---|---|
| Aplicar Integral | Aplica todo o dano aos PV (PV temporário é drenado primeiro) |
| Aplicar Metade | Aplica metade do dano (arredondado para baixo) |
| Não Aplicar | Ignora o dano (PM ainda é descontado se informado) |
| Ignorar (Aura de Invencibilidade) | Aparece quando elegível; ignora 100% do dano e marca o uso da imunidade |
| Forçar Rerolar Ataque | Solicita ao atacante que relance a rolagem de ataque; novo prompt abre se acertar |

**Campos opcionais:**

- **RD automática por tipo de dano** — o módulo lê as resistências do alvo (estruturais e texto de NPC) e pré-preenche a RD conforme o tipo do dano (perfuração, fogo…); imunidade anula o dano. Campo editável
- **Custo de Mana (PM)** — debitado junto com PV na mesma ação

---

### Resistência a Magias

Quando uma magia com resistência é lançada contra alvos marcados com **T**, o módulo abre automaticamente um modal unificado para cada alvo (para o dono do token ou GM).

**O modal inclui:**

- **Seção Resistência** — rola Fortitude / Reflexos / Vontade contra a CD da magia (extraída do HTML do chat, incluindo bônus de Fortalecimento Arcano e similares). Suporta reroll gratuito.
- **Poderes ativáveis** — lista automática de poderes/itens que bônus à resistência escolhida, com PM selecionável.
- **Bônus extra** — campo livre para bônus manuais (ex: `+1d4`, `-2`)
- **Seção Dano / Cura** — aplica dano integral, metade ou nenhum, **subtraindo automaticamente a RD do alvo pelo tipo de dano** (imunidade anula; campo editável). Para magias de cura, exibe o total e opção de Consagrar (bônus automático se o alvo estiver em área de Consagrar).
- **Morto-Vivo** — toggle para magias de cura vs morto-vivo (rola resistência adicional de Vontade)
- **Efeitos / Buff** — botões para aplicar cada efeito de buff da magia diretamente ao alvo
- **Condições** — grid filtrável com todas as condições do T20; aplica via `toggleStatusEffect`

**Badge Aura Antimagia** — quando o alvo está dentro de uma Aura Sagrada cujo paladino tem o aprimoramento Aura Antimagia, uma badge dourada indica que o reroll de resistência é gratuito por esse motivo.

---

### Magias de Área Persistentes

#### Consagrar

Magia de área persistente que usa o template circular do T20. Aplica Active Effects em aliados dentro da área e penalidade em mortos-vivos.

- Reclama automaticamente o template criado pelo T20 ao lançar Consagrar
- Sincroniza AEs quando tokens entram/saem da área ou o template é movido
- Detecta aprimoramento de penalidade (+2 PM → penalidade maior) via `flags.tormenta20.onUseEffects`
- Expira após 1 dia de jogo (tempo in-game)
- Botão de cancelamento no **Skills Menu** (ícone ✝️)

#### Aura Sagrada (Paladino)

Aura persistente emitida a partir do token do paladino, seguindo seu movimento.

**Aprimoramentos detectados automaticamente:**

| Aprimoramento | Efeito |
|---|---|
| Aura Poderosa | Raio aumenta de 9m para 30m |
| Aura de Cura | No início do turno de cada aliado dentro da aura, aplica cura de `5 + CHA` |
| Aura Ardente | No início do turno de cada morto-vivo/espírito dentro da aura, aplica dano de luz de `5 + CHA` |
| Aura Antimagia | Aliados dentro da aura podem re-rolar testes de resistência contra magia gratuitamente |
| Aura de Invencibilidade | Cada aliado pode ignorar o primeiro dano sofrido na cena (rastreado por cena) |

**Sustain:** ao início do turno do paladino, 1 PM por aura ativa é debitado. Se não houver PM, a aura é cancelada automaticamente com aviso no chat.

#### Égide Sagrada (Paladino)

Poder que recobre o escudo/símbolo sagrado de energia — aliados adjacentes somam o Carisma do paladino na Defesa.

- Raio padrão: **1,5m** (adjacente)
- Com aprimoramento **Escudo Fraterno** + escudo equipado: **9m**
- Persiste até cancelamento manual via Skills Menu (ícone 🛡️)
- Sem sustain de PM (custo único no cast)

#### Bola de Fogo

Magia evocação com dois aprimoramentos implementados:

- **+2 PM:** adiciona +2d6 ao dano da explosão
- **Esfera Flamejante (+X PM):** cria um token movível no canvas. Causa 3d6 a tokens na trajetória do movimento. Usa o modal de resistência para cada alvo afetado (Reflexos reduz à metade).

---

#### Coluna de Chamas & Miasma Mefítico

Magias de área one-shot: o usuário posiciona o grid do T20 e o modal de resistência abre para **cada token dentro da área**. O grid e a animação somem automaticamente quando todos os alvos resolvem o modal.

- **Miasma Mefítico** — aprimoramentos funcionais: +1d6 dano (+2 PM), tipo trevas (+3 PM, via key nativa `tipoDano`) e **Truque** completo: valida alvo com 0 PV, consome **Pó de Ônix** (item incluído no compêndio do módulo), rola Fortitude vs CD; falha = morte + caster ganha +2 CD por 1 dia; sucesso = imunidade ao truque por 1 dia.

---

### Automação de Poderes & Magias

| Poder / Magia | Automação |
|---|---|
| **Deformidade** (Lefou) | Modal de escolha de 1-2 perícias (+2 permanente) ao adicionar o poder |
| **Briga** (Lutador) | Dano do ataque desarmado evolui automaticamente com o nível (tabela oficial + tamanho) |
| **Acuidade com Arma** | Usa Des no ataque e dano de armas leves/arremesso |
| **Manopla** | Exibe e aplica aprimoramentos de arma nos ataques desarmados |
| **Kiai Divino** (3 PM) | Dano maximizado no próximo ataque |
| **Grito de Kiai** (Samurai, 2 PM) | Vantagem no ataque + dado bônus por nível |
| **Disparo Sublime** (Caçador) | Percepção vs CD 15+ND → crítico automático no próximo tiro |
| **Medalhão Afiado** | +1 margem de ameaça quando magia com bônus de ataque é lançada |
| **Herança Dracônica** | Modal de elemento → RD 5 (10 com Escamas Elementais) + tipo monstro |
| **Tradição Perdida** (+ Aprimorada) | Modal de atributo/classe → PM pelo atributo escolhido (teto por patamar), recálculo automático em level-up; Aprimorada troca o atributo-chave de CD |
| **Baforada Dracônica** | Modal de PM (mín(Con, nível, PM), 1×/rodada) → Nd10 do elemento + Reflexos CD Con + animação |
| **Velocidade** | Sustain automático de 1 PM/turno; cancelar remove o buff dos alvos |
| **Mente Divina** | Pop-up para o **alvo** escolher o atributo (+2/+4); aprimoramentos "nos três" aplicam direto |

---

### Ferramentas de GM

- **Gerador de Encontros Aleatórios** — botão na toolbar; 7 ambientes (Esgotos, Cavernas, Estradas, Florestas, Becos, Ruínas e **Deserto** com níveis 1-10) com rolagem 1d100 secreta.
- **Gerador de Tesouro** — botão na toolbar + ficha de Ameaça.
- **Log de Alterações de Fichas** — Diário GM-only com histórico permanente de toda mudança nas fichas (PV/PM, dinheiro, munição, itens, condições), com autor e origem (dano de X, custo de PM…), divisores por dia e menu de manutenção.
- **Gasto automático de mana** — todos os fluxos de PM (perícias com poderes on-use, magias, poderes) usam a setting nativa `automaticManaSpend` do T20 (deve estar LIGADA), com proteção contra débito duplo nos fluxos do módulo.

---

### Compêndios incluídos

| Compêndio | Conteúdo |
|---|---|
| **T20 Overhaul — Ameaças** | 100 ameaças prontas organizadas em pastas (Allihana, Azgher, Glorienn, Hyninn, Lena, Marah, Tenebra, Ragnar) — GM-only |

As fontes dos compêndios vivem em `packs-src/` (1 JSON por documento) e são compiladas para LevelDB no build (`npm run build:packs`).

---

### Skills Menu

Botão único na barra lateral esquerda que agrega todas as ações de skills ativas no momento.

- **0 ações visíveis** → botão some da barra
- **1 ação visível** → clique executa diretamente (sem menu intermediário)
- **2+ ações visíveis** → clique abre um picker com lista de ações disponíveis

Cada subsistema (Consagrar, Aura Sagrada, Égide Sagrada) registra sua ação de cancelamento no Skills Menu.

---

## Dependências

| Módulo | Tipo |
|---|---|
| [socketlib](https://foundryvtt.com/packages/socketlib) | Obrigatório — RPC GM↔jogador para os sistemas socket |

Nenhuma outra dependência. O Foundry instala `socketlib` automaticamente ao ativar este módulo.

---

## Desenvolvimento

```sh
npm install        # instala as dependências
npm run dev        # build + watch (modo desenvolvimento)
npm run build      # build de produção
npm run typecheck  # verifica tipos TypeScript
npm test           # roda os testes unitários (Vitest, 459 testes)
npm run build:packs  # compila packs-src/ → packs/ (compêndios LevelDB)
```

### Estrutura do projeto

```
src/
├── main.ts                        Ponto de entrada — hooks do ciclo de vida do Foundry
├── constants.ts                   IDs do módulo e nomes de hooks
├── types/
│   ├── global.d.ts                Tipos ambientes para Foundry VTT v13
│   └── css-inline.d.ts            Declaração de módulo para imports ?inline
├── utils/
│   └── logging.ts                 Utilitários de log com prefixo do módulo
├── socket/
│   └── index.ts                   Bootstrap socketlib (getSocket / onSocketReady)
├── parser/
│   └── t20.ts                     Parser de flavor text em português
├── integration/
│   └── index.ts                   Intercepta T20 chat messages e dispara o overlay
├── overlay/
│   └── BG3Overlay.ts              Overlay cinemático full-screen
├── chat/
│   └── chatStyles.ts              Tema global do chat (todos os tipos de mensagem)
├── dialogs/
│   └── bg3-dialog.ts              Estilização de diálogos AbilityUse
├── sheet/
│   └── index.ts                   Tema visual das fichas T20
├── ui/
│   └── skills-menu.ts             Skills Menu (botão único na toolbar)
├── hidden-test/
│   ├── index.ts                   Setup: toolbar, socket, hooks e estilos
│   ├── HiddenTestGMDialog.ts      Modal do GM (multi-alvo)
│   ├── HiddenTestPlayerDialog.ts  Modal do jogador (poderes + PM)
│   ├── skills.ts                  Lista de perícias T20 + cálculo de bônus
│   └── types.ts                   Interfaces do sistema de testes secretos
├── auto-damage/
│   ├── index.ts                   Hook, socket, prompt e aplicação de HP/PM
│   └── types.ts                   Interfaces de dano automático e reroll
├── spell-resistance/
│   ├── index.ts                   Modal unificado de resistência a magias
│   └── types.ts                   Tipos do sistema de resistência
└── area-spells/
    ├── index.ts                   Entry point (setup de Consagrar + Aura + Égide + BdF)
    ├── consagrar.ts               Consagrar: template + AEs + movimento + expiração
    ├── aura-sagrada.ts            Aura Sagrada: ghost template + tick combate + Sequencer
    ├── egide-sagrada.ts           Égide Sagrada: ghost template + AEs adjacentes
    └── bola-de-fogo.ts            Bola de Fogo: esfera flamejante movível
```

### Releases

**Release estável:**

```sh
# Após npm run typecheck && npm test && npm run build
git tag vX.Y.Z
git push origin <branch>:master && git push origin vX.Y.Z
```

O CI executa typecheck + testes + build, monta o ZIP e publica a release no GitHub.

**Release beta (automático):**

Basta fazer push para a branch `beta`. O workflow `.github/workflows/beta-release.yml` publica automaticamente o pre-release `beta-latest`.

---

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Overlay nunca aparece | Sistema ativo não é `tormenta20`; verifique o console |
| Rolagem aparece no chat sem overlay | Flavor text não reconhecido — abra uma issue com o texto exato |
| Botão de Teste Secreto não aparece | Usuário não é GM, ou o hook de toolbar não disparou — recarregue a página |
| Teste Secreto: "nenhum jogador ativo" | O dono do token está offline; o modal só abre se houver um jogador conectado |
| Prompt de dano não aparece após ataque | Nenhum alvo selecionado com T, ou a rolagem não contém attack + damage rolls T20 |
| Dano aplicado sem prompt | Não ocorre — o módulo sempre aguarda confirmação antes de alterar PV |
| Rerolar ataque não funciona | Atacante desconectou após o ataque; sem atacante ativo, o reroll não pode ser enviado |
| Aura Sagrada não segue o token | Token movido com snap desativado — mova com snap para acionar o hook `updateToken` |
| Prompt de resistência não abre | Nenhum alvo com T, ou o lançador não é o usuário atual da sessão |
| Skills Menu não aparece | Nenhuma area spell ativa no momento; o botão some automaticamente |
| Tema visual não aplicado | Módulo desativado ou cache do browser — force reload com Ctrl+F5 |

Abra o console do navegador e filtre por `[t20-theme-overhaul]` para diagnóstico.
