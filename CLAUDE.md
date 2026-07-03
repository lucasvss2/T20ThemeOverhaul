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
  adamante/esoteric.ts         — Adamante esotérico: reroll de 1s no dano da magia por +1 PM (helpers puros + integração no spell-resistance)
  escudo-leve/index.ts         — Escudo Leve: ocupa slot de ANTEBRAÇO (além das mãos) → mão livre p/ objeto/arma/desarmado 2 mãos; patches em ActorSheetT20 + migração
  armamento-aberrante/index.ts — Armamento Aberrante (Tormenta): seletor de arma orgânica (busca+favoritos), dano +1 passo/2 outros poderes Tormenta, dura a cena
  armamento-aberrante/weapons.ts — Base EMPACOTADA de 96 armas (stats colhidos dos compêndios T20) p/ o seletor
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
| 1.48 | Encounter-roller: ambiente Deserto, `bracketMax` por ambiente (deserto [2,5,8,10] → níveis 1-10) | `encounter-roller/` |
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
- **vitest exclui `.claude/**`** — worktrees antigos do Claude carregavam cópias velhas dos testes contra o src ATUAL (via alias `@`), inflando/quebrando a suíte. Contagem real: 680 testes / 41 arquivos.
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
- Decisões: auto-aplica direto + aviso; "veja texto"/escolha → `suggest:true` (pré-marca, não aplica). Lote 1: Adaga Mental, Despedaçar (Atordoado 1 rod.), Imobilizar (falha→Paralisado/passa→Lento, cena). (Amedrontar foi removida — tem complicações a recurar com base no documento do usuário.) Cobertura cresce por lote.

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
- **Poderes da Tormenta = `system.subtipo === "Tormenta"`.** `countOtherTormentaPowers` exclui o próprio AA; `computeDamageSteps = floor(outros/2)` (Lancry: 3 outros → +1 passo).
- **Passo de dano CRAVADO no item** (sem AE): `steppedWeaponDie` reusa `stepDie(die, CONFIG.T20.passosDano, steps)` do [[adamante]] e grava no `rolls[dano].parts[0][0]` do item criado. **⚠️ Sem Active Effects de propósito** (pedido do usuário: nada que possa remover passivos/atributos de outros poderes) — verificado: criar/dissolver NÃO toca nos poderes/itens existentes.
- **Base de armas EMPACOTADA** (`weapons.ts`, 96 armas): stats colhidos ao vivo dos compêndios T20 instalados (base + Atlas/Heróis de Arton), tupla `[nome,prof,proposito,emp,critM,critX,alc,dado,tipoDano,danoAttr,ataqueAttr]`. **Regra de bundle** — não depende de compêndio de suplemento em instalação limpa. Reharvestar se precisar atualizar.
- **Seletor** (Dialog `.t20-aa-dialog`): busca + **favoritos** (client setting `armamentoAberranteFavorites`, ★ persiste por usuário) + agrupado por proficiência; mostra o dado JÁ stepado (ex.: Katana 1d8→1d10). **Filtra por proficiência do personagem (v1.74.1):** `getActorWeaponProficiencies` lê `system.tracos.profArmas.value` (categorias simples/marcial/exotica/fogo) + `.custom` (armas específicas por nome); `isProficientWith` mostra só as proficientes. ⚠️ **Fallback:** ficha SEM nenhuma proficiência registrada (`known===false`, ex.: Lancry com `value:[]`) NÃO zera a lista — exibe todas + aviso "nenhuma proficiência registrada". Verificado ao vivo: simples+marcial → 59/96 armas, sem exóticas/fogo. Selecionar cria a arma (`Nome (Aberrante)`, `espacos:0`, flag `flags.<MODULE_ID>.armamentoAberrante = {sceneId, createdWorldTime, baseDie, steps}`) + card verde. Verificado: T20 resolve `dano "1d10 + 6"`, crít 19, toHit +1.
- **"Dura a cena":** dissolve manual via skills-menu (`armamento-aberrante-dissolver`) OU auto no `deleteCombat` (GM eleito = fim do encontro). Dissolve deleta APENAS itens com nossa flag + card cinza "se desfaz numa poça de gosma". Verificado ao vivo (Lancry, Katana criada/dissolvida sem colateral).
- **Espada-Calibre**: incluída (proficiência exótica). Armas sem dado (Rede, Desmontador) entram sem passo.

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
