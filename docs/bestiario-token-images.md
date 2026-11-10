# Imagens dos tokens do Bestiário de Arton

Atualização local validada em 10/11/2026: 181 criaturas do compêndio
`t20-theme-overhaul.bestiario-de-arton`.

- 124 imagens copiadas sem alteração dos PNGs fornecidos pelo usuário.
- 57 variantes sem token específico preservam a arte anterior com moldura vermelha.
- Apenas `img` e `prototypeToken.texture.src` mudam nos documentos de criatura.
- Raças, parceiros, fichas importadas, tokens da mesa, atributos e dimensões permanecem iguais.

O mapeamento completo está em `scripts/data/bestiario-token-images.json`.
As imagens anteriores continuam em `public/assets/bestiario-de-arton/originais/`
e `criadas/`. Não apagar: os compêndios de raças e parceiros ainda as referenciam.

## Reprodução

Com Python e Pillow, a partir da raiz do checkout:

```powershell
python scripts/apply-bestiario-tokens.py 'D:/Foundry/T20/Tokens Campanha/Tokens'
npm run build:packs
```

O script gera os PNGs em `public/assets/bestiario-de-arton/tokens/` e atualiza
os caminhos dos 181 documentos, mantendo os arquivos originais intactos.

## Aplicação local realizada

Os arquivos foram copiados para a instalação local do módulo. O compêndio
aberto foi atualizado pela API nativa do Foundry em uma macro administrativa
temporária, removida depois da verificação. Não houve troca de LevelDB com
o mundo aberto nem reinicialização do mundo.

`scripts/apply-bestiario-images-foundry.js` contém a rotina auditável. Ela
carrega as 181 imagens antes de atualizar, salva os caminhos anteriores,
confere a integridade dos documentos e restaura o bloqueio do compêndio.
Em caso de falha durante a aplicação, restaura os caminhos anteriores.

Arquivos de auditoria da instalação local (não incluir na distribuição):

- `assets/bestiario-de-arton/tokens/before-images-20261110.json`
- `assets/bestiario-de-arton/tokens/applied-images-20261110.json`

Resultado ao vivo: 181 imagens carregadas; apenas campos de imagem alterados;
todos os atores e tokens das cenas idênticos ao estado anterior.

## Validação

- Typecheck, build e compilação dos 11 compêndios passaram.
- 92 arquivos de teste, 1.138 testes aprovados.
- 181 documentos comparados com HEAD: nenhuma alteração fora dos dois campos de imagem.
- 124 PNGs idênticos byte a byte aos arquivos fornecidos.
- 57 PNGs de 600×600 com transparência externa e arte anterior preservada.
- Conferência visual no Foundry de token fornecido e arte emoldurada.

As verificações antigas que exigiam WebP foram atualizadas para PNG; a
verificação de raças/parceiros continua exigindo os retratos anteriores.

## Publicação e integração

Esta correção usa a versão `1.125.2`, na branch `codex/bestiario-token-images`,
baseada em `ee77fdb`. A publicação segue o workflow Release do repositório:
typecheck, testes, build e compilação dos packs antes de gerar o ZIP.

Esta release incorpora integralmente os commits publicados `ba5ed78`
(Necromante Iniciado, 1.125.0) e `ee77fdb` (correção de perícias, 1.125.1).
O checkout principal deve receber a atualização por fast-forward somente se
continuar sem alterações pendentes; nenhuma edição em andamento será descartada.

A instalação local do compêndio já usa os novos caminhos. Não substituir
o LevelDB com o mundo aberto: a aplicação online descrita acima fez a mesma
atualização por meio da API do Foundry e preservou a mesa.
