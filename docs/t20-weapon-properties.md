# Propriedades de Arma (Tormenta20)

Referência das propriedades (habilidades) de arma do T20 e do **status de
implementação** no módulo `t20-theme-overhaul`. O sistema Tormenta20 guarda
estas propriedades em `item.system.propriedades` (booleans), mas **não as
implementa mecanicamente** — só expõe os rótulos. Cada propriedade que o módulo
automatiza está marcada abaixo.

Também distribuído como compêndio **Journal** no módulo
("T20 Overhaul — Propriedades de Arma", `packs-src/weapon-properties/`), para
ficar disponível dentro do Foundry mesmo em instalação limpa.

| Propriedade | Chave(s) em `system.propriedades` | Regra | Implementado? |
|---|---|---|---|
| **Adaptável** | `adaptavel` | Uma arma de uma mão pode ser usada com as duas mãos para aumentar seu dano em um passo. | ❌ (o mesmo "passo de dano" é usado pela melhoria **Adamante** de arma) |
| **Ágil** | `agi` (legado), `agil` | Pode ser usada com Acuidade com Arma, mesmo não sendo uma arma leve. | ✅ **v1.68.1** |
| **Alongada** | `alo`, `alongada` | Dobra o alcance natural do atacante, mas não permite atacar adversário adjacente. | ❌ |
| **Desbalanceada** | — | Impõe penalidade de −2 em testes de ataque. | ❌ |
| **Dupla** | `dup`, `dupla` | Pode ser usada com Estilo de Duas Armas para ataques adicionais; cada "ponta" conta como arma separada p/ melhorias e encantos. | ❌ |
| **Versátil** | `ver`, `versatil` | Fornece bônus em uma ou mais manobras (cumulativo), conforme a arma. | ❌ |

## Ágil × Acuidade com Arma (v1.68.1)

A propriedade **Ágil** estende a Acuidade a armas que **não** são leves (ex.:
Katana de uma mão Ágil). O T20 só trocava Força→Destreza para `empunhadura:
"leve"` de corpo-a-corpo (e parcialmente arremesso), ignorando a propriedade
Ágil — então uma katana Ágil ficava em Força mesmo com o poder Acuidade.

`src/t20-fixes/acuidade-arma.ts`:
- `isAgilWeapon(item)` — `system.propriedades.agi === true || .agil === true`.
- `isAcuidadeWeapon(item)` — elegível se **Ágil**, ou leve corpo-a-corpo, ou
  arremesso.
- Com o poder Acuidade (`flags.tormenta20.acuidade`) e Des > For, o ataque
  (`getAttackToHit`) e o dano (`rollDamage`) usam Destreza.

> Detalhe do dado: a part de dano nativa do T20 costuma ser o sentinela
> `"padrao"` (resolvido p/ `@for`/`@des` no roll com a lógica de acuidade); só
> armas com atributo de dano EXPLÍCITO guardam `@for` literal (caso que o swap
> `@for`→`@des` do módulo cobre).
