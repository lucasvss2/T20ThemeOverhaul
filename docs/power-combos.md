# Poderes recebidos de fontes diferentes

O módulo mantém os itens de origem na ficha e unifica a opção de uso destas combinações do Tormenta20 Jogo do Ano:

| Combinação | Resultado | Regra |
| --- | --- | --- |
| Engenhosidade de Kliren + outra fonte da habilidade, como Inventor | Inteligência uma vez por 1 PM; não se aplica a ataques | p. 28 e 68 |
| Empatia Selvagem de Dahllan + outra fonte da habilidade, como Druida/Caçador | +2 passivo em Adestramento, sem custo e sem checkbox adicional | p. 21 |
| Aventureiro Ávido + Surto Heroico | Uma opção de Surto Heroico por 3 PM | p. 47 |

Importar duas cópias da mesma fonte não concede o benefício racial de receber a habilidade novamente. Bônus de poderes diferentes continuam independentes. Este catálogo não deduplica poderes desconhecidos por semelhança de nome ou texto.

As fontes ficam acessíveis pelo detalhe **Fontes** na ficha. Remover uma delas recalcula a combinação. Os custos originais dos itens e dos Active Effects, seus estados de ativação e os recursos do ator não são regravados para implementar a combinação. Reduções já aplicadas, como Economia de Habilidade, são respeitadas, com custo mínimo de 1 PM.

## Integração

`power-combos/format.ts` concentra as regras. Os seletores próprios de perícias/resistências e iniciativa usam o mesmo resolvedor. No T20 1.5.015, o formulário nativo e a aplicação de efeitos consultam `actor.effects.filter`; esse método recebe uma visão com clones dos efeitos combinados, mantendo os IDs esperados pelo formulário. `contents` e `toObject()` preservam os documentos de origem. Cópias legadas cujo item foi removido deixam de ser opções de uso.

O bônus passivo de Empatia é uma parcela identificada da lista derivada de bônus de Adestramento. Ela é substituída em cada preparação da ficha, impedindo acúmulo ao abrir ou recalcular o ator. O custo de ativação de um poder combinado é ajustado somente no clone utilizado na rolagem.

## Validação

Os testes de regressão cobrem custo, não duplicação, remoção de fontes, fontes repetidas, bônus independentes, custo mínimo e disponibilidade com apenas 1 PM. A validação ao vivo usa cópias temporárias e compara os documentos de todos os atores e tokens originais antes e depois.
