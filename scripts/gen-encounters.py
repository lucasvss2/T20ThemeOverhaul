# -*- coding: utf-8 -*-
"""Gera src/encounter-roller/encounter-data.ts a partir das 18 tabelas do
Apêndice D (Ameaças de Arton). Conteúdo transcrito do PDF (texto legível)."""
import json, io, sys

RANGES = [(1,2),(3,6),(7,10),(11,20),(21,30),(31,35),(36,40),(41,50),(51,60),(61,65),(66,70),(71,80),(81,90),(91,98),(99,100),(101,110),(111,115),(116,125),(126,130),(131,135),(136,145),(146,150),(151,155),(156,160),(161,170),(171,185),(186,200),(201,None)]

# Cada terreno: lista de 28 strings (na ordem de RANGES).
T = {}

T["aquatico"] = ("Aquático", [
 "1 hynne dormente se afogando",
 "1d3 bandidos comuns",
 "1d3 piratas",
 "1 baú de tesouro (ND 2; Percepção CD 15 para achar)",
 "1 baú de tesouro (ND 3) e 1d4+2 piratas que o acharam antes",
 "1 elfo-do-mar pescador e 1 escudeiro",
 "1 canceronte",
 "1 dragão filhote dos rios",
 "2 lacedons",
 "1d3 platans",
 "Tempestade em alto-mar*",
 "1 enxame de águas-vivas",
 "1 capitão pirata",
 "1 homem-piranha capitão e 1d6+1 homens-piranhas",
 "1 moreau da raposa bucaneira enfrentando 1d4 afogados",
 "2 águas-vivas gigantes",
 "1d4+1 corganns",
 "1 nereida",
 "1 peixe-recife sendo atacado por 2 pliorex abissais",
 "1 namasqall",
 "1 dragão venerável dos recifes",
 "1 canceronte de guerra",
 "2 dragões veneráveis* (frio)",
 "1 lobo do mar, 2 capitães piratas e 2d8 piratas",
 "1 Enguia Rainha",
 "1 kraken",
 "1 kaiju com deslocamento de natação",
 "1 Dragão-Real* (frio) e 1d4 dragões veneráveis* (frio)",
])

T["artico"] = ("Ártico", [
 "1 sílfide de cabelo rosa morrendo de frio",
 "1d4 zumbis*",
 "1 carcaju",
 "1d3+1 lobos*",
 "1 aquin’ne",
 "1 soterrado vagante",
 "1 minotauro da Manada com 1 lobo das cavernas*",
 "1 chefe de gangue e 1d3+1 bandidos selvagens",
 "1 ogro",
 "Avalanche*",
 "1 glacioll*",
 "1 minotauro chefe da Manada",
 "2 gigantes esqueletos",
 "1 mamute",
 "1 troll das cavernas*",
 "2 golens de Nor enormes",
 "1d4+1 mamutes esqueletos",
 "1 dragão bicéfalo (eletricidade e frio)",
 "1d4+2 vermes do gelo larvas",
 "1 fantasma ancestral e 2 fantasmas guardando um templo de Beluhga com 1d4 riquezas médias",
 "1 hallus'tir",
 "2 dracomantes superiores (frio)",
 "2d4 lyubas com 1d3 riquezas menores presas nas patas de um deles",
 "1 verme do gelo adulto",
 "2 ezzayn",
 "1 necrodraco lich",
 "Ninho de vermes do gelo (2 adultos e 2d4 larvas)",
 "Corte rubra invernal (templo de Aharadak com 1 reishid líder de culto, 1 avatar de Aharadak e 2d4 aspectos de Aharadak)",
])

T["area_tormenta"] = ("Área de Tormenta", [
 "Chuva ácida cai por 1d4+1 rodadas",
 "1 armadilha viva (arame farpado* ou virote*)",
 "1 armadilha viva (fosso profundo* ou lâmina na parede*)",
 "Insanidade da Tormenta* 1d6 PM (Von CD 14 evita)",
 "Fenômeno rubro (temperaturas implacáveis)",
 "1d2 maníacos lefou*",
 "1 árvore rubra (contém 1d3 sementes rubras)",
 "1 uktril*",
 "1d3 infectos",
 "1d4 iniciados da agonia",
 "1 grifo*",
 "1 rinoceronte lanoso",
 "1 alma acorrentada",
 "1 enxame infernal",
 "1 senhor do gigante rubro forma inicial",
 "1d4 veridak",
 "Role novamente, o próximo encontro inclui 1 fenômeno rubro aleatório",
 "1 dragão feral corrompido (sopro de ácido, acrescente Habilidades Lefeu*, Insanidade da Tormenta 3d6 PM, Von CD 30 evita)",
 "1 morgadrel",
 "1 arquibruxo da Tormenta e 2 turbas de infectos",
 "1 reishid líder de culto, 1 sacerdote de Aharadak*, 2d4 zyrrinaz e 2d4 fanáticos lefou* em um templo de Aharadak",
 "1 thuwarokk*",
 "2 esmagadores coletivos",
 "1 ezzayn especial",
 "1d4+1 elementais corrompidos",
 "1 Dragão-Real* (eletricidade)",
 "Templo de Aharadak com um avatar de Aharadak e 2d4 ezzayn especiais",
 "Gatzvalith faz promessas de poder aos personagens",
])

T["colina"] = ("Colina", [
 "2 boguns brigando para ver quem é o favorito de seu druida",
 "1d4+2 cascavéis*",
 "1d4+2 gali-gali",
 "2 gambás",
 "4 gnolls capangas",
 "1 jagunço e 1 capanga",
 "2 perdigueiros trolls atacando um viajante",
 "Grama carnívora",
 "1 kobold veterano e 4 kobolds patrulheiros",
 "1 gorlogg alfa com uma perna presa em uma armadilha",
 "Ninho de simbiontes (Conhecimento ou Misticismo CD 25 encontra 1 dádiva de Aharadak)",
 "1 geraktril* e 2 maníacos lefou* escoltando 2d4+2 prisioneiros para sacrifícios",
 "2 leões caçando 1 rinoceronte",
 "2 tendrículos",
 "4 serpes",
 "1 gnoll xamã de Megalokk, 1 gnoll xamã de Marah, 2 gnolls líderes de alcateia e 1 totem risonho",
 "1 keylor e 2 minotauros chefes da Manada",
 "2d4+2 entes discutindo sobre uma longa lista de nomes",
 "2 ogros capangas",
 "2 matronas gnolls, 2d4+2 gnolls filibusteiros e 1 xamã de Marah celebrando um casamento",
 "O mausoléu de um antigo herói contendo uma espada baronial e 1d4 riquezas maiores. Quem toca nos itens é afetado por uma maldição mortuária",
 "2 mantícoras primais",
 "2 golens de ferro superiores com mal-funcionamento (troque os elementos de sua Imunidade a Magia)",
 "2 nuvens de estirges",
 "4 golens de pedra protegendo um monólito, que se tocado invoca 1 gnoll Vuul'rak que estava preso",
 "Fábrica de esmagadores (2d4 sacerdotes de Aharadak e uma forja rubra; um sacerdote pode gastar uma ação padrão para criar um esmagador coletivo ao fim da rodada. A forja pode ser reativada em 1d4 rodadas)",
 "A Catástrofe Rara (4 nuvens de estirges)",
 "A Horda Risonha (2 gnolls Vuul'rak, 1 totem de Sarana, 1 totem do Rei-Tirano, 1d6 xamãs de Marah, 1d6 xamãs de Megalokk, 2d6 gnolls líderes de alcateia e 2 totens risonhos)",
])

T["deserto"] = ("Deserto", [
 "Uma caravana de negociantes (fornece descanso confortável)",
 "1d4 cascavéis*",
 "1 pakk",
 "2 gnolls capangas",
 "1 trog e 1 terrier",
 "1 trog caçador",
 "1 iniciado da agonia",
 "1d4 enxames larvais",
 "2 chacais zumbis disputando 1 garra-zumbi",
 "1 iniciado de Sszzass e 1d4 najas*",
 "Ciclone arcano",
 "2 feras-vassalo",
 "2 gatunos (depois de 3 rodadas, inicia-se uma tempestade de areia)",
 "1 ber-baram",
 "2 iniciadas de Sszzaas e 1 cultista de Sszzaas se passando por peregrinos",
 "2 pamgras e 1 trog anão eremita",
 "1 bruxa goblin",
 "1 sacerdote da agonia e 1d6+2 fanáticos lefou",
 "1 lagash*",
 "1 serpentaar",
 "1 fera-mãe e 2d6 feras-líder",
 "1 gnoll Vuul'rak",
 "2 senhores das múmias",
 "1 golem de matéria vermelha",
 "1 górgona matriarca e 4 elementais do veneno grandes lutando entre si",
 "1 Dragão-Real*",
 "Grande Enxame (1 avatar de Aharadak, 4 ezzayn e 2d10 líderes fanáticos lefou)",
 "Novos Zarkhassianos (1 Nastarrath, 1d6+2 sszzaazitas celebrantes, 1d4 nagahs místicas e 2d6 nagahs defensores)",
])

T["floresta"] = ("Floresta", [
 "1 gambá correndo atrás de um gato",
 "1 kobold patrulheiro aparentemente perdido",
 "1 terrier",
 "1d3+1 bandidos comuns sar-allan (não roubam ouro de devotos de Azgher)",
 "1d4 ursos pandas",
 "1 tropa de tentacutes (ei, aquele colar na mão deles não é de vocês?)",
 "Grama carnívora",
 "4 bandidos ligeiros sar-allan (não roubam ouro de devotos de Azgher)",
 "2d4 capivaras (…capivárias?)",
 "1d4+1 lagartos perseguidores",
 "1 tigre-de-Hyninn",
 "1 carrasco de Lena",
 "1d6+2 aranhas gigantes* (metade do terreno ao redor é coberto de teia)",
 "2 defeituosos",
 "1 gnoll xamã de Megalokk, 1 gorlogg alfa, 1 serpe* e 1 ganchador*",
 "2 entes conversando sobre uma longa lista de deuses",
 "1 hidra* (substitua o bônus de Furtividade para deserto)",
 "1d4+2 tendrículos",
 "Caçada Primal (1 centauro chefe, 2 centauros xamãs de Megalokk e 4 ursos das cavernas)",
 "1 górgona matriarca",
 "1 dragão venerável* (veneno)",
 "1 reishid líder de culto e 1d4 sacerdotes de Aharadak",
 "1 ezzayn explorando a região para seu lorde",
 "2 razza'kham",
 "4 dragões veneráveis* (elementos variados)",
 "1 gnoll Vuul'rakk combatendo 1 nuvem de estirges",
 "Coração da Selva (santuário de Allihanna com 1 dragão venerável* (ácido), 4 totens da Divina Serpente, 4 tanaloom e 2d6 gnolls xamãs de Allihanna)",
 "Fúria Monstruosa (4 totens do Rei-Tirano, 2 nuvens de estirges e 2d6 centauros xamãs de Megalokk)",
])

T["montanha"] = ("Montanha", [
 "Uma druida de cabelos cacheados protegida por 3 ursos-coruja* (ela possui itens de cura para negociar)",
 "1 lobo*",
 "1 carcaju (em seu tesouro há uma neko-te)",
 "Uma pedra solta rolando montanha abaixo (1 armadilha de bloco de pedra*)",
 "4 lobos*",
 "1 pantera espreitando",
 "1 chefe de gangue e 1d4 capangas",
 "1 urso pardo",
 "1 orc chefe e 1d4+1 orcs combatentes",
 "1 ogro",
 "2d6 lobos*",
 "3 ursos-corujas* acuando uma jovem de cabelos cacheados (se for salva, é uma aliada médica iniciante)",
 "1 ogro caçador",
 "1d4+1 cães do inferno*",
 "1d4 serpes e 1 serpe anciã",
 "2 tengu bandoleiros e 1 daitengu",
 "1d4+2 ogros furiosos e 1 keylor",
 "1 dragão bicéfalo",
 "1d3+2 raagorans em fuga",
 "1 concílio forjador combatendo 1 dragão feral",
 "1 fantasma ancestral de um aventureiro cercado por 1d4 runas de desintegração",
 "1 grande tachygloss",
 "2 tiranos do Terceiro* montados em 2 dragões adultos dos segredos e 1 alto clérigo de Kally guardando um covil.",
 "2 razza'kham lutando entre si",
 "2 hobgoblins gladiadores e 1 horda goblin",
 "2 vermes do gelo adultos",
 "Ateliê Rubro (2 golens de matéria vermelha, 1 senhor do gigante rubro forma final, 1d4+2 reishid líderes de culto, 1d6 esmagadores coletivos e 1d3+1 simbiontes diversos)",
 "O Despertar dos Monstros (1d4 kaiju)",
])

T["pantano"] = ("Pântano", [
 "1d6+3 capivaras nadando",
 "1d3 glops",
 "1d4+1 garras-zumbi",
 "2 gambás",
 "1 trog caçador preparando uma emboscada",
 "1 elemental do veneno pequeno",
 "1 área de dejetos alquímicos (Percepção CD 22 evita)",
 "1 garra-zumbi enxame",
 "1d4 gnolls saqueadores e 1 gnoll xamã de Allihanna",
 "1 basilisco*",
 "1 ninhada de dragões filhotes (ácido)",
 "1 finntroll caçador e 4 perdigueiros troll",
 "1 fantasma de um viajante em busca do seu anel de casamento",
 "1d6+2 tatus-montanha",
 "1 cocatriz-real e 1d3+1 cocatrizes em seu ninho",
 "2 elementais do veneno médios",
 "1 hidra* escondida submersa em um lago",
 "1 serpe anciã e 1d4+2 serpes",
 "1 necrodraco esqueleto (metade da área ao redor dele é areia movediça)",
 "1 necrodraco zumbi",
 "1 alto sacerdote finntroll, 2 finntroll senhores de estábulo e 1 elemental do veneno grande",
 "2 serpentaar",
 "Santuário antigo guardado por 2 tanaloom e 1 dragão da equidade venerável",
 "1 horda de otyughs e 1 elemental corrompido",
 "2 cemitérios vivos",
 "1 necrodraco lich",
 "Laboratório… abandonado? (1 lich de Aslothia, 1 cemitério vivo e 4 vampiros*)",
 "1 Dragão-Real* (ácido) e 1d6+2 dracomantes superiores",
])

T["planicie"] = ("Planície", [
 "1d4 bandidos comuns",
 "1 bandido ligeiro",
 "1 t'peel carregando um medalhão com um sol desenhado no valor de T$ 25",
 "Um tropel de 2d4 cavalos de carga selvagens",
 "1d4 gnoll capanga",
 "1 pantera furtiva caçando",
 "1 gnoll xamã de Allihanna e 1 hiena",
 "1 leão caçando 1 trobo",
 "1 duplo se passando por um conhecido do grupo",
 "3 goblins de sombreiro num impasse",
 "1 líder pistoleiro e 2 pistoleiros",
 "1 gnoll xamã de Marah oferece cura ao grupo se eles entregarem suas armas a ela",
 "1 gnoll xamã de Megalokk e 4 gnolls saqueadores",
 "1d6+1 elefantes pastando",
 "1 golem de bronze enguiçado (passar em um teste de Percepção contra CD 25 revela vestígios de uma batalha antiga na região)",
 "1 cavaleiro de Kally e 1 clérigo de Kally",
 "1 tigre-de-Hyninn primordial",
 "1 matrona gnoll e 1d6+1 gnolls caçadores de cabeças",
 "1 concílio forjador procurando pelo grupo",
 "Duelo entre 1 chapéu-preto e 1 demônio da pólvora",
 "2 golens de pedra em cima de 1 grama carnívora extensa",
 "1 gnoll Vuul'rak",
 "2 dragões veneráveis (eletricidade)",
 "1 nuvem de estirges",
 "1d6+2 hallus'tir",
 "1 Dragão-Real* (eletricidade)",
 "2d6 dracomantes superiores que invocam o avatar de Kallydranoch em 1d4 rodadas",
 "A Horda Risonha (2 gnolls Vuul'rak, 1 totem de Sarana, 1 totem do Rei-Tirano, 1d6 xamãs de Marah, 1d6 xamãs de Megalokk, 2d6 gnolls líderes de alcateia e 2 totens risonhos)",
])

T["subterraneo"] = ("Subterrâneo", [
 "Uma fazenda de mycotann livres, permitindo descanso luxuoso pela noite (ou será uma armadilha?)",
 "1 kill'bone lutando contra 1 perdigueiro troll",
 "1 slark pendurado no teto",
 "1 enxame larval explodindo de uma das paredes",
 "1 turba de zumbis*",
 "1d6+2 fofos",
 "4 orcs combatentes* e 1 orc veterano",
 "Uma aventureira perdida (na verdade 1 nagah dormente)",
 "1 basilisco",
 "1 finntroll caçador* arrastando 1 mycotann labutador em uma corrente",
 "1 trog rei dos túneis",
 "Um labirinto de túneis naturais",
 "1 cavaleiro finntroll",
 "2 armeiros de Tenebra devotos",
 "1 troll das cavernas",
 "1 orc mutante superior",
 "1 mortalha",
 "1 golem de pedra",
 "Cabala Tenebrista (2 armeiros de Tenebra clérigos e 6 armeiros de Tenebra devotos)",
 "1 golem de ferro superior",
 "1 arcanista finntroll, 1 finntroll senhor de estábulo e 1 alto sacerdote finntroll",
 "2 brawar protegendo a entrada de um Athrid",
 "2 arcanistas finntroll e 4 trolls das cavernas*",
 "1 cemitério vivo (de anões) num local sob efeito de Profanar* com área dobrada",
 "1 rival espelho para cada membro do grupo",
 "1 necrodraco lich",
 "Conventículo Escravagista (1 Dragão-Real* (psíquico) e 2d6 finntroll arcanistas negociando 4d6x10 escravos)",
 "1 Dragão-Real* (psíquico) e 1d4 dragões veneráveis* (psíquico)",
])

T["urbano"] = ("Urbano", [
 "Uma carroça de verduras desgovernada",
 "1d3+1 bandidos comuns",
 "1 t'peel carregando os pertences de um bardo",
 "1 devoto de Hyninn simão e 1 tentacute",
 "4 devotos de Hyninn manhosos",
 "1d4 pakks causando um incêndio",
 "1d4 gnolls saqueadores dividindo um saque",
 "1 mashin monge ensinando meditação (concede +2 em Vontade até o fim da aventura)",
 "2 gárgulas",
 "1 chefe de gangue e 2d4 bandidos ligeiros",
 "1 gangue goblin",
 "4 jagunços",
 "2 iniciados de Sszzaas (fingindo) que estão atacando 1 hynne dormente",
 "1 caçador de impuros atrás de um não humano",
 "1 forjador litúrgico oferencendo uma arma com um encanto para quem o derrotar",
 "2 fantasmas em conflito, um é o memento do outro",
 "1 dragão adulto dos segredos",
 "1 chapéu-preto",
 "1 minauro arcanista e 1d6+2 centuriões, com 1 minauro ladino prisioneiro",
 "1 fantasma ancestral",
 "1 alto clérigo de Kally, 2 clérigos de Kally e 1d6 acólitos de Kally atacando a cidade",
 "3 tanaloom disfarçados como pilares de uma igreja",
 "1 dragão venerável* (trevas), 1 governador corrupto e 2 gladiadores táuricos",
 "1 cemitério vivo",
 "2 soldados superiores",
 "2 liches de Aslothia",
 "Falsa Congregação (2 sszzaazitas celebrantes que em 1d4 rodadas invocarão 1 Nastarrath numa multidão)",
 "Invasão do Templo da Pureza Divina (1d6 soldados superiores, 1d6 colossos supremos e 2d6 cavaleiros do leopardo sangrento*)",
])

T["aslothia"] = ("Aslothia", [
 "2 garras-zumbi",
 "1 esqueleto* sem crânio (se reunido com seu crânio, ele entrega 1 riqueza média como agradecimento)",
 "1 carniçal",
 "1d4 zumbis*",
 "1 lacedon",
 "2 esqueletos*",
 "1 garra-zumbi enxame",
 "1 ogro esqueleto",
 "1d4 chacais zumbi",
 "4 carniçais e 1 lívido",
 "1 aparição",
 "4 mercenários de Aslothia",
 "2 mercenários de Aslothia e 1 líder mercenário de Aslothia",
 "1 wisphago",
 "1 morgue'raz",
 "4 kappa brigões e 1 nezumi ninja enfrentando 1 coletor de Arsenal",
 "1 mortalha",
 "1 capitão afogado e 2d4+1 afogados",
 "1 centurião de elite, 2 decúrias, 2 alzeras",
 "2 vampiros",
 "1 senhor das múmias e 2 múmias",
 "1 lich e 1 necrodraco esqueleto",
 "1 cemitério vivo",
 "2 senhores das múmias e 4 necrodracos esqueletos",
 "4 necrodracos zumbis",
 "1 lich de Aslothia e 4 necrodracos zumbis",
 "1 necrodraco lich",
 "Festa Fúnebre (1d4 liches de Aslothia, 2d6 vampiros* e 1 cemitério vivo)",
])

T["estradas_reinado"] = ("Estradas do Reinado", [
 "Uma taverna lotada",
 "1 pirata vendendo um mapa do tesouro (falso)",
 "4 bandidos comuns tentam roubar o grupo",
 "2 guardas de cidade* patrulhando",
 "1 chefe bandido e 2 capangas",
 "1 sacerdote de Hyninn em forma de macaco pungando algo valioso do grupo",
 "1 grifo* atacando 1 cavalo pertencente a um mercador",
 "2 gorloggs fugindo",
 "1 ogro guardando uma ponte e cobrando um pedágio de T$ 15 por pessoa",
 "1 bugbear sentinela e 4 goblins salteadores",
 "1 gangue goblin",
 "3 goblins de sombreiro escondidos",
 "1 chefe de quadrilha, 1 capanga minotauro e 2 jagunços",
 "1 líder pistoleiro e 3 pistoleiros",
 "Uma caravana de mercadores (vende itens com até duas melhorias e tem T$ 1.000 para fazer compras) protegida por 4 capangas minotauros",
 "2 altos sacerdotes de Hyninn recolhendo doações para sua igreja (nem sempre intencionais)",
 "1 gnoll caçador de cabeças, 1 bugbear guarda-costas e 1 ogro caçador",
 "1 dragão bicéfalo",
 "1d4+1 golens de bronze transportando 1d3+1 riquezas médias roubadas",
 "Grama carnívora extensa",
 "1 devorador de medos* e 2 bruxas goblins",
 "1 hobgoblin gladiador",
 "1 dragão celestial adulto tentando capturar 3 kaijin ninjas",
 "1 nagah encantadora escoltada por 4 nagahs retalhadores",
 "4 golens de ferro superiores enviados para eliminar os aventureiros",
 "2 sszzaazitas celebrantes (um disfarçado de clérigo de Tenebra, o outro, de Azgher) acusando um ao outro de ser um impostor",
 "Conflagração Elemental (1 hallus'tir, 1 namasqall, 1 serpentaar e 1 tanaloom)",
 "Tarso pedindo um sorvete",
])

T["galrasia"] = ("Galrasia", [
 "1 pirata fugindo de um 1 enxame de gali-gali",
 "1d4 jiboias*",
 "Uma voracis drogadora (possui 1d4 bálsamos de drogadora à venda)",
 "1d4+1 piratas enterrando 1 riqueza menor",
 "2 najas*",
 "1 galhada fêmea",
 "1 alcateia com 1 lobo das cavernas* e 1d4+1 lobos*",
 "1 sucuri* estrangulando um gorlogg*",
 "2 pteros ceifadores",
 "1 espada-da-floresta montado em 1 galhada macho",
 "1d3+1 ceratops guerreiros",
 "2 burafontes pastando",
 "1 ptero do céu infinito e 2 pteros ceifadores",
 "1 gorlogg alfa e 1d4+2 gorloggs",
 "1d3+1 uraghians jovens",
 "1 xamã de Sarana e 1d3+1 velocis caçadores",
 "1 ceratops chefe da tribo e 2d4 ceratops guerreiros",
 "1 árvore-matilha",
 "1 rei-tirano e 1 tuntram batalhando",
 "Um obelisco misterioso obra de uma civilização antiga (na verdade é 1 tanaloom)",
 "1 dragão venerável da equidade em seu covil",
 "1d3+1 grande battham de passagem",
 "1 razza'kham*",
 "1 voracis rainha e 2d6 voracis caçadoras que vão invocar um totem da Divina Serpente em 1d4+1 rodadas",
 "1 Dragão-Real (veneno)",
 "1 kaiju (ferrão peçonhento e sopro corrosivo) adormecido que acordará em 1d3 dias",
 "Conflagração Elemental (1 hallus'tir, 1 namasqall, 1 serpentaar e 1 tanaloom)",
 "1 Rubi da Virtude* protegido por uma armadilha sussurro de Sszzaas (aumente a CD em 10)",
])

T["tauron"] = ("Império de Tauron", [
 "Uma família com 1d10+2 membros fugindo de Tiberus",
 "1 capanga",
 "2 piratas",
 "1 legionário",
 "2 bandidos selvagens",
 "4 cavalos de carga desgovernados",
 "1 infecto",
 "2 capangas minotauros",
 "2 maníacos lefou* e 1 iniciado da agonia",
 "1 capelão de guerra pregando a palavra de Arsenal",
 "1 minauro arcanista estudando 2 fúrias de Tauron",
 "3 pistoleiros atrás de um tesouro de ND 8 em um cemitério tapistano",
 "2 decúrias",
 "1 gladiador lefou oferecendo abrigo contra uma tempestade (descanso confortável)",
 "4 arqueiros escravos e 1 governador corrupto",
 "Uma arena com lutas individuais contra gladiadores táuricos",
 "1 armadilha viva",
 "1 chapéu-preto atrás de um escravo foragido",
 "Role novamente, o próximo encontro está sob efeito de 1 fenômeno rubro aleatório",
 "1 morgadrel",
 "Uma formação rubra que infecta quem a tocar com náusea antinatural",
 "1 mantícora primal",
 "1 arquibruxo da Tormenta e 4 geraktril*",
 "1 senhor do gigante rubro forma final",
 "1 ezzayn",
 "2 elementais corrompidos enfrentando 2d4+2 centuriões de elite",
 "Um grupo de arcanistas tapistanos realizando testes com uma armadura do Devorador",
 "4 thuwarokk",
])
# NB: Tauron tem 28 faixas mas 186-200 e 201+ ficaram assim:
T["tauron"] = (T["tauron"][0], T["tauron"][1][:26] + [
 "1 avatar de Aharadak em uma manifestação da Tormenta",
 "A Marcha da Centúria Rubra (1 avatar de Aharadak, 20 zyrrinaz, 2d4 reishid líderes de culto, 2d6+2 legionários insanos e 2 arquibruxos da Tormenta conjurando Momento de Tormenta)",
])

T["sanguinarias"] = ("Sanguinárias", [
 "Ninho com 1d4+1 cascavéis*",
 "1 trog anão bruto caçando",
 "1 terrier querendo brincar",
 "1 leão cochilando",
 "1d4 enxames larvais",
 "1 aranha gigante* em seu covil",
 "1d3+1 lagartos perseguidores",
 "1 lobo-das-cavernas* e 2 lobos*",
 "1 avalanche",
 "1 gigante esqueleto",
 "1d3+1 grifos*",
 "1d4+1 cerianthar preparando uma emboscada",
 "1 centopeia-dragão*",
 "4 cães do inferno*",
 "1d4+2 basiliscos*",
 "2 serpes anciãs",
 "1d3+1 uraghians adultos",
 "2 oxxdons imensos",
 "Role novamente, o próximo encontro está sob efeito de 1 fenômeno rubro aleatório",
 "1 mantícora primal",
 "Um templo de Kallyadranoch defendido por 1 alto clérigo de Kally e 2 cavaleiros de Kally",
 "1 grande tachygloss",
 "1 vagalhão kobold",
 "2 razza'kham caçando",
 "2 ezzayn especiais",
 "1 Dragão-Real* (fogo)",
 "2 kaiju brigando por território",
 "O Kishinauros em seu local de descanso",
])

T["supremacia_purista"] = ("Supremacia Purista", [
 "1 recruta purista*",
 "Um clérigo de Tanna-Toh ferido (se for auxiliado, torna-se um parceiro ajudante iniciante até o fim da aventura)",
 "4 goblins salteadores* fugitivos",
 "1 chefe bandido",
 "1 purificado fugitivo",
 "1d4+2 recrutas puristas*",
 "1 sargento-mor*",
 "1d4 soldados puristas*",
 "2 corcéis de comando",
 "1d4+2 recrutas puristas* e 1 sargento-mor*",
 "1 dançarino de guerra e 2 bandidos selvagens",
 "2 capelães de guerra*",
 "2 soldados blindados",
 "1 dançarino de guerra veterano e 2 capelães de guerra*",
 "1 capelão de guerra*, 1 capitão-baluarte* e 2 sargentos-mor*",
 "1d6+1 guerreiros perpétuos",
 "2 caçadores de impuros e 1 cavaleiro do leopardo sangrento*",
 "1 companhia blindada de elite e 1 arcano de guerra veterano",
 "1 arcano de guerra veterano e 2 golens de bronze",
 "1 fantasma ancestral, morto na Batalha do Vale do Baixo Iörvaen",
 "1 kishin e 1d6+2 bispos de guerra",
 "1 concílio forjador combatendo 1 alto clérigo de Kally montado em 1 dragão adulto*",
 "1 golem de ferro superior e 1 colosso supremo*",
 "4 arcanos de guerra veteranos, dois deles montados em 2 carruagens de comando, escoltando 4 colossos supremos* desativados",
 "2 golens de ferro superiores e 1 soldado superior",
 "4 colossos supremos*, 2 golens de ferro superiores e 1 soldado superior",
 "1d6+2 soldados superiores",
 "Comando do Templo da Pureza Divina (1d6 soldados superiores, 1d6 colossos supremos* e 2d6 bispos de guerra)",
])

T["tyrondir_lamnor"] = ("Ruínas de Tyrondir/Lamnor", [
 "1d4+1 goblins salteadores",
 "2d4 ratos gigantes",
 "1 bandido ligeiro e 2 bandidos comuns",
 "1 zumbi peçonha",
 "1 turba de zumbis*",
 "1 leão disputando uma carcaça com 1 pantera",
 "1 ogro esqueleto",
 "1 goblin engenhoqueiro* querendo trocar descobertas científicas",
 "1 imediato e 1d4+1 piratas",
 "1 arauto de Thwor em peregrinação",
 "1 tigre-de-Hyninn",
 "1 hobgoblin mago de batalha e 2 hobgoblins soldados",
 "1 bugbear guarda-costas e 1d3+1 bugbears sentinelas",
 "Ruínas com 1d4+1 riquezas menores começam a desabar (use o perigo complexo construção em colapso)",
 "1 goblin de ferro mark II e 4 goblins-bomba",
 "1 devorador de medos* e 2 bugbears guarda-costas",
 "2 sombras de Thwor* tentam assassinar um dos aventureiros",
 "1 engenho de guerra goblin* escoltado por 1 hobgoblin comandante tático e 2 hobgoblins atiradores",
 "1 lodo negro surge em um espaço desocupado e dobra sua área a cada rodada, por 1d4+1 rodadas (role novamente outro encontro)",
 "1 horda goblin",
 "Ruínas de uma cidade com 1 fantasma ancestral e 4 fantasmas",
 "1 necrodraco zumbi submerso num lago de lodo negro",
 "1d4+2 tigres-de-Hyninn primordiais",
 "1 cemitério vivo",
 "1 lobo do mar e 4 capitães da Frota Áurea carregando um baú com 1d3 riquezas maiores protegida por 1 runa de desintegração (aumente a CD em 5)",
 "1 hobgoblin gladiador aconselhado por um clérigo de Thwor (1 sszzaazita celebrante disfarçado)",
 "1 necrodraco lich tentando reerguer uma vila, ele invoca 1 falange a cada 1d4 rodadas",
 "1 sangue do Ayrrak, 4 hobgoblins gladiadores e 2 bruxas goblins convidam os aventureiros a se juntarem a suas tropas... à força",
])

# fix Galrasia 1-2 (readable: "1 pirata fugindo de 1 enxame de gali-gali")
T["galrasia"][1][0] = "1 pirata fugindo de 1 enxame de gali-gali"

ORDER = ["aquatico","artico","area_tormenta","colina","deserto","floresta","montanha","pantano","planicie","subterraneo","urbano","aslothia","estradas_reinado","galrasia","tauron","sanguinarias","supremacia_purista","tyrondir_lamnor"]

# ---- validate ----
errs=[]
for tid in ORDER:
    label, rows = T[tid]
    if len(rows)!=28: errs.append(f"{tid}: {len(rows)} linhas (esperado 28)")
    for i,r in enumerate(rows):
        if not r or not r.strip(): errs.append(f"{tid}[{i}] vazio")
if errs:
    print("ERROS:\n"+"\n".join(errs)); sys.exit(1)
print(f"OK: {len(ORDER)} terrenos, {len(ORDER)*28} encontros.")

# ---- emit TS ----
def esc(s): return s.replace("\\","\\\\").replace('"','\\"')
buf=io.StringIO()
buf.write('''/**
 * Encontros Aleatórios (Tormenta20, Apêndice D — Ameaças de Arton).
 *
 * 18 tabelas de terreno, cada uma com 28 faixas de d% (1-2 … 201+). Cada faixa
 * tem UM encontro. O patamar do grupo desloca a rolagem de d100:
 *   Iniciante +0 · Veterano +30 · Campeão +70 · Lenda +110.
 *
 * Fluxo (ver index.ts): gatilho 1d20 + modificador acumulado (persistente); em
 * 20+ ocorre encontro e o d100+patamar resolve a tabela do terreno. No patamar
 * Lenda, um 100 natural no d100 dispara o Rhandomm (1d4, no 1 substitui).
 *
 * Fonte gerada por scratchpad/gen_encounters.py — NÃO editar à mão; ajuste os
 * dados no gerador e regenere.
 */

export type PatamarId = "iniciante" | "veterano" | "campeao" | "lenda";

export interface PatamarDef { id: PatamarId; label: string; mod: number; }

/** Modificador somado ao d100 por patamar (livro, p.422). */
export const PATAMARES: PatamarDef[] = [
    { id: "iniciante", label: "Iniciante (1\\u00ba\\u20134\\u00ba)", mod: 0 },
    { id: "veterano",  label: "Veterano (5\\u00ba\\u201310\\u00ba)", mod: 30 },
    { id: "campeao",   label: "Campe\\u00e3o (11\\u00ba\\u201316\\u00ba)", mod: 70 },
    { id: "lenda",     label: "Lenda (17\\u00ba\\u201320\\u00ba)", mod: 110 },
];

export function getPatamar(id: string): PatamarDef | undefined {
    return PATAMARES.find((p) => p.id === id);
}

export interface EncounterRange {
    /** Limite inferior da faixa (inclusivo). */
    min: number;
    /** Limite superior (inclusivo). null = sem teto (faixa "201+"). */
    max: number | null;
    /** Rótulo exibido, ex.: "1-2", "201+". */
    label: string;
    /** Texto do encontro. */
    encounter: string;
}

export interface TerrainDef {
    id: string;
    label: string;
    rows: EncounterRange[];
}

/**
 * Texto do Rhandomm (livro, p.422) — usado apenas no patamar Lenda quando o
 * d100 sai 100 natural e o 1d4 de confirmação cai em 1.
 */
export const RHANDOMM_TEXT =
    "O Rhandomm \\u2014 uma for\\u00e7a do caos que se manifesta nos momentos e lugares menos esperados.";

''')

# ranges labels
def rlabel(mn,mx): return f"{mn}-{mx}" if mx is not None else f"{mn}+"

buf.write("export const TERRAINS: TerrainDef[] = [\n")
for tid in ORDER:
    label, rows = T[tid]
    buf.write("    {\n")
    buf.write(f'        id: "{tid}",\n')
    buf.write(f'        label: "{esc(label)}",\n')
    buf.write("        rows: [\n")
    for (mn,mx),enc in zip(RANGES, rows):
        maxstr = "null" if mx is None else str(mx)
        buf.write(f'            {{ min: {mn}, max: {maxstr}, label: "{rlabel(mn,mx)}", encounter: "{esc(enc)}" }},\n')
    buf.write("        ],\n")
    buf.write("    },\n")
buf.write("];\n\n")

buf.write('''export function getTerrain(id: string): TerrainDef | undefined {
    return TERRAINS.find((t) => t.id === id);
}

/** Faixa correspondente ao total (d100 + modificador de patamar). */
export function findEncounterRow(terrain: TerrainDef, total: number): EncounterRange | null {
    return terrain.rows.find((r) => total >= r.min && (r.max === null || total <= r.max)) ?? null;
}

// \\u2500\\u2500 Valida\\u00e7\\u00e3o (exercida nos testes) \\u2500\\u2500
export function validateTerrains(terrains: TerrainDef[] = TERRAINS): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const t of terrains) {
        if (!t.id) problems.push(`Terreno sem id (label "${t.label}").`);
        else if (seen.has(t.id)) problems.push(`Id duplicado: "${t.id}".`);
        if (t.id) seen.add(t.id);
        const rows = t.rows ?? [];
        if (rows.length !== 28) problems.push(`"${t.id}": ${rows.length} faixas (esperado 28).`);
        const sorted = [...rows].sort((a, b) => a.min - b.min);
        if (sorted.length && sorted[0].min !== 1) problems.push(`"${t.id}": primeira faixa deve come\\u00e7ar em 1.`);
        if (sorted.length && sorted[sorted.length - 1].max !== null) problems.push(`"${t.id}": \\u00faltima faixa deve ser aberta (201+).`);
        for (let i = 1; i < sorted.length; i++) {
            const prevMax = sorted[i - 1].max;
            if (prevMax !== null && sorted[i].min !== prevMax + 1) {
                problems.push(`"${t.id}": buraco/sobreposi\\u00e7\\u00e3o entre ${prevMax} e ${sorted[i].min}.`);
            }
        }
        for (const r of rows) {
            if (!r.encounter || !r.encounter.trim()) problems.push(`"${t.id}" faixa ${r.label}: encontro vazio.`);
        }
    }
    return problems;
}
''')

OUT = r"src/encounter-roller/encounter-data.ts"
open(OUT,"w",encoding="utf-8").write(buf.getvalue())
print("wrote", OUT, "bytes", len(buf.getvalue()))
