# Servos de Sombra e criaturas integradas

## Ergam-se! — Necromante Iniciado

O mestre usa o poder normal na ficha ou no HUD. A ficha se minimiza enquanto ele escolhe quatro espaços no mapa. Cada clique marca um espaço; a prévia verde indica uma posição válida e a vermelha indica espaço ocupado, posição fora da cena ou além do alcance curto de 9m. O contador mostra quantos espaços já foram escolhidos.

ESC, clique direito ou **Cancelar** abandona a seleção sem criar atores, tokens ou gastar PM. Depois dos quatro pontos, o uso segue pelo diálogo nativo do poder. Confirmar cria os quatro servos e debita 3 PM uma única vez. Uma nova conjuração substitui os servos anteriores desse iniciado.

Os tokens são independentes, Médios (1×1), com 1 PV, Defesa 22, Força e Destreza 3, demais atributos 0, deslocamento de 9m e Golpe de Sombra de 1d8 de trevas. O ataque automático exige um alvo adjacente marcado com T e só pode ser usado uma vez por rodada, no turno do mestre. As imunidades estão na ficha; as resistências e os testes opostos falham automaticamente. Sacrificar Servo continua consumindo um servo próprio para reduzir 15 de dano. O encerramento do combate limpa os tokens e atores auxiliares.

A ficha independente **Servo de Sombra (Iniciado)** fica em **T20 Overhaul — Ameaças → Custom Made**, para consulta ou importação manual. Ela não recebe o vínculo de um conjurador até que seja criada por Ergam-se!.

## Compêndios incorporados

Dentro de **T20 Overhaul → Ameaças de Arton**:

- **Ameaças de Arton:** 442 criaturas do compêndio homônimo do módulo externo Bestiário de Arton 0.8.6.
- **Ameaças — Livro Básico:** 83 criaturas da coleção do livro básico desse mesmo módulo.
- **Habilidades — Ameaças de Arton:** 83 itens normais de habilidades para consulta e referências.

Essas cópias preservam os documentos, estatísticas, itens, efeitos e organização de origem. A importação não altera os atores nem os tokens já presentes nos mundos e não desativa o módulo de origem. Os novos compêndios funcionam com o módulo externo desativado.

Na revisão de compatibilidade, duas fichas de devotos de Sszzaas tinham o bônus de +5 contra venenos gravado como uma resistência a dano inexistente. Ele foi convertido ao efeito nativo de uso em testes de resistência, selecionável quando o teste for contra veneno. No Enxame Infernal, a imunidade foi convertida à categoria nativa de efeitos de veneno. Isso elimina os erros de preparação sem conceder bônus incondicionais ou alterar os números publicados das ameaças.

As imagens originais foram empacotadas em `public/assets/criaturas-integradas/`. A conversão de 502 arquivos para WebP foi **sem perdas**, com igualdade dos pixels RGBA verificada, reduzindo 81,1 MB. Uma referência de arquivo local inexistente no Golem de Nor Médio foi substituída pelo próprio retrato original dele. O tamanho dos tokens segue: Minúsculo 0,25×0,25; Pequeno e Médio 1×1; Grande 2×2; Enorme 3×3; Colossal 6×6.

Links de condições, magias e poderes copiados do mundo particular do autor foram direcionados aos documentos correspondentes do sistema ou dos compêndios incorporados. Duas referências privadas de regras de montarias do Cavaleiro de Kally não existem nos materiais disponíveis: seus rótulos foram preservados como texto, sem links quebrados. O relatório [criaturas-integradas.json](imports/criaturas-integradas.json) registra as origens, imagens e referências.

## Manutenção

As fontes JSON e as imagens finais são versionadas: o build da release não depende do módulo externo ou de downloads. Para repetir a importação, os scripts usam uma extração local dos três packs originais e um índice dos itens e diários do sistema instalado. `scripts/import-external-creatures.mjs` gera os packs, `scripts/bundle-imported-creature-assets.mjs` reúne as imagens e `scripts/optimize-imported-portraits.py` faz a conversão sem perdas. `scripts/gen-shadow-servant.mjs` gera a ficha do servo a partir do mesmo construtor usado em tempo de execução.

## Validação no Foundry

Em 10/11/2026, num mundo descartável em porta separada, com Foundry 13.351 e Tormenta20 1.5.015, foram aprovadas **21 verificações**. As 525 criaturas e as 83 habilidades foram importadas como documentos nativos com o módulo externo desativado e sem erros de preparação dos dados. Avatar de Aharadak e Necromante foram usados como amostras de ataque real contra um dummy marcado.

O posicionamento foi testado com cliques reais no canvas, incluindo ESC após o primeiro ponto e reconjuração nas mesmas quatro posições ocupadas pelos servos anteriores. Foram verificados os atributos e a arte dos quatro tokens, o débito único de 3 PM, o dano de 1d8, o limite por rodada, a falha automática em resistência, a preservação do PV contra magia de frio, a limpeza dos auxiliares no fim do combate e a recusa de conjuração sem PM. O teste de reposicionamento do dummy foi executado sem animação de movimento, para que a checagem de adjacência usasse sua posição final.

O [registro das verificações](imports/verificacao-servos-criaturas.json) contém os resultados. Isso valida todas as importações e os comportamentos acima; os poderes individuais das 525 criaturas não foram todos exercitados em combate. Nenhuma ficha ou token da mesa foi usado ou alterado nesses testes.

## Arte do servo

Ferramenta: geração de imagem integrada, sem CLI. Arquivo final: `public/assets/necromancia/servo-de-sombra.png`.

Prompt utilizado:

> Use case: stylized-concept. Asset type: square circular VTT monster token for a dark fantasy tabletop RPG. Create one shadow undead servant raised by a novice necromancer: humanoid skeleton formed of black smoke and purple shadow, visible pale skull with dim violet eyes, thin dark skeletal shoulders and clawed hands, no weapons or armor, ominous but clearly a weak disposable minion. Expressive illustrated fantasy RPG book art, detailed confident ink linework, painterly shadows, muted colors. Composition: clear centered bust portrait readable at small token size inside a thin weathered bronze circular rim, skull and hands contained within the circular token, dark smoky interior. Isolate token on a genuinely transparent background outside the circle, no scenery, no letters, no text, no logo, no watermark. 1024 square. Intended for Foundry VTT Tormenta20, high readability.
