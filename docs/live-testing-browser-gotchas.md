# Verificação ao vivo via automação de browser — gotchas

Notas de processo (não de código do módulo) sobre como testar ao vivo no Foundry
usando a ferramenta de automação de browser (`mcp__Claude_Browser__*`). Isso
complementa a "REGRA DE PRIORIDADE MÁXIMA" de restauração de estado do
`CLAUDE.md` — aqui é só o COMO fazer a verificação de forma confiável, não a
regra de restaurar depois.

## Múltiplos `DialogV2` sobrepostos — clique por `ref` pode acertar o dialog ERRADO

Quando mais de um `DialogV2`/`ApplicationV2` está aberto ao mesmo tempo (ex.: o
modal de resistência do `spell-resistance` abre 1 cópia por ALVO — 2 alvos = 2
janelas empilhadas, quase coincidentes em posição), um clique via `computer`
usando `ref` (ou coordenada) pode acertar a janela **errada** se elas estiverem
sobrepostas: o `ref` resolvido por `read_page`/`find` aponta pro elemento DOM
certo, mas dois cliques seguidos em refs "diferentes" (`ref_4155` no primeiro,
`ref_4302` no segundo) podem os dois acabarem clicando na MESMA janela (a que
está no topo do z-order), porque a coordenada de clique real cai na área
visível daquela janela específica, não na outra que está por baixo.

**Sintoma observado:** cliquei em "Aplicar Integral" nos dois modais (Al
Simmons dano 3, Aller Brushfighter dano 4) — só o dano do Aller foi realmente
aplicado (2x, sem duplicar porque o botão desabilita após uso — `smf-spent`);
o de Al Simmons nunca disparou, PV ficou intocado.

**Fix confiável — não depender de coordenadas de tela nem de z-order:**
```js
// Encontra o dialog certo pelo CONTEÚDO (nome do alvo no título), não pela posição na tela
const dialogs = Array.from(document.querySelectorAll(".smf-dialog"));
const target = dialogs.find(d => d.textContent.includes("Al Simmons"));
const btn = target.querySelector(".smf-dmg-btn"); // primeiro botão = "Aplicar Integral"
btn.click();
```
`.click()` disparado via `javascript_tool` no elemento certo dispara o MESMO
listener que um clique real do usuário dispararia (React/vanilla addEventListener
não distingue a origem do evento) — não é um mock, é a mesma ação, só que
mirada com precisão no elemento certo em vez de numa coordenada de tela que
pode estar sobre outra janela.

## `read_page`/screenshot: viewport reportado ≠ frame de coordenadas do screenshot

`read_page` pode reportar `Viewport: 1465x918` enquanto o screenshot devolvido
tem `800x501` — são dois sistemas de coordenadas DIFERENTES. Cliques por
`coordinate` sempre devem usar o frame do ÚLTIMO screenshot, nunca o viewport
do `read_page`. Quando há dúvida (múltiplas janelas, alguma fora da área
capturada no screenshot), prefira `ref` (resolvido pelo DOM, não por pixel) OU
manipulação direta via `javascript_tool` como acima — ambos não dependem de
coordenada de tela.

`scroll_to` num `ref` dentro de uma app Foundry (canvas fixo, janelas
`position:fixed`/absolutas) **não reposiciona a janela** como faria num
website comum — é só um `scrollIntoView` de DOM que não tem efeito visual em
elementos já fixos na tela. Não confiar nele pra "trazer a janela certa pra
frente"; usar o DOM direto.

## Contar chamadas de API de módulo de terceiros sem adivinhar (ex.: Automated Animations)

Pra verificar "quantas vezes a animação disparou" sem depender de observação
visual (frágil — a animação passa rápido) ou de introspecção do código-fonte
do módulo terceiro (nem sempre disponível/documentado), um wrap temporário na
API pública funciona bem e é seguro (chama a função original por baixo, então
o comportamento real não muda — só instrumenta):

```js
window.__aaCallLog = [];
const AA = globalThis.AutomatedAnimations;
if (!window.__origPlayAnimation) window.__origPlayAnimation = AA.playAnimation.bind(AA);
AA.playAnimation = function(...args) {
  window.__aaCallLog.push({ t: Date.now(), targets: args[2]?.targets?.map(t => t?.name) ?? null });
  return window.__origPlayAnimation(...args);
};
// ... executar a ação a ser testada ...
// depois, restaurar:
globalThis.AutomatedAnimations.playAnimation = window.__origPlayAnimation;
delete window.__origPlayAnimation;
delete window.__aaCallLog;
```
Achado real com essa técnica (v1.115.0, Seta Infalível): o disparo automático
nativo do T20/Automated Animations para um cast NÃO interceptado (ao contrário
da Baforada, que cancela o cast nativo) **não passa pela mesma API pública**
`playAnimation` — só as chamadas manuais do nosso código apareceram no log,
contagem exata (2 chamadas pra 2 setas, alvos corretos, intervalo batendo com
o stagger programado). Ou seja: não há overshoot de animação nessa integração
— o receio documentado inicialmente (achando que o native trigger fosse
duplicar via a mesma API) era infundado nesse mecanismo específico. Sempre
bom desconfiar de "vai duplicar" até medir — o A-A pode ter um caminho interno
totalmente separado do que a gente assumiu por analogia com a Baforada.

## Fingerprint rápido de estado de ator pra restaurar depois (regra de prioridade máxima)

Antes de qualquer teste ao vivo que toque um ator, capturar um objeto pequeno
e barato de comparar/restaurar — não precisa ser o `system` inteiro:

```js
const snap = {
  pv: foundry.utils.deepClone(actor.system.attributes.pv),   // value/temp/max
  pm: foundry.utils.deepClone(actor.system.attributes.pm),   // value/temp/max
  itemCount: actor.items.size,       // detecta item de teste esquecido
  itemIds: actor.items.contents.map(i => i.id), // detecta qual item é novo, se precisar reverter 1 a 1
};
```
Restaurar só `pv.value`/`pv.temp`/`pm.value`/`pm.temp` via `actor.update({...})`
direto nos valores capturados (nunca tentando "desfazer a ação" espelhando
dano/cura) cobre a maioria dos casos; `itemCount`/`itemIds` serve só pra
confirmar que nenhum item de teste ficou pra trás (comparar a contagem final
com a original é suficiente — não precisa diffar a lista toda).

## GM2 (mundo `arton`) — role pode mudar entre sessões, não assumir

Sessões anteriores registraram GM2 como role `TRUSTED` (2) sem permissão de
religar o mundo/fazer upload de arquivo. Nesta sessão, `game.user.role` voltou
`4` (GAMEMASTER completo). Não assumir a role de uma sessão pra outra — checar
`game.user.role`/`game.user.isGM` no início de cada verificação ao vivo se a
tarefa depender de permissão de GM completo (ex.: reiniciar o mundo, upload
via `FilePicker`).

## Múltiplos alvos no mesmo teste — `token.setTarget` é local ao token, não ao user

`token.setTarget(true, {releaseOthers})` seta o alvo current USER
(`game.user.targets`), igual clicar em "Selecionar Alvos" e marcar na UI.
`releaseOthers:true` no PRIMEIRO alvo + `releaseOthers:false` nos seguintes é
o padrão certo pra marcar 2+ alvos programaticamente sem precisar simular
clique real no token.
