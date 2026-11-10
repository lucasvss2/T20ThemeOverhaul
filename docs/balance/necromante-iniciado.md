# Necromante Iniciado — ND 5, especial

Variante do Necromante de ND 7 mostrado na ficha de referência. Mantém a raça élfica, deslocamento 12m, adaga com dano de trevas, servos de sombra, sacrifício defensivo e as quatro magias.

| Elemento | Necromante de ND 7 | Iniciado de ND 5 |
|---|---|---|
| Defesa sem Armadura Arcana | 23 | 16 |
| Fortitude / Reflexos / Vontade | 7 / 14 / 20 | 5 / 11 / 17 |
| PV / PM | 180 / 55 | 124 / 35 |
| Ataque secundário | +22, 1d4 + 1d8 trevas | +15, 1d4 + 1d4 trevas |
| Ergam-se! | Completa, 5 PM, seis servos, 2d8 cada | Completa, 3 PM, quatro servos, 1d8 cada |
| Defesa / PV de cada servo | 25 / 1 | 22 / 1 |
| Sacrificar Servo | Anula um dano, uma vez por rodada | Reduz um dano em 15, uma vez por rodada |
| CD das magias | 26, 28 para necromancia | 22 |
| Amedrontar preparado | Vários alvos, duração aprimorada | Um alvo, duração básica |
| Armadura Arcana preparada | +7 por um dia | +4 pela cena |
| Crânio Voador preparado | 6d8+6 | 4d8+4 |
| Toque Vampírico preparado | 10d6 | 6d6 |

Os números de defesa e PV conservam os desvios da criatura original em relação à tabela do papel especial: −6 em Defesa e −16 PV. O iniciado continua um conjurador vulnerável sem preparação. Iniciativa +8, Percepção +6, Conhecimento +11 e Misticismo +13 incorporam a redução do nível e da graduação de treino.

O orçamento ofensivo usa a rotina combinada, não a adaga: quatro servos de 1d8 somam 18 de dano médio. Crânio Voador básico soma 22, totalizando os 40 de referência do especial ND 5 quando todos os servos alcançam alvos e antes das resistências. Os servos exigem uma ação completa de preparação, têm apenas 1 PV e perdem dano ao serem sacrificados.

## Uso no Foundry

É um ator NPC comum do compêndio **T20 Overhaul — Ameaças → Custom Made**. Os poderes e magias são itens normais, sem macros. A imagem da variante reutiliza o retrato do necromante, empacotado no próprio módulo.

- **Ergam-se!** cria quatro tokens independentes de servos em espaços livres em alcance curto. Uma nova conjuração substitui os servos anteriores desse iniciado.
- Os servos agem no turno de seu mestre, podem se deslocar normalmente e usam **Golpe de Sombra** contra um único alvo adjacente marcado com T, uma vez por rodada.
- **Sacrificar Servo** é oferecido no diálogo de dano somente enquanto houver um servo próprio vivo. Consome um servo e reduz até 15, sem anular automaticamente danos maiores.
- **Crânio Voador** causa dano somente ao alvo principal. Inimigos a até 3m dele fazem testes separados contra o medo, sem receber esse dano direto. A versão do iniciado não aumenta medo que já exista.
- **Toque Vampírico** recupera metade do dano efetivamente causado, respeitando o máximo de PV.
- **Armadura Arcana** aplica o efeito de Defesa à própria ficha e não acumula cópias do mesmo bônus.
- O fim do combate dispensa os servos e remove seus atores auxiliares sem afetar outras criaturas.

As fórmulas de ataque usam uma perícia nativa válida e um ajuste numérico separado; as resistências descontam atributo e metade do ND dos campos brutos para produzir os valores finais anunciados.

## Validação

Testado em 10/11/2026 com Foundry 13.351 e Tormenta20 1.5.015, num mundo descartável em outra porta, sem copiar ou alterar atores da mesa. Vinte e uma verificações de importação e combate passaram, usando tokens sintéticos, combate iniciado e alvo marcado. Foram conferidos: bônus e dados da adaga; quatro servos e custo de 3 PM; Defesa 22 e 1 PV dos servos; dano de 1d8 e limite por rodada; bloqueio fora do turno do mestre; sacrifício contra ataque e magia; dano de Crânio Voador restrito ao alvo principal; cura de metade do dano real de Toque Vampírico; resistência de Amedrontar; Armadura Arcana +4 sem acúmulo; substituição dos servos e limpeza no fim do encontro. A revisão final de uma nova importação confirmou Iniciativa +8, Percepção +6, Conhecimento +11 e Misticismo +13. Exemplo observado: Toque Vampírico causou 28 PV e curou 14 PV.

Testes automatizados cobrem também cliques concorrentes no sacrifício, isolamento entre conjuradores, dano zero sem consumo, recuperação após falha ao excluir um servo e preservação da reação do Necromante original.
