# Tormenta20 System Reference (Foundry v13)

Authoritative dump of the T20 system actor data model + the statblock importer +
the Arton content modules. Sourced from `systems/tormenta20/tormenta20.mjs` and
live MCP inspection of real PC/NPC actors (Sir Drake / Esqueleto). T20 has **no
`template.json`** — the schema is defined by DataModel classes in the .mjs.

## Actor `system` — top-level keys
- **character (PC):** `atributos, attributes, detalhes, dinheiro, modificadores, pericias, resources, tracos, equipamentos`
- **npc (ameaça):** same MINUS `equipamentos` (+ npc-only fields inside `attributes`/`detalhes`, see below)

## atributos (for, des, con, int, sab, car)
Each: `{ base, racial, bonus, value }`. **`value` is DERIVED** (base+racial+bonus). To
change an attribute, set `.base` (or `.racial`) — writing `.value` reverts on next prepareData.
(`atributos.car.value` = CHA modifier total, used by Aura Sagrada.)

## attributes
- **pv:** `{ value, max, min, temp, atributos:{for,des,con,int,sab:bool}, bonus:{nivel,nivelImpar,nivelPar,total} }`
- **pm:** `{ value, max, min, temp, atributos:{for,des,con,int,sab,car:bool}, bonus:{nivel,nivelImpar,nivelPar,total} }`
  - `bonus.*` are **ArrayFields** (accumulative; AEs with mode ADD push to them). NEVER call `actor.prepareData()` in a loop — duplicates the bonus arrays (v1.19.4 bug).
- **defesa:** `{ value, base, atributo, condi, outros, pda, bonus[] }` (value derived = base+armor+atributo+…)
- **carga:** `{ value, base, max, limit, pct, atributo, encumbered, bonus[] }`
- **movement:** `{ walk, climb, burrow, swim, fly: {base, bonus[], value}, hover:bool, unit, tags }`
- **nivel:** `{ value, xp:{value, pct, proximo} }`
- **cd:** number — spell CD (includes item AE bonuses like Foco Arcano; the correct CD source — see CD patch note in MEMORY)
- **conjuracao:** string — casting attribute key (e.g. "int"/"sab"/"car")
- **sentidos:** `{ value (array of sense keys), custom }`
- **treino:** number
- **npc-only:** `nd` (string: `"1/4"|"1/2"|"1"|"2"|…|"S"|"S+"` — challenge level), `meionivel` (number). NPC pv/pm omit the `atributos`/`bonus` sub-objects (just value/max/min/temp).

## pericias — keys
`acro, ades, atle, atua, cava, conh, cura, dipl, enga, fort, furt, guer, inic, inti, intu, inve, joga, ladi, luta, mist, nobr, perc, pilo, pont, refl, reli, sobr, vont` + custom ofícios (`alfa, alqu, arme, arte, cozi, enge, …`).
Saves: `fort` (CON), `refl` (DES), `vont` (SAB).
Each: `{ value, atributo, treinado, outros, condi, label, custom, pda, size, st, bonus[] }`.
**`pericias[key].value` is the CONSOLIDATED total** (halfLevel + treino + attrMod + outros + condi) — already computed by `prepareDerivedData`. Do NOT re-add `outros`/`condi` (double-count bug v1.18.2).

## tracos
- **tamanho:** string — `min|peq|med|gra|eno|col`
- **ic:** `{ value (array of condition-immunity keys), custom }` — Imunidades a Condições
- **idiomas / profArmaduras / profArmas:** `{ value[], custom }`
- **resistencias[damageType]:** `{ base, value, imunidade:bool, vulnerabilidade:bool, danoPorDado:bool, excecao, bonus[] }`
  - damageType keys: `dano, perda, acido, corte, eletricidade, essencia, fogo, frio, impacto, luz, psiquico, perfuracao, trevas`

## detalhes
- **character:** `raca, tipo, origem, divindade, info, biography:{value,public}, diario..diario5`
- **npc:** `role (solo|lackey|special), raca, tipo, resistencias (TEXT), movimento (TEXT), ataquescac (TEXT), ataquesad (TEXT), equipamento (TEXT), tesouro (TEXT), divindade, origem, biography`
- **NPC race/type gotcha:** `detalhes.raca` (full name, can be empty) AND `detalhes.tipo` (short code) — Lich has `raca:""` + `tipo:"mor"`. Always check both.

## modificadores (the AE-target keys for buffs; all ArrayFields / accumulative)
- `custoPM` (number)
- `atributos: { for, des, con, int, sab, car, fisicos, mentais, geral }`
- `ataque: { ad, cac, geral }`
- `dano: { ad, cac, mag, alq, geral }`
- `cura: { geral, mag }`
- `pericias: { ataque, semataque, resistencia, geral, atr:{for,des,con,int,sab,car} }`
  - e.g. Aura Sagrada writes `system.modificadores.pericias.resistencia`; Medalhão reads `modificadores.ataque.*`.

## dinheiro / resources / equipamentos
- `dinheiro: { tc, tp, to, tl }` (coins)
- `resources: { primary, secondary, tertiary, catarse, deathsave, shadow }` each `{label, max, value}`
- `equipamentos: { limiteEmpunhado, limiteVestido }` (character-only)

## CONFIG.T20 enums
- `creatureTypes`: ani, con, esp, hum, mon, mor (animal/construto/espírito/humanoide/monstro/morto-vivo)
- `creatureRoles`: solo, lackey, special
- `actorSizes`: min, peq, med, gra, eno, col
- `senses`: penumbra, escuro, cegas, faro
- `damageTypes`: (same 13 as tracos.resistencias keys above)

---

## Statblock Importer — `StatblockParser` (FormApplication)
- **Launch:** header button on the **NPC sheet** only — label `T20.ParseStatblock`, class `t20-parse-statblock`, icon `fa-diagram-predecessor`. Opens `new StatblockParser({actor, statblock:"", schema:{}, items:[], log:[]})`. Template: `apps/statblock-parser.hbs`. (Character sheet shows a "Configure" button → `ActorSettings` instead.)
- **Two actions:** `.validate` → `_parseStatblock` (parse + preview log); `.apply` → `_applyToActor`.
- **`_parseStatblock` flow:**
  1. Lazy-loads (once) compendium indexes for name-matching: `tormenta20.equipamentos`, `equipamentos-magicos`, `magias`, `poderes`, `habilidades-de-criaturas`.
  2. Normalizes pasted text: removes `-\n` hyphenation, joins wrapped lines, merges the `Magias …` block, replaces `–`→`-`.
  3. Builds a fresh npc schema: `new ActorT20({type:"npc"}).system.toObject()`.
  4. Pipeline (each wrapped in try/catch, pushing to `log`): `parseData` → `parseSkills` → `parseAbilities` → `parseWeapons` → `parseTreasure` → `parseDefense`.
- **`_applyToActor`:** deletes ALL existing actor items + effects, then `actor.update({type:"npc", name, system:schema})`, then creates parsed items (`createEmbeddedDocuments("Item", items, {statblockParsing:true})`) + effects. **Destructive — replaces the whole actor.**
- **Field mapping (what each parser writes):**
  - `parseData`: name; `attributes.nd`; `detalhes.role` (creatureRoles) / `tracos.tamanho` (actorSizes) / `detalhes.raca` (subtype) / creatureType; `atributos[abl].base` (from "For X, Des Y, …"); `attributes.pv.{value,max}` & `pm.{value,max}` (Pontos de Vida/Mana); `detalhes.resistencias` (raw text) → parsed into `tracos.ic.value` (condition immunities), `tracos.resistencias[dmg].base` (RD), `.imunidade`, `.vulnerabilidade`; `attributes.movement[walk|climb|burrow|swim|fly].base` (Deslocamento/Escalar/Escavar/Natação/Voo); `attributes.sentidos.value` (senses).
  - "Resistência a Magia +N" → creates an ActiveEffect `{changes:[{key:"roll", value:N}], flags.tormenta20:{onuse:true, skill:true, items:"Fortitude;Reflexos;Vontade"}}`.
  - `parseSkills`/`parseSkill`: matches "Perícia +X" (incl. Fort/Ref/Von). Infers `treinado` + `outros` by comparing the listed total to expected `halfLevel + treino + atrMod + sizeMod` (treino = 2 / 4 / 6 by ND tier; nivel from ND, "S"/"S+"→20). Writes `pericias[key]={value, atributo, treinado, outros}`.
  - `parseAbilities`: powers/spells via `searchItem` (compendium + world match by slugified name); `attributes.cd` (from "(CD N)"); `detalhes.ataquescac` / `ataquesad` (Corpo a Corpo / À Distância text). Spell lines marked with `•` → type "magia".
  - `parseDefense`: `attributes.defesa.base = DefesaValue − totalArmorEquipado − clamp(DES, 0, maxAtr)`.
  - `searchItem`: tries world items first, then compendium index; falls back to creating a bare item (type "tesouro" for generic). Spell/power names trimmed before "(".

## Arton content modules (data-only — NO scripts/esmodules; depend on the T20 data model)
- **bestiario-de-arton** — Actor packs `bestiario-de-arton`, `ameacas-livro-basico` (pre-built NPCs/ameaças) + Item pack `habilidades-do-bestiario` (creature abilities/poderes).
- **suplementos-de-arton** — Item packs `ameacas-de-arton`, `atlas-de-arton`, `deuses-de-arton`, `guia-de-deuses-menores`, `guia-de-npcs-and-dbs`, `herois-de-arton`, `distincoes`.
- Neither ships code; they provide compendium content consumed by the system + our module. The statblock importer matches against the SYSTEM packs (tormenta20.*), not these — but importer-built NPCs share the same npc schema as these bestiary actors.
