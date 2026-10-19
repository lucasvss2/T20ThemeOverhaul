// Fonte: capturas fornecidas pelo usuário, pp. 63–65. Itens normais do T20.
import { mkdirSync, writeFileSync } from 'node:fs';
const root = 'packs-src/capanga';
mkdirSync(root, { recursive: true });
const asset = slug => `modules/t20-theme-overhaul/assets/Capanga/${slug}.png`;
const source = 'Classe variante de Ladino — Capanga (material fornecido, pp. 63–65)';
const definitions = [
    ['Ataque Furtivo Brutal', 'ataque-furtivo-brutal', 1, 'Você sabe aproveitar a distração do inimigo para atingir seus pontos vitais. Uma vez por rodada, quando atinge uma criatura desprevenida com um ataque corpo a corpo, ou uma criatura que esteja flanqueando, você causa 1d8 pontos de dano extra. A cada dois níveis, esse dano aumenta em +1d8. Uma criatura imune a acertos críticos também é imune a ataques furtivos.'],
    ['Evasão', 'evasao', 2, 'No 2º nível, quando sofre um efeito que permite um teste de Reflexos para reduzir o dano à metade, você não sofre dano algum se passar. Você ainda sofre dano normal se falhar. Esta habilidade exige liberdade de movimentos; você não pode usá-la de armadura pesada ou na condição Imóvel.'],
    ['Poder de Ladino', 'poder-de-ladino', 2, 'A partir do 2º nível, e a cada nível seguinte, você recebe um poder de ladino à sua escolha, como o ladino básico. Você deve cumprir os pré-requisitos do poder escolhido.'],
    ['Rápido e Rasteiro', 'rapido-e-rasteiro', 3, 'No 3º nível, você recebe +2 em Iniciativa, Defesa e em rolagens de dano na primeira rodada de cada combate. Esse bônus aumenta para +4 no 7º nível e para +6 no 15º nível.'],
    ['Cara Feia', 'cara-feia', 4, 'No 4º nível, você recebe +5 em testes de resistência contra efeitos de Medo e em testes de Vontade para resistir a intimidações.'],
    ['Flanquear Aprimorado', 'flanquear-aprimorado', 6, 'No 6º nível, o bônus que você recebe contra oponentes flanqueados aumenta para +4 (em vez de +2).'],
    ['Olhos nas Costas', 'olhos-nas-costas', 8, 'No 8º nível, você consegue lutar contra diversos inimigos como se fossem apenas um. Você não pode ser flanqueado.'],
    ['Evasão Aprimorada', 'evasao-aprimorada', 10, 'No 10º nível, quando sofre um efeito que permite um teste de Reflexos para reduzir o dano à metade, você não sofre dano algum se passar e sofre apenas metade do dano se falhar. Esta habilidade exige liberdade de movimentos; você não pode usá-la de armadura pesada ou na condição Imóvel.'],
    ['Debulhar Inimigos', 'debulhar-inimigos', 20, 'No 20º nível, você já perdeu a paciência com inimigos cheios de truques ou que são resistentes às suas habilidades. Seus ataques furtivos ignoram imunidades de criaturas a acertos críticos. Além disso, você pode gastar 5 PM quando faz um ataque para usar seu ataque furtivo mesmo que o alvo não esteja desprevenido ou que você não o esteja flanqueando.'],
];
const ids = definitions.map((_, i) => `CapangaPower${String(i+1).padStart(4,'0')}`);
const link = i => `@UUID[Compendium.t20-theme-overhaul.capanga.Item.${ids[i]}]{${definitions[i][0]}}`;
const notes = {
    'ataque-furtivo-brutal': 'No diálogo da arma, selecione este efeito quando cumprir as condições. A progressão em d8 é automática pelos níveis de Capanga; Assassinar dobra apenas esses dados. A elegibilidade, a imunidade do alvo e o limite de uma vez por rodada devem ser conferidos na mesa, como no Ataque Furtivo do ladino.',
    'poder-de-ladino': 'Escolha e arraste os poderes desejados do compêndio de poderes de ladino. Este item registra a escolha por nível; não escolhe um poder por você.',
    'rapido-e-rasteiro': 'Iniciativa e dano aparecem nos efeitos de uso, selecionados por padrão enquanto disponíveis. Antes de iniciar o combate, o bônus de Iniciativa também fica disponível. A Defesa é aplicada automaticamente aos participantes durante a primeira rodada e removida nas rodadas seguintes. O valor acompanha o nível de Capanga.',
    'cara-feia': 'Marque o efeito de uso Cara Feia no teste de resistência apenas contra Medo ou, em Vontade, contra intimidação. Não concede +5 permanentemente a todas as resistências.',
    'flanquear-aprimorado': 'No ataque contra um oponente flanqueado, marque este efeito para somar +2 adicionais ao bônus normal de +2. Não some +4 novamente. A posição de flanqueamento é conferida na mesa.',
    'olhos-nas-costas': 'Considere esta imunidade ao determinar posições de flanqueamento na mesa.',
    'debulhar-inimigos': 'A parte de ignorar imunidade a ataques furtivos é passiva e deve ser considerada na mesa. Para a opção de 5 PM, marque Ataque Furtivo Brutal e Debulhar Inimigos no mesmo ataque. Não use o poder separadamente para esse custo. O efeito de 5 PM libera a condição situacional; não adiciona uma segunda cópia do dano furtivo.',
};
function onuse(name, changes, flags={}) {
    return { name, img:'', type:'base', transfer:true, disabled:true, changes,
        flags:{tormenta20:{onuse:true,self:false,attack:false,skill:false,ability:false,power:false,spell:false,consumable:false,aumenta:false,custo:'',durationScene:false,items:'',...flags}} };
}
const change = (key,value) => ({key,mode:2,value,priority:20});
definitions.forEach(([name,slug,level,text],i)=>{
    const id=ids[i], effects=[];
    if(i===0) effects.push(onuse(name,[change('dano','roll')],{attack:true}));
    if(i===3){
        effects.push(onuse(name,[change('dano','2')],{attack:true,spell:true,power:true,consumable:true}));
        effects.push(onuse(`${name} — Iniciativa`,[change('roll','2')],{skill:true,items:'Iniciativa'}));
        effects.forEach(e=>e.disabled=false);
    }
    if(i===4) effects.push(onuse(name,[change('roll','5')],{skill:true,items:'Fortitude;Reflexos;Vontade'}));
    if(i===5) effects.push(onuse(name,[change('ataque','2')],{attack:true}));
    if(i===8) effects.push(onuse(name,[],{attack:true,custo:'5'}));
    effects.forEach((e,j)=>{e._id=`CapangaEffec${String(j+1).padStart(4,'0')}`;e._key=`!items.effects!${id}.${e._id}`;e.img=asset(slug);});
    const description=`<p>${text}</p><p><strong>Nível de Capanga:</strong> ${level}º.</p>`+(notes[slug]?`<p><strong>Uso no Foundry:</strong> ${notes[slug]}</p>`:'');
    const doc={name,type:'poder',img:asset(slug),system:{description:{value:description,unidentified:''},source,ativacao:{execucao:'passive',custo:0,qtd:'',condicao:'',special:''},duracao:{value:0,units:'',special:''},range:{value:null,units:''},resistencia:{pericia:'',atributo:'',bonus:0,txt:''},efeito:'',alcance:'none',area:'',rolls:i===0?[{name:'Dano',key:'dano0',type:'dano',parts:[['1d8','dano','']]}]:[],tipo:'ability',subtipo:'Capanga',origin:'',tags:[],rolltags:[],automationtags:[],chatFlavor:'',chatGif:''},effects,folder:null,sort:level*100,ownership:{default:0},flags:{'t20-theme-overhaul':{capangaLevel:level}},_stats:{systemId:'tormenta20'},_id:id,_key:`!items!${id}`};
    writeFileSync(`${root}/poder-${slug}.json`,JSON.stringify(doc,null,2)+'\n');
});
const skills='Ladinagem (Des) e Enganação (Des), mais 6 a sua escolha entre Acrobacia (Des), Atletismo (For), Atuação (Car), Cavalgar (Des), Conhecimento (Int), Diplomacia (Car), Furtividade (Des), Iniciativa (Des), Intimidação (Car), Intuição (Sab), Investigação (Int), Jogatina (Car), Luta (For), Ofício (Int), Percepção (Sab), Pilotagem (Des), Pontaria (Des) e Reflexos (Des).';
const rows=Array.from({length:20},(_,i)=>{
    const n=i+1, powers=[];
    if(n%2) powers.push(`${link(0)} +${Math.ceil(n/2)}d8`);
    if(n===2) powers.push(link(1));
    if(n>=2) powers.push(link(2));
    if([3,7,15].includes(n)) powers.push(`${link(3)} +${n===3?2:n===7?4:6}`);
    for(const [level,index] of [[4,4],[6,5],[8,6],[10,7],[20,8]])if(n===level)powers.push(link(index));
    return `<tr><td>${n}º</td><td>${powers.join(', ')}</td></tr>`;
}).join('');
const description=`<p><em>Variante de Ladino. “Quer saber a melhor maneira de roubar algo? Bata no dono. Bata com força.”</em></p><p>Bruto, ágil e direto, o capanga troca sutileza por brutalidade. Resolve os problemas do submundo cobrando dívidas, intimidando informantes e abrindo caminho na marra.</p><p><strong>Regras de variante:</strong> funciona como Ladino para lista de poderes e pré-requisitos. Não pode fazer multiclasse com Ladino. A escolha deve ser feita ao criar o personagem ou ao alcançar o 1º nível da classe e não pode ser mudada. O material fornecido está em fase de testes.</p><p><strong>PV:</strong> como Ladino: 12 + Constituição no 1º nível; +3 + Constituição nos seguintes.</p><p><strong>PM:</strong> como Ladino: 4 por nível.</p><p><strong>Perícias:</strong> ${skills}</p><p><strong>Proficiências:</strong> como Ladino, armas simples e armaduras leves.</p><p><strong>Uso no Foundry:</strong> arraste a classe e as habilidades correspondentes ao seu nível para a ficha, como no compêndio do Cruzado. Os links abaixo abrem cada poder. Não recebe Especialista, Esquiva Sobrenatural ou A Pessoa Certa para o Trabalho do ladino básico.</p><table><thead><tr><th>Nível</th><th>Habilidades de classe</th></tr></thead><tbody>${rows}</tbody></table>`;
const id='CapangaClass0001';
writeFileSync(`${root}/classe-capanga.json`,JSON.stringify({name:'Capanga',type:'classe',img:asset('capanga'),system:{description:{value:description,unidentified:''},source,niveis:1,pvPorNivel:3,pmPorNivel:4,inicial:false,rolls:[],origin:'',tags:[],chatFlavor:'',chatGif:'',pericias:{inatas:skills,numero:6},rolltags:[],automationtags:[]},effects:[],folder:null,sort:0,ownership:{default:0},flags:{'t20-theme-overhaul':{variantOf:'Ladino'}},_stats:{systemId:'tormenta20'},_id:id,_key:`!items!${id}`},null,2)+'\n');
console.log('Capanga: classe e 9 poderes gerados.');
