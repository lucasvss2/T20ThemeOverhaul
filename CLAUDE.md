# CLAUDE.md — t20-theme-overhaul

## Project Overview

Foundry VTT module for the **Tormenta20** system (`game.system.id = "tormenta20"`). Adds a cinematic dark theme: cinematic roll overlay, restyled dialogs, chat cards, hidden skill tests, auto damage prompts, area spells, and a character sheet redesign.

- **Module ID:** `t20-theme-overhaul`
- **Foundry:** v13.351+
- **Repo:** https://github.com/lucasvss2/T20ThemeOverhaul
- **Local module path:** `C:\Users\lucas\AppData\Local\FoundryVTT\Data\modules\t20-theme-overhaul\`

---

## Development Workflow

### Commands

```bash
npm run typecheck   # tsc --noEmit — must pass before any commit/tag
npm test            # vitest run — 656 tests must pass (vitest exclui .claude/** — worktrees antigos poluem a suíte)
npm run build       # Vite → dist/main.bundle.js
npm run build:packs # compila packs-src/ → packs/ (compêndios LevelDB, via @foundryvtt/foundryvtt-cli)
npm run dev         # watch mode
npm run lint        # eslint src
```

### Before every commit

Run `npm test`. If any test fails, fix the source (not the test) and re-run. Only commit when `npm test` exits 0.

### Feature → Deploy (mandatory)

**Every completed feature or fix must trigger the full deploy flow below.** There is no "push code only" — shipping code without a release means Foundry users stay on the old version.

Version scheme: `MAJOR.MINOR.PATCH`
- New feature → bump MINOR, reset PATCH (`1.6.4` → `1.7.0`)
- Bug fix → bump PATCH (`1.6.4` → `1.6.5`)

### Full deploy flow

```
1.  npm run typecheck && npm test && npm run build   ← all must pass
2.  Bump "version" in module.json  (e.g. "1.7.0")
3.  git add module.json + changed files
4.  git commit -m "feat/fix: description (vX.Y.Z)"
5.  git tag vX.Y.Z
6.  git push origin <branch>:master && git push origin vX.Y.Z
        ↳ triggers .github/workflows/release.yml
          • runs typecheck + test + build on CI
          • patches module.json version + download URL
          • creates t20-theme-overhaul.zip
          • publishes GitHub Release (what Foundry reads)
7.  Copy dist/main.bundle.js + module.json → local AppData module folder
        C:\Users\lucas\AppData\Local\FoundryVTT\Data\modules\t20-theme-overhaul\
8.  Check GitHub Actions tab — wait for release workflow green ✓
8b. Se packs-src/ mudou: `npm run build:packs` e copiar `packs/` pro AppData — MAS o
    LevelDB fica TRAVADO com o mundo rodando: derrubar o mundo (game.shutDown() →
    confirmar "Voltar à Configuração"), copiar, religar via POST /setup
    {action:"launchWorld", world:"libertacao-de-valkaria"} (senha admin = mesma dos
    GMs). Mudar a entrada "packs" do module.json também exige relaunch do mundo.
```

**Rules:**
- Never push a tag without `npm run typecheck` passing locally first.
- Never report a deploy as done before step 8 (green CI).
- Work is done in a **branch** (uma por feature/fix, ex.: `feat/briar-images-bundled`), NOT directly on `master`. Push with `git push origin <branch>:master`.
- If CI fails post-push: fix → push new commit → re-tag:
  ```bash
  git tag -d vX.Y.Z
  git push origin --delete vX.Y.Z
  # fix code, commit, then re-tag and push
  ```
- Do NOT create GitHub releases manually via `gh release create` unless CI is definitively broken.

---

## Source File Map

```
src/
  main.ts                      — Hooks init/setup/ready; registers all sub-systems
  constants.ts                 — MODULE_ID, SYSTEM_ID
  types/global.d.ts            — Minimal ambient Foundry types (incl. CONFIG, toggleStatusEffect, socketlib)
  utils/logging.ts             — log() / warn() helpers prefixed with [MODULE_ID]
  socket/index.ts              — socketlib bootstrap (registers module on socketlib.ready, exposes getSocket / onSocketReady)
  parser/t20.ts                — parseT20(): flavor string → RollMeta | null
  integration/index.ts         — createChatMessage hook → overlay
  overlay/T20Overlay.ts        — Full-screen cinematic overlay singleton
  dialogs/t20-dialog.ts        — Cinematic restyling for AbilityUseDialog
  chat/chatStyles.ts           — Cinematic restyling for T20 chat roll cards
  hidden-test/index.ts         — Secret skill test: GM rolls for multiple targets
  auto-damage/index.ts         — Auto damage application prompt (attack-based weapons)
  spell-resistance/index.ts    — Automatic saving throw + damage dialog for spells
  spell-resistance/types.ts    — SpellResistRequest, SpellConditionData, ResistSkill
  area-spells/index.ts         — Entry point for area spells (Consagrar, Aura/Égide Sagrada, Bola/Coluna/Explosão de Chamas)
  area-spells/area-engine.ts   — Engine reutilizável p/ magias de área one-shot: registerAreaSpell({key,nameNormalized,displayName,anchorToCaster,cleanup})
  area-spells/explosao-de-chamas.ts — Explosão de Chamas (cone 6m pessoal) via engine; Em Chamas vem do conditions-map
  conditions/em-chamas.ts      — Condição Em Chamas: tick 1d6 fogo no início do turno (combatTurnChange, GM eleito)
  area-spells/consagrar.ts     — Consagrar: MeasuredTemplate claim, AE apply/remove, movement sync
  area-spells/aura-sagrada.ts  — Aura Sagrada (Paladino): ghost template + Aura de Cura (combatTurn heal)
  area-spells/egide-sagrada.ts — Égide Sagrada (Paladino): ghost template + Escudo Fraterno (raio dinâmico)
  ui/skills-menu.ts            — Toolbar button that aggregates active skill actions (register/refresh API)
  sheet/index.ts               — Character sheet redesign (cinematic aesthetic)
  counterspell/index.ts        — Contramágica: janela GM no cast → Misticismo vs CD → anula a magia (Parte 2b)
  duration-manager/index.ts    — Gerenciador de duração de buffs/condições (rodadas/cena/dia/sustentada) em combate
  duration-manager/classify.ts — Classificação pura da duração (effect.duration + system.duracao.units) — testável
  duration-manager/hud.ts      — Mini-dialog de duração ao aplicar condição manual (default rodadas=1)
  duration-manager/types.ts    — DurKind, DurData (flag flags.<MODULE_ID>.dur)
  anim-presets/index.ts        — Memória de animações de skills (Automated Animations): captura/aplica flags.autoanimations por magia; prompt ao adicionar
  anim-presets/bundled-presets.ts — Presets de animação EMPACOTADOS (camada bundled) + tipos AnimPreset/AnimPresetLibrary
  adamante/index.ts            — Material Adamante: injeta templates de upgrade (arma=passo de dano, armadura/escudo=RD, esotérico=marker) em CONFIG.T20.upgrades
  t20-fixes/ajustada-upgrade.ts — Ajustada: fix do bug de sinal nativo — penalidade de armadura do ITEM reduzida em derived data (mín 0); AE vira marcador; migração
  t20-fixes/poderoso-upgrade.ts — Poderoso (esotérico): template +1 CD (AE em attributes.cd, só cópia no ATOR) + migração/dedup + reset p/ labels
  t20-fixes/npc-equipado.ts    — Defesa de Ameaças: NPC com armadura equipado:true + slot 0 ganha slot DERIVADO sintético (equipmentSlots ON exige slot truthy)
  adamante/esoteric.ts         — Adamante esotérico: reroll de 1s no dano da magia por +1 PM (helpers puros + integração no spell-resistance)
  escudo-leve/index.ts         — Escudo Leve: ocupa slot de ANTEBRAÇO (além das mãos) → mão livre p/ objeto/arma/desarmado 2 mãos; patches em ActorSheetT20 + migração
  luva-de-ferro/index.ts       — Luva de Ferro: +1 nos bônus de Defesa/resistência de magias ARCANAS PESSOAIS (boost nas changes antes de aplicar; consumido pelo spell-resistance)
  bolsa-de-po/index.ts         — Bolsa de Pó: −2 PM no custo dos APRIMORAMENTOS de magias enc/ilu (wrapper AbilityUseDialog.create mede o delta do clone; display via ajustecusto)
  _shared/advantage.ts          — Registro compartilhado de vantagem/desvantagem (ataque + perícia): cancelamento cross-feature, sem empilhar (khd20/kld20 nativo só sabe 2 dados)
  concentracao-combate/index.ts — Concentração de Combate: vantagem no ataque (patch rollAttack → rollKeep khd20, via registro compartilhado); +tiers desvantagem/alvos/+10 Def-Refl/imunidades
  orientacao-divina/index.ts   — Orientação (nome real do compêndio, sem "Divina"): vantagem em teste de perícia (patch rollPericia → event.altKey/ctrlKey, via registro compartilhado); +tiers escopo por atributo/grupo (cena) + alvos múltiplos
  iniciativa-buff/index.ts     — Iniciativa pelo tracker oferece Efeitos de Uso de perícia (Audácia etc.): wrapper Combat.rollInitiative → redirect p/ rollPericia("inic") nativo
  t20-fixes/energetico-upgrade.ts — Energético (esotérico): custo undefined→"0" no template CONFIG + migração (evita a magia virar truque pelo Number(undefined+1)=NaN nativo)
  essencia-mana/index.ts       — Essência de Mana: consumível recupera 1d4 PM ao usar (hook createChatMessage, cap no máximo; consumo da dose é nativo)
  divindades/index.ts          — Divindades: item de deus arrastável → modal de poderes concedidos (1 ou 2 c/ Devoto Fiel) + complicação O&R + campo da ficha vira item + automações Aharadak/Nimb
  linhagem-draconica/index.ts  — Linhagem Dracônica (Básica/Aprimorada/Superior): modal de elemento (vincula as 3), AEs PV/RD/imunidade, onuse único −1 PM/+1 por dado, PM temp ao matar
  linhagem-draconica/format.ts — Linhagem Dracônica: builders puros de changes + detecção + damageMatchesElement
  coragem-liquida/index.ts     — Coragem Líquida (Bucaneiro): 1d4 no início do turno em combate; no 1 → popup de consumíveis (beber) ou Pasmo 1 rodada
  t20-fixes/arma-magica.ts     — Arma Mágica: sanitiza changes quebradas do compêndio (dano&magico→dano, dropa keys "?"*) + effect atributo-chave no ataque
  golpe-pessoal/effects.ts     — Golpe Pessoal: catálogo dos 24 efeitos + puros (custo mín 1, Letal/Elemental/Sequencial, gates, validação)
  golpe-pessoal/build-dialog.ts— Golpe Pessoal: dialog de construção (efeitos+arma+magia do Conjurador) → flag golpePessoal no ITEM + resumo na descrição
  golpe-pessoal/index.ts       — Golpe Pessoal: uso (gates+PM+dialog da arma com injeção no clone), card (Amplo/Conjurador), pós-dano via auto-damage, level-up, botão GM
  membros-extras/index.ts      — Membros Extras (Tormenta): 2 armas "Pata Inseto" reais (1d4 corte, crít x2) criadas/removidas com o poder; ataque extra 2 PM/perna ao Agredir c/ outra arma, 1x/rodada, reaproveita auto-damage via weapon.roll()
  pocoes-pergaminhos/index.ts  — Poções/Pergaminhos: usar clona+conjura a magia real (fromUuid+import temp+roll, reaproveita spell-resistance/conditions-map); mascara nome/descrição pra jogador (não identificado) + patch AbilityUseDialog.create
  pocoes-pergaminhos/identify.ts — Identificação: Misticismo vs CD 15+custoPM, bypass p/ Visão Mística (magia ou poder equivalente), animação opcional Sequencer/JB2A
  armamento-aberrante/index.ts — Armamento Aberrante (Tormenta): seletor de arma orgânica (busca+favoritos), dano +1 passo/2 outros poderes Tormenta, dura a cena
  armamento-aberrante/weapons.ts — Base EMPACOTADA de 100 armas (stats colhidos dos compêndios T20) p/ o seletor
  economia-habilidade/index.ts — Economia de Habilidade: reduz −1 PM (mín 1) de um poder escolhido; modal ao adicionar; restaura ao remover
  inspiracao/index.ts          — Inspiração do Bardo: patch AbilityUseDialog (dialog só de PM/bônus), auto-apply em alvos T ≤9m (perícia + Marcial/dano + Resoluta/Defesa + Revigorante/PV temp), Gaita (Atuação vs CD 20+PM → +1) + Adamante (+1); cancelar via skills-menu; expira no deleteCombat
  inspiracao/format.ts         — helpers puros: maxBonusForLevel/pmCostForBonus/resolveBaseBonus/gaitaCD/computeFinalBonus/isInspiracaoPower/inspiracaoImprovementOf
  hud/index.ts                 — Footer HUD: registerFooterHud() (CONFIG.ui.hotbar, hook init) + setupFooterHud() (hooks de refresh, hook setup)
  hud/T20FooterHud.ts          — Subclasse de foundry.applications.ui.Hotbar — substitui a hotbar nativa preservando #slots/#page (teclas 1-0/PageUp/Down)
  hud/active-actor.ts          — getActiveActor(): token controlado > game.user.character
  hud/orb.ts                   — Orbes PV/PM: clique abre prompt com sinal (+cura/-dano), floaters, animação líquido+brilho, update otimista
  hud/capacity.ts               — buildCargaVM(actor): dados derivados de system.attributes.carga (Carga/Sobrecarga/Limite) pra barra ao lado do título Perícias
  hud/reorder.ts                — Reordenar por arrastar-e-soltar (Perícias + painel direito): computeReorderedKeys/applyCustomOrder, puro/testável
  hud/pericias-data.ts         — Liga T20_SKILLS + computeSkillTotal (hidden-test/skills.ts) + ícones
  hud/skill-icons.ts           — 29 ícones SVG de perícia portados do Claude Design (por label PT-BR); ícone "Ofício" = cinzel/martelo (v1.97.0)
  hud/right-panel.ts           — Abas Inventário/Poderes/Magias: filtro de itens do ator por categoria
  hud/macros-tab.ts            — Aba Macros: usa this.slots/this.page reais da hotbar nativa + DragDrop próprio
  hud/slots-grid.ts            — Grid genérico paginado (cols×rows) reusado por perícias/itens
  hud/combat-toggle.ts         — Indicador (removido da UI) + "Finalizar Turno" (gate isMyTurn) + start/end combat GM-only
  hud/state.ts                 — Estado de UI (aba ativa, páginas, rows persistido via client setting)
  hud/responsive.ts            — colsForWidth(): nº de colunas do grid pela largura real do container (ResizeObserver)
  hud/portrait.ts              — Retrato do ator (actor.img, fallback mystery-man)
  hud/portrait-hover.ts        — Hover no retrato do HUD: reusa o preview do módulo opcional "Image Hover" (canto da tela, igual hover em token)
  hud/classes.ts                — classesForActor(): itens type=classe do ator + system.niveis, exibido abaixo do retrato
  tests/
    parser/t20.test.ts         — Vitest unit tests for parseT20 (75 tests)
    setup.ts                   — Test environment setup
```

---

## Systems

| #   | File                          | Hook                     | Notes                                                                                   |
| --- | ----------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| 1   | `overlay/T20Overlay.ts`       | `createChatMessage`      | 1 000 ms delay, auto-dismiss 3 000 ms, CSS id `t20-styles`                          |
| 2   | `dialogs/t20-dialog.ts`       | `renderApplication`      | Detects `.ability-use-form` / `.attribute-use-form`, CSS id `t20-dialog-styles`     |
| 3   | `chat/chatStyles.ts`          | `renderChatMessage`      | Target: `.tormenta20.chat-card.item-card` in `#chat-log`, CSS id `t20-chat-styles`  |
| 4   | `integration/index.ts`        | `createChatMessage`      | `resolveFlavorText` → `parseT20` → `T20Overlay.show`                                    |
| 5   | `hidden-test/index.ts`        | socket                   | GM emits per-target; each player sees only their own result                             |
| 6   | `auto-damage/index.ts`        | `createChatMessage`      | Triggers on attack+damage rolls (weapons). Skips spells (no attack roll).               |
| 7   | `spell-resistance/index.ts`   | `createChatMessage`      | Triggers on spell rolls (tipo arc/div/uni, damage only, no attack). Rolls saving throw, sends dialog via socket. |
| 8   | `sheet/index.ts`              | —                        | Character sheet redesign                                                                |
| 9   | `area-spells/consagrar.ts`    | multiple (see below)     | Persistent area spell: MeasuredTemplate + AE management + movement sync                |
| 10  | `area-spells/aura-sagrada.ts` | multiple (see below)     | Paladin aura emitted from caster token, follows movement, ally-only via disposition    |
| 11  | `ui/skills-menu.ts`           | renderSceneControls, ready, canvasReady | Single toolbar button aggregating active skill actions (Consagrar remove, Aura cancel, ...) |
| 12  | `area-spells/egide-sagrada.ts`| multiple (see Égide Sagrada section) | Paladin Égide: ghost template + AE on adjacent allies; 9m com Escudo Fraterno + escudo equipado |

### Spell Resistance System (v1.6.5+)

Detects spell chat messages and auto-rolls saving throws for targeted tokens.

**Detection:** `itemData.tipo ∈ ['arc','div','uni']` + damage roll present + **no** attack roll + author == current user.

**Resistance text parsing** (`resistencia.txt`):
- `"Vontade parcial"` → skill=`vont`, outcome=`parcial` (half dmg + no condition on pass)
- `"Reflexos reduz à metade"` → skill=`refl`, outcome=`metade`
- `"Fortitude (veja texto)"` → skill=`fort`, outcome=`texto` (shows all options)
- `"Reflexos anula"` → skill=`refl`, outcome=`anula` (no effect on pass)
- `""` / `"nenhuma"` → no resistance; heals (curapv) proceed without a test

**CD extraction:** `message.content.match(/CD\s*(\d+)/)` — parses from rendered HTML, which includes all power bonuses (e.g. Fortalecimento Arcano). Do NOT use `itemData.resistencia.cd` — it reflects only the stored value, not runtime bonuses.

**Conditions:** Extracted from `message.flags.tormenta20.effects` effect names in format `"SpellName (ConditionName)"`. Matched against `CONFIG.statusEffects` by name; applied via `actor.toggleStatusEffect(id, { active: true })`.

**Heal detection:** `damageRoll.formula.includes('curapv')` → shows green heal dialog, applies PV directly.

---

### Consagrar Area Spell System (v1.6.63+)

Persistent area spell using a MeasuredTemplate (circle, 9m radius). Manages Active Effects on tokens inside the area.

**Hooks used:**
- `createChatMessage` — detects spell cast, registers `_pendingCasts` entry with `undeadPenalty`
- `createMeasuredTemplate` — claims T20's template (adds our flags via `doc.update`); applies AEs if already flagged (scene reload)
- `updateMeasuredTemplate` — (a) flag just added → apply AEs; (b) geometry changed → re-sync all tokens
- `deleteMeasuredTemplate` — removes all AEs created by this template
- `updateToken` — movement sync (see v13 quirk below)
- `createToken` — token placed in scene → sync against all templates
- `createActiveEffect` — dedup/adopt orphan AEs from `chat-apply-ae` button
- `canvasReady` — re-sync all tokens on scene load/switch
- `renderSceneControls` / `ready` — refresh remove-area button visibility
- `updateWorldTime` — expire templates after 1 in-game day (86 400 s)

**Template claim strategy:**
T20 creates its own MeasuredTemplate when a spell with area is cast. We detect this via `createMeasuredTemplate` (comparing `authorUid` vs `game.user.id`) and claim it by calling `doc.update({ flags.t20-theme-overhaul: {...} })`. This fires `updateMeasuredTemplate` which triggers AE application. Fallback: if no template appears within 4 s, prompt manual placement.

**Template flags (`flags.t20-theme-overhaul`):**
```
spell: "consagrar"          — identifies this as a Consagrar template
casterActorId               — actor ID of the caster
casterName                  — display name for UI
undeadPenalty               — penalty value (0 = no aprimoramento active)
createdAtGameTime           — game.time.worldTime at cast (for expiry)
creatorUserId               — game.user.id at cast (for remove button filtering)
```

**AE flags (`flags.t20-theme-overhaul`):**
```
consagrarTemplateOrigin: templateId  — links AE to its source template
consagrarHealingBoost: true          — marks the living-token boost AE
```

**Undead detection:**
- NPC: `actor.system.detalhes.raca === "Morto-vivo"` (normalized)
- PC: item of `type === "race"` with name `"Osteon"` or `"Soterrado"`

**Penalty computation (`computeUndeadPenaltyFromMessage`):**
Reads `message.flags.tormenta20.onUseEffects[]` (user-selected aprimoramentos with qty).
- Do NOT use `flags.tormenta20.effects` — it contains the baseline -2 AE regardless of selection.
- 1PM entry detected by: `/[-–−]\s*2\b.*?\btestes\b.*?\bdefesa\b/i` on `description`
- 2PM entry detected by: `/aumenta\s+(?:as\s+)?penalidades/i` on `description`
- If 1PM not activated → return 0 (no penalty at all)
- Final penalty = 2 + (qty × 1 for each 2PM entry)

**Multi-GM election (`isActiveGM()`):**
When multiple GMs are active, all receive hooks. To avoid duplicate AE creation, only the GM with the lexicographically smallest `user.id` (among active GMs) executes mutations. Pattern:
```typescript
function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const activeGMs = (game.users?.contents ?? [])
        .filter(u => u.isGM && u.active)
        .map(u => u.id)
        .sort();
    return activeGMs[0] === myId;
}
```

**Dedup / adoption of orphan AEs:**
If the user clicks `chat-apply-ae` from the T20 chat card:
- If our AE for this template already exists → delete the new one (`createActiveEffect` hook)
- If our AE doesn't exist yet → adopt the new one by writing our `consagrarTemplateOrigin` flag

**Floating remove-area button:**
Injected as the last `<li>` in `menu#scene-controls-layers`. Visible to GM (all areas) and to the caster (`creatorUserId` flag match). CSS id: `t20-consagrar-remove-btn`. Dialogs use `.t20-dialog` class + `CONSAGRAR_STYLES_ID` supplement.

---

### Aura Sagrada — Paladin Aura (v1.7.0, Fase 1)

Aura emitted FROM the paladin's token (no clickable grid). Currently implements only the base power + **Aura Poderosa** improvement (radius 30 m vs default 9 m).

**Architectural differences from Consagrar:**
- **Ghost template, created by us**: T20 does NOT auto-create a template for `type:"poder"` items. We create our own MeasuredTemplate, centered on the caster's token. No prompt — no canvas click.
- **Template follows the caster**: hooks on `updateToken` for the caster → we update template `x/y` to track. Result also re-syncs ALL other tokens (stationary tokens may enter/leave the aura when the emitter moves).
- **Ally detection via disposition**: AE only applies to the caster + tokens whose `document.disposition` equals the caster's. Hostiles never get the bonus.
- **No `onUseEffects`**: powers don't expose aprimoramentos in chat flags. "Aura Poderosa" is detected by checking the caster's items for an item named "Aura Poderosa" (normalized).
- **AE re-use**: instead of building the AE from scratch, we clone `message.flags.tormenta20.effects[0][0]` — T20 already computed `system.modificadores.pericias.resistencia += "<caster CHA>"` there. Allies receive the caster's CHA, not their own.
- **One aura per caster**: re-casting deletes the previous template (which cleans its AEs) then creates a new one.

**Detection:** `normalizeCondName(extractSpellName(message)) === "aura sagrada"` (mind the SPACE — `normalizeCondName` does NOT replace spaces with hyphens).

#### Anti-duplicação e AE órfã (v1.66.1 / v1.66.2) — vale p/ Aura E Égide

- **Debounce de cast (v1.66.1):** o T20 posta MAIS DE UMA mensagem por uso do poder e ambas passam pela detecção por item-id, disparando `onAuraSagradaCast`/`onEgideSagradaCast` 2× no cliente do autor; como o fluxo é assíncrono (deletar anterior → criar novo), as duas execuções correm (leem "0 anteriores") e duplicam template+AE. Fix: `Map<casterActorId, ts>` com janela de 2s, checado/setado SÍNCRONO no topo do handler (antes de qualquer `await`).
- **Limpeza de AE órfã (v1.66.1):** no `syncToken*`, remove efeitos de aura cujo template de origem (`FLAG_ORIGIN`) não existe mais — cobre "buff persiste com o token fora da área / sem aura cobrindo" (template removido sem o cleanup pegar a AE). Roda mesmo havendo OUTRAS auras ativas (antes só limpava quando havia ZERO).
- **Dedup cross-client (v1.66.2):** o debounce só cobre 1 cliente; com múltiplas abas do mesmo usuário ou race multi-GM, cada cliente cria o seu template. `dedupeCasterTemplates()` (gated por `isActiveGM`, agendado ~1.5s após o cast) colapsa templates duplicados do mesmo caster (mantém 1, deleta o resto; sync re-aplica do sobrevivente). ⚠️ O GM eleito é o de MENOR id ordenado — se a aba dele rodar bundle antigo, o dedup não roda lá; todos os clientes precisam do bundle atual.

**Template flags (`flags.t20-theme-overhaul`):**
```
spell: "aura-sagrada"
casterTokenId          — token that emits the aura
casterActorId          — actor id (for re-finding token)
casterName             — display name
raioM                  — 9 or 30 (Aura Poderosa)
creatorUserId          — who cast it
baseEffectData         — AE template cloned per recipient
```

**Hooks:**
- `createChatMessage` → detect cast, call `onAuraSagradaCast` (only the author runs this)
- `updateToken` → caster moved? move template + resync all. Other token? resync just it.
- `updateMeasuredTemplate` → x/y/distance/flags changed → resync all
- `deleteMeasuredTemplate` → cleanup all AEs created by this template
- `createToken` → new token? sync against active auras
- `updateToken` (secondary listener) → disposition changed → resync token (ally/foe flip)
- `canvasReady` → resync everything on scene load

**Client setting:** `auraSagrada.alwaysPromptStartOfTurn` — when **false** (default), Aura de Cura applies automatically to all eligible allies at the caster's turn start. When **true**, opens a dialog with checkboxes pre-marked (player can deselect targets). Same setting will be reused by future Aura Ardente.

### Aura de Cura e Aura Ardente — semântica de tick (v1.9.1)

Itens normalizados nos poderes do caster: `"aura de cura"` (cura aliados elegíveis) e `"aura ardente"` (dano de luz em mortos-vivos/espíritos). Os dois são independentes — o caster pode ter um, o outro ou ambos.

**Quando o tick acontece**: o efeito é aplicado no início do **turno do ALVO** (não mais no turno do caster). O caster também é elegível pra Aura de Cura no PRÓPRIO turno, porque ele se inclui como aliado dentro da própria aura — preserva o texto "você e os aliados".

**Sustentar (custo de PM)**: quando o turno volta ao caster, o handler debita 1 PM por aura ativa dele. Auras que não couberem ser pagas são **canceladas automaticamente** (delete template → cleanup AEs via hook existente). Posta chat card vermelho `Aura Sagrada cancelada — sem PM` + `ui.notifications.warn`. O sustain roda ANTES do tick → se a aura cair por falta de PM, ela não cura nem dana ninguém neste mesmo turno.

**Aura de Cura**:
- Elegível = caster + tokens com mesma `disposition`, dentro da aura, com PV < max.
- Cura = `5 + CHA do caster` (lido de `template.flags.t20-theme-overhaul.baseEffectData.changes[0].value` — T20 já resolveu `@car` no cast).
- Aplica via `actor.update({ "system.attributes.pv.value": Math.min(max, cur + heal) })`.
- Posta chat card `Aura de Cura — <caster>` (border `#c8a96e`) com `<alvo>: +N`.

**Aura Ardente**:
- Elegível = tokens cuja raça (`actor.system.detalhes.raca`, normalizada) é `"morto-vivo"` ou contém `"espír"`, dentro da aura, com PV > 0. Disposition NÃO é checada (texto: "à sua escolha" — picker resolve).
- Dano = `5 + CHA do caster` (luz elemental).
- Aplica via `actor.applyDamage(amount, 1, false)` — sem RD. T20 ActorT20 expõe `applyDamage(amount, multiplier=1, applyRD=false)`.
- Posta chat card `Aura Ardente — <caster>` (border `#ff8a4a`).
- CSS suplementar: `.t20-aura-ardente-picker` com texto laranja.

**Setting `auraSagrada.alwaysPromptStartOfTurn`**: quando `true`, abre 1 dialog por alvo perguntando aplicar/pular. Quando `false` (default), aplica direto.

**Hooks**: `combatTurnChange(combat, prior, current)` (`isActiveGM()` é o único que roda; sequência: sustain → tick).

**⚠️ Gotcha**: NÃO usar `combatTurn` — esse hook entrega `combat.combatant` como o combatant ANTERIOR (que está terminando o turno), o que aplica o tick no FIM do turno do recebedor. `combatTurnChange` é o hook correto: entrega `combat.combatant = NOVO combatant` e dispara em todas as transições (start do combate, próximo turno, virada de round).

### Aura Antimagia (v1.10.0) — Fase 4

Aprimoramento (item `"Aura Antimagia"` normalizado nos poderes do caster; pre-req paladino nível 14). Quando ativo + a Aura Sagrada do mesmo caster está ativa:
- Aliados elegíveis (caster + mesma `disposition`, dentro da aura) podem rolar novamente qualquer teste de resistência contra magia. Sem custo extra.

**Implementação**:
- `aura-sagrada.ts` exporta `getAuraAntimagiaContextForActor(actorId): Array<{ casterName, casterActorId }>` que filtra: ator dentro de aura ativa cujo caster tem o aprimoramento + mesma disposition.
- `spell-resistance/index.ts` consulta esse helper ao construir o dialog unificado. Se há contexto, renderiza badge `.smf-aura-antimagia-badge` (gradient dourado, borda esquerda destacada) acima do form de resistência: `"Aura Antimagia disponível — <caster> permite re-roll deste teste"`.
- O dialog JÁ permitia re-roll livre (botão "Rerolar" após a primeira tentativa); a badge dá contexto narrativo do POR QUE o re-roll é gratuito agora. Não muda mecânica do dialog.

### Aura de Invencibilidade (v1.11.0) — Fase 5

Aprimoramento (item `"Aura de Invencibilidade"` normalizado nos poderes do caster; pre-req paladino nível 18). Quando ativo + a Aura Sagrada do mesmo caster está ativa:
- Você e cada aliado dentro da aura podem ignorar o PRIMEIRO dano sofrido na cena. Sem custo extra.

**Implementação**:
- `aura-sagrada.ts` exporta:
  - `getAuraInvencibilidadeContextForActor(actorId, tokenId?): Array<{ casterName, casterActorId }>` — filtra: ator dentro de aura ativa cujo caster tem o aprimoramento + mesma disposition + ATOR AINDA NÃO USOU NESTA CENA. `tokenId` é preferido pra resolver synthetic actors de NPCs unlinked.
  - `markAuraInvencibilidadeUsed({actorId, tokenId?, casterName, targetName, damageIgnored})` — seta flag `flags.t20-theme-overhaul.auraInvencibilidadeUsedSceneId = <sceneId>` no ator + posta chat card dourado descritivo.
- `auto-damage/index.ts` consulta `getAuraInvencibilidadeContextForActor` em `openDamagePrompt`. Se elegível: renderiza badge `.aad-invenc-badge` (gradient dourado) + adiciona botão extra `Ignorar (Aura de Invencibilidade)` antes do `Forçar Rerolar Ataque`. Click → marca uso + ignora 100% do dano (PM ainda é debitado se preenchido).

**Tracking "primeira vez na cena"**: flag no ator com o `sceneId` atual. Comparação contra `canvas.scene.id` no momento da checagem — quando a cena muda, a flag fica stale e a comparação falha naturalmente, dando direito a nova imunidade. Não precisa de cleanup explícito.

**NPCs unlinked**: `markAuraInvencibilidadeUsed` resolve o ator via `canvas.tokens.get(tokenId).actor` quando `tokenId` é fornecido — necessário pra setar a flag no synthetic actor (não no world actor compartilhado entre tokens).

### Égide Sagrada (v1.12.0) — Fase 5

Poder do paladino. "Você gasta uma ação de movimento e 2 PM para recobrir de energia seu escudo ou símbolo sagrado. Até o fim da cena, você e todos os aliados adjacentes somam seu Carisma na Defesa". O T20 já debita os 2 PM no cast.

**Arquivo:** `src/area-spells/egide-sagrada.ts`. Reusa o mesmo esqueleto de Aura Sagrada (template ghost seguindo o caster, AE clonada de `flags.tormenta20.effects[0][0]`, sync via `disposition`), mas SEM sustain, SEM tick, SEM tracking de Sequencer. Helpers genéricos (isActiveGM, getTokenCenterPx, isTokenInsideTemplate, findTokenForActor, isAuraTarget, extractBaseEffectData, escHtml) estão duplicados intencionalmente — refactor pra `_shared.ts` é uma fase futura.

**Detecção:** `normalizeCondName(extractSpellName(message)) === "egide sagrada"` (acentos removidos).

**Raio dinâmico (computeEgideRaioM):**
- Padrão: **1,5 m** (adjacente — 1 quadrado de raio do centro do token).
- Com aprimoramento **Escudo Fraterno** + escudo equipado: **9 m**.

**Detecção de escudo equipado (`hasShieldEquipped`):** percorre `actor.items` procurando item `type === "equipamento"` com `system.equipado === true` (ou `equipped`) E (`system.tipo === "escudo"` OU `system.subtipo === "escudo"` OU nome normalizado contém `"escudo"`). Cobre variações conhecidas; pode precisar refinamento se T20 mudar shape.

**Detecção de Escudo Fraterno:** item por nome — `normalizeCondName(item.name) === "escudo fraterno"`.

**Template flags (`flags.t20-theme-overhaul`):**
```
spell: "egide-sagrada"
casterTokenId / casterActorId / casterName
raioM                  — 1.5 ou 9
creatorUserId
baseEffectData
```

**Cores do template:** `fillColor="#a8d2ff"` / `borderColor="#5a8bb8"` (azul-prateado, distinto do dourado da Aura Sagrada e do dourado-intenso do Consagrar).

**Cancelar:** botão único registrado no skills-menu (`egide-sagrada-cancel`, ícone `fa-shield-halved`). 1 ativa → dialog de confirmação; 2+ → picker com checkboxes. Mesmo padrão do Aura Sagrada.

**Hooks:** createChatMessage (cast), updateToken (movimento — sync ou move-with-caster), updateMeasuredTemplate (resync), deleteMeasuredTemplate (cleanup AEs + refresh menu), createToken, updateToken (disposition), canvasReady.

**"Até fim da cena":** Foundry não tem evento "scene end" automático. Persiste até cancelamento manual via skills-menu. Usuário cancela quando o encontro acabar.

### Não implementados (próximas fases)
- **Égide Sagrada — reroll nv 11+** (5 PM, re-roll de resistência contra magia ao caster, com possível redirect ao conjurador se passar e a magia for single-target).

> **Correção (v1.60.0):** "Escudo Fraterno" NÃO é uma reação de redirecionar dano. Nos compêndios só existe o **aprimoramento passivo** de raio da Égide Sagrada (9 m com escudo), JÁ implementado em v1.12.0. O mecanismo de dividir/redirecionar dano com aliado é **Amigo Protetor** (v1.60.0) e **Proteção Fraterna** (melhor-de em resistência, ainda não implementado).

### Encerrar animação ao cancelar a aura (v1.9.2)

O autoanimations cria um efeito persistente do Sequencer atrelado ao TOKEN do caster (não ao MeasuredTemplate). Deletar o template NÃO encerra essa animação. Solução em 2 camadas:
1. **Captura preciso no cast**: snapshot dos IDs do Sequencer atrelados ao caster antes do cast, depois 1.5 s após. O diff é salvo em `template.flags.t20-theme-overhaul.sequencerEffectIds`.
2. **Fallback no delete**: além de terminar pelos IDs salvos, o handler do `deleteMeasuredTemplate` varre TODOS efeitos do Sequencer atrelados ao caster cujo `file` casa `autoanimations.*\.(spell|aura)\.` e termina também — cobre race conditions.

**Gotcha da API**: `Sequencer.EffectManager.endEffects({ effects: [...] })` exige `string[]` (IDs) ou `CanvasEffect[]`. Passar `[{ id: "..." }]` (objeto plain) falha com "collections in inFilter.effects must be of type string or CanvasEffect". Os helpers `endSequencerEffectsByIds` e `endAutoanimSpellEffectsForCasterToken` passam IDs como strings.

### Skills Menu (v1.8.0)

`src/ui/skills-menu.ts` é a camada compartilhada que substituiu botões avulsos na toolbar. Cada sistema chama `registerSkillAction({ id, label, icon, color, isVisible(), onClick() })` em seu `setup*()` e `refreshSkillsMenu()` depois de mudar estado relevante (cast/cancel/delete template, etc.).

Comportamento:
- 0 ações visíveis → o botão da toolbar é removido.
- 1 ação visível → click executa direto (sem menu intermediário); tooltip mostra o label da ação.
- 2+ ações visíveis → click abre um Dialog `.t20-dialog` com lista; tooltip vira `"Skills ativas (N)"`.

Setup global em `main.ts` antes de `setupAreaSpells` — também re-refresh em `renderSceneControls`, `ready` e `canvasReady`.

---


### Sistemas v1.32–v1.49 (resumo)

| Versão | Sistema | Arquivo |
|---|---|---|
| 1.32 | RD automática por tipo no auto-damage (`extractDamageType`/`computeTargetRd`) | `auto-damage/rd.ts` |
| 1.33 | Deformidade (Lefou): modal de perícias +2 | `deformidade/` |
| 1.34 | Briga (Lutador): dano desarmado evolui c/ nível+tamanho | `briga/` |
| 1.35–37 | Acuidade c/ Arma · Manopla (UI + aprimoramentos mecânicos) | `t20-fixes/acuidade-arma.ts`, `t20-fixes/manopla-upgrades.ts` |
| 1.38 | Overlay diferencia crítico 20-natural × margem ampliada | `overlay/`, `integration/` |
| 1.39/43 | Sheet-log: Journal GM-only permanente de mudanças de ficha (origin hints via `options[MODULE_ID].origin`) | `sheet-log/` |
| 1.40 | Herança Dracônica + Escamas Elementais (RD elemental via `tracos.resistencias.<el>.bonus`, tipo mon) | `heranca-draconica/` |
| 1.41 | Tradição Perdida (+Aprimorada): PM pelo atributo escolhido — DESLIGA o atributo da classe (`pm.atributos.X=false` prio 1000, vence a AE "Magias (Classe)") e soma o valor capado; cap por patamar 6/8/10/12; nível total = Σ `classe.system.niveis` | `tradicao-perdida/` |
| 1.42 | Baforada Dracônica: cancela uso nativo via patch AbilityUseDialog; modal próprio mín(Con,nível,PM); 1×/rodada em combate; anima via `AutomatedAnimations.playAnimation(token, item, {targets})` | `baforada/` |
| 1.43.1 | Rolagem secreta não mostra overlay (`canSeeRollResult`: blind→só whisper; privada→whisper+autor) | `integration/` |
| 1.44 | Velocidade: sustain 1 PM/turno (combatTurnChange, GM eleito) + cancelar remove buff "Velocidade" dos alvos (uuids salvos na flag; executeAsGM) | `velocidade/` |
| 1.45 | Mente Divina: alvo escolhe atributo via socket pop-up (`executeAsUser`); "nos três" aplica direto; AE `system.atributos.X.bonus` +2/+4 durationScene | `mente-divina/` |
| 1.46 | Miasma Mefítico: área (molde Coluna de Chamas/resolveNotify), trevas via `tipoDano`, Truque (pó de ônix consumido, morte/imunidade 1 dia/+2 CD caster) | `miasma/` |
| 1.47 | RD automática no modal de spell-resistance (`damageType` no preReq + fallback `damageTypeFromFormula`) | `spell-resistance/` |
| 1.48 | Encounter-roller: ambiente Deserto, `bracketMax` por ambiente (deserto [2,5,8,10] → níveis 1-10) — **substituído na v1.92.0** | `encounter-roller/` |
| 1.49 | Compêndio do módulo "T20 Overhaul — Ameaças" (100 atores c/ árvore de pastas) | `packs-src/`, `scripts/build-packs.mjs` |

### Gotchas críticos (v1.32+)

- **`automaticManaSpend` (setting WORLD do T20, default FALSE)** é o gate de TODO débito automático nativo de PM (item.roll / rollPericia / rollAtributo). Está LIGADA neste mundo. Fluxos do módulo que debitam manualmente devem descontar o que o nativo cobra (ex.: disparo-sublime subtrai `ativacao.custo`).
- **Patch de `AbilityUseDialog.create`**: retornar `null` CANCELA o uso nativo (sem PM, sem card, sem roll) — usado pela Baforada (fluxo próprio) e pela validação pré-cast do Truque do Miasma. O `item` recebido é um **CLONE efêmero** (`id: null`) — `setFlag` nele NÃO persiste; resolva o item real via `actor.items.find(...)`.
- **`registerMenu` exige subclasse de FormApplication/ApplicationV2** — classe plain LANÇA no setup e mata o registro de TODOS os hooks do módulo que vêm depois. Sempre try/catch + subclasse real (ver sheet-log).
- **`tipoDano` (mode 5 OVERRIDE)** é key nativa do `applyRollChanges` que troca o tipo de dano do roll (`r.parts[p][1] = value`) — usada pra consertar a AE "trevas" do Miasma que vinha do compêndio com changes vazias.
- **StatblockParser programático**: `new game.tormenta20.applications.StatblockParser({actor, statblock:"", schema:{}, items:[], log:[]})`, stub `parser.render = () => parser`, evento fake `{preventDefault(){}, currentTarget:{closest:()=>({statblock:{value:text}})}}` → `_parseStatblock(ev)` + `_applyToActor(ev)`. Luta (= bônus de ataque), criticoM e saves vêm certos; conferir depois: nomes truncados de habilidades, sentidos/ic (SetFields — `JSON.stringify` mostra `{}` mas o valor existe; use `Array.from`), parágrafos de poderes engolidos (ex.: Atropelamento do Górgon).
- **Pipeline de compêndios**: fontes em `packs-src/<pack>/*.json` (1 doc/arquivo; `_key` obrigatório INCLUSIVE nos embedados: `!actors.items!<actorId>.<itemId>`, `!actors.items.effects!<aId>.<iId>.<eId>`, pastas `!folders!<id>`). `npm run build:packs` compila → `packs/` (gitignorado). CI (release.yml e beta-release.yml) compila e inclui no zip. module.json tem a entrada `"packs"`: `ameacas` (Actor, GM-only) e `weapon-properties` (JournalEntry "Propriedades de Arma", ownership OBSERVER p/ jogadores). Suporta qualquer tipo de doc (JournalEntry usa `_key:"!journal!<id>"` + páginas `!journal.pages!<journalId>.<pageId>`).
- **Imagens dos packs**: paths URL-encoded (`Amea%C3%A7as`); convenção de nome: `Nome.png` = retrato, `Nome Token.png` / `Nome Vista/Visão Aerea.png` = token.
  - **REGRA (sempre, a partir de v1.65.2):** imagens de atores/compêndio são **empacotadas no módulo** pra serem distribuídas aos jogadores. PNG vai em `public/assets/<subpasta>/...` (Vite copia `public/` → `dist/assets`; `release.yml` empacota `dist/assets` → `modules/t20-theme-overhaul/assets/...`) e o ator referencia **module-relative**: `modules/t20-theme-overhaul/assets/Amea%C3%A7as/<...>`. Arquivo no disco fica acentuado (`Ameaças`); referência no JSON fica URL-encoded.
  - **Legado:** atores antigos do bestiário ainda usam `assets/...` (resolve pra raiz do `Data/assets/Ameaças/`, exige cópia manual do usuário). Não migrados retroativamente — migrar sob demanda. Ex. já no padrão novo: Briar Casca-Pálida.
- **`resolveNotify`** no `SpellResistPreRollRequest`: magias de área (Coluna de Chamas, Miasma) removem grid+animação quando TODOS os alvos resolvem o modal (socket por alvo → contagem no caster; fallback 90s; linger 2,5s sem alvos).
- **vitest exclui `.claude/**`** — worktrees antigos do Claude carregavam cópias velhas dos testes contra o src ATUAL (via alias `@`), inflando/quebrando a suíte. Contagem real: 714 testes / 44 arquivos.
- **`getTargetUserId`** (spell-resistance) = primeiro player dono ativo, senão PRIMEIRO GM ativo (ordem da coleção — qualquer GM); **`isActiveGM()`** (eleição p/ mutações) usa MENOR id ORDENADO entre GMs ativos — critérios DIFERENTES, não confundir. Os ids de usuário podem MUDAR (mundo recriado) — nunca hardcode.

### Reações — Parte 2b: Contramágica (v1.58.0)

`src/counterspell/index.ts`. Reação de TERCEIROS que anula uma magia na conjuração (diferente das demais reações, sempre do próprio alvo).

- **Gatilho (modelo escolhido):** janela no cliente do **GM eleito** (`isActiveGM()`). Hook `createChatMessage` detecta a conjuração (mesma detecção do spell-resistance: `itemData.tipo ∈ arc/div/uni`, sem roll de ataque) e enumera **reatores elegíveis** na cena: tokens cujo ator conhece **Contramágica Aprimorada** (poder, `.includes("contramagica aprimorada")`), têm **≥3 PM** (custo de Dissipar Magia), reação disponível na rodada (flag compartilhada `reactionUsedRound`) e **disposição oposta** à do conjurador (não oferece anular magia de aliado). Se nenhum elegível → não abre janela.
- **Resolução:** GM clica "Reagir" → rola **Misticismo** (`computeSkillTotal(actor,"mist")`) + opcional **+Sabedoria** (checkbox manual quando o ator tem **Contramágica Elemental** — escola/elemento da Afinidade não é auto-detectável). Sucesso = `total ≥ CD` (`extractCD` do card; fallback `computeCasterSpellCD`). Gasta 3 PM e consome a reação SEMPRE (sucesso ou falha). Sucesso → posta card "Magia Anulada" e fecha a janela; falha → marca a linha e deixa outro reator tentar.
- **Anular = fechar o modal de resistência do alvo:** `spell-resistance` rastreia modais abertos por `messageId` (`openSpellModals` Map) e exporta `closeSpellModalForMessage(messageId)`. Ao anular, o counterspell faz `getSocket().executeForEveryone("counterspell/negated", {messageId,...})` → todo cliente fecha seu modal + `ui.notifications.warn`. Como nada é auto-aplicado (o dono do alvo clica os botões), "anular" = fechar o modal + avisar; o GM não aplica os efeitos.
- **Contramágica Superior** (passivo): ao anular, ganha PM temporários = círculo da magia, limitado pelo PM gasto (`superiorTempPm(circle, 3)`). Aplicado via `pm.value` (cap no max).
- **Exports puros testáveis:** `hasCounterspellPower(names)`, `counterspellSucceeds(total, cd)`, `superiorTempPm(circle, pmSpent)`.

### Reações defensivas extras — lado ataque (v1.60.0)

Todas em `src/reactions/index.ts` + integração no `auto-damage`. Varredura confirmou 79 itens `execucao:"reaction"`; estes 5 encaixam no fluxo de dano recebido.

- **Bloqueio Divino** (poder, 2 PM): +5 Defesa contra o ataque, **exige escudo equipado**. Entrou em `DEFENSE_REACTIONS` (campos novos `itemType:"poder"`, `requiresShield`). `getBlockingDefenseReactions` agora aceita `it.type` "magia" OU "poder" e checa `actorHasShieldEquipped`.
- **Gingado Elusivo** (poder, 2 PM): +5 Defesa **e** +5 Reflexos, **exige estar sob efeito da Dança Marcial** (`requiresDancaMarcial` → `actorHasActiveEffectNamed(actor,"danca marcial")` — a Dança Marcial aplica um AE de mesmo nome no ator). O +5 Reflexos entra no modal de resistência na v1.61.0.
- **Rilhar os Dentes** (poder, 1 PM): RD = 5 + Constituição vs dano corpo a corpo. `POSTDAMAGE_REACTIONS` ganhou o kind `flat-attr` (`flatBase` + `flatAttr`); `computePostDamageReduction` resolve `flatBase + attrMod(actor, flatAttr)`.
- **Bloqueio Desconcertante** (poder, 1 PM): ao errar/aparar, atacante fica **Desprevenido**. Registry `MISS_DEBUFF_REACTIONS` + `getMissDebuffReactions`/`applyMissDebuff`. Integrado no `openMissCounterPrompt` — `MissCounterRequest.options[].kind` agora é `"counter" | "debuff"`; o status `desprevenido` é aplicado no ATACANTE.
- **Amigo Protetor** (poder, 2 PM): metade do dano vai para um aliado próximo. `getAmigoProtetorOption` + `splitAmigoProtetor` (metade/resto) + `resolveAmigoProtetor`. No `auto-damage`, `doAmigoProtetor` abre um picker (`pickAllyDialog`) de tokens com mesma `disposition` (excluindo o alvo), aplica metade no alvo + metade no aliado e trava o rodapé. Excluído do auto-disable de rodapé (controla sozinho; picker pode ser cancelado).

**Gotcha de teste (MCP):** prompts antigos não fechados deixam `document.querySelector(".aad-dialog")` apontando para o STALE — sempre fechar via `foundry.applications.instances` e pegar o ÚLTIMO `.aad-dialog`. Nível do PC em `system.attributes.nivel.value` (não `system.nivel`).

### Reações defensivas extras — lado magia (v1.61.0)

No modal de resistência (`spell-resistance/index.ts`), reusando os helpers de `reactions/index.ts`.

- **Evasão / Evasão Aprimorada** (poderes, inclui variantes do Ladino; passivo): em efeito de **Reflexos-reduz-à-metade**, Evasão → passou: 0 dano / falhou: cheio; Aprimorada → passou: 0 / falhou: metade. `getEvasaoLevel(actor)` ("none"|"evasao"|"aprimorada", **aprimorada vence**, anulado se Imóvel) + `applyEvasao(level,passed,full,half)`. O modal NÃO auto-aplica — ajusta o **texto de outcome** ("Sem dano (Evasão…)" / "Metade do dano (Evasão Aprimorada — falhou)") e o GM aplica o botão certo. Só quando `skillKey==="refl"` e outcome metade/parcial.
- **Gingado Elusivo (+5 Reflexos)**: injetado como **poder sintético** na lista de bônus do modal (`powers.push({pm:2,bonusFormula:"+5",bonusLabel:"+5 Reflexos"})`) quando `skillKey==="refl"` + conhece Gingado + Dança Marcial ativa + ≥2 PM. Reusa o mecanismo de power-check (soma +5 ao roll, debita 2 PM na 1ª rolagem). Lado Defesa (+5 Def) já entrou na v1.60.0.
- **Futuro Melhor** (magia, 1 PM): `MAGIC_REACTIONS` ganhou kind **`bonus`** (+2). Aparece no painel de reações contra magia só quando FALHOU. Soma +2 ao último total (`lastResistTotal`/`lastResistD20` rastreados no render) e recomputa pass/fail. Consome 1 PM.

### Reações — Parte 2b: Presença Aristocrática (v1.59.0)

`src/reactions/index.ts` (`getPresencaOption`/`resolvePresenca`) + integração em `auto-damage/index.ts` (ataques) e `spell-resistance/index.ts` (magias).

- **Regra:** poder, reação, 2 PM. Quando uma criatura inteligente tenta machucar o portador (ataque, magia ou habilidade), o ATACANTE faz **Vontade (CD Car)**; se falhar, não consegue machucar e **perde a ação**. 1×/cena por criatura.
- **CD Car** = `10 + ½ nível + Carisma` do portador (`presencaCD`). ⚠️ **Nível do PC fica em `system.attributes.nivel.value`** (NÃO `system.nivel.value` — esse não existe; default `?? 0` mascarava). NPCs idem.
- **Anula quando o atacante FALHA** (`presencaNegates(vont, cd)` = `vont < cd`; empate passa).
- **1×/cena por criatura:** flag `presencaUsedScene` no portador = `{ [attackerKey]: sceneId }`, `attackerKey = attackerTokenId || attackerActorId` (por-instância p/ unlinked). `presencaAlreadyUsedThisScene` compara contra `canvas.scene.id` — reseta naturalmente ao trocar de cena.
- **Também consome a reação da rodada** (`reactionUsedRound`) — é uma reação como as demais (1/rodada), além do limite por-cena.
- **Não escreve no atacante** — só rola a Vontade dele (lido localmente via `resolveActor`/`canvas.tokens`, igual `doCounter`/`reflectToCaster`); o "perde a ação" é informativo (mestre aplica). O chamador aplica/ignora o dano conforme `negated`.
- **auto-damage:** botão `data-skill="presenca"` no painel; tratado como o contra-ataque (NÃO trava o rodapé automaticamente) — `doPresenca` trava os botões de aplicar SÓ quando anula.
- **spell-resistance:** seção `#smf-presenca-sect` (acima da resistência, pré-resolução), visível só quando `!isHeal && damageTotal > 0`; ao anular, fecha o modal após 1,4 s.


### Gerenciador de Duração de buffs/condições (v1.62.0)

`src/duration-manager/`. Expira automaticamente buffs e condições com duração **rodadas/cena** durante um encontro; **dia** expira ao passar 1 dia in-game (`updateWorldTime`) ou via ação "Descanso" no skills-menu; **sustentada** sobrevive ao encontro e pergunta ao conjurador se encerra a concentração ao fim; **indeterminada** só remoção manual.

- **"Em combate" = `game.combat.started`.** Fora de encontro nada expira sozinho (item 3). Rodadas/cena só contam durante o encontro e **começam a contar quando o encontro inicia** (item 4) — ancoradas em `combatStart`/`createCombatant`, não no cast.
- **Flag** `flags.<MODULE_ID>.dur` (`DurData`): `{ managed, kind, rounds?, remaining?, combatId?, startWorldTime?, casterActorId?, label?, source }`. `getDur`/`writeDur`.
- **Classificação** (`classify.ts`, puro/testável): `effect.duration.type==="turns"` + `rounds<100` → **rodadas(N)**; senão pelo `system.duracao.units` da magia-pai (resolvida via `fromUuidSync(effect.origin)`) → scene/sust/day/perm(→indeterminada)/special(→indeterminada)/inst(→scene). **Pegadinha do compêndio:** T20 marca ~140/171 effects aplicados como `type:"scene"/durationScene:true` por DEFAULT, independente da duração real — por isso a unidade real vem do `duracao.units` da magia, não do effect. Scene às vezes traz sentinela `rounds:999` (nunca tratar como contagem real).
- **Hooks (GM eleito `isActiveGM()` p/ mutações):** `createActiveEffect` (classifica/tagueia/prompt), `combatStart`+`createCombatant` (ancora), `combatTurnChange` (decrementa rodadas no INÍCIO do turno do dono; 0 → remove + chat card), `deleteCombat` (cena/rodadas removidas, sustentada pergunta), `updateWorldTime` (dia). O prompt manual roda no cliente que togglou (`userId === game.user.id`), não no GM eleito.
- **HUD manual (item 6):** condição togglada via paleta do token → `createActiveEffect` sem nosso flag → `promptDuration` (rodadas[N]/cena/dia/indeterminada, default rodadas=1). Cancelar = indeterminada (não remove a condição).
- **Magia→condição:** `spell-resistance` chama `registerExpectedCondition(actorId, statusId, dur)` ANTES do `toggleStatusEffect` (mapa de supressão, TTL 4s) → o `createActiveEffect` consome e NÃO pergunta. `computeConditionDur` prefere a duração por-rodada que a magia cravou no effect (`flags.tormenta20.effects[][].duration` com `type:"turns"` — ex.: Adaga Mental → Atordoado 1 rodada), senão classifica pelo `duracao.units` da magia.
- **⚠️ Condições derivadas (cascata T20):** aplicar Atordoado cria a primária (`origin:null`) **+ Desprevenido derivado** (`origin: ...ActiveEffect.<idDaPrimária>`). Remover a primária **cascateia** (T20 remove a derivada junto). O manager **ignora** effects cujo `origin` contém `.ActiveEffect.` (`isDerivedConditionOrigin`) — só gerencia/pergunta a primária; ao expirá-la, T20 limpa as derivadas. Sem esse guard, cada condição dispararia um prompt extra pela derivada.
- **Guards do `createActiveEffect`:** ignora se já tem nosso flag, se tem QUALQUER flag do módulo (AEs de área são de outro subsistema), se `transfer:true` (passiva de item), se `flags.tormenta20.onuse` (Efeito de Uso — roll-time), ou origin derivado. Buffs (sem `statuses`) só são gerenciados com **duração FINITA real** (`hasFiniteBuffDuration`: units da magia ∈ round/turn/scene/sust/day, ou `duration.type:"turns"`) — passivas permanentes ficam intactas.
- **⚠️ BUG v1.72.1 (crítico, resolvido):** as cópias de AE que o T20 põe no ATOR (legacyTransferral=true) são `transfer:false` — o guard de `transfer` NÃO as protege. Poderes passivos (Insolência, Golpista Divino, Resistência Elemental, Caminho do Arcanista) têm `system.duracao.units:"inst"` e o `classify` mapeia `inst→scene`; "Efeitos de Uso" (Audácia etc.) têm `onuse:true`. Ambos eram marcados `dur.kind:"scene"` e **DELETADOS no `deleteCombat`** (fim do encontro) — daí "todos os efeitos passivos somem sem saber a ação". Fix: pular `onuse` + trocar o sinal temporal de buff para `hasFiniteBuffDuration` (NÃO confia em `inst`/`perm`/`durationScene`, só duração finita real). Migração `healMistaggedEffects` (ready, GM eleito) destagueia effects passivos/de-uso marcados por builds antigas — auto-heal idempotente (conditions e buffs com duração real ficam intactos).
- **⚠️ Sweep dia/descanso cobre tokens unlinked (v1.62.1):** `onWorldTime`/`dayEffectActors` iteram `relevantActors()` = world actors ∪ atores sintéticos de tokens UNLINKED do canvas. `game.actors.contents` sozinho NÃO enxerga NPCs unlinked (efeito vive no synthetic actor) — bug pego na verificação ao vivo (Zumbi unlinked não expirava no fim do dia). Os hooks de combate (anchor/tick/end) já usam `combatActors` (via canvas), então só o sweep de tempo precisava do fix.

### Aplicação automática de condições por magia (v1.64.0)

`src/spell-resistance/conditions-map.ts` — mapa **curado à mão** `magia normalizada → { conditions:[{statusId, applyOn:"fail"|"pass", durKind, rounds?|formula?, suggest?}], aprimoramentos:[{match,add?,replace?}] }`. **⚠️ T20 NÃO codifica a condição em dados** — ela vive na PROSE da descrição (`system.description.value`, às vezes via `@UUID{Condição}`), com contexto (curar/invocar/imune) que torna extração automática insegura (ex.: Sopro da Salvação linka 18 condições mas é CURA; Conjurar Mortos-Vivos paralisa o invocado, não o alvo). Por isso curadoria manual por lote; magias não curadas caem na grade manual.

- **`resolveSpellConditions(spellName, passed, onUseEffects)`** (puro/testável): filtra por `applyOn` vs resultado, aplica overrides de aprimoramento (regex em `onUseEffects[].description`), separa `apply` (auto) de `suggest` (pré-marca na grade).
- **Integração no modal** (`doAutoApplyConditions` em `openUnifiedSpellModal`): ao resolver o teste (roll principal + branches de reação reroll/bonus/aparar — todos chamam), aplica via `registerExpectedCondition` + `applyCondition` (status REAL, não o efeito-de-nome do botão buff), com a duração tagueada pro gerenciador de duração; rola `formula` (ex.: "1d4") pras durações variáveis. **Idempotente**: `autoAppliedConds` Set rastreia o aplicado; reroll que vira o resultado remove (toggle off) e reaplica. Posta `.smf-autocond-note` no resultado.
- Decisões: auto-aplica direto + aviso; "veja texto"/escolha → `suggest:true` (pré-marca, não aplica). Lote 1: Adaga Mental, Despedaçar (Atordoado 1 rod.), Imobilizar (falha→Paralisado/passa→Lento, cena). Cobertura cresce por lote.
- **Lote 2 (v1.87.0, especificado pelo usuário):** modelo ganhou `when:"combat"|"no-combat"` (por condição), `matchTruque` (override quando lançada como Truque — heurística `/truque/i` no card), `remove` (aprimoramento remove condição base) e `resistBonusInCombat` (entry; o modal SOMA no bônus base quando `game.combat.started`, com nota; `entry.note` também é exibida no modal).
  - **Amedrontar:** passa→Abalado 1d4 rod.; falha→**SÓ Apavorado 1 rod. com `then` = Abalado cena** (encadeamento — v1.87.1). ⚠️ Abalado tem `flags.tormenta20.stack:"apavorado"` (`isSuppressedUpgrade`): aplicar os dois JUNTOS deixa o Abalado SUPRIMIDO enquanto o Apavorado dura (bug do usuário "abalado não aplica"). Por isso o modelo ganhou `then` (condição sucessora): aplica só a base e, quando ela expira, o **duration-manager** (`applySuccessor` no `onTurnChange`) rola a fórmula, registra a duração e liga a sucessora. apr. `1d4+1`→Apavorado 1d4+1 (o `then` permanece). Restrição de alvo (animal/humanoide) é nota. Verificado manualmente (luta.condi −5 com Apavorado → −2 com Abalado ativo/não-suprimido ao expirar); **o teste end-to-end do hook é bloqueado pelo phantom GM do mundo de teste rodando bundle antigo** (`isActiveGM` elege o `Gamemaster` de id menor — [[phantom-active-gm]]).
  - **Enfeitiçar:** falha→Enfeitiçado cena; `resistBonusInCombat:5` (hostil fora de combate = manual); apr. sugestão (`/sugere uma ação|sugestão/`)→`remove` (mestre resolve); dissipar por ação hostil = manual.
  - **Hipnotismo:** falha→Fascinado 1d4 rod.; `resistBonusInCombat:5`; Truque→Pasmo 1 rod. (`matchTruque`); apr. `/sustentad/`→Fascinado sustentada; passou = imune 1 dia (manual).
  - **Sono:** passa→Fatigado 1d4 rod.; falha FORA de combate→Inconsciente+Caído (indeterminada — acordar é manual); falha EM combate→**SÓ Exausto 1 rod. com `then` = Fatigado cena** (mesmo encadeamento do Amedrontar — Fatigado tem `stack:"exausto"`); apr. `1d4+1`→Exausto 1d4+1. Alvo humanoide = nota.
  - Verificado ao vivo (Allegro CD 23 vs Gnoll Capanga): Sono fora de combate falha→Inconsciente+Caído (derivadas indefeso/desprevenido em cascata nativa); Amedrontar falha→"Apavorado (1 rod.), Abalado (cena)"; Hipnotismo em combate→bônus base +0→**+5** com nota, passou→nada. Condições duplas no mesmo resultado FUNCIONAM (aplicadas em sequência; duration-manager expira cada uma pela própria duração).

### Engine de magias de área + Explosão de Chamas (v1.65.0)

`src/area-spells/area-engine.ts` — scaffolding reutilizável p/ magias de área **one-shot** (coloca grid → quem está dentro rola resistência → grid some). Generaliza o padrão escrito à mão na Coluna de Chamas / branch one-shot da Bola de Fogo. Uma feature declara `registerAreaSpell(def)` e o engine instala os hooks UMA vez, roteando por nome.

- **`AreaSpellDef`**: `{ key, nameNormalized (includes), displayName, defaultResistTxt?, anchorToCaster?, cleanup? }`. `cleanup`: `{mode:"after-resolve", fallbackMs?}` (remove o grid quando TODOS os alvos fecham o modal — via `resolveNotify`/socket, igual Coluna) ou `{mode:"linger", ms}` (timer fixo).
- **Fluxo**: `createChatMessage` (autor detecta, soma rolls de dano, CD via `extractCD`>stored, resistTxt) → `createMeasuredTemplate` (autor reclama via flags; se `anchorToCaster`, **sobrescreve x/y pro centro do token do conjurador no MESMO update** preservando a `direction` que o user mirou) → `updateMeasuredTemplate` (flag chegou → caster dispara resistência a cada token dentro). `messageId` real é repassado → a auto-aplicação de condição do modal (`conditions-map`) continua funcionando. **Caster é excluído** dos alvos em magias `anchorToCaster`.
- **Containment p/ qualquer shape**: `_shared/canvas-geometry.ts` ganhou `isTokenInAreaTemplate`/`tokensInAreaTemplate` (cone/circle/ray/rect) por **trigonometria** — em v13 (com os shape getters custom do T20) `template.object.shape` NÃO expõe `.contains()` usável. Convenção de ângulo do Foundry: `direction` em graus, 0=leste, horário (y cresce p/ baixo); `Math.atan2(dy,dx)` casa. Cone = `dist≤distância && |Δângulo|≤angle/2`. Circle reusa o teste de raio em quadrados existente.
- **Explosão de Chamas** (`explosao-de-chamas.ts`): Arcana 1, cone 6m PESSOAL (sempre do token do conjurador), Reflexos reduz à metade, `cleanup:after-resolve`. +1d6 (aprimoramento) já soma no roll do T20 → engine soma todos os rolls. O aprimoramento "Reflexos parcial" NÃO muda o dano (metade/integral); só adiciona **Em Chamas** ao FALHAR — entrada `"explosao de chamas"` no `conditions-map` (gated por regex `/em\s*chamas|reflexos\s*parcial/` em `onUseEffects`, `applyOn:"fail"`, `durKind:"indeterminate"`). Truque (alvo 1 objeto, sem área) NÃO automatizado — sem cone, sem template a reclamar.
- **Condição Em Chamas** (`conditions/em-chamas.ts`): T20 **NÃO** automatiza a queima (status `emchamas` só carrega `changes:{key:"dano",value:"1d6[fogo]"}` vestigial). Implementamos: no início do turno de cada criatura Em Chamas (`combatTurnChange`, GM eleito), rola 1d6 e aplica via `actor.applyDamage(total,1,false)` (sem RD automática — ajuste manual do mestre, igual Aura Ardente) + chat card. Genérico p/ qualquer fonte da condição. Status id = **`emchamas`** (sem hífen/espaço).
- **Migração futura**: Coluna de Chamas e o branch one-shot da Bola de Fogo podem migrar pro engine (não migrados ainda p/ evitar risco — eram a referência).


### Memória de animações de skills (Automated Animations) (v1.67.0)

`src/anim-presets/`. Memoriza a config de animação (`item.flags.autoanimations`, do módulo **Automated Animations** / `autoanimations`, sobre **Sequencer** + **JB2A**) por magia/poder e oferece reaplicá-la quando a skill é adicionada a um personagem (ou via scan, para magias já adicionadas sem animação).

- **Duas camadas (decisão do usuário):** BUNDLED (`bundled-presets.ts`, distribuído no módulo) + OVERRIDE do mundo (setting `animPresets`, Object). World vence bundled no `getMergedPresets()`. Chave = `normalizeCondName(nome)`.
- **Captura:** `game.modules.get(MODULE_ID).api.captureActorAnimations(actor)` lê os `flags.autoanimations` das magias/poderes do ator e grava no override; `requiredModules` é derivado dos paths `modules/<id>/` referenciados na config (+ sequencer/autoanimations). Captura inicial feita: 7 magias do Victor.
- **Portabilidade (decisão):** guarda a config COMPLETA incluindo a referência de **macro** (as anims do Victor são tipo "macro" — rodam uma macro do mundo). O prompt avisa se módulos/macro faltarem, mas aplica a config mesmo assim.
- **Prompt:** hook `createItem` (gated ao `userId` que adicionou) → `offerForItem` (defer 200ms). Dialog clássico (`Dialog`) mostra os módulos necessários (✓/✗ verde/vermelho), botões Aplicar/Agora não, e checkbox "não oferecer novamente" → setting `animPresetsDontAsk` (Object `{ [norm]: true }`). Aplicar = `item.update({ "flags.autoanimations": preset.autoanimations })`.
- **Magias já adicionadas:** ação no skills-menu **"Animações: verificar ficha"** (`anim-presets-scan`) varre o ator do token controlado (ou `game.user.character`) e oferece, sequencialmente, para itens sem animação com preset e fora do dontAsk.
- **Settings:** `animPresets.enabled` (Boolean world, config:true, gate do prompt), `animPresets` (Object world, config:false), `animPresetsDontAsk` (Object world, config:false). ⚠️ A ambient `SettingConfig` (global.d.ts) foi ampliada p/ aceitar `Object/Array` em `type` e `name` opcional (settings config:false não têm label).
- **Promover bundled:** os 7 presets do Victor estão no override do mundo; para distribuí-los aos jogadores, mover a config pra `bundled-presets.ts` (`BUNDLED_ANIM_PRESETS.presets`). (Feito em v1.67.1 — os 7 já estão no bundled.)


### Classe Cruzado — Clérigo variante (v1.69.0 compêndio · v1.70.0 mecânicas · v1.70.1 Magias→PM)

Compêndio bundled `cruzado` (`packs-src/cruzado/`, type Item, ownership OBSERVER) com a classe + 7 poderes + mecânicas em `src/cruzado/index.ts`.

- **Classe Cruzado** (`type:"classe"`): copia PV/PM do Clérigo (`pvPorNivel:4`, `pmPorNivel:5` — base 16+Con no 1º nível é regra do sistema), `pericias.numero:2`, `pericias.inatas` (Luta/Pontaria + Religião + 2), proficiências (marciais/pesadas/escudos) e a tabela de progressão na `description.value` (HTML). ⚠️ O Foundry T20 NÃO auto-concede habilidades — a tabela é descritiva; os poderes são itens separados que o jogador arrasta.
- **Poderes** (`type:"poder"`, `tipo:"ability"`, `subtipo:"Cruzado"`): Devoto Fiel, **Magias (Cruzado)**, Presente dos Deuses, Alma Guerreira, Fé Inabalável, Oração Marcial (`ativacao.custo:5`), Guerreiro Santificado.
- **Magias (Cruzado) soma Sabedoria ao PM (v1.70.1):** o poder carrega um AE embutido `transfer:true` com change `{key:"system.attributes.pm.atributos.sab", value:"true", mode:OVERRIDE}` — idêntico ao "Magias (Clérigo)" nativo. `preparePVPM` soma ao PM cada atributo com `pm.atributos.<X>` truthy. ⚠️ **GOTCHA (T20):** o T20 NÃO usa o transfer nativo do Foundry — ele **copia** os efeitos `transfer:true` pro `actor.effects` no momento da CRIAÇÃO do item (cada cópia com `origin:Item.<id>`); efeitos de item NÃO aparecem em `allApplicableEffects()`. Logo, um AE adicionado a um item que JÁ está na ficha **não aplica** até re-adicionar o item. Cruzados que já tinham o antigo "Magias Divinas" (sem AE): apagar e re-arrastar "Magias (Cruzado)" do compêndio.
- **Mecânicas (`src/cruzado/index.ts`, `setupCruzado()`), verificadas ao vivo no Everton (Cruzado nv8):**
  1. **Presente dos Deuses** — checkbox injetado na aba Aprimoramentos da arma (`renderItemSheet`, padrão do manopla), grava `flags.t20-theme-overhaul.presenteDosDeuses=true`. NÃO ocupa os 4 slots nem o de material; combina com Adamante. Base de detecção (`isGiftWeapon`+`isWeaponEquipped`→`findEquippedGift`) p/ as mecânicas 2 e 4. **(v1.72.0) Não ocupa espaços de inventário:** `setGiftFlag` zera `system.espacos` ao marcar (guarda `espacosOrig` no flag) e restaura ao desmarcar — `carga.value` (soma `i.system.espacos`) ignora o presente. Verificado: carga 2.5→0.5.
     - **Poder Presente dos Deuses (v1.72.0):** `ativacao.custo:2` + `execucao:"move"` (invocar = ação de movimento + 2 PM, debitado nativo). Animação da invocação (luz dourada, `static/marker/light`) empacotada em `bundled-presets.ts` (chave `"presente dos deuses"`, módulo `levels-3d-preview`) → oferecida pelo anim-presets ao adicionar o poder.
     - **Invocação pelo PODER (v1.86.0):** USAR o poder (createChatMessage, autor, debounce 2s) seta flag `presenteInvocado {ts,sceneId}` no ATOR e ativa os buffs **DESACOPLADOS da arma no inventário**: `giftActive(actor)` = `findEquippedGift` OU `isPresenteInvocado` (gate novo das mecânicas 2 e 4 — `grantAlmaGuerreira` roda na hora do uso, mesmo fora de combate, e `syncGuerreiroSantificado` aplica o −1 PM). Termina: ação "Dispensar Presente dos Deuses" no skills-menu (`dispensarPresente`, re-sincroniza GS; PV temp fica), `deleteCombat` (gate `game.user.isGM`, idempotente) ou troca de cena (sceneId). Verificado ao vivo (Korin, machado-presente DESEQUIPADO): uso → PM 40→38 nativo, PV temp 0→16, flag setada, card "invoca sua arma divina"; dispensa via menu limpa a flag e posta "se dissipa".
  2. **Alma Guerreira** — `grantAlmaGuerreira`: com o presente EQUIPADO + o poder, ao entrar em combate (`combatStart`/`createCombatant`, GM eleito) ou ao equipar durante o combate (`updateItem`), PV temp = nível + Sab (não acumula: `max(curTemp, want)`; posta chat card). `computeAlmaGuerreiraTempHP` puro.
  3. **Oração Marcial** — `createChatMessage` (autor) detecta o uso do poder (`data-item-id`→item `oracao marcial`) e aplica um AE buff "Oração Marcial" (`duration.seconds:86400`) no conjurador. O T20 já debita os 5 PM (`ativacao.custo`). Buff genérico (o poder concedido é escolhido manualmente). Dedup se já houver buff ativo.
  4. **Guerreiro Santificado** — `syncGuerreiroSantificado` (gated `isMyUser`, em `createItem`/`deleteItem`/`updateItem` equip+flag, e `ready`): com o presente equipado + o poder, cria um AE no ator `system.modificadores.custoPM = -1` (mode ADD) → o T20 soma `custoPM` no custo de qualquer uso com mana (`manaCost = max(ativacao.custo,0) + custoPM`), reduzindo −1 em "habilidades que custam mana" (estilo upgrade `harmonized`). Some ao desequipar/remover o poder. A 1ª parte (Ataque Especial como guerreiro nv 20) é manual. ⚠️ Interpretação ampla (todo uso com mana, não só Ataque Especial), por pedido do usuário.
- **Eleição de GM** (`isActiveGM`): mecânica 2 (combate) usa o GM de MENOR id ordenado — ⚠️ se a aba dele estiver em bundle antigo, não roda (gotcha multi-GM conhecido). Mecânicas 1/3/4 rodam no cliente do dono/autor (sem election).
- **API de diagnóstico:** `game.modules.get(MODULE_ID).api.diagnoseCruzado(actor)` e `.cruzadoGrantAlmaGuerreira(actor)`.
- **Estrutura de item de classe** (lida do Clérigo ao vivo): `{niveis, pvPorNivel, pmPorNivel, inicial, pericias:{inatas,numero}, rolls, ...}`. Item `poder`: `{ativacao:{custo,...}, duracao, efeito, tipo, subtipo, ...}` + AEs em `effects` (`flags.tormenta20.{onuse,self,custo,...}`).

### Aspirante a herói — escolha de atributo (v1.71.0)

`src/aspirante-heroi/index.ts`. Poder do **Atlas de Arton** ("Você recebe +1 em um atributo à sua escolha") sem mecânica nativa. Damos a ele o comportamento das raças que escolhem atributo (ex.: Humano): ao adicionar o poder a um personagem, abre um modal (Dialog) pra escolher 1 atributo e aplica **+1 PERMANENTE** via AE no ATOR (`system.atributos.<attr>.value` +1, mode ADD, `transfer:false`, `origin`=uuid do poder, flag `flags.t20-theme-overhaul.aspiranteHeroi`). ⚠️ **Mira `.value`, NÃO `.bonus`** (v1.71.1) — idêntico ao poder nativo "Aumento de Atributo". O `.value` é o que as derivadas leem (PM/PV/perícias/Defesa), então só assim o +1 cascateia pra "mana e afins"; AE em `.bonus` sobe o atributo mas é recomputado tarde demais e NÃO afeta as derivadas. Verificado ao vivo (Everton +1 Sab → PM 47→48, Vontade 16→17). Detecção por NOME (`isAspiranteHeroiPoder`, `normalizeCondName().includes("aspirante a heroi")`) — NÃO editamos o compêndio do outro módulo; é código do nosso bundle (funciona em instalação limpa). Hooks `createItem` (gated `userId`==quem adicionou; só em `character`) e `deleteItem` (limpa a AE). Verificado ao vivo (Everton: Força 0→1; remover o poder zera). Mesmo molde do [[deformidade]] (`src/deformidade/`).

### Armamento Aberrante — arma orgânica (v1.74.0)

`src/armamento-aberrante/`. Poder da Tormenta: gasta ação de movimento + 1 PM p/ produzir uma arma orgânica; **dano +1 passo para cada DOIS OUTROS poderes da Tormenta**; dura a cena.

- **Trigger:** `createChatMessage` → `data-item-id` → item do ator com nome normalizado incluindo "armamento aberrante". O T20 **debita 1 PM nativo** (`ativacao.custo:1`, `automaticManaSpend` ON) — verificado ao vivo (Lancry PM 25→24). Gate ao autor + debounce 2s (o T20 pode postar >1 msg).
- **Poderes da Tormenta (v1.74.3):** `system.subtipo === "Tormenta"` **OU** a descrição contém a cláusula "…conta como um poder da Tormenta…" (`TORMENTA_CLAUSE` regex). Pega Couraça Rubra/Disforme (Kaijin), Linhagem Rubra (+Aprimorada/Superior), Apoteose Rubra (Arcanista) — genérico p/ futuros. **Deformidade (Lefou) pesa 2** ("cada um desses bônus [em DUAS perícias] conta como um poder"); demais pesam 1. `tormentaPowerWeight`/`isTormentaPower` puros. `countOtherTormentaPowers` exclui o próprio AA; `computeDamageSteps = floor(outros/2)` (Lancry: 5 outros [3 subtipo + Couraça + Disforme] → +2 passos, verificado ao vivo).
- **Passo de dano CRAVADO no item** (sem AE): `steppedWeaponDie` reusa `stepDie(die, CONFIG.T20.passosDano, steps)` do [[adamante]] e grava no `rolls[dano].parts[0][0]` do item criado. **⚠️ Sem Active Effects de propósito** (pedido do usuário: nada que possa remover passivos/atributos de outros poderes) — verificado: criar/dissolver NÃO toca nos poderes/itens existentes.
- **Base de armas EMPACOTADA** (`weapons.ts`, 100 armas — inclui Maça de guerra/Cajado de batalha/Machado de Lenha/Pistola Tambor dos suplementos): stats colhidos ao vivo dos compêndios T20 instalados (base + Atlas/Heróis de Arton), tupla `[nome,prof,proposito,emp,critM,critX,alc,dado,tipoDano,danoAttr,ataqueAttr]`. **Regra de bundle** — não depende de compêndio de suplemento em instalação limpa. Reharvestar se precisar atualizar.
- **Seletor** (Dialog `.t20-aa-dialog`): busca + **favoritos** (client setting `armamentoAberranteFavorites`, ★ persiste por usuário) + agrupado por proficiência; mostra o dado JÁ stepado (ex.: Katana 1d8→1d10). **Filtra por proficiência do personagem (v1.74.1):** `getActorWeaponProficiencies` lê `system.tracos.profArmas.value` (categorias simples/marcial/exotica/fogo) + `.custom` (armas específicas por nome); `isProficientWith` mostra só as proficientes. ⚠️ **Fallback:** ficha SEM nenhuma proficiência registrada (`known===false`, ex.: Lancry com `value:[]`) NÃO zera a lista — exibe todas + aviso "nenhuma proficiência registrada". Verificado ao vivo: simples+marcial → 59/96 armas, sem exóticas/fogo. Selecionar cria a arma (`Nome (Aberrante)`, `espacos:0`, flag `flags.<MODULE_ID>.armamentoAberrante = {sceneId, createdWorldTime, baseDie, steps}`) + card verde. Verificado: T20 resolve `dano "1d10 + 6"`, crít 19, toHit +1.
- **"Dura a cena":** dissolve manual via skills-menu (`armamento-aberrante-dissolver`) OU auto no `deleteCombat` (GM eleito = fim do encontro). Dissolve deleta APENAS itens com nossa flag + card cinza "se desfaz numa poça de gosma". Verificado ao vivo (Lancry, Katana criada/dissolvida sem colateral).
- **Espada-Calibre**: incluída (proficiência exótica). Armas sem dado (Rede, Desmontador) entram sem passo.

### Economia de Habilidade — reduz PM de um poder (v1.75.0)

`src/economia-habilidade/index.ts` + compêndio bundled `poderes` (`packs-src/poderes/economia-de-habilidade.json`, pack "T20 Overhaul — Poderes", type Item, ownership OBSERVER). Poder: "Escolha uma habilidade não mágica; seu custo em PM é reduzido em −1. Pode escolher outras vezes para habilidades diferentes."

- **Trigger:** `createItem` (gated ao autor, só em `character`) do poder cujo nome normalizado inclui "economia de habilidade" → modal (Dialog `.t20-economia-dialog`) lista poderes candidatos → usuário escolhe.
- **Candidato (`isEligibleTarget`):** `type:"poder"`, `ativacao.custo >= 2` (senão −1 zeraria — proibido), não é outro Economia, e não vinculado por outro Economia (`linkedItemIds`).
- **Aplicar:** reduz o **custo EFETIVO** do alvo em 1 — `system.ativacao.custo` **E** o custo dos "Efeitos de Uso" `flags.tormenta20.custo`. ⚠️ Poderes de perícia/ataque (ex.: **Audácia**) cobram o PM pelo EFEITO onuse, não pelo `ativacao.custo`. **⚠️⚠️ (v1.75.3) O modal NATIVO de uso de perícia lê o custo da CÓPIA do efeito em `actor.effects`** (legacyTransferral — T20 usa `item.actor.effects` p/ perícia, tormenta20.mjs ~L6182), NÃO do efeito no item. Então `collectEffectReductions` reduz o custo em DUAS fontes: efeitos do item (nosso teste secreto lê) + cópias em `actor.effects` cujo `origin` aponta pro item (modal nativo lê). Cada mudança guarda `where:"item"|"actor"`. `powerEffectiveCusto = max(ativacao, custos dos efeitos)`; elegibilidade usa o efetivo. **Sem AE**. Flag `economiaHabilidade = {linkedItemId, originalCusto, reducedCusto, effectCustos:[{effectId,original,reduced,where}]}` + **renomeia SÓ esta instância** (`economiaDisplayName`, v1.75.1). Migração `reconcileActor` (ready, owner) re-deriva do estado atual e reduz o que faltou (item e/ou cópia no ator), mesclando no flag.
- **Restaurar:** `deleteItem` do Economia → volta o custo do alvo (ativacao + efeitos item/actor) ao `originalCusto`, só se o custo atual ainda for o `reducedCusto`. **⚠️ (v1.75.4) DEFERIDO:** o hook captura `actor`+`link` SÍNCRONO e roda o restore via `setTimeout(...,100)` — atualizar `actor.effects` DENTRO da transação de `deleteItem` faz a atualização da CÓPIA no ator ser PERDIDA (o `ativacao.custo` e o efeito do item aplicam por serem de outro documento; a do ator, mesmo documento da transação, não). Fallback: casa a cópia no ator por id OU por origin+custo (se o id regenerou). Múltiplos Economia → cada um vincula um poder diferente (exclui já vinculados; renomeia independente). Verificado ao vivo (Al'gazaha/Audácia): link → 1/1/1; deletar → 2/2/2 (inclusive a cópia no ator).
- **Limitação:** se não há candidato ao adicionar, avisa e fica sem vínculo (re-adicionar p/ vincular depois). Helpers puros `isEconomiaPower`/`computeReducedCusto`/`isEligibleTarget`/`economiaDisplayName` testados. **Verificado ao vivo (Aller, v1.75.1):** modal lista "Percepção Temporal 3→2 PM", reduz + renomeia "Economia de Habilidade (Percepção Temporal)"; 2º Economia exclui o já vinculado, renomeia independente; deletar restaura 3/4.

### Inspiração do Bardo (v1.76.0 — Fase 1)

`src/inspiracao/index.ts` + `format.ts`. Reformula o modal nativo e automatiza a Inspiração + as melhorias/instrumentos/materiais PRIORITÁRIOS. Conteúdo (poderes/instrumentos) vem do módulo **Suplementos de Arton** do usuário — nosso CÓDIGO detecta por NOME e roda em instalação limpa (regra bundle; nada de compêndio novo).

- **Detecção do poder base:** `isInspiracaoPower` = `type:"poder"` + nome normalizado `=== "inspiracao"` OU `endsWith(" inspiracao")` (pega prefixo de categoria, NUNCA as melhorias "Inspiração Marcial/Resoluta/…" que têm palavra DEPOIS de "inspiração").
- **Dialog próprio (imagem 1 reformulada):** patch em `game.tormenta20.applications.AbilityUseDialog.create` (padrão **Baforada**) — se for a Inspiração base, `return null` (cancela o fluxo nativo: sem PM, sem card, sem roll) e abre nosso Dialog `.t20-inspiracao-dialog`. A tela mostra APENAS o seletor de bônus/PM (some o "Inspiração Marcial" e afins); as melhorias ativas viram nota "Automático: …".
- **Escala (`format.ts`, puro/testável):** `maxBonusForLevel(l)=min(5,1+floor((l-1)/4))` (1º+1/5º+2/9º+3/13º+4/17º+5) pelo nível de **bardo** (classe cujo nome inclui "bardo"; fallback soma de níveis). Custo `pmCostForBonus(b)=2b`. `resolveBaseBonus(escolha,nível,pm)` limita pelos três. `computeFinalBonus({base,gaitaPassed,adamante})` soma Gaita/Adamante ACIMA do teto de nível.
- **Alvos:** o bardo (VOCÊ) SEMPRE — adicionado por **`actor.uuid`** (v1.79.1), NÃO pelo token. ⚠️ Antes dependia de `getActiveTokens()[0]`; se o bardo não tinha token na cena ativa (GM conjurando de outra cena), o caster era EXCLUÍDO e, sem alvos T, **nada era aplicado** (bug "nem caster nem alvos recebem"). Agora o caster entra sempre. + **TODOS** os `game.user.targets` (dedupe por uuid de ator). **⚠️ SEM filtro de alcance (v1.79.2):** o limitador de 6 quadrados/9 m foi REMOVIDO por pedido do usuário — o controle de alcance é MANUAL (quem ele marca com T). Removidos `squaresBetween`/`RANGE_SQUARES`/`casterToken`/import de `getTokenCenterPx` (a medição em quadrados marcava alvos adjacentes como fora do alcance em cenas com `grid.distance`/`grid.size` atípicos). **Feedback (v1.79.1):** `ui.notifications.info` no cast bem-sucedido (lista alvos), `warn` explícito na falha da Gaita, e `fireInspiracao().catch()` transforma qualquer erro em `ui.notifications.error` (nunca falha em silêncio).
- **Aplicação (GM-side, roteada por socket `inspiracao/apply` p/ jogador):** 1 AE por alvo "Inspiração (+B)" (`duration.seconds:86400`, flag `flags.<MODULE_ID>.inspiracao={casterActorId,casterName,bonus,createdWorldTime}`), changes conforme melhorias do bardo:
  - sempre `system.modificadores.pericias.geral += B` (mode ADD — mesmo padrão do Consagrar)
  - **Inspiração Marcial** → `system.modificadores.dano.geral += B`
  - **Inspiração Resoluta** → `system.attributes.defesa.bonus += B`
  - **Inspiração Revigorante** → NÃO é AE: seta `system.attributes.pv.temp = max(cur, 5×B)` no alvo (one-shot; pool de PV temp normal). Recasting remove a Inspiração anterior DESTE caster no alvo antes de reaplicar (não empilha).
  - **Inspiração Espirituosa** (v1.77.0) → `system.attributes.pm.temp = max(cur, B)` no caster + aliados, **só na 1ª vez por combate** (`activeCombatId()` + flag `flags.<MODULE_ID>.inspEspirituosaCombat = combatId` no bardo; fora de combate NÃO dispara). `espirituosaPmTemp(B, first)` puro.
  - **Arte Mágica** (v1.77.0) → change EXTRA `system.attributes.cd += 2` aplicada **SÓ na AE do próprio bardo** (`isCaster = actor.id === casterActorId` no `applyInspiracaoGM`). O T20 lê `actor.attributes.cd` ao computar a CD das magias (ver `t20-fixes/spell-cd-formula`), então o +2 nas habilidades de bardo entra/sai junto com a Inspiração. `arteMagicaCdChanges(has)` puro. ⚠️ Interpretação: enquanto sob a PRÓPRIA Inspiração, +2 na CD de TODAS as habilidades do bardo (não só magias) — `attributes.cd` é global.
- **Gaita de Foles** (instrumento equipado, nome inclui "gaita de foles"): ao usar, rola **Atuação** (`computeSkillTotal(actor,"atua")` — key T20 é `atua`) num `1d20+bônus` vs `gaitaCD=20+PM total`; posta card + `T20Overlay.show(…, "sucesso"|"falha")`. Sucesso → +1 no bônus; **falha → habilidade sem efeito, mas PM são gastos** (aborta a aplicação). O card da Gaita usa flavor próprio (não casa `parseT20` → sem overlay duplicado da integração).
- **Adamante** (instrumento musical equipado): +1 no bônus final. **Ligado ao ITEM pelo slot de material** (`system.upgrades.material==="adamant"`, igual às armas) + equipado — NÃO detecta por nome (o material tem que estar selecionado no aprimoramento). Gate por nome de instrumento (`INSTRUMENT_NAMES`) só p/ escopar "é instrumento musical". O [[adamante]] registra `tools.adamant` (categoria `tools` do T20 = ferramenta/traje) → o material aparece como **Automatizado** na ficha (antes ficava laranja "Não Automatizado").
- **Fim do buff:** ação `inspiracao-cancel` no skills-menu (1 ativa → confirma; 2+ → picker por caster; jogador só vê casters que possui) **E** `deleteCombat` → `onCombatEnd` varre `relevantActors()` (world ∪ sintéticos do canvas) e remove todas as Inspirações. ⚠️ **NÃO gated por `isActiveGM()`** — gate `game.user.isGM` (remoção da PRÓPRIA AE é idempotente); se o GM eleito (menor id) for sessão morta/bundle velho, a limpeza precisa rodar no GM que de fato executa o código (bug pego ao vivo: 2 GMs ativos, "Gamemaster" fantasma tinha id menor). Também NÃO lê `combat.combatants` (já apagados quando o hook async roda). O duration-manager IGNORA nossas AEs (têm flag do módulo) — por isso limpamos nós mesmos. PV temp não é revertido (comportamento padrão).
- **Verificado ao vivo (Allegro, bardo nv8, world libertacao-de-valkaria):** dialog reformulado (só "+1 (2 PM)"/"+2 (4 PM)", improvements como nota "Automático:…"); cast +2 com Gaita passando (36 vs CD 24) → card "Bônus +4" (base 2 + Gaita 1 + Adamante 1), Everton (3 quadrados) recebe AE pericias/dano/defesa=4 + PV temp 20, Lancry (9 quadrados) EXCLUÍDO, Allegro incluído; Gaita falhando (20 vs CD 22) → "sem efeito, 2 PM gastos", nada aplicado; cancelar pelo skills-menu remove tudo (defesa 13→9, acro 7→3); `deleteCombat` limpa todas as Inspirações.
- **Verificado ao vivo Fase 2 (Allegro + poderes temporários Arte Mágica/Espirituosa, em combate):** dialog lista as notas novas; cast +4 → AE do Allegro tem `attributes.cd=2` (cd 14→16) + `pm.temp=4`; Everton (aliado, 3 quadrados) recebe `pm.temp=4` mas **SEM** `attributes.cd` (cd fica 14); 2º cast no mesmo combate NÃO regenera PM temp (fica 0). ⚠️ Gotcha de teste: `token.document.update({x})` durante animação lê `document.x` stale — usar `{animate:false}`.

**Instrumentos (v1.78.0):** detectados por nome entre os equipados (`hasEquippedInstrument(actor, key)`).
- **Clarim Deheoni** (`"clarim"`) → change EXTRA nas AEs dos alvos: `system.modificadores.pericias.resistencia += 1`. `clarimResistChanges` puro.
- **Tamborete Marcial** (`"tamborete"`) → change EXTRA: `system.attributes.movement.walk.bonus += 3` (deslocamento, ArrayField). `tamboreteMoveChanges` puro.
- **Cornamusa de Doherimm** (`"cornamusa"`) → **(a)** custo da Inspiração −1 PM (mín. 1) via `cornamusaAdjustedCost(pmCostForBonus(b), true)` — aplicado no `totalPm` E no cálculo do dialog (opções mostram o custo já descontado; o Gaita CD = 20 + PM descontado); **(b)** −2 Defesa PERSISTENTE enquanto vestida: AE no ator (`attributes.defesa.bonus -= 2`, flag `flags.<MODULE_ID>.cornamusaPenalty`) sincronizada por equip (`syncCornamusaPenalty` em `createItem`/`deleteItem`/`updateItem` gated ao dono + `ready`) — NÃO é do cast, é do instrumento vestido.
- **Verificado ao vivo (Allegro + instrumentos temporários equipados):** dialog lista Clarim/Tamborete/Cornamusa; opções mostram `+1 (1 PM)`/`+2 (3 PM)` (Cornamusa); cast +4 → Everton recebe `resistencia=1` (fort 12→17) + `movement.walk.bonus=3` (desloc 6→9); PM gasto 3 (não 4); equipar Cornamusa cria a AE −2 Defesa (13→11), desequipar remove (11→13).
- **Instrumentos NÃO implementados:** **Cítara Heptatônica** (+2 CD da 1ª habilidade mágica do aliado — one-shot/cross-actor), **Flauta Sar-Allan** (+5 Atuação só vs répteis — situacional), **Violino Soprano** (+1d4 no PRÓXIMO teste de perícia — consume-after-one-use) ficaram de fora por terem semântica "próximo/primeiro/condicional" que não cabe numa AE estática; **Trombeta Tapistana** dispensada pelo usuário.

**Materiais de instrumento (v1.79.0):** slot de material do T20 (`system.upgrades.material`), detectados por `hasInstrumentMaterial(actor, key)` (equipado + instrumento). Registrados como Automatizado via `injectInspiracaoMaterials()` (marcadores em `CONFIG.T20.upgrades.tools`, mesmo padrão do `tools.adamant`). Keys `CONFIG.T20.specialMaterials`: `ruby-steel`/`dark-wood`/`mithril`.
- **Adamante** (`adamant`) → +1 no bônus (v1.76.x, já documentado acima).
- **Madeira Tollon** (`dark-wood`) → **−1 PM no custo da Inspiração** (mín. 1), somado à Cornamusa via `costReductions(actor)` + `adjustInspiracaoCost(baseCost, reductions)`. ⚠️ **Só na Inspiração** (a habilidade que o módulo controla): NÃO usamos AE `custoPM` global porque o T20 **não** limita `manaCost` a 1 (`manaCost += custoPM`, sem piso) — zeraria habilidades de 1 PM, violando a regra do usuário "custo nunca < 1".
- **Aço-Rubi** (`ruby-steel`) → alvos sob a Inspiração ganham 25% de evitar o dano EXTRA de crítico. Marca `acoRubi:true` na flag da AE do alvo; `getAcoRubiContextForActor(actorId, tokenId?)` (exportado) é consumido pelo `auto-damage`: no crítico (`req.baseDamageFormula` só existe em crítico) mostra o botão "Aço-Rubi (crítico)" → rola 1d4 (`acoRubiNegatesCrit`), no **1** aplica só o dano BASE (`new Roll(req.baseDamageFormula)` → `applyRd` → `applyDamage`) e trava o rodapé; fora do 1, posta card e mantém o rodapé (dano do crítico normal). Furtivo NÃO é auto-detectável → manual. Verificado ao vivo (crit 16 → base 4 absorvido por PV temp; branch de falha mantém o rodapé).
- **Mitral** (`mithril`) → **informativo**: "ação de movimento" no dialog/card (economia de ações não é rastreada pelo Foundry). Só marca Automatizado.
- **Matéria Vermelha** (`red-matter`) → **NÃO implementado**: a CD do T20 é global (`attributes.cd`); não dá pra subir só as habilidades "exceto magias" sem afetar as magias. Não registrado (ficaria "Automatizado" enganoso).
- **Verificado ao vivo (Allegro + materiais temporários):** dialog lista Madeira Tollon/Aço-Rubi/Mitral; custo +2 → 3 PM (Madeira Tollon −1); Everton recebe AE com `acoRubi:true`; os 3 materiais aparecem como Automatizado na ficha.

### Defesa de Ameaças — armadura equipada de NPC (v1.82.1)

`src/t20-fixes/npc-equipado.ts`. Com `equipmentSlots` LIGADO, o `prepareDefense` (mjs ~L16851) só conta como equipado item com `equipado2.slot` truthy — e NPCs (StatblockParser/compêndios/Bestiário) vêm com `equipado:true` + `slot:0` → armadura/escudo NÃO somavam na Defesa (Sargento-mor 13 em vez de 24; Recruta Purista 11 em vez de 16). Fix: wrapper em `Item.prepareDerivedData` (instalado no `init` via top-level, encadeado com o do Ajustada) — item `equipamento` de ATOR NPC com `equipado` truthy e slot 0 recebe slot DERIVADO sintético (`body`→1.2, senão 1.1; nada persiste). PCs intactos. De quebra conserta `areEffectsSuppressed` p/ upgrades em itens de NPC (mesmo critério de slot). **Verificado ao vivo (world arton):** Sargento-mor 13→**24**, Recruta Purista ×2 11→**16** (números do livro); Aller (PC) inalterado (Defesa 25, pda 0). Cobre packs/imports futuros sem migração de dados.

### Bolsa de Pó (v1.82.0)

`src/bolsa-de-po/index.ts`. Item: "−2 PM no custo dos APRIMORAMENTOS de magias de **Encantamento/Ilusão**" — NÃO desconta o custo base; total nunca < 1 (piso nativo).

- **Mecânica do T20 explorada:** o `applyOnUseEffects` SOMA o custo dos aprimoramentos selecionados no `ativacao.custo` do **CLONE** do item (mjs ~L5884); o débito real lê esse total com piso 1 (mjs ~L6983 `max(custo,1)`); o card de chat também lê o clone. → **Wrapper em `AbilityUseDialog.create`** (encadeável com Baforada/Inspiração): mede `custoBefore` do clone, chama o nativo, e no retorno aplica `custo −= min(2, delta)` — `delta` = exatamente o que os aprimoramentos somaram (delta 0 → sem desconto; base intacta por construção).
- **Display:** hook `renderAbilityUseDialog` injeta nota + `input[name=ajustecusto]` oculto — o `_onInputChange` NATIVO já soma esse campo no total exibido (mjs ~L6132) e aplica o piso `max(total,1)`. Listener nos inputs da `.aprimoramentos-list` (+ botões `.numCtrl`) recalcula `ajustecusto = −min(2, Σ custos selecionados)`.
- **Detecção:** magia `escola ∈ {enc, ilu}` + equipamento equipado com nome incluindo "bolsa de po" (cobre "Bolsa de Pó Poderoso"). ⚠️ `ajustecusto` NÃO é consumido pelo débito (só display) — o débito vem 100% do wrapper no clone; os dois calculam o mesmo desconto.
- **Verificado ao vivo (Al'gazaha, Bolsa de Pó Poderoso equipada):** Adaga Mental (enc, base 1) + aprimoramento +1d6 (2 PM) → display "1", débito **1 PM**, card "1 PM"; sem aprimoramento → 1 PM; Armadura Arcana (abj) → sem nota/desconto.

### Luva de Ferro (v1.81.0)

`src/luva-de-ferro/index.ts`. Item: "Suas magias arcanas pessoais que concedem bônus na Defesa ou em testes de resistência têm esse bônus aumentado em +1." Sem automação nativa (nome não existe no tormenta20.mjs).

- **Elegibilidade:** caster com equipamento equipado cujo nome normalizado inclui "luva de ferro" (`equipado` OU `equipado2.slot>0`) + magia com `itemData.tipo==="arc"` e `itemData.alcance==="self"` (⚠️ `itemData` do flag é o `.system` ACHATADO — alcance em `.alcance`, não `.system.alcance`; pessoal = key `"self"` de `T20.distanceUnits`).
- **Boost (`boostDefenseResistGroups`, puro):** +1 em changes `mode ADD` com valor > 0 cuja key: `system.attributes.defesa.*` (EXCETO `.pda`), `system.modificadores.pericias.resistencia*`, `system.pericias.(fort|refl|vont).*`. Deep-clone (não muta a entrada).
- **Integração (2 pontos em `spell-resistance`):** `maybeBoostLuvaEffects(message, groups)` chamado no auto-apply de buff puro (⚡) e no `applyBuffEffect` (botões `.smf-buff-btn` do modal). Notificação "Luva de Ferro: bônus +1" quando boosta. **Limitação:** o botão nativo `chat-apply-ae` do card T20 não passa pelo módulo — sem boost por lá.
- **Verificado ao vivo (Aller, Luva de Ferro Vigilante equipada):** Armadura Arcana (arc/self, base `defesa.bonus=5` no grupo do flag) aplicada pelo botão do modal → AE com **6**.
- **⚠️ Duplicata de aprimoramento (v1.97.2):** a implementação é 100% código (acima). Se o item tiver AEs `onuse` manuais nomeadas "Luva de Ferro: …" (Defesa/resistência), elas são REDUNDANTES e aparecem como aprimoramentos-fantasma em TODA lista de uso (têm todos os type-flags true). Não são o mecanismo funcional (o código é) — removidas ao vivo do item do Aller (mundo). Não criamos/nem migramos essas AEs automaticamente.

### Vantagem/desvantagem compartilhada — cancelamento cross-feature (v1.101.0)

`src/_shared/advantage.ts` + `tests/`. Registro central pro qual QUALQUER feature que concede vantagem/desvantagem em ataque ou perícia se cadastra (`registerAdvantageSource({id, hasAdvantage(q), hasDisadvantage(q)})`); quem for rolar chama `resolveRollKeep({actor, kind, skillKey?})`, que agrega TODAS as fontes registradas e aplica a regra: **cancelamento simples, sem empilhar** — vantagem + desvantagem de QUALQUER combinação de fontes (não importa de onde vêm) = teste normal (1d20); 2+ fontes do mesmo sinal continuam valendo como uma vantagem/desvantagem só (2d20kh/2d20kl, nunca 3d20+). Uma fonte que lança erro não derruba a agregação das outras (try/catch por fonte).

- **Por que não empilha de verdade:** o `d20Roll` nativo do T20 (mjs ~4806-4843) hardcoda `nd=2` sempre que detecta vantagem/desvantagem (`options.rollKeep`/`event.altKey`/`event.ctrlKey`) e REESCREVE `parts[0]` com `${nd}d20${mods}` — não tem como pré-formar uma fórmula "3d20kh" e sobreviver a essa reescrita (o nativo não lê "quantos dados", só liga/desliga um bit). Empilhamento de verdade exigiria reimplementar essa parte do motor de rolagem por fora; decisão do usuário: só cancelamento por ora.
- **Concentração de Combate** registra `id:"concentracao-combate"` — vantagem = `actorHasAdvantage` (buff próprio), desvantagem = `anyTargetImposesDisadvantage` (algum alvo marcado tem o +5 ativo), ambas só p/ `kind:"attack"`.
- **Orientação** registra `id:"orientacao-divina"` — vantagem = tem buff aplicável a esta perícia (`findApplicableEffect`), só p/ `kind:"pericia"`; desvantagem sempre `false` (nenhuma fonte de desvantagem em perícia existe ainda — fica pronto pro cancelamento automático no dia em que existir, sem precisar mexer em Orientação).
- **Uso nos patches:** `installAttackPatch` (Concentração) e `installPericiaPatch` (Orientação) chamam `resolveRollKeep(...)` em vez de resolver vantagem/desvantagem sozinhos — herdam automaticamente qualquer fonte nova que outra feature registrar no futuro, sem precisar de mudança nos dois módulos existentes.

### Concentração de Combate (v1.98.0)

`src/concentracao-combate/index.ts` + `tests/`. Magia Arcana 1 (Adivinhação, livre, pessoal, 1 rodada): quando VOCÊ faz um teste de ataque, rola dois dados e usa o MELHOR. Aprimoramentos aditivos.

- **Mecanismo (vantagem/desvantagem):** patch em `Item.prototype.rollAttack` (instalado no setup, encadeável, try/catch) — injeta `options.rollKeep` (o `d20Roll` nativo lê `rollKeep` em mjs ~4819: `"khd20"`→melhor de 2d20, `"kld20"`→pior), resolvido via `resolveRollKeep` (registro compartilhado, [[vantagem-desvantagem-compartilhada]]). ⚠️ **v1.101.0:** vantagem própria + desvantagem imposta pelo alvo agora **CANCELAM** (teste normal) — ANTES a desvantagem sempre prevalecia; mudança de comportamento pedida pelo usuário pra bater com a regra geral de cancelamento. `anyTargetImposesDisadvantage` lê `game.user.targets` no cliente que rola.
- **Estado = AE flagada** `flags.<MODULE_ID>.concentracaoCombate = {advantage, imposesDisadvantage, casterActorId, expireKind, combatId, appliedRound}`. `actorHasAdvantage`/`actorImposesDisadvantage` leem os effects ativos.
- **Tiers (puros/testados `parseTiers`/`computeConfig`):** por CUSTO do onUseEffects (fallback descrição). +2→cena; +5→desvantagem nos atacantes; +9→alvos escolhidos (`game.user.targets`) em vez de você + cena; +14→1 dia + AE `defesa.bonus`/`refl.bonus` +10 + imune surpreendido/desprevenido (remove os status ao aplicar) + sexto sentido (informativo). Aditivos; +14 vence na duração.
- **Detecção do cast:** `createChatMessage` (autor, debounce 2s/ator). ⚠️ `flags.tormenta20.itemData` de MAGIA **NÃO traz `name`/`type`** — resolve via `data-item-id`/`data-actor-id` do `content` (`resolveCastItem`, igual `extractSpellName`). Aplica via socket `executeAsGM` (`concentracao/apply`), posta card.
- **Limpeza:** skills-menu "Cancelar" (`concentracao/remove` GM); `deleteCombat`→remove de `relevantActors()` (world ∪ sintéticos, gate `game.user.isGM`); base "1 rodada" expira no `combatTurnChange` (início do turno do dono, rodada > appliedRound, gate `isActiveGM`). Cena→deleteCombat; 1 dia→manual/deleteCombat.
- **Verificado ao vivo (Al'gazaha, Magias compêndio):** base → AE advantage + Arco longo vira `2d20kh` (19 vs 4, mantém 19); alvo com +5 → atacante rola `2d20kl` (4 vs 17, mantém 4, sobrepõe a própria vantagem — comportamento PRÉ-v1.101.0, hoje cancelaria pra 1d20); +14 → AE 1 dia com Defesa 19→29 e Reflexos 4→14. Detecção por `data-item-id` (magia sem name no flag).

### Orientação (v1.100.0, nome corrigido v1.100.1, exclusão de resistência corrigida v1.101.1)

`src/orientacao-divina/index.ts` + `tests/`. Magia Divina 1 (Adivinhação, padrão, curto, 1 criatura, 1 rodada): no próximo teste de perícia do alvo, ele rola dois dados e usa o MELHOR. Aprimoramentos aditivos.

- **⚠️ O item do compêndio chama-se só "Orientação"** — "Divina" no pedido original do usuário descrevia o TIPO da magia (`tipo:"div"`), não o nome. Diretório/flag/módulo continuam `orientacao-divina`/`orientacaoDivina` (não vale a pena o churn de renomear), mas a STRING de detecção (`SPELL_NAME`) é `"orientacao"`.
- **Mecanismo (vantagem em teste de perícia):** ⚠️ `Actor.prototype.rollPericia` **NÃO** propaga `options.rollKeep` pro `d20Roll` como `Item.prototype.rollAttack` faz (esse merga `options` inteiro em `rollConfig`; `rollPericia` só repassa `options.event`/`options.message`, o resto de `rollConfig` vem do dialog/`applyOnUseEffects`). Único gancho que sobra: `d20Roll` também lê `event.altKey`/`event.ctrlKey` como vantagem/desvantagem (mjs ~4819) — o patch em `Actor.prototype.rollPericia` injeta esses campos num `event` sintético a partir do `rollKeep` resolvido por `resolveRollKeep` (registro compartilhado, [[vantagem-desvantagem-compartilhada]]). Testes de ATAQUE nunca são afetados, em NENHUM modo — mecanismo totalmente separado (`Concentração de Combate`), nem passa por `rollPericia`.
- **⚠️ Fortitude/Reflexos/Vontade só são excluídos no modo PERSISTENTE (+2/+5 PM)** — bug real corrigido em v1.101.1: a implementação original excluía essas 3 perícias em TODOS os modos, mas o texto do livro só ressalva "não se aplica a testes de ataque ou resistência" nos parágrafos dos aprimoramentos +2/+5 PM; a BASE ("em seu próximo teste de perícia") não tem essa ressalva e cobre QUALQUER perícia rolada via `rollPericia`, incluindo as de resistência. `isEligibleSkill(key, mode)` agora recebe o modo do buff e só filtra Fort/Refl/Vont quando `mode==="persistent"`; `findApplicableEffect` aplica esse filtro POR EFEITO (não globalmente), então um alvo com um buff "once" ativo E um "persistent" ativo teria regras diferentes por buff.
- **Dois modos:** **"once"** (base — sem aprimoramento de escopo): buff de 1 uso, cobre QUALQUER teste de perícia (inclusive Fort/Refl/Vont), consumido no 1º teste elegível — **mesmo se a vantagem cancelar** com alguma desvantagem futura (a chance foi usada; `consumeAfter` deletado só se `orig.call(...)` não retornou `undefined` — dialog cancelado não consome) ou expira no início do próximo turno do alvo (`combatTurnChange`, `expireKind:"round"`, igual Concentração). **"persistent"** (+2 ou +5-grupo presente): dura a CENA inteira, sem consumo, restrito a um ESCOPO de atributo (`scopeAttrs` — `attrInScope` compara `pericia.atributo`, resolvido de `CONFIG.T20.pericias[key].abl` na preparação, contra a lista) E exclui Fort/Refl/Vont mesmo que o atributo escolhido bata (ex.: escopo "Constituição" NÃO dá vantagem em Fortitude, apesar de Fortitude ser Con-based — verificado ao vivo).
- **Tiers (puros/testados `parseTiers`/`computeConfig`):** os DOIS aprimoramentos de +5 PM são distinguidos só pela DESCRIÇÃO (custo empata) — `/fisic|mental/` → escopo GRUPO (`t5Group`); `/criaturas escolhidas/` → alvo múltiplo (`t5Target`). `t2` (cena + atributo único) e `t5Group` (cena + grupo Físicos/Mentais) são alternativas de ESCOPO dentro do mesmo modo persistente — `computeConfig` trata `t5Group` como suficiente sozinho pra virar persistente (não exige `t2` junto), já que o texto do livro descreve o grupo "como acima" do +2 mas a automação não força a combinação. `t5Target` é independente — muda só o alvo, funciona sozinho (base "once" pra múltiplas criaturas) ou junto de `t2`/`t5Group`.
- **Escolha do conjurador:** quando `needsScopeChoice` (t2 ou t5Group), abre um Dialog logo após o cast — atributo único (select, 6 opções de `CONFIG.T20.atributos`) ou grupo (radio Físicos ×Mentais). Cancelar o modal aborta a aplicação inteira (nenhum efeito criado) — mesmo padrão de "Aspirante a Herói".
- **Alvo:** lê `game.user.targets` no cliente que conjura (igual Inspiração/Concentração +9) — 1 alvo por padrão, todos os marcados com `t5Target`. Sem alvo marcado → `ui.notifications.warn`, nada aplicado (NÃO cai pro conjurador — a magia não é `self`).
- **Estado = AE flagada** no ATOR-ALVO (não no conjurador): `flags.<MODULE_ID>.orientacaoDivina = {mode, scopeAttrs, casterActorId, casterName, expireKind, combatId, appliedRound}`. Recast no mesmo alvo não empilha (remove a anterior). Cancelar pelo skills-menu afeta o buff do PRÓPRIO ator ativo (quem recebeu, não quem conjurou — a AE mora nele).
- **Detecção do cast:** `createChatMessage` (autor, debounce 2s/ator), mesmo `resolveCastItem` via `data-item-id`/`data-actor-id` do Concentração (`itemData` de magia não traz `name`/`type`). Aplica via socket `executeAsGM` (`orientacao-divina/apply`), posta card.
- **Limpeza:** skills-menu "Cancelar Orientação Divina" (`orientacao-divina/remove` GM); `deleteCombat`→remove de `relevantActors()` (world ∪ sintéticos, gate `game.user.isGM`); modo "once" expira no `combatTurnChange` (início do turno do DONO do buff, rodada > appliedRound, gate `isActiveGM`) se não foi usado. Cena→`deleteCombat`.
- **⚠️ BUG v1.100.0→v1.100.1 (crítico, resolvido):** `SPELL_NAME` estava `"orientacao divina"`, string que não existe em NENHUM nome real do compêndio → a detecção do cast nunca disparava, com ou sem aprimoramentos (bug reportado como "sem aprimoramentos não faz nada", mas na real acontecia sempre). Fix: `SPELL_NAME = "orientacao"`.
- **⚠️ BUG v1.101.1 (real, resolvido — não era design correto como eu tinha concluído):** achei inicialmente que Fortitude ficar em `1d20` era intencional (raciocínio: "teste de resistência ≠ teste de perícia"), mas o usuário corrigiu — a exclusão só existe no texto dos aprimoramentos +2/+5, a base NÃO tem essa ressalva. Fix: `isEligibleSkill` ganhou parâmetro `mode`; só filtra em `"persistent"`. Lição: quando o usuário cita o texto exato do livro contradizendo minha leitura, o texto dele é a fonte de verdade, não minha inferência de terminologia.
- **Verificado ao vivo (Al Simmons, Arcanista 3), múltiplas rodadas (console + clique real na ficha/HUD):** base sem aprimoramento → card postado, AE `mode:"once"` no alvo, PRIMEIRO teste de perícia (incl. Fortitude!) saiu `2d20kh` (fórmula e dados capturados no chat), buff consumido depois do uso; +2 PM (escolha "Constituição", mesmo atributo de Fortitude) → AE `mode:"persistent", scopeAttrs:["con"]`, Fortitude saiu `1d20` normal mesmo com o escopo batendo (exclusão correta só no modo persistente) e a AE PERMANECEU (não consome); Furtividade/Percepção/Atletismo (perícias comuns) sempre `2d20kh` quando elegíveis. Pós-refatoração pro registro compartilhado de vantagem: reconfirmado `2d20kh` em Percepção via clique real na ficha (14 descartado, 18 mantido, total 28).

### CD de magia usa o atributo de CONJURAÇÃO do ator (v1.86.1)

`src/t20-fixes/spell-cd-formula.ts`. O nativo (e o patch até v1.86.0) computava a CD com `atributos[resistencia.atributo]` **do ITEM** — e as magias dos compêndios vêm com o atributo da classe "típica" (arcanas=`int`, divinas=`sab`). Conjurador de OUTRO atributo pegava CD errada: Allegro (bardo, Car 9, `attributes.conjuracao="car"`) tinha Sono/Enfeitiçar/etc. com CD **15** (14+Int 1) enquanto a ficha mostra 23. Fix: `castingAttr = attrs.conjuracao || resist.atributo` (o dropdown "CD de Magias" da ficha vence o item; fallback pro item se o ator não define; Tradição Perdida override continua vencendo tudo). Verificado ao vivo: Sono do Allegro 15→**23** (card do cast e modal de resistência idem); Korin (conjuração `sab`) teve "Luz" corrigida 15→22 de tabela; magias sem resistência intactas. Não precisa migração — `resistencia.cd` é derivado a cada preparação.

### Golpe Pessoal (v1.85.0)

`src/golpe-pessoal/` (`effects.ts` puro + `build-dialog.ts` + `index.ts`). Poder do guerreiro (5º): golpe construído com efeitos de uma lista de 24; custo = Σ efeitos (mín 1 PM); arma específica (salvo Qualquer Arma); reconstrói ao subir de nível; limite de PM/rodada em golpes = nível.

- **Build:** dialog `.t20-dialog` aberto no `createItem` do poder (gated userId, character), no level-up (`updateItem` de classe c/ `system.niveis`) e via botão **GM-only** no `renderItemSheet` do poder. Elemental tem qty por elemento; Letal 1×/2×; **Conjurador lista as magias de 1º/2º círculo da ficha** (custo dinâmico = custo da magia + 1). Salvo em `flags.<MODULE_ID>.golpePessoal` do ITEM + resumo espelhado na descrição (bloco idempotente). Detecção por nome (`isGolpePessoalPower`: poder + norm inclui "golpe pessoal").
- **Uso** (patch `AbilityUseDialog.create`, encadeado c/ Baforada/Inspiração/Bolsa, instalado no ready): usar o PODER → `return null` + `useGolpe`: gates (Perto da Morte PV≤¼; Golpe de Abertura round 1; Truque Secreto por alvo/cena; limite PM/rodada [flag `golpePmRound` {combatId,round,spent}]; PM suficiente) → arma equipada do build (`norm` includes bidirecional; picker se 2+) → Carregado (energizar seta flag `golpeCarregado` {ts,combatId,round}, janela = rodada+1 ou 120s) → **debita PM via `spendMana`** → seta `pendingUse` → `weapon.roll()` abre o dialog NATIVO da arma (Ataque Especial etc. continuam disponíveis).
- **Injeção no clone da arma** (mesmo wrapper, pós-`orig`): criticoM −2/−5 (Letal), criticoX +1 (Destruidor), push de parts de dano (Brutal `1dF` mesma face/tipo; Elemental `2Nd6[elemento]`; Carregado `2d8`; Sequencial dado stepado por acertos/cena), `dano.rd −10` (Penetrante, espelha o `ignoraRD` nativo), **Preciso = `result.rollKeep="khd20"`** (⚠️ o d20Roll lê `options.rollKeep`, mjs ~4819 — NÃO `rollKeeping`, que é só o valor pré-selecionado do template), entrada "Golpe Pessoal (N PM)" no `onUseEffects` do card. **Cancelou o dialog → reembolsa PM** (`spendMana(recover)`) e desfaz o gasto da rodada. Sacrifício (−10 PV) e consumo da carga só no submit.
- **Claim da mensagem:** a 1ª msg de roll da arma (autor + `data-item-id`/nome + fresh 90s) é reivindicada (`claimedByMsg`); posta card suplementar com notas informativas (Distante/Teleguiado/Lento/Avanço/Brando/Ricocheteante/Amplo/Impactante/Atordoante/Sifão/Penetrante), **Amplo** (compara o total do ataque com a Defesa de cada alvo marcado T — decisão do usuário) e botão **Conjurador** (`.t20-golpe-cast`): lança a magia escolhida SEM o custo base (pendingFreeSpell zera o custo do clone; piso nativo `max(custo,1)` → devolve 1 PM via `spendMana(recover)` agendado quando zera).
- **Pós-dano (auto-damage):** `AutoDamageRequest.golpe` (payload embutido pelo autor via `getGolpePayloadForMessage(message)` — claim on-demand, sem dependência de ordem de hooks). No prompt: **Penetrante** −10 na RD automática (imunidade prevalece). Ao aplicar (integral/metade/reduções/Aço-Rubi): `handleGolpePostDamage` no cliente do alvo — **Atordoante** rola Fort do alvo vs CD (10+½nv+For do atacante), falhou → `toggleStatusEffect("atordoado")` + `registerExpectedCondition` (1 rodada), 1×/cena (flag `golpeAtordoadoScene` no ALVO); **Impactante** nota c/ empurrão floor(dano/10)×1,5m; **Sifão/Sequencial/Truque** → socket `golpe-pessoal/post` (executeAsGM) atualiza o ATACANTE: pm.temp (cap/cena = nível, flag `golpeSifao`), `golpeSequencial.hits++` (dano aplicado > 0 = acerto — decisão do usuário), `golpeTruque.targets` (tokenId||actorId). Trackers com `sceneId` → reset natural ao trocar de cena.
- **Vários golpes:** cada cópia do poder tem build próprio (resolução por id do clone, fallback nome — cópias com MESMO nome resolvem pra primeira; renomear os poderes distingue).
- **UI v1.85.1:** efeitos em 2 colunas (`minmax(0,1fr)` — `1fr` puro deixa o select de magia estourar a janela); janela travada em 820px via `.window-app.t20-dialog:has(.t20-golpe-build){width:820px!important}` (⚠️ o t20-dialog.css tem `.window-app.t20-dialog:not(.ability-use-form){width:auto!important}` com especificidade 0,3,0 — a regra do golpe empata e vence por ordem, o style é appendado depois). **Magias do Conjurador** = ficha + TODOS os packs de Item (sistema Magias, Ameaças de Arton, Deuses/Heróis de Arton, Habilidades de Criaturas — ~162 de 1º/2º círc.) com busca; escolha guarda `spellUuid` e o botão do card IMPORTA a magia pra ficha se faltar (flag `golpeConjuradorTemp`, deletada ~2 min depois). **Arma** = search sobre `ABERRANT_WEAPONS` (base do armamento-aberrante) + armas da ficha; `equippedWeapons` do golpe também aceita arma DESEQUIPADA com flag `armamentoAberrante` (aberrantes nascem equipado:false mas estão "na mão") — verificado no Kai: build "Maça de guerra" usa a "Maça de guerra (Aberrante)". ⚠️ spendMana consome pm.TEMP primeiro — PM value intacto não é bug de débito.

### Divindades (v1.89.0)

`src/divindades/index.ts` + compêndio bundled `divindades` (`packs-src/divindades/`, 20 itens type poder subtipo "Divindade", gerados por script — ícones heráldicos em `public/assets/Heraldica/Deuses/<Nome>.png`, referência module-relative). Cada item carrega `flags.<MODULE_ID>.divindade = { nome, poderes:[nomes CORRIGIDOS dos compêndios], automacao: "aharadak"|"nimb"|null }` e a descrição = O&R.

- **Arrastar pra ficha (character)** → `createItem` (autor) → MODAL `.t20-div-modal` (janela 720px via `:has`): header fixo (símbolo 64px + nome), O&R (scroll próprio ≤150px), lista de poderes concedidos em **2 colunas** (`minmax(0,1fr)`, scroll SÓ na área ≤40vh) — cada poder com ícone+nome (click expande a descrição carregada dos compêndios) e checkbox. **Limite: 1 poder (2 com "Devoto Fiel"** — `maxPoderesConcedidos`, norm includes). Enforcement no change + no Finalizar.
- **Finalizar** → importa os poderes escolhidos (busca por nome em TODOS os packs de Item, sistema primeiro — `loadPowerDocs`), seta `system.detalhes.divindade`, posta card. **(v1.89.1) O PRÓPRIO item da divindade é o portador único das O&R** — NÃO cria complicação separada (v1.89.0 gerava dois itens quase idênticos; migração no ready [GM, idempotente] remove complicações `divindadeComplicacao` de quem tem o item da divindade). A automação lê a flag da DIVINDADE (fallback legado: flag da complicação). **Cancelar/fechar sem finalizar → DELETA o item** (escolha abortada). 2ª divindade → warn + delete do novo item.
- **deleteItem da divindade** → remove complicação legada + AE Nimb + limpa `detalhes.divindade`. Poderes concedidos FICAM (decisão: mestre remove).
- **(v1.89.1) Campo da ficha:** wrap `inline-flex` c/ `justify-content:flex-end`, `gap:6px` e `flex:0 0 auto` nos filhos — o `<li>` do header esticava ícone e nome pros extremos.
- **Ficha**: hook `renderActorSheet` troca o `<input name="system.detalhes.divindade">` por símbolo+nome clicável (abre o item) quando o ator tem a divindade — comporta como raça.
- **Automações O&R** (hooks `combatStart`/`createCombatant`, gate `isActiveGM()`, 1×/combate via flag `divindadeCombatRoll {combatId}`): **Aharadak** 1d6 ÍMPAR→Fascinado (cena); **Nimb** 1d6==1→Confuso (cena) — via `registerExpectedCondition` kind scene + toggleStatusEffect + card com o roll. **Nimb** também ganha AE persistente `system.modificadores.pericias.atr.car −5` (criada no Finalizar, origin = complicação, flag `divindadeNimbAE`).
- **⚠️ Nomes de poderes corrigidos** (usuário → compêndio): Espalhar Corrupção, Trilha Desempedida (typo do compêndio), **Armas da Destuição** (typo do compêndio, pack suplementos deuses-de-arton), Inimigo das Trevas, Aura de Medo, Curar o Espirto (typo do compêndio), Tradição de Samurai, Perceber Farsa, Tropas Goblinóides. Poderes de Arsenal vivem em `suplementos-de-arton.deuses-de-arton`; sem esse módulo instalado, o modal marca "não encontrado" e segue.
- **Verificado ao vivo (arton, Al Simmons):** modal 2 colunas c/ expand; limite 1→2 com Devoto Fiel; Finalizar importa poderes + complicação + campo; ficha mostra símbolo+nome; 2ª divindade bloqueada; delete limpa tudo (poderes ficam); Nimb: Enganação/Diplomacia −4 (Car 1 −5) e combate rolou 1d6=6 com card; regenerar pack = `node scratchpad/gen-divindades.mjs` (dados no plano `C:\Users\lucas\.claude\plans\divindades.md`).

### Encontros Aleatórios — Apêndice D (v1.92.0)

`src/encounter-roller/` reescrito a partir do **Apêndice D (Ameaças de Arton, p.422-431)** — substitui as 6 tabelas antigas (ambientes×níveis).
- **`encounter-data.ts` é GERADO** por `scripts/gen-encounters.py` (dados transcritos do PDF; NÃO editar à mão — ajustar o gerador e rodar `python scripts/gen-encounters.py`). **18 terrenos** (aquatico, artico, area_tormenta, colina, deserto, floresta, montanha, pantano, planicie, subterraneo, urbano, aslothia, estradas_reinado, galrasia, tauron, sanguinarias, supremacia_purista, tyrondir_lamnor), cada um com **28 faixas d%** (`1-2`…`201+`; a última faixa tem `max:null`). 504 encontros no total.
- **Patamar** desloca o d100: Iniciante +0, Veterano +30, Campeão +70, Lenda +110. `resolveEncounter(terrain, patamar, d100?, d4?)` (d100/d4 injetáveis p/ teste): `total = d100 + patamar.mod` → `findEncounterRow`. **Rhandomm** só no Lenda: `d100===100` natural → 1d4, no 1 substitui o encontro por `RHANDOMM_TEXT`.
- **Gatilho persistente** (`index.ts`): 1d20 + modificador acumulado (setting **world** `encounterTriggerMod`, config:false — sobrevive a reiniciar o Foundry). `≥20` → encontro + zera o mod; senão mod+1. Botão **Resetar contador** no modal. Botão **Forçar encontro** rola o d100 direto (não mexe no contador).
- **Modal**: seletor de terreno + patamar, barra do gatilho (mostra o mod atual), botões, e **Consultar tabela** (dialog com as 28 faixas + coluna que mostra o intervalo de d100 que cai em cada faixa PARA O PATAMAR escolhido — `d100Hint = [min-mod, max-mod] ∩ [1,100]`). GM-only, resultado sussurrado (blind) só pro GM.
- **Testes**: `resolveEncounter` é exportado de `index.ts` e testado (patamar shift, Rhandomm gated no Lenda, faixa aberta 201+). `validateTerrains` exercido (28 faixas, cobertura contígua 1..201+).
- Verificado ao vivo (arton): 18 terrenos/4 patamares no modal; gatilho mod 19 → 1d20=9=28≥20 → Deserto/Veterano d100 94+30=124 → faixa 116-125 correta + reset; acúmulo sem-encontro persistindo no setting; consulta 28 linhas com coluna d100 do patamar.

### Footer HUD — substitui a hotbar nativa (v1.95.0)

`src/hud/`. Barra de rodapé customizada (orbes PV/PM interativos, retrato, grid de Perícias, painel com abas Inventário/Poderes/Magias/Macros, indicador de combate) que **substitui visualmente a hotbar/macro-bar nativa do Foundry**, a partir de um design feito no Claude Design (projeto "Barra de Skills Foundry VTT", conectado via `DesignSync`).

- **Mecanismo de override**: `CONFIG.ui.hotbar = T20FooterHud` no hook `init` (`registerFooterHud()`, ANTES de `Game#initializeUI()` instanciar `ui.hotbar` — no `setup` seria tarde). `T20FooterHud extends foundry.applications.ui.Hotbar`.
- **Preserva `#slots`/`#page` nativos**: `_prepareContext()` chama `super._prepareContext()` — crítico pras teclas 1-0/PageUp/PageDown (`client-keybindings.mjs` usa `ui.hotbar.slots`/`ui.hotbar.changePage`) e pro offset de notificação do chat (`chat.mjs` faz `document.getElementById("hotbar")` direto). `_renderHTML()` troca a renderização por string-builder (padrão `t20-dialog.ts`) — retorna um `<div>` wrapper cujos **filhos** substituem o conteúdo do `<aside id="hotbar">` real (`_replaceHTML` herdado faz `content.replaceChildren(...wrapper.children)` pra part `root:true`).
- **`_onRender()` NÃO chama `super._onRender()`**: `Hotbar#_onRender` chama `_updateToggles()`, que faz `.classList` em botões `mute`/`lock` inexistentes no nosso markup → lança exceção (inclusive quando chamado de FORA, por `playlist-directory.mjs` ao destilenciar volume global). `_updateToggles()` é sobrescrito como no-op.
- **⚠️ `Hooks.call` desreferenciado perde o `this` interno do Foundry**: `const fn = Hooks.call; fn(...)` lança `Cannot read properties of undefined (reading '#events')` (`Hooks.call` é um método estático que depende do próprio `this` da classe). Sempre chamar `Hooks.call(...)` diretamente ou via `HooksStatic.call(...)` (cast, não desreferenciado numa variável solta) — bug real encontrado implementando o drag-and-drop de macros (`hud/macros-tab.ts`).
- **`#hotbar` some por completo sem ator ativo** (GM sem token controlado, sem `game.user.character`): `_renderHTML` retorna wrapper vazio. `getActiveActor()` = token controlado > `game.user.character`.
- **⚠️ Overflow: flex items e grid `1fr` não encolhem abaixo do conteúdo mínimo.** `#hotbar` é flex item de `#ui-bottom`; sem `min-width:0` explícito, ele NUNCA encolhe abaixo da largura intrínseca do conteúdo — nosso grid largo forçava `#hotbar` a crescer bem além dos ~60% centrais (medido: 2062px vs 1237px reais), vazando sobre a sidebar/controles de cena. Precisa de `min-width:0` em CADA nível da cadeia flex (`#hotbar`, `.t20-hud-root`) E `grid-template-columns: repeat(N, minmax(0,1fr))` — **não** `repeat(N, 1fr)` puro (equivale a `minmax(auto,1fr)`, que não encolhe abaixo do texto `white-space:nowrap` dos nomes de slot). Sem isso, o `ResizeObserver` mede o tamanho JÁ inflado por `#hotbar`, nunca o espaço realmente disponível — ciclo que nunca se corrige sozinho.
- **⚠️ `chat.mjs#offsetHotbar` desloca `#hotbar` via `transform`** pra "abrir espaço" pra notificações de chat flutuantes, assumindo a hotbar nativa ESTREITA. Como nossa HUD ocupa quase toda `#ui-middle`, esse cálculo sempre acha colisão e empurra a barra pra fora da área de controles de cena. Neutralizado com `#hotbar.t20-footer-hud.offset { transform: none !important; }` (a classe/CSS var nativas continuam sendo setadas, só ignoramos o resultado visual).
- **Responsividade** (`hud/responsive.ts`): `colsForWidth(width)` calcula colunas do grid pela largura REAL do container via `ResizeObserver` sobre `this.element` — não `window.innerWidth` nem só `_onResize()` nativo (que só reage a resize de JANELA; colapsar/expandir a sidebar de chat muda a largura de `#ui-middle` sem disparar esse evento). Breakpoints calibrados ao vivo em 1280/1501/1920px.
- **Painel direito**: 4 abas (`right-panel.ts` + `macros-tab.ts`). Inventário = `type ∈ {arma,equipamento,consumivel,tesouro}` (precedente `miasma/index.ts`); Poderes/Magias = `type==="poder"/"magia"`; **Macros é diferente** — reflete a PÁGINA REAL da hotbar nativa (`this.slots`/`this.page`, não paginação própria, pra não quebrar a correspondência com teclas 1-0/PageUp/Down) e reimplementa o drag-and-drop (`foundry.applications.ux.DragDrop.implementation`, `TextEditor.implementation.getDragEventData`, `foundry.utils.getDocumentClass`, `game.user.assignHotbarMacro`), disparando o hook `hotbarDrop` — não herda o bind nativo porque `super._onRender()` não é chamado.
- **Clique real**: perícia → `actor.rollPericia(key)` (abre `AbilityUseDialog` nativo); poder/magia/item → `item.roll()` (idem; posta direto no chat quando não precisa de confirmação). Orbes: `orb.ts` consome `pv.temp` antes de `pv.value` (padrão `auto-damage/index.ts`), sem socket (sempre o dono mexendo no próprio personagem); update OTIMISTA no DOM antes do `actor.update` resolver, com o full re-render adiado até o floater `+N`/`−N` terminar a animação (senão o render mata o floater no meio).
- **Combate** (`combat-toggle.ts`): API confirmada lendo `client/documents/combat.mjs` — `combat.started = round>0`; `combat.endCombat()` já abre `DialogV2.confirm` nativo e deleta o documento; criar do zero replica `CombatTracker#_onCombatCreate` (`Combat.create()` + `activate({render:false})` + `startCombat()`). **O indicador visual "Em Combate/Fora de Combate" foi removido da UI** por pedido do usuário — a lógica (`getCombatState`/`toggleCombatState`) permanece testada e disponível.
- **Finalizar Turno — condição de exibição (v1.96.2):** `Combatant#players` nativo (`client/documents/combatant.mjs`) é `game.users.filter(u => !u.isGM && this.testUserPermission(u,"OWNER"))` — **SEMPRE exclui GMs**, mesmo quando o GM está com o token do combatente ativo selecionado. Com a condição original (`combatant.players.includes(game.user)`), o botão nunca aparecia em teste solo/mesa onde o GM controla os PCs diretamente — bug reportado ao vivo. Fix: `getCombatState(activeTokenId)` agora aceita o id do token atualmente controlado na HUD (`active-actor.ts` → `getActiveTokenId()`) e `isMyTurn` vira **OR** de duas condições: (1) `players` nativo inclui `game.user` (jogador dono, mesmo sem token selecionado), (2) `activeTokenId === combatant.tokenId` (comparação por TOKEN, não por `actor.id` — cobre NPCs unlinked duplicados que compartilham `actor.id` entre instâncias, ver gotcha de "múltiplos tokens unlinked do mesmo NPC"). Verificado ao vivo (Aller Brushfighter, GM2 controlando o token do combatente ativo): botão aparece no início do turno, clique chama `combat.nextTurn()` (round 1, Aller→Al'gazaha confirmado via `game.combat.combatant.name`), some corretamente quando o turno passa pra um combatente cujo token o GM não está controlando.
- **Retrato**: quadrado (não circular), nome sobreposto num gradiente escuro na base (`.t20-hud-portrait-name`), não mais um `<div>` de nome separado acima. **(v1.95.1) `background-size:contain` (não `cover`)** + `background-color:var(--t20-bg-deepest)` — igual ao `img.profile` nativo da ficha (`object-fit:contain`, container quadrado 160×160). Retratos de corpo inteiro (naturalmente bem mais altos que largos, ex. 512×1024) ficavam com a maior parte cortada em `cover`; `contain` mostra a arte completa (letterboxed), consistente com o que a ficha padrão já exibe pra mesma imagem.
- **Perícias de Ofício treinadas (v1.97.0):** `pericias-data.ts` `buildOficioSlots(actor)` acrescenta à grade de perícias as 6 variantes de Ofício do T20 (`alfa/alqu/arme/arte/cozi/enge`, `trainedOnly`, atributo Int) **só quando `system.pericias[key].treinado === true`**. Label compacto = `pericias[key].label` (ou `CONFIG.T20.pericias[key].label`, ex.: "Ofício: Armeiro") sem o prefixo "Ofício: " → "Armeiro". Ícone = o novo "Ofício" (cinzel/martelo) do design. `buildSkillSlots` retorna `[...28 fixas, ...ofícios treinados]`, então a paginação por seção já acomoda (ex.: 29 perícias → 3 páginas). Clique → `actor.rollPericia(key)` nativo (verificado ao vivo: Altheus, "Ofício: Armeiro" +5, abre "Configuração de uso de perícia: Ofício: Armeiro").
- **Classes/níveis** (v1.96.0): `classes.ts` — `classesForActor(actor)` filtra itens `type==="classe"` e lê `system.niveis` (mesma fonte que `tradicao-perdida`/`golpe-pessoal` usam pro nível total). Renderizado abaixo do retrato (`.t20-hud-classes`, dentro de `.t20-hud-portrait-col`) como `"Nome N"` por classe, separadas por `" · "`. Container tem só 56px de largura — multiclasse não cabe numa linha; `-webkit-line-clamp:2` permite quebrar em até 2 linhas em vez de truncar com ellipsis (que cortaria a 2ª classe inteira). Verificado ao vivo (Aller Brushfighter, Lutador 1 + Arcanista 2): "Lutador 1 ·" / "Arcanista 2" em 2 linhas, sem estourar a coluna do retrato nem o layout do HUD.
- **Stepper de linhas** (`state.ts`): `rows` (1-4) persiste via client setting `hud.rows` (`scope:"client", config:false`). **(v1.96.1) Coluna própria, não mais overlay:** o divisor que carrega o stepper (`.t20-hud-divider.has-stepper`) tinha só 2px de largura — o stepper (`position:absolute` centralizado nele) vazava por cima do painel vizinho (perícias à esquerda ou inventário/poderes/magias à direita, dependendo de qual lado tinha menos conteúdo), cobrindo slots clicáveis. Fix: `min-width:34px` reservado de verdade nessa coluna + stepper `position:relative` (centralizado pelo flex do pai, não mais `position:absolute`) — overlap estruturalmente impossível agora, não só "corrigido visualmente".
- **Botão Finalizar Turno (v1.96.1):** era um círculo cheio grudado no canto inferior direito do root (`right:-8px`), sobrepondo o orbe de PM/coluna direita. Reposicionado pro **topo-centro do painel** (`.t20-hud-panel` virou `position:relative`; botão ancorado nele, não no root, pra acompanhar a altura dinâmica do painel independente de quantas `rows` estão configuradas) com formato de **meio-círculo** (`width:84px height:42px border-radius:42px 42px 0 0` — raio = altura = metade da largura, arco perfeito; `border-bottom:none`), saltando pra fora da borda superior (`transform:translate(-50%,-88%)`, quase inteiro acima da borda, evitando qualquer sobreposição nova com o stepper ou o conteúdo do painel).
- **Botão não era cortado pelo clip do `#hotbar` (v1.96.3):** o `#hotbar.t20-footer-hud` tinha `overflow:hidden` (guarda contra vazamento horizontal sobre a sidebar) — mas isso também **cortava** o botão que salta ~37px acima da borda superior. Trocado por `overflow:clip; overflow-clip-margin:64px` — o clip horizontal continua (min-width:0 + minmax(0,1fr) já limitam a largura, então nada vaza lateralmente dentro dos 64px), mas o botão escapa pra cima por inteiro. `overflow-clip-margin` estende a região de clip em todos os lados; as bordas laterais são vazias, então a margem só revela o botão no topo.
- **Botão não cobre a linha superior da barra (v1.96.4):** o botão saltava acima da borda mas com `z-index:5` cobria a **linha dourada do topo** do painel (base do meio-círculo por cima da borda). Trocado pra `z-index:-1` — o painel (`position:relative` sem stacking context próprio) pinta seu fundo/borda NA FRENTE do botão, então a base do meio-círculo fica escondida atrás da barra e a linha superior segue intacta ("sai de trás da barra"). A parte que salta acima continua clicável (nada na frente; `elementFromPoint` confirma o hit no botão).
- **Input flutuante de chat não sobrepõe mais a HUD (v1.96.3):** quando a sidebar está numa aba que NÃO é o chat, o Foundry mostra `#chat-notifications` (input + mensagens flutuantes) ancorado no fundo da coluna direita — que cai na MESMA faixa inferior ocupada pela nossa HUD larga, sobrepondo o painel direito. Fix: `T20FooterHud._onRender`/ResizeObserver expõem a altura real da barra em `--t20-hud-height` (`:root`, +6px de folga; colapsa a ~0 sem ator ativo), e o CSS levanta `#chat-notifications` com `margin-bottom: var(--t20-hud-height)`. Verificado ao vivo (aba Combate aberta): input sobe de `bottom 879` pra `bottom 715`, acima da borda superior da barra (`top 784`) — sem overlap.
- **Retrato — hover-preview + clique abre a ficha (v1.99.0):** `portrait-hover.ts`. Hover → integração OPCIONAL com o módulo "Image Hover" (`game.modules.get("image-hover")?.active`; ativo neste mundo): chama `canvas.hud.imageHover.bind(token)` DIRETAMENTE (não `showArtworkRequirements()` — essa exige `token === canvas.tokens.hover`, comparação de referência com o token de fato sob o cursor no CANVAS, que nunca bate aqui; `bind()` é o mesmo caminho que o próprio módulo usa no `showToAll()`, pulando esse gate). Se o ator ativo é o token controlado, passa o token REAL (`canvas.tokens.controlled[0]`, `instanceof PlaceableObject` — obrigatório, `_canRender` do `BasePlaceableHUD` lança erro senão); senão (ator veio de `game.user.character` sem token na cena), monta um shim mínimo (`actor`, `document.actorLink/texture.src/getFlag`) com os campos que o módulo lê. Mouseleave → `.close()`. Sem o módulo instalado, no-op (feature cosmética, sem fallback bundled — mesmo padrão de integração opcional do Arms Reach). Clique → `actor.sheet.render(true)` nativo. Verificado ao vivo (Aller Brushfighter): hover mostra o preview no canto da tela (idêntico ao hover nativo de token — comparado byte-a-byte via `token._onHoverIn` direto), mouseleave fecha, clique abre a ficha completa.
- **Fonte de design**: projeto Claude Design conectado via `DesignSync` (`projectId 7b287ef2-9d80-4eb4-9b5e-e2525d68a891`, "Barra de Skills Foundry VTT"). `skill-icons.ts` portado 1:1 de `skill-icons.js` do design. `image-slot.js` do design NÃO é portável (web-component exclusivo do runtime do Design) — retrato usa `actor.img` direto.
- **Verificado ao vivo (arton, Al'gazaha)**: teclas 1-0/PageUp/PageDown intactas; `_updateToggles` chamado externamente (destilenciar volume) sem erro; orbes com floater+update otimista; abas trocam, paginação por seção independente; drag-and-drop de macro real (slot vazio→cheio, clique executa); stepper persiste entre reloads; combate GM inicia/encerra (dialog nativo), "Finalizar Turno" ausente corretamente quando o GM não é dono do combatente; sem overflow em 1280/1501/1920px (barra alinhada exatamente com `#ui-middle`, sem sobrepor controles de cena/sidebar).

**Ajuste manual de PV/PM com sinal, barra de capacidade, reordenar por arrastar, animação de líquido (v1.102.0):**
- **Orbes — prompt com sinal explícito** (`orb.ts`): clicar no orbe abre um campo de TEXTO (não mais `number`) com placeholder `"+5 ou -3"` — `parseSignedDelta(raw)`: `"+5"`→+5 (cura/recupera), `"-3"`→-3 (dano/gasto), `"5"` sem sinal→-5 (mantém o hábito antigo de "clicar e digitar" como dano por padrão). Substituiu o modelo anterior (clique=dano fixo/Shift+clique=cura) — decisão do usuário: um clique só, o sinal digitado decide a direção. `Shift` não tem mais papel aqui.
- **Barra de capacidade** (`capacity.ts` `buildCargaVM`): lê `system.attributes.carga` (mesmo dado DERIVADO que a ficha nativa usa em `encumbrance.hbs` — `{value,limit,max,pct,encumbered}`; nada recalculado aqui). `null` quando `carga.max` é 0/ausente (ator sem capacidade rastreada) — mesmo guard do `{{#if carga.max}}` nativo. Renderizada **ao lado do título "Perícias"**, separada por um `|` (`.t20-hud-title-sep`, `margin:0 16px` — 16px de cada lado, `color:var(--t20-border-ambient)`, a mesma var. do contorno do painel). Fica vermelha (`.encumbered`) quando `carga.encumbered` é true — mesmo critério da ficha.
- **Reordenar por arrastar-e-soltar** (`reorder.ts` puro + `state.ts` persistência): Perícias E painel direito (Inventário/Poderes/Magias — Macros fica de fora, já tem seu próprio drag-and-drop de ATRIBUIÇÃO em `macros-tab.ts`, não de reordenação). `computeReorderedKeys(currentKeys, draggedKey, targetKey)` recalcula a ordem completa (o item arrastado fica logo ANTES do alvo); `applyCustomOrder(items, order)` aplica a ordem salva, com itens novos indo pro final (ordem natural) e chaves obsoletas ignoradas — nunca quebra com mudanças de inventário/perícias treinadas. Persistência client setting `hud.customOrder` (Object, `{ [actorId]: { [listKey]: string[] } }` — `listKey` é `"skills"` ou uma `RightTabKey`), então cada ator mantém sua própria ordem. `slots-grid.ts` ganhou um parâmetro opcional `dragList` que marca os slots com `data-drag-key`/`data-drag-list`/`draggable="true"`; `T20FooterHud#wireDragReorder()` liga os listeners nativos (`dragstart`/`dragover`/`drop`) e persiste + re-renderiza no drop.
- **Animação de líquido + brilhos de dano/cura/gasto** (`hud.css` + `orb.ts`): `.t20-hud-orb-fill::before` — brilho de superfície ondulando devagar em loop (`t20HudLiquidWave`, sem imagem/SVG externo) pra dar impressão de fluido vivo mesmo parado; classe `.t20-liquid-pulse` (adicionada/removida via JS a cada confirmação do prompt) toca um "splash" de brilho (`t20HudLiquidPulse`, `filter:brightness`) no instante da mudança. Anel de brilho ao redor do ORBE INTEIRO (`::after`, `t20HudFlashRing`) via `flashClassFor(poolKey, delta)`: PV perde→vermelho (`--t20-color-danger-rgb`), PM perde→azul (`--t20-color-info-rgb`), PV ganha (cura)→verde (`--t20-color-success-rgb`); **PM ganha (recupera) fica sem brilho, de propósito** — só as 3 combinações pedidas pelo usuário, não generalizado pra todo delta positivo. `.t20-hud-orb-label` ganhou `text-shadow` (não tinha) pra legibilidade do "Vida"/"Mana" contra o fundo variável do orbe.
- **Verificado ao vivo (Al Simmons, Arcanista 3):** capacidade "16.5 / 15" com classe `.encumbered` (Carga>Sobrecarga, igual à ficha), separador com `margin-left/right:16px` e cor `rgb(106,78,24)` (`--t20-border-ambient`) confirmados via `getComputedStyle`; prompt "+5" curou PV 29→33 (capado no max) com `t20-flash-success` + `t20-liquid-pulse` aplicados; "5" sem sinal causou dano 33→28 com `t20-flash-danger`; "-1" no orbe de Mana 2→1 com `t20-flash-info`; drag real (`DragEvent`+`DataTransfer` simulados) reordenou Perícias (arrastar "Atuação" sobre "Acrobacia" → fica antes) E o painel de Poderes, persistindo entre re-renders via o client setting.
- **⚠️ BUG v1.102.1 (real, resolvido) — Enter não confirmava o prompt:** usuário reportou "aperto enter e nada acontece". Reproduzido ao vivo com clique+digitação REAIS (não só eventos sintéticos): o `KeyboardEvent` do Enter chegava no input com `key`/`code`/`keyCode` todos vazios/zero — captura direta confirmou (`target:"INPUT"` correto, mas sem identificador de tecla legível). Causa raiz não 100% cravada (suspeita: alguma combinação de layout/IME/extensão no ambiente do usuário não popula `.key` de forma confiável em todo input — o mesmo padrão apareceu na ferramenta de automação usada pra reproduzir), mas em vez de só caçar a causa exata, o fix prioriza ROBUSTEZ: (1) detecção de Enter/Escape com fallback em 3 propriedades (`key`/`code`/`keyCode`), não só `key`; (2) **botão ✓ explícito** como caminho de confirmação garantido, independente de QUALQUER particularidade do evento de teclado — `mousedown`+`preventDefault()` (não `click`) pra não deixar o input perder o foco (que dispara `blur`→fecha o prompt) ANTES do clique terminar; (3) guarda `resolved` em `finish()` pra eliminar qualquer risco de disparo duplo entre Enter (que remove o prompt, e a remoção de um input focado dispara `blur` SINCRONAMENTE) e o próprio listener de `blur`. **Verificado ao vivo:** clique real (mouse) no botão ✓ após digitar "+5" → PV 29→33, prompt fechou; o mesmo teste via tecla Enter simulada pela ferramenta de automação (que não popula `key`) confirmou que SEM o botão o prompt ficava preso — com o botão, sempre há um caminho que funciona.

### Loot: distribuição, overlay de fim de combate e riqueza interativa (v1.93.0)

Expande o `src/treasure/` (gerador de tesouro + saque por right-click).
- **`loot.ts`** (puro): `summarizeLoot(lines)` → `{totalTibar, items[]}`. O engine (`treasure-engine.ts`) ganhou campos opcionais em `ResultLine`: `tibar?` (valor em T$/prata) e `assign?` (`AssignItemInfo{name,category,upgrades[],preco,ref}`). Conversão de moeda `currencyToTibar` (TO=10, T$/TP=1, TC=0,1 — taxas do `CURRENCIES` do sistema). `tibarToCoins` (T$→prata+cobre, 1 T$=10 TC), `perShareTibar`.
- **`loot-store.ts`**: memória por combate na flag `flags.<MODULE_ID>.lootLog` (Combat). `recordLoot` (dedup por tokenId), `getLootLog`, `getPresentPlayers` = combatentes `type:"character"` + `hasPlayerOwner` (dedup por ator).
- **`loot-overlay.ts`** (+`.css`): overlay persistente (NÃO auto-some, só botão Fechar). Jogadores veem total + itens (leitura). GM vê dropdown por item (presentes) + botão "Distribuir igualmente" ao lado do total + "Entregar itens".
- **`item-resolver.ts`**: `deliverItemToActor` busca o item por nome em TODOS os packs de Item (sistema primeiro); achou → copia pra ficha (com melhorias: renomeia "Base (Melhorias)" + nota na descrição — **auto-aplicar slot de upgrade NÃO é feito**, avisa o GM); não achou → placeholder do tipo por categoria + aviso. (Auto-aplicação mecânica da melhoria ficou de fora: labels i18n `T20.WeaponUpgrades*` → risco de corromper o item.)
- **`riqueza-picker.ts`** (puro): `parseRiquezaCategories(exemplos)` divide o campo `exemplos` por linha de espaço ("0,5 espaço: …;\n1 espaço: …"); `splitItems` respeita parênteses; `pickRiquezaItem` sorteia + resolve fórmula de quantidade ("1d4+1 soldadinhos"). O modal (`index.ts` `openRiquezaPicker`) mostra 1 checkbox por categoria; GM marca as cabíveis → rola 1d(N marcadas) p/ a linha → 1d(itens) p/ o item. Roda inline na geração/saque (`resolveRiquezasInteractive`).
- **Fluxo de combate**: saque de inimigo morto EM combate (`game.combat.started`) → `recordLoot` + chat curto "guardado"; FORA de combate → chat completo (comportamento antigo). No `deleteCombat` (GM), `onCombatEnd` agrega o log → `socket.executeForEveryone("treasure/loot-overlay", payload)` (todos os clientes; GM recebe também e liga os handlers). Distribuir soma `system.dinheiro.tp/tc`. Entregar chama `deliverItemToActor`.
- **Gerador de tesouro** (modal GM): resultado ganha botão "Distribuir / Atribuir" → abre o mesmo overlay com os presentes (combate atual, senão todos os PJs com dono).
- **Arms Reach**: se `game.modules.get("arms-reach").active`, `requestLoot` (jogador) chama `playerHasArmsReach` → `api.isReachable(tokenDoJogador, alvo)`; sem alcance → bloqueia. Sem o módulo ou sem token do jogador na cena → não bloqueia.
- **Verificado ao vivo (arton)**: overlay GM (total 100 T$, 2 dropdowns c/ PJs, distribuir/entregar); distribuir → +50 T$ em cada PJ; entregar "Espada longa" → resolvida do compêndio pra ficha; gerador sem regressão + botão distribuir; picker de riqueza (ND16 dobro) com 4 categorias/checkboxes/Sortear. Testes: `loot.test.ts` + `loot-store.test.ts` (15 casos).

### Distribuição de tibares de ouro fracionados (v1.103.0)

Antes de v1.103.0, TODA moeda do loot (TO/T$/TC) virava um número escalar `tibar` (T$) logo em `resolveMoney` — o tipo original de moeda era descartado, então "Distribuir igualmente" sempre soltava prata+cobre, mesmo quando o tesouro trazia tibares de ouro (TO).

- **`ResultLine.tibarOuro?`** (`treasure-engine.ts`): preenchido em `resolveMoney` só quando a moeda rolada é `TO` (valor já em T$-equivalente, igual ao `tibar` da mesma linha — não é um campo novo de unidade, é só "quanto do `tibar` veio de ouro"). `LootSummary.totalOuroTibar` (`loot.ts`, `summarizeLoot`) soma essa fração através da árvore, em paralelo ao `totalTibar` existente (que não muda de significado).
- **`splitGoldShare(totalTO, n)`** (puro, `loot.ts`): divide o total de TO (não de T$-equivalente — a chamada em `distributeTibarToPlayers` já faz `/10`) igualmente por cabeça; a parte inteira do quinhão fica em TO, a fração vira prata (`(share-to)*10`, 1 TO = 10 TP) — ex.: 90 TO / 4 → 22 TO + 5 TP por jogador (caso citado pelo usuário). Resto que arredonda pra 10 TP carrega +1 TO.
- **`distributeTibarToPlayers`** (`treasure/index.ts`) separa `totalOuroTibar` (→ TO via `splitGoldShare`) do restante (`totalTibar - totalOuroTibar`, T$/TP/TC como antes) e agora também escreve em `system.dinheiro.to` (campo que já existia no ator mas nunca era tocado pela distribuição — só tp/tc). Card de chat mostra "TO + T$ + TC" separados quando aplicável.
- `LootBroadcast`/`LootEntry` (loot-store) carregam `totalOuroTibar` opcional através do fluxo saque→combate→overlay, mesma forma que `totalTibar` já trafegava.

### Membros Extras — patas insetoides (v1.103.2)

`src/membros-extras/index.ts`. Poder da Tormenta: "Você possui duas armas naturais de patas insetoides... Uma vez por rodada, quando usa a ação agredir para atacar com outra arma, pode gastar 2 PM para fazer um ataque corpo a corpo extra com cada uma (dano 1d4, crítico x2, corte)."

- **Arquitetura (reaproveita 100% do `auto-damage` existente, mesmo padrão de `armamento-aberrante`):** ao ganhar o poder (`createItem`, ator `character`, mesmo idioma `hookUserId`/`isMyUser`/`actorOf` do `briga`), cria 2 itens `arma` EMBARCADOS reais — **"Pata Inseto 1/2 (Membros Extras)"** (`criticoM:20`, `criticoX:2`, dano `1d4 corte`, `espacos:0`, sempre "equipada" — arma natural). Ao remover o poder, deleta as 2 armas (`deleteItem`).
- **Trigger:** `createChatMessage` com o MESMO idioma de detecção do `auto-damage` (mensagem cujos `rolls` têm `type:"attack"` E `type:"damage"` — identifica qualquer ataque com arma, nativo ou não) de um ator com o poder, cujo `data-item-id` NÃO resolve pra uma das próprias Patas (evita reagir ao ataque extra que ELE MESMO dispara — sem essa guarda, fora de combate, onde o gate de rodada não existe, entraria em loop), e que ainda não foi ofertado nesta rodada. Abre um `Dialog` simples ("Não atacar" / "N ataque(s) extra(s) (N×2 PM)", até o teto de pernas pagáveis com o PM disponível).
- **Uma vez por rodada:** flag `membrosExtrasRound {combatId, round}` no ator, setada ASSIM QUE o prompt abre (não só na confirmação) — mesmo padrão do `golpePmRound` do Golpe Pessoal. Fora de combate (`combat.started` falso) o gate nunca ativa (não há "rodada"); a exclusão da própria Pata no trigger é o que impede loop nesse caso.
- **Execução:** por perna confirmada, `actor.spendMana(2)` + `weapon.roll({})` na respectiva Pata — como é uma arma NATIVA (rolls `type:"ataque"`/`type:"dano"` no formato padrão), o próprio `createChatMessage` do `auto-damage/index.ts` (já registrado, roda antes/depois independente da ordem) processa o ataque exatamente como qualquer outra arma: RD, reações, aplicação de dano no(s) alvo(s) marcado(s) em `game.user.targets`, crítico x2 em 20 natural nativo. **Nenhum código de dano/RD/aplicação foi escrito neste módulo.**
- **Fora de escopo** (nota, mesmo padrão de outras exceções documentadas): variante com armas leves equipadas nas patas via Ambidestria/Estilo de Duas Armas (penalidade −2, dano da arma em vez de 1d4) — só o caso base foi automatizado, por pedido explícito do usuário.

### Poções e Pergaminhos + identificação (v1.104.0, fix do patch v1.104.1)

Compêndio bundled `pocoes-pergaminhos` (`packs-src/pocoes-pergaminhos/`, gerado — **NÃO editar à mão**, ver regenerar abaixo) + `src/pocoes-pergaminhos/` (uso/identificação).

- **Harvest ao vivo** (colhido uma vez, GM logado, script no console — não versionado no bundle): itera `game.packs` (`documentName==="Item"`), filtra `type==="magia"`, extrai por magia `name/uuid/pack/circulo/custo(ativacao.custo)/execucao/escola/tipo/alcance/area/alvo/resistenciaTxt/descExcerpt/aprimoramentos[]` (aprimoramentos = `item.effects` com `flags.tormenta20.onuse===true`, `name` é a descrição completa do efeito — T20 não tem um "label" curto separado). Salvo em `C:\Users\lucas\.claude\plans\t20-harvest-magias.json` (fora do repo, mesmo padrão do `gen-divindades.mjs`). **264 magias colhidas** (6 packs: sistema `tormenta20.magias` 200 + `habilidades-de-criaturas` 3 + `suplementos-de-arton.{ameacas-de-arton,deuses-de-arton,guia-de-npcs-and-dbs,herois-de-arton}` 61) → **261 únicas arc/div/uni** após dedup por nome normalizado (prioriza o pack canônico do sistema; exclui `tipo:"sim"` — "simulada", não é magia real conjurável).
- **`scripts/gen-pocoes-pergaminhos.mjs`** (committed, reexecutável): lê o harvest → `packs-src/pocoes-pergaminhos/*.json`.
  - **Pergaminho**: 1 por magia elegível (arc/div/uni), SEM filtro de alvo — 261 gerados. Nome `"Pergaminho de <Magia>"`.
  - **Poção**: só magias elegíveis por alvo (`isEligibleForPotion`: exclui `alcance==="spec"`; exclui `alcance∈{"self","none"}` SEM `area` — mas inclui magias `alcance:"self"` COM área, ex. Explosão de Chamas/Talho Invisível, cone/esfera centrados no conjurador — 18 casos achados ao vivo). **1 variante base + 1 por CADA aprimoramento individual** (decisão do usuário: sem combinar 2+, evita explosão combinatória — power-set completo chegaria a milhares). Resultado real: 200 poções base + 569 variantes de aprimoramento = 769 poções, distribuição de 0 a 16 aprimoramentos por magia (outliers: Resistência à Energia 16, Conjurar Monstro 12 — contagem alta mas genuína, cada "escolha de elemento/tamanho" é uma AE onuse própria no compêndio nativo).
  - **Nome replica a convenção NATIVA do T20** (achada lendo `Item#roll` no `tormenta20.mjs` — mecanismo de "fabricar poção" nativo, `configuration.brew`, nunca usado pela nossa automação mas cuja lógica de nomenclatura foi copiada): tem `area` → **Granada**; `alvo` contém "objeto" → **Óleo**; senão → **Poção**. Bate com os sufixos que a tabela de tesouro já usa (`treasure-data.ts`: "Bola de Fogo (granada)", "Arma Mágica (óleo)") — ver B5 abaixo. Distribuição real: 532 Poção / 164 Granada / 73 Óleo.
  - Preço = `30 × custoPM²` (custo efetivo = base + aprimoramento, quando houver), `espacos:0.5`, `img` = `poção.png`/`pergaminho.png` bundled (`public/assets/Items/`, URL-encoded no JSON: `po%C3%A7%C3%A3o.png`). `type:"consumivel"`, `system.tipo:"potion"`/`"scroll"`. Flag `flags.t20-theme-overhaul.pocaoPergaminho = {kind, spellUuid, spellName, custoPM, aprimoramentoName, identificado:false}`. **Nome REAL no documento do compêndio** (uso do GM — precisa achar/arrastar certo); o mascaramento pro jogador acontece em RUNTIME, só na cópia entregue (ver abaixo), não no compêndio. Ownership `PLAYER:NONE` (igual `ameacas` — não é pra jogador navegar o compêndio direto, veria os spoilers de todo item).
  - **Regenerar**: colher o harvest ao vivo de novo (script no console, GM) → salvar em `C:\Users\lucas\.claude\plans\t20-harvest-magias.json` → `node scripts/gen-pocoes-pergaminhos.mjs` → `npm run build:packs`.
- **Uso** (`src/pocoes-pergaminhos/index.ts`): NÃO reimplementa a magia — clona a magia REAL via `fromUuid(spellUuid)` (mesmo padrão de `castGolpeSpell` em `golpe-pessoal/index.ts`), zera `system.ativacao.custo` (usar não custa PM — já pago na fabricação; **sem o floor nativo `max(custo,1)`** porque `hasManaCost` do T20 lê o custo ORIGINAL do clone, que aqui já nasce 0, ao contrário do caso do Golpe Pessoal que precisa de refund pós-hoc), importa temporariamente na ficha (flag `pocaoPergaminhoTemp`) e dispara `.roll()` nativo nela — reaproveita 100% da automação (spell-resistance, conditions-map, area-engine) sem código de dano/resistência aqui. Item temporário apagado ~2 min depois (mesma janela do Golpe Pessoal); consome 1 uso do item físico (`qtd -=1`, deleta ao chegar em 0) logo após disparar o roll.
  - **Pergaminho**: mantém TODAS as AEs de aprimoramento da magia no clone — picker nativo completo (quem ativa escolhe e paga PM extra pelos aprimoramentos).
  - **Poção base**: `effects:[]` no clone — nenhum picker.
  - **Poção com aprimoramento fixo**: mantém só a ÚNICA AE correspondente (`disabled:false`, pré-marcada); hook `renderAbilityUseDialog` (gated pela flag `pocaoPergaminhoTemp`) trava o(s) checkbox(es) restante(s) (`checked=true;disabled=true`) — não dá pra desmarcar.
  - **Patch em `Item.prototype.roll`** (`CONFIG.Item.documentClass.prototype`, NÃO `AbilityUseDialog.create`): item com a flag `pocaoPergaminho` retorna `null` direto de dentro de `.roll()` (cancela ANTES do nativo clonar/abrir dialog) e despacha pro identificar-ou-conjurar usando `this`/`this.actor` (o item REAL, não um clone).
- **Identificação** (`src/pocoes-pergaminhos/identify.ts`): itens entregues a um ator de JOGADOR (`createItem`, `actor.type==="character" && actor.hasPlayerOwner`) nascem **mascarados** — nome vira "Poção desconhecida"/"Pergaminho desconhecido", descrição genérica; nome/descrição REAIS movidos pra dentro da flag (`realName`/`realDescription`) antes de mascarar. Clicar um item mascarado abre o modal de identificação em vez de conjurar.
  - **Teste:** Misticismo (`computeSkillTotal(actor,"mist")`, mesma perícia do Contramágica) vs **CD 15 + custoPM** (`identifyCD`, regra citada pelo usuário — "Identificar Magia"). Sucesso → restaura nome/descrição reais + `identificado:true`. Falha → nada muda, sem penalidade de retry (T20 não define custo de tentar de novo fora de combate).
  - **Visão Mística (bypass sem teste):** lista curada `["visao mistica", "sentidos misticos", "visao feerica"]` — achada ao vivo buscando, nos compêndios, poderes cuja descrição referencia "Visão Mística" (regex + inspeção manual dos 4 hits: 2 falsos-positivos descartados — "Descendente Colleniano" só CONCEDE a magia, não deixa permanentemente sob efeito; "Dragonete (Parceiro)" É válido, mas com nuance de tier não detectável por nome só — não incluído por ora). Actor com QUALQUER um desses itens na ficha → botão extra "Identificar automaticamente" no modal, sem rolar dado.
  - **Animação opcional:** `playIdentifyAnimation` — só roda se `Sequencer` + (`jb2a_patreon` OU `JB2A_DnD5e`) estiverem instalados e ativos (checado via `game.modules.get(id)?.active`, mesmo idioma de integração opcional do `portrait-hover`/Presente dos Deuses); sem eles, no-op silencioso — feature nunca fica bloqueada pela ausência de um módulo de terceiros.
- **Loot da tabela resolve pro item novo** (`src/treasure/item-resolver.ts`): categoria `"pocao"` (da tabela `TREASURE.pocoes`, que referencia por NOME DE MAGIA, às vezes com sufixo `"(óleo)"`/`"(granada)"`/`"(2d8+2 PV)"`) agora tenta primeiro `findPocaoPergaminhoBase` — normaliza o nome da tabela (`stripTableSuffix`, remove o `(...)` final), busca no pack `pocoes-pergaminhos` por uma variante **BASE** (sem aprimoramento) cujo nome, uma vez removido o prefixo Poção/Granada/Óleo, bate (`pocaoBaseMatchesSpell`) — fallback pro `findCompendiumItem` genérico (placeholder) se não achar. Item entregue já chega com a flag `identificado:false` (herda do compêndio) — o hook de mascaramento de `pocoes-pergaminhos/index.ts` cuida do resto automaticamente (não precisou de código extra aqui: `createEmbeddedDocuments` dispara o MESMO `createItem` hook).
- **⚠️ BUG v1.104.0→v1.104.1 (real, resolvido) — modal de identificação nunca abria:** achado ao vivo (após o usuário relançar o mundo `arton`, pack `pocoes-pergaminhos` reconhecido, 1030 itens confirmados). `AbilityUseDialog.create(item)` é chamado pelo `Item.prototype.roll` nativo com `item = this.clone({keepId:true})` — nesta versão do Foundry/T20, o clone resultante tem `.id`/`._id` **`null`** (verificado direto no console: `item.clone({keepId:true}).id === null`), então `resolveRealItem(actor, clone.id)` não achava o item de verdade e o dispatch pro identify/cast silenciosamente não fazia nada (sem erro, sem dialog). Fix: patch movido pra `Item.prototype.roll` (via `CONFIG.Item.documentClass.prototype`) — intercepta ANTES do clone nativo existir, `this` dentro do método é o item REAL com id/actor válidos. GM2 (role TRUSTED, não GAMEMASTER — descoberto ao vivo, `game.user.role===2`) não tem permissão de relançar o mundo (`POST /setup` → 403) nem de `FilePicker.upload` (harvest precisou retornar o JSON direto pela ferramenta de automação em vez de gravar arquivo no Data via upload).
- **Verificado ao vivo completo (arton, pós-relaunch, Al Simmons):** harvest real (264 magias → 261 únicas), pack com 1030 itens confirmado (`game.packs.get(...).getIndex()`). Entrega mascara ("Poção desconhecida", flag `realName`/`realDescription` preenchida). Clique no item → modal de identificação abre, mostra CD correta (16 = 15+1 pra Curar Ferimentos) e detecta Sentidos Místicos do próprio Al Simmons (bypass automático oferecido). "Identificar automaticamente" → nome/descrição restaurados, `identificado:true`. 2º clique (já identificado) → importa a magia real, dispara o dialog nativo "Configuração de Uso de Magia" (aprimoramentos PESSOAIS do ator — Magia Instintiva, Tomo do Rancor etc. — aparecem normalmente, só os da MAGIA em si é que ficam vazios pra variante base; custo de mana total mostrou **0**), lançar → **o modal de resistência/cura do `spell-resistance` já existente abriu sozinho** ("Curar (9)"), aplicou a cura no alvo — confirma reaproveitamento real da automação, não só em teoria. PM do ator ficou inalterado (0 custo, sem cobrança de piso). Item físico consumido (deletado, qtd era 1) logo após o roll; clone temporário da magia ficou de pé (cleanup agendado ~2 min, não instantâneo — por design). B5 testado com 3 nomes reais da tabela de tesouro (`Bola de Fogo (granada)`→`Granada de Bola de Fogo`, `Arma Mágica (óleo)`→`Poção de Arma Mágica`, `Curar Ferimentos (2d8+2 PV)`→`Poção de Curar Ferimentos`) — todos resolveram certo.
- **Troca de itens legados nos inventários dos jogadores** (ação pontual, não é código do módulo): Al'gazaha e Aller Brushfighter tinham 5 poções/pergaminhos antigos (de outra fonte, sem automação nenhuma) — substituídos pelos itens novos do pack (mesma magia, `identificado:true` direto pois já eram conhecidos, `qtd` preservada). 2 dos 5 ("Emular Magia", "Punho de Mitral") só existem como Pergaminho no pack novo — as magias correspondentes são de alvo pessoal sem área, inelegíveis pra Poção pela regra RAW; os itens antigos rotulados "Poção" foram trocados pelo Pergaminho equivalente (mais correto que criar uma poção que a regra não permite).

**Ajustes pós-verificação (v1.104.2):**
- **Nome sem repetir o rótulo:** `buildItemName(label, spellName)` (`scripts/gen-pocoes-pergaminhos.mjs`) pula o prefixo "`<Label>` de " quando o nome normalizado da magia já contém a palavra (ex.: a magia real "Poção Explosiva" agora vira item **"Poção Explosiva"**, não "Poção de Poção Explosiva"; mesma checagem cobre Pergaminho/Granada/Óleo). Regenerado o pack inteiro (mesma contagem: 261 pergaminhos/200 base/569 aprimoradas).
- **Escolha identificado/não no drag-and-drop manual:** o mascaramento automático (`maskAsUnidentified`) só roda incondicionalmente quando o item chega via o **gerador de loot** — `deliverItemToActor` (`src/treasure/item-resolver.ts`) agora passa um marcador de contexto (`LOOT_DELIVERY_CONTEXT_KEY = "t20LootDelivery"`, exportado de `pocoes-pergaminhos/index.ts`) no 3º argumento de `createEmbeddedDocuments`, lido de volta no hook `createItem` (`options[chave]`). **Sem o marcador** (GM arrastando o item do compêndio direto pra ficha de um jogador) o hook abre um `Dialog` ("Identificado" / "Não identificado"); fechar sem escolher cai no padrão seguro (não identificado). Loot continua 100% automático, sem perguntar nada.
- **Imagens atualizadas + recentralizadas:** `poção.png`/`pergaminho.png` trocadas pelas versões atuais de `Data/assets/Items` (o usuário editou as artes depois do harvest original). A poção tinha um canvas não-quadrado (1109×1309) com o conteúdo desalinhado verticalmente (margem topo 98px vs base 232px — ~5% de offset do centro), o que ficava visivelmente descentralizado quando o Foundry corta pra thumbnail quadrada (`background-size:cover`). Recentralizado via script (`PIL`): bbox do canal alfa → canvas quadrado (lado = maior dimensão original) → conteúdo repastado exatamente no centro (sem reescalar, só reposicionar). Pergaminho já estava quase centralizado (~2%); mesmo tratamento aplicado por consistência.
- **⚠️ BUG v1.104.2→v1.104.3 (real, resolvido) — "Identificado" no drag-drop vinha mascarado:** `Dialog#submit` (`dialog-v1.mjs`) chama `button.callback.call(...)` **sem aguardar** o retorno e encadeia `this.close()` logo em seguida, **síncrono**. O callback do botão "Identificado" era `async` e só marcava `resolved=true` DEPOIS do `await item.update(...)` — quando `close()` rodava (imediatamente, antes do await terminar), via `resolved:false`, o guard falhava e o handler de `close` mascarava o item por cima da escolha ("Pergaminho desconhecido" mesmo escolhendo Identificado — bug reportado ao vivo pelo usuário). Fix: `resolved=true` é setado **síncrono**, na primeira linha do callback do botão, antes de qualquer `await`/promise.
- **⚠️ Corrupção do pack durante a correção (não é bug de código, é operacional):** uma cópia do pack `pocoes-pergaminhos` pro `Data/modules/.../packs/` foi tentada com o MUNDO AINDA RODANDO — o LevelDB tinha alguns arquivos travados (`Device or resource busy`) mas outros (o `.ldb` de dados) foram parcialmente apagados antes do erro, deixando o diretório num estado misto (dados reais ausentes, só stubs vazios). Um `relaunch` do mundo nesse estado disparou a rotina de RECUPERAÇÃO do LevelDB, que viu o log órfão vazio e **descartou** o manifest válido — resultado: compêndio vazio (itens "sumiram"). Fix definitivo: com o mundo REALMENTE parado (confirmar tentando apagar um arquivo do pack — se der `Device or resource busy` ainda está rodando), apagar o diretório INTEIRO e copiar os 6 arquivos do pack compilado (`CURRENT`, `LOG`, `MANIFEST-*`, `*.log`, `*.ldb`, `LOCK`) de uma vez, sem deixar nenhum arquivo órfão de tentativas anteriores — verificado byte-a-byte (`cmp`) antes de autorizar o relaunch. **Lição:** nunca copiar/mexer num pack LevelDB (`packs-src` build output) enquanto o mundo Foundry pode estar com o processo aberto — sempre confirmar "trava ainda existe?" com uma escrita de teste antes de declarar sucesso.

### Linhagem Dracônica + Coragem Líquida + fixes (v1.90.0)

**Linhagem Dracônica (Básica/Aprimorada/Superior)** — `src/linhagem-draconica/`. As AEs do compêndio nativo são QUEBRADAS: Básica tem key `system.tracos.resistencias.???.bonus` (placeholder literal) + `transfer:false` (nunca copia pro ator — não aplica nada); Aprimorada tem 2 onuse separadas (custo e dano +1 FLAT); Superior não tem effect.
- **Elemento único** (ácido/eletricidade/fogo/frio) escolhido em modal no `createItem` de qualquer das 3 (ou reconcile no ready — gated ao PRIMEIRO owner ativo ordenado); flag no ATOR `linhagemDraconicaElement` vincula as 3 versões; limpa quando o último poder sai.
- **`syncLinhagem`** idempotente (molde do heranca-draconica): AEs flagadas `linhagemDraconica`; remove as AEs nativas quebradas do item E das cópias no ator. Básica: `pv.atributos.car OVERRIDE true` (preparePVPM soma Car 1× — mesmo mecanismo do PM do Cruzado) + `resistencias.<el>.bonus ADD 5`. Superior: `pv.atributos.car` + **`pv.bonus.total ADD "@car"`** (ArrayField de fórmulas — `@car` resolve via simplifyRollFormula; verificado ao vivo PV 20→30 com Car 5) + `resistencias.<el>.imunidade OVERRIDE true` (applyDamage zera).
- **⚠️ GOTCHA/DESCOBERTA — per-die NATIVO**: `applyRollChanges` (mjs 5301) tem mecanismo de **+N por dado**: change **mode 0 (CUSTOM)** com `value:"d*1"` (`re.perd=/d\*\d+/`) → `perDie` no rollMod, aplicado como `parseInt(dano.match(/\d+d/)[0]) * perDie` (mjs 5764). E key **`dano:<tipo>`** targeta SÓ as parts com aquele `dmgType` (rollMods carregam `dmgType: parts[i][1]`) — se a magia não tem dano do tipo, no-op. A Aprimorada usa isso: UM effect onuse no ATOR (`spell:true`, `custo:"-1"`, change `dano:<el>`+`d*1`) = checkbox único que dá −1 PM (piso 1 nativo no débito) e +1/dado. Verificado: Explosão de Chamas 2d6[fogo] → `2d6[fogo]+2[fogo]`, débito 1 PM.
- **Superior — PM temp ao matar**: modal de resistência (`spell-resistance`, botão de aplicar dano) chama `notifySuperiorKillIfDead(targetActor, {messageId, damageType})` quando o alvo fica com PV ≤ 0 → socket `linhagem-draconica/superior-kill` (executeAsGM). GM valida (caster da msg tem Superior + elemento casa `damageType`/fórmula `[el]`), **dedupe por messageId** (1 grant por conjuração — "um ou mais inimigos"), `pm.temp += circulo` + card dourado. ⚠️ Import de `norm` vem de `@/inspiracao/format` (NÃO de spell-resistance — ciclo).

**Coragem Líquida** (`src/coragem-liquida/`): `combatTurnChange` (GM eleito) → portador do poder rola 1d4; **≠1 = silêncio** (sem spam); =1 → card + popup no cliente do dono (socket `coragem-liquida/prompt`, roteado por `getTargetUserId`). Popup lista TODOS os consumíveis com qtd≥1 (o jogador sabe qual é bebida): Beber → decrementa `system.qtd` + card; Sem bebida/fechar → **Pasmo 1 rodada** (registerExpectedCondition rounds:1 + toggleStatusEffect no cliente do dono — mesmo padrão do modal de resistência; aplica mesmo se imune). Sem consumível → Pasmo direto.

**Aharadak O&R (fix)**: Fascinado agora **1 rodada** (`kind:"rounds", rounds:1`) — o texto é "fica fascinado NA PRIMEIRA RODADA". Nimb/Confuso continua cena (texto sem duração). Card mostra "(1 rodada)".

**Proficiência (fix — caso Lancry)**: `isWeaponProficient` ganhou 2 camadas: (a) **`profArmas.custom`** (proficiências por NOME de arma, split `;`/`,`, match bidirecional normalizado); (b) **`PROF_POWER_OVERRIDES`** — poderes que reclassificam família de armas (Arquearia Élfica: "todos os arcos são armas simples" → qualquer arco proficiente). Lancry (Arco de Guerra exótica, só simples+marcial): −5 sumiu, ataque +4. ⚠️ O **−2 restante é NATIVO do item** (propriedade Desbalanceada hardcoded nas parts do compêndio Heróis de Arton) — não mexer.

**Arma Mágica (fix — dados do compêndio quebrados)**: o effect-base tem change `dano&magico` (key morta — `r.key.match(new RegExp(key))` nunca casa `dano1`) e **`?.items.arma` → `new RegExp("?.items.arma")` LANÇA SyntaxError** ("nothing to repeat") no filtro de rolls quando o checkbox é marcado no ataque. Fix em `t20-fixes/arma-magica.ts`: `sanitizeBuffEffectGroups` nos 2 pontos de aplicação de buff do spell-resistance (auto-apply ⚡ + `applyBuffEffect`, DEEP-CLONE antes — o shallow copy compartilha `changes` com o flag da msg): guard GERAL dropa changes com key `"?"*` (qualquer magia); Arma Mágica reescreve `dano&magico`→`dano`. Quando o alvo é o PRÓPRIO conjurador, adiciona 2º effect onuse "atributo-chave (<Attr>)" com change `{key:"atributoAtq", mode:5, value:attrs.conjuracao}` — checkbox no dialog de ataque troca o atributo do teste (verificado: pont 6→8 com Car 5). Limitação: botão nativo `chat-apply-ae` não passa por nós.

### Energético (esotérico) — custo 0 + Essência de Mana (v1.88.0)

**Energético** (`src/t20-fixes/energetico-upgrade.ts`): o template nativo `CONFIG.T20.upgrades.esoteric.energetic` (mjs ~L1011) NÃO define `flags.tormenta20.custo`. Ao aplicar o aprimoramento numa magia, o `applyOnUseEffects` faz `if (!Number(applied[ef.id]?.custo + 1) && item.type=="magia") options.truque = true;` (mjs ~L5885) — com custo `undefined`, `Number(undefined+1)=NaN`, `!NaN=true` → a magia é tratada como **TRUQUE** (bug). Fix: dar `custo:"0"` ao template no setup + migração (ready, GM) dos AEs `energetic` já criados (`needsCustoFix`). Com `"0"`: `Number("0"+1)=1`→`!1=false` (não vira truque) e `Number("0")=0` (aprimoramento continua de graça, só o +1d6 de dano). Verificado ao vivo (Al Simmons, Tomo do Rancor): aprimoramento aparece "0 PM Energético", cast de Adaga Mental marcando-o → dano `2d6+1d6[Energético]`, NÃO vira truque, gasta só o custo da magia.

**Essência de Mana** (`src/essencia-mana/index.ts`): o consumível ("recupera 1d4 PM") nativamente NÃO devolve PM ao usar — só posta card. Fix: hook `createChatMessage` (autor) detecta o uso do consumível `essencia de mana` (por `data-item-id`→item; **NÃO** usar fallback por nome — o card de qualquer habilidade tem data-item-id e dispararia errado), rola `1d4`, devolve o PM (cap no máximo, `computeRecoveredPm`) e posta card. ⚠️ O consumo da dose (`system.qtd`) é feito pelo PRÓPRIO T20 ao usar via o dialog — NÃO decrementamos (dobraria). Debounce 1,5s (o T20 pode postar >1 msg). Verificado ao vivo (Al'gazaha): PM 8→9 (1d4=1), qtd 4→3 (só a dose nativa); cast de magia com item no inventário NÃO dispara a essência.

**⚠️ BUG v1.103.1 (resolvido) — dois d4 no chat:** o item nativo carrega `system.rolls:[{type:"dano",parts:[["1d4","curapm",""]]}]` (visto nos `packs-src/ameacas/*` que têm Essência de Mana equipada) — o próprio T20 já posta UMA rolagem de d4 nativa ao usar o consumível (sem efeito nenhum, nunca lida por ninguém), e o hook do módulo, reagindo a essa mensagem, fazia SUA PRÓPRIA rolagem de d4 (a válida, usada pra restaurar PM) e postava um SEGUNDO card — 2 dados no chat, sem indicação de qual valia. Fix: depois de aplicar o PM e postar o card do módulo, `onEssenciaUse` deleta a mensagem nativa que disparou o hook (`message.delete()` — `deleteChatMessage` não re-dispara o hook, que só escuta `createChatMessage`). Só a rolagem válida (a do módulo) fica visível.

### Iniciativa com Efeitos de Uso de perícia (v1.84.0)

`src/iniciativa-buff/index.ts`. A iniciativa rolada pelo TRACKER (dado do combatente, "Rolar Todos"/"Rolar NPCs") usa `Combat.rollInitiative` → `_getInitiativeFormula` (roll seco `1d20 + inic`) — poderes que buffam teste de perícia gastando PM (Audácia, Engenhosidade, Fé Guerreira, Eclético...) nunca eram oferecidos.

- **Fix:** wrapper em `Combat.prototype.rollInitiative` (via `CONFIG.Combat.documentClass`, hook setup). Combatente com `initiative === null` cujo ator tem Efeito de Uso de perícia PAGÁVEL → redirecionado p/ `actor.rollPericia("inic")` — fluxo NATIVO da ficha: AbilityUseDialog (checkboxes + custo), débito automático de PM, card, e o `toInitiative` do T20 grava a iniciativa. Demais ids seguem o `orig` intocado. Redirecionados rodam em SEQUÊNCIA (evita pilha de modais no Rolar Todos).
- **⚠️ Filtro de elegibilidade** (= o do AbilityUseDialog p/ `type:"pericia"`, mjs ~L6180): cópias em `actor.effects` com flags `onuse` E **`skill`** truthy — a flag é `skill`, NÃO `pericia` (o branch sem-dialog do rollPericia usa `pericia`, que não existe nas cópias reais — pegadinha); `disabled:true` NÃO exclui (onuse ficam disabled por default — é o estado do checkbox). Restrição opcional `flags.tormenta20.items` ("Percepção;Sobrevivência") precisa incluir "Iniciativa". Corte adicional nosso: custo (`flags.tormenta20.custo`) ≤ PM disponível (value+temp).
- **Fallback pós-roll:** `toInitiative` acha o combatente por `actor.id` (falha c/ gêmeos unlinked/combate não-ativo) — se ESTE combatente segue null, extrai `msg.rolls[0].total` do ChatMessage retornado e chama `combat.setInitiative` direto.
- **Cancelar o dialog aborta** (paridade com a ficha); o dado do tracker continua disponível.
- **Setting world** `iniciativaBuffEnabled` (Boolean, config:true, default true).
- **Verificado ao vivo (Asuka + Audácia temporária):** dado do tracker → dialog "Uso de Perícia: Iniciativa" com "Audácia 2 PM"; marcar → PM 14→12, iniciativa gravada, card com o buff; Audácia = `roll += @car` (com Car 4 → init 22); Korin (Fé Guerreira 2 PM; Conhecimento das Rochas restrito a Percepção;Sobrevivência NÃO listado) → rolar sem marcar não debita PM; Rolar Todos misto → dialogs sequenciais; cancelar aborta limpo; Gnoll sem efeito → roll seco sem dialog.

### Upgrades Ajustada + Poderoso (v1.80.0)

`src/t20-fixes/ajustada-upgrade.ts` + `src/t20-fixes/poderoso-upgrade.ts`. Dois aprimoramentos de item que não funcionavam.

- **Ajustada (armadura/escudo)** — regra: penalidade de armadura do item **reduzida em 1, nunca acima de 0**. O template nativo (`T20.upgrades.armor.general.adjusted`, mjs ~L844) aplica `defesa.pda += "-1"` — **bug de sinal** (Escudo Leve −1 virava −2). **⚠️ NÃO dá pra consertar só o valor da change:** `defesa.pda` (ator) e `armadura.penalidade` (item) são **`PenaltyField`** (mjs ~L12118) — TODA atribuição vira `-Math.abs(v)`; uma AE `ADD +1` produz 0+1=1 → cast **−1** (verificado ao vivo: pda −1→−2 com a AE "+1"). Nenhuma change consegue SUBIR o pda. Fix: template vira **marcador** (changes vazias; fluxo nativo de criar/deletar a AE preservado) + **patch em `Item.prepareDerivedData`** que faz `armadura.penalidade = min(0, pen+1)` p/ equipamento com armadura + "adjusted" em melhoria1..4 + `enableAutoUpgrades` (derived only, nada persiste; o `prepareDefense` do ator lê o valor já corrigido). **⚠️ O patch é instalado no `init` via chamada TOP-LEVEL no main.ts** (padrão proficiencia.ts) — no setup/ready seria tarde: a 1ª preparação do mundo já teria rodado sem ele (bug pego ao vivo: pda voltava a −1 em load fresco). Migração no ready (GM): AEs "adjusted" existentes (ator + item — o `_createEffect` nativo cria NOS DOIS) têm as changes de pda removidas.
- **Poderoso (esotérico)** — regra: +1 na CD das magias do portador. Nativo é só `status.powerful="MANUAL"` (sem template/AE). Fix: injeta `T20.upgrades.esoteric.powerful` (change `system.attributes.cd += 1`, transfer:true, status DONE) — a CD das magias flui pelo patch existente `spell-cd-formula` (lê `actor.attributes.cd`); supressão por desequipar é nativa (`isSuppressedUnnequipped`; com `equipmentSlots` ON checa `equipado2.slot === 0`, NÃO `system.equipado`). Migração no ready (GM): esotéricos com "powerful" já selecionado ganham a AE — **⚠️ SÓ a cópia no ATOR** (origin = uuid do item): o T20 RE-COPIA efeitos do item pro ator no toggle de `system.equipado` (verificado: duplicou → CD +2) e `isSuppressedDuplicated` só protege efeitos de STATUS; sem cópia no item não há o que re-copiar. Migração também **deduplica** por origem e dá `actor.reset()` nos portadores — o label `resistencia.cd` das magias é computado 1 preparação ANTES da AE aplicar no load (ficava 1 abaixo até re-preparar).
- **Verificado ao vivo (world arton):** Aller (Escudo leve Ajustado) pda −2 → **0** já no load; Al'gazaha (Bolsa de Pó Poderoso, esotérico equipado) cd 11 → **12**, Adaga Mental CD 17 → **18**; desequipar via `equipado2.slot=0` suprime (cd 11); template Ajustada em armadura −2 → −1 (via `ajustadaPenalty`).

### Escudo Leve — mão livre (v1.73.0)

`src/escudo-leve/index.ts`. Regra do item: "amarrado no antebraço, deixando a mão livre — você pode carregar um objeto na mão que empunha o escudo e usar ataques desarmados normalmente". No sistema de **slots** do T20 (`equipmentSlots` LIGADO neste mundo) cada mão é um slot exclusivo, então um escudo leve numa mão impedia (a) carregar outro item na mesma mão e (b) manter o desarmado empunhado como **duas mãos** (slot 12.1 zera 1.1/2.1 → removia o escudo).

- **Solução:** escudo leve passa a ocupar um slot de **ANTEBRAÇO** = 1 índice além dos slots de empunhadura (`limiteEmpunhado+1` + `.1`, ex.: **3.1**). Continua contando como equipado (Defesa/RD do escudo dependem só de `equipado2.slot > 0`; **verificado ao vivo**: Defesa idêntica em 2.1 e 3.1, cai só ao desequipar). A exclusividade nativa (`_onToggleItem`) só limpa 1.1/2.1/12.1 → nunca toca no 3.1, então ambas as mãos ficam livres e duas-mãos-desarmado + escudo coexistem naturalmente.
- **Patches em `ActorSheetT20`** (achado subindo a cadeia de protótipos de `CONFIG.Actor.sheetClasses` até `name==="ActorSheetT20"`): `_onToggleItem` (escudo leve → alterna o slot de antebraço, sem tocar no ocupante da mão) + `_getItemToggleContextOptions` (troca as 3 opções por-mão por 1 único "Equipar/Desequipar (antebraço)", preservando Favoritar/Editar/etc.).
- **Migração no `ready`** (owner): move escudos leves já equipados numa mão (`isGripSlot`) p/ o antebraço. Idempotente.
- **Detecção** (`isLightShield`, pura/testável): `type==="equipamento"` + (tipo/subtipo `escudo` ou nome contém "escudo") + nome normalizado contém **"escudo leve"** (exclui Escudo Pesado). Helpers puros `forearmSlotFor`/`isGripSlot` testados. Só age com `equipmentSlots` LIGADO.
- **Verificado ao vivo** (Aller Brushfighter): shield migrou 2.1→3.1 (Defesa 20 mantida); desarmado como duas-mãos (12.1) não removeu o escudo; objeto "Tocha" equipado na mão 2 coexiste com escudo(3.1)+desarmado(1.1); toggle desequipa/reequipa (Defesa 19↔20).

### Acuidade com Arma — fix do ATAQUE (v1.68.0)

`src/t20-fixes/acuidade-arma.ts`. Antes só patcheava o DANO; o ataque dependia do T20 nativo, que tem dois buracos (descobertos lendo `getAttackToHit` no `tormenta20.mjs`):
- O T20 só troca For→Des no ataque quando `roll.parts[1][1]` (atributo) está **vazio** E a arma é `empunhadura:"leve"` de `corpo-a-corpo`.
- **Arremesso** nunca recebe Des no ataque (o `case "arremesso"` só trata `arremessoPotente`); e armas com **atributo explícito** (`parts[1][1]==="for"`, comum em armas importadas do bestiário) fazem o T20 PULAR a lógica de acuidade.

Fix: `injectAcuidadeAtaque` embrulha `getAttackToHit` forçando `roll.parts[1][1]="des"` (in-place, restaurado no `finally`) para armas elegíveis (leve corpo-a-corpo OU arremesso) com a flag `flags.tormenta20.acuidade` e Des>For. Cobre arremesso E atributo explícito; é no-op se já for `des` ou para corpo-a-corpo leve com atributo vazio (mesmo resultado do caminho nativo, sem dupla aplicação). O patch de DANO (swap `@for`→`@des` em parts literais) continua — parts `"padrao"` o T20 já trata. ⚠️ **A part de dano nativa é o sentinela `"padrao"`** (escolha "Padrão" no item), que o T20 resolve p/ `@for`/`@des` com acuidade no roll; só armas com atributo de dano EXPLÍCITO guardam `@for` literal (caso que o swap cobre).

**Propriedade Ágil (v1.68.1):** `isAcuidadeWeapon` também aceita armas com a propriedade **Ágil** (`system.propriedades.agi` legado / `agil`) — "Pode ser usada com Acuidade com Arma, mesmo não sendo uma arma leve" (ex.: **Katana de uma mão Ágil** da Asuka Kurogane). O T20 guarda a propriedade no dado mas NÃO a implementa, então sem isso uma arma Ágil de uma mão ficava em Força. Achado da verificação ao vivo: a katana era `empunhadura:"uma"` + `propriedades.agi:true` — o fix v1.68.0 (só leve/arremesso) não a cobria. As demais propriedades de arma (Adaptável/Alongada/Desbalanceada/Dupla/Versátil) também não são implementadas pelo T20 — ver `docs/t20-weapon-properties.md` + compêndio Journal bundled "T20 Overhaul — Propriedades de Arma" (`packs-src/weapon-properties/`).

### Material Adamante — arma/armadura/escudo/esotérico (v1.68.0)

`src/adamante/`. O T20 já tem **"Adamante"** (`CONFIG.T20.specialMaterials.adamant`) como opção no slot dedicado de MATERIAL (`system.upgrades.material`) da aba "Aprimoramentos" — mas SEM efeito mecânico (não havia template em `T20.upgrades.<cat>`, então selecionar não criava AE). Damos efeito a esse material já existente.

- **`setupAdamante()` / `injectAdamanteUpgrades`** (`index.ts`): injeta templates de AE keyed `adamant` em `CONFIG.T20.upgrades` no hook `setup` + status `"DONE"`:
  - `weapon.adamant` — **marcador** (sem changes). **+1 passo de dano feito por patch próprio** (`injectAdamanteWeaponStep` embrulha `rollDamage`), NÃO pela change `passos` nativa. ⚠️ Testado ao vivo (Katana Adamante da Asuka): o `passos` do T20 via AE onuse **não aplica** (o dado ficava 1d8/4d8 no crítico, nunca 1d10/4d10) — formato do change idêntico ao `passos` nativo de "Saque Celestial"/"Truque da Mão Lesta", mas não surte efeito no dano da arma. O patch sobe o PRIMEIRO dado `NdF` de cada roll de dano um passo via `CONFIG.T20.passosDano` ANTES do `rollDamage` original → o multiplicador de crítico do T20 (`criticoX`, `alter()`) incide depois, sobre o dado já elevado (1d8→1d10; crítico ×4 → 4d10). Detecção por `system.upgrades.material === "adamant"` (não depende de Automação/seleção no dialog). `stepDie` é puro/testável.
  - `armor.leve.adamant` / `armor.escudo.adamant` — `system.tracos.resistencias.dano.bonus += 2` (mode ADD). `armor.pesada.adamant` — `+= 5`. `transfer:true` (persistente); o T20 já **suprime quando o item não está equipado** (`isSuppressedUnnequipped`). RD física = `tracos.resistencias.dano` (somada em `prepareDamageResistances` de `base + bonus[]`; subtraída do dano em `applyDamage`).
  - `esoteric.adamant` — **marcador** (sem changes); o reroll é lógica custom.
  - `tools.adamant` (v1.76.1) — **marcador** (sem changes, `transfer:true`). Categoria `tools` do T20 = `system.tipo ∈ {ferramenta, traje}` (ver `_availableEffects`/`_upgradeStatus` no mjs ~L15301). Cobre **instrumentos musicais** (`tipo:"ferramenta"`): faz o material "Adamante" aparecer **Automatizado** na ficha; o efeito real "+1 no bônus da Inspiração" é lógica custom em [[inspiracao-bardo]] (`src/inspiracao`), lida de `upgrades.material==="adamant"` + equipado.
- **Fluxo nativo reaproveitado**: com a Automação do item ligada, escolher "Adamante" no slot de material dispara `_createEffect("adamant")` (lê `_availableEffects[upgrade]` = `T20.upgrades.<cat>` por tipo) e `_deleteEffect` (filtra por `flags.tormenta20.upgrade`). Não tocamos no dropdown — `specialMaterials.adamant` já existe.
- **Esotérico (reroll de 1s)** (`esoteric.ts`): "ao lançar magia que causa dano, pague +1 PM para rolar novamente qualquer 1 na rolagem de dano". Integrado em `spell-resistance` (`processSpellMessage`, lado conjurador, ANTES do loop de alvos → o modal de resistência já usa o dano corrigido). `maybeApplyAdamanteEsoteric`: detecta esotérico **equipado** com `upgrades.material==="adamant"` (`findAdamanteEsoteric`), coleta as faces de cada dado ativo que rolou 1 (`collectActiveOnes`), se há PM≥1 abre Dialog (pagar 1 PM e rerolar), rola `1d{faces}` por 1, `computeRerollDelta = Σ(novo-1)`, debita 1 PM, posta card e retorna o novo dano. Helpers puros são testáveis; só single-target via spell-resistance (magias de área que dão `return` cedo — Bola de Fogo/Coluna/Miasma — não cobertas nesta fase). **Decisão do usuário:** prompt automático no cast.


## Foundry v13 Gotchas

### DialogV2 (`.application`) recorta conteúdo alto SEM scroll

Modais DialogV2 têm root `.application` (NÃO `.window-app`, que é do Dialog clássico). O Foundry clampa a altura da janela ao viewport e põe `overflow:hidden` no `.window-content` → conteúdo alto fica **recortado e inacessível** (sem scroll). A regra `.window-app.t20-dialog … {overflow:visible}` em `dialogs/t20-dialog.css` NÃO cobre `.application`. Fix global (v1.63.0): `.application.t20-dialog .window-content { max-height:90vh; overflow-y:auto !important }`. O modal de resistência (`.smf-dialog`) ainda vira **2 colunas** via container query (`.smf-body{container-type:inline-size}` + `@container (min-width:600px)`), largura `isHeal?460:760` — "resolver o teste" à esquerda, dano/condições/buffs à direita; abaixo de 600px de largura interna colapsa pra 1 coluna + scroll.

### Rolls in createChatMessage

`message._source.rolls[0]` is a **JSON string** in v13. Always use `message.rolls` for Roll instances:

```typescript
// CORRECT
const rolls = message.rolls as Roll[] | undefined;
const roll = rolls?.[0]; // already a Roll instance

// WRONG — throws in v13
Roll.fromData((message as any)._source.rolls[0]);
```

### renderChatMessage args

`args[1]` is a direct `HTMLElement` in v13, NOT a jQuery array.

### `normalizeCondName` does NOT convert spaces to hyphens

`normalizeCondName(s)` = `s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()`. **No hyphen substitution.** Constants for matching multi-word power/spell names must keep the space: `"aura sagrada"`, NOT `"aura-sagrada"`. Got bitten by this writing Aura Sagrada detection.

### Poderes do paladino têm prefixo `"Bênção da Justiça: "` (e similares)

O T20 nomeia poderes de família com prefixo de categoria — Égide Sagrada aparece como **"Bênção da Justiça: Égide Sagrada"** (não só "Égide Sagrada"). Quem fizer detecção via `extractSpellName` + `normalizeCondName` DEVE usar `.includes(NORMALIZED_NAME)`, NÃO igualdade. Aura Sagrada parece não ter prefixo (até hoje), mas é só sorte — preferir `.includes()` por default em qualquer detecção nova.

### `flags.tormenta20.itemData` lacks `name` for powers

`message.flags.tormenta20.itemData` for `type:"poder"` items contains only the item's `.system` payload — there is no `name` top-level field. Always resolve the item name via `extractSpellName(message)` which parses `data-item-id` from the rendered content and looks it up via `actor.items.get(itemId).name`.

### Unlinked tokens têm synthetic actor — `game.actors.get(id)` NÃO ATUALIZA o token

Pra NPCs unlinked (caso clássico: tokens de NPC arrastados pra cena), `token.actor` é um **synthetic actor** separado do world actor. Atualizar `game.actors.get(id)` modifica o ator do mundo mas o token na cena continua com o PV/estado antigo.

**Sempre prefira** `canvas.tokens.get(tokenId).actor` quando o objetivo é modificar o estado VISÍVEL na cena (PV de NPCs, etc.). Helper canônico:

```typescript
function resolveActorForCandidate(c: { tokenId: string; actorId: string }) {
    const tok = canvas.tokens?.get(c.tokenId);
    if (tok?.actor) return tok.actor; // synthetic se unlinked
    return game.actors?.get(c.actorId) ?? null;
}
```

Bug histórico: v1.10.2 — Aura Ardente postava card mostrando dano em Aparição (NPC unlinked) mas PV do token ficava inalterado, porque eu modificava o world actor via `game.actors.get(id).applyDamage(...)`.

### Múltiplos tokens unlinked do MESMO NPC base compartilham `actor.id`

Quando o usuário arrasta o MESMO NPC pra cena várias vezes (ex.: 2 "Ameaça" Aparição), TODOS os tokens unlinked criam synthetic actors com o MESMO `actor.id` (herdado do world actor). Apenas o `token.id` é único por instância.

Implicações:
- Dedup por `actor.id` faz só um token entrar em listas de candidates. Use `seen Set<tokenId>` em vez de `seen Set<actorId>`.
- Pra identificar "este combatant específico" em combat hooks, use `combat.combatant.tokenId` (ou `combatant.token.id`), NUNCA `combatant.actor.id`.
- `combatant.actor` pra unlinked é o synthetic do token específico — instâncias diferentes por token, mas todas com mesmo `.id`. Comparar com `===` pode parecer funcionar mas é frágil; sempre prefira tokenId.

Bug histórico: v1.10.3 — Aura Ardente em cena com 2 Aparições só danificava a primeira em ambos os turnos.

### updateToken — doc.x/y is OLD position during animation

When `updateToken` fires, `tokenDoc.x` and `tokenDoc.y` still hold the **pre-move** position. The destination is in `args[1].x` / `args[1].y` (the `changes` object). Pass these as `overrideXY` to any position-based check; only use `doc.x/y` when called outside of `updateToken` (e.g. `canvasReady`, `createToken`).

```typescript
Hooks.on("updateToken", (...args) => {
    const tokenDoc = args[0] as { object?: FoundryToken };
    const changes  = args[1] as Record<string, unknown> | undefined;
    const destX = typeof changes?.["x"] === "number" ? changes["x"] as number : undefined;
    const destY = typeof changes?.["y"] === "number" ? changes["y"] as number : undefined;
    const overrideXY = (destX !== undefined || destY !== undefined) ? { x: destX, y: destY } : undefined;
    void syncTokenWithTemplates(tokenDoc.object!, overrideXY);
});
```

---

## T20 Data Structures

> **Full reference:** [`docs/t20-system-reference.md`](docs/t20-system-reference.md) — complete `actor.system` schema for PC (`character`) and ameaça (`npc`): atributos, attributes (pv/pm/defesa/movement/nd/cd/sentidos), pericias, tracos (resistencias by damage type), detalhes, modificadores (AE-target keys), CONFIG.T20 enums, and how the **statblock importer** (`StatblockParser`) works. T20 has no `template.json` — the schema lives in DataModel classes in `tormenta20.mjs`. The Bestiário/Suplementos de Arton modules are data-only compendiums using this same npc schema.

```typescript
// Actor
actor.system.atributos.des.value; // modifier (not score)
actor.system.pericias.fort.value; // total Fortitude bonus
actor.system.pericias.refl.value; // total Reflexos bonus
actor.system.pericias.vont.value; // total Vontade bonus
actor.system.attributes.pv; // { value, max, temp }
actor.system.nivel.value; // character level
actor.system.detalhes.raca; // NPC race string, e.g. "Morto-vivo" — MAS pode vir vazio
actor.system.detalhes.tipo; // Código curto T20: "hum"|"ani"|"con"|"mon"|"mor"|"esp"|""

// Spell item (from message.getFlag("tormenta20","itemData"))
itemData.type; // "magia"
itemData.system.escola; // "evo"|"nec"|"con"|"tra"|"abj"|"enc"|"ilu"|"adv"
itemData.system.tipo;   // "arc"|"div"|"uni"
itemData.system.circulo; // 1–5
itemData.system.resistencia.txt; // "Vontade parcial (CD 18)"
itemData.system.resistencia.cd; // may be 0 — parse from txt as fallback

// message.flags.tormenta20 (T20 spell cast message)
flags.tormenta20.onUseEffects; // Array of { cost, description, qty } — user-selected aprimoramentos
flags.tormenta20.effects;      // Array<Array<AEData>> — baseline AEs regardless of selection (DON'T use for penalty)
flags.tormenta20.itemData;     // Full item data at cast time
flags.tormenta20.template;     // Template data if spell has area

// Roll object
roll.formula / roll.total;
roll.dice[0].faces; // 20
roll.dice[0].results[0].result; // natural die result
roll.options.type; // "attack"|"damage"|"initiative"|"skill"|"save"
```

### Saves

| Save      | key    | Atributo |
| --------- | ------ | -------- |
| Fortitude | `fort` | CON      |
| Reflexos  | `refl` | DEX      |
| Vontade   | `vont` | WIS      |

### Tipos de NPC no bestiário T20 (`detalhes.tipo`)

| Código | Significado | Exemplos |
|---|---|---|
| `hum` | Humanoide | Drake, Asuka, Aparição, Esqueleto |
| `ani` | Animal | Capivara, Cavalo |
| `con` | Construto | Armário Animado, Mímico, Baú Animado |
| `mon` | Monstro | Carrasco de Lena, Ente, Trog Rei |
| `mor` | Morto-vivo | Lich, Ravarimm |
| `esp` | Espírito | Sílfide, Nandara |
| `""` | Legado / não classificado | Escribas, alguns NPCs antigos |

**Atenção**: `detalhes.raca` pode estar vazio mesmo para mortos-vivos (Lich, p.ex.) — sempre cheque AMBOS `raca` e `tipo`. Combinações são comuns: Ravarimm = `raca: "Anão"` + `tipo: "mor"` (humanoide morto-vivo).

---

## Socket Pattern (socketlib, v1.13.0+)

All cross-client coordination goes through [socketlib](https://foundryvtt.com/packages/socketlib) — a hard `requires` dependency. The central bootstrap lives in `src/socket/index.ts` and is invoked from `Hooks.once("init")` in `main.ts`.

```typescript
import { getSocket, onSocketReady } from "@/socket";

// 1. Register a handler in your subsystem's setup() (queued until socketlib.ready)
onSocketReady((socket) => {
    socket.register("auto-damage/request", (req) => openDamagePrompt(req));
});

// 2. Invoke remotely (target a specific user — socketlib does the routing)
await getSocket()?.executeAsUser("auto-damage/request", targetUserId, payload);

// 3. GM-only work (one active GM runs it — no isActiveGM() dedup needed)
await getSocket()?.executeAsGM("spell-resist/auto-apply-buff", req);
```

**Handler name convention:** `<feature>/<action>` (e.g. `auto-damage/request`, `spell-resist/preroll`). Names are module-scoped so collisions don't happen across modules.

**Why not raw `game.socket.emit`?**
- No more manual `if (data.targetUserId !== game.user.id) return` filtering.
- `executeAsGM` already picks one GM — eliminates the `isActiveGM()` (lowest sorted userId) dedup pattern for socket-mediated work. (Hook-based dedup like Consagrar/Aura still needs `isActiveGM()`.)
- Handlers can `return` values and `await` them on the caller side.

**GM routing for damage prompts:** unchanged — (1) online non-GM player owning target (`ownership >= 3`) → (2) any active GM. Computed in each feature (`getTargetUserId` in spell-resistance, `findActiveGM` in auto-damage).

**Warning:** `game.user.targets` must be populated before `createChatMessage` fires. If empty, show `ui.notifications.warn`.

---

## Color Palette

| Role            | Hex       |
| --------------- | --------- |
| Gold accent     | `#c8a96e` |
| Gold glow       | `#6a4e18` |
| Text primary    | `#f0ebe0` |
| Text secondary  | `#e8e0d0` |
| Text muted      | `#9a8e7a` |
| Background dark | `#090604` |
| Background mid  | `#1c1209` |
| Crit green      | `#6ecf7a` |
| Fumble red      | `#cc4444` |
