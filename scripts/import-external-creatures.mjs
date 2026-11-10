/** Import the user's installed T20 packs; never reads or writes a world. */
import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2]??'node_modules/.cache/servos-importacao/extracted';
const assetMapPath='scripts/data/imported-creature-assets.json';
const assetMap=fs.existsSync(assetMapPath)?JSON.parse(fs.readFileSync(assetMapPath,'utf8')):{};
const mapping={'bestiario-de-arton':'ameacas-de-arton','ameacas-livro-basico':'ameacas-livro-basico','habilidades-do-bestiario':'habilidades-ameacas'};
const packs=Object.entries(mapping).map(([old,name])=>({old,name,docs:fs.readdirSync(path.join(input,old)).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(input,old,f),'utf8')))}));
const aliases=new Map(),embeddedById=new Map(),namedAbilities=new Map();
const register=(map,key,value)=>{if(!key)return;if(!map.has(key))map.set(key,new Set());map.get(key).add(value);};
// The source pack contains links copied from the author's world. These IDs
// also exist in the installed system's rulebook and item compendiums.
const nativeItems='node_modules/.cache/bestiario/native-json';
for(const pack of ['magias','poderes','parceiros','equipamentos'])for(const file of fs.readdirSync(path.join(nativeItems,pack)).filter(f=>f.endsWith('.json'))){
 const d=JSON.parse(fs.readFileSync(path.join(nativeItems,pack,file),'utf8'));
 if(d._key?.startsWith('!items!'))register(aliases,'Item.'+d._id,`Compendium.tormenta20.${pack}.Item.${d._id}`);
}
for(const file of fs.readdirSync('node_modules/.cache/servos-importacao/native-basico-json').filter(f=>f.endsWith('.json'))){
 const d=JSON.parse(fs.readFileSync(path.join('node_modules/.cache/servos-importacao/native-basico-json',file),'utf8'));
 if(!d._key?.startsWith('!journal!'))continue;
 const uuid=`Compendium.tormenta20.basico.JournalEntry.${d._id}`;
 register(aliases,'JournalEntry.'+d._id,uuid);
 register(aliases,`Compendium.tormenta20.condicoes.JournalEntry.${d._id}`,uuid);
 for(const page of d.pages??[]){
  const own=uuid+'.JournalEntryPage.'+page._id;
  register(aliases,`JournalEntry.${d._id}.JournalEntryPage.${page._id}`,own);
  register(aliases,`Compendium.tormenta20.condicoes.JournalEntry.${d._id}.JournalEntryPage.${page._id}`,own);
 }
}
for(const p of packs)for(const d of p.docs){
 if(!['npc','poder','magia','arma','equipamento','consumivel'].includes(d.type)||d._key?.startsWith('!folders!'))continue;
 const kind=p.old==='habilidades-do-bestiario'?'Item':'Actor';
 const uuid=`Compendium.t20-theme-overhaul.${p.name}.${kind}.${d._id}`;
 for(const prefix of [`Compendium.bestiario-de-arton.${p.old}`,`Compendium.world.${p.old}`]){
  register(aliases,`${prefix}.${kind}.${d._id}`,uuid);register(aliases,`${prefix}.${d._id}`,uuid);
 }
 for(const a of [d.flags?.core?.sourceId,d._stats?.compendiumSource,d._stats?.duplicateSource])register(aliases,a,uuid);
 if(kind==='Item'){register(embeddedById,d._id,uuid);register(namedAbilities,d.name.toLowerCase(),uuid);}
 for(const item of d.items??[]){const own=uuid+'.Item.'+item._id;register(embeddedById,item._id,own);
  for(const a of [item.flags?.core?.sourceId,item._stats?.compendiumSource,item._stats?.duplicateSource])register(aliases,a,own);
  register(aliases,`Actor.${d._id}.Item.${item._id}`,own);
 }
}
const unique=(map,k)=>map.get(k)?.size===1?[...map.get(k)][0]:undefined;
const unresolved=[];
function rewriteString(s,owner){
 if(assetMap[s]?.path)return assetMap[s].path;
 const exact=unique(aliases,s);if(exact)return exact;
 return s.replace(/@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g,(full,id,label)=>{
  const match=unique(aliases,id)??(/^Actor\..+\.Item\.(\w+)$/.test(id)?unique(embeddedById,id.split('.').at(-1)):undefined)
    ??(/^Item\.\w+$/.test(id)?unique(embeddedById,id.slice(5))??(label?unique(namedAbilities,label.toLowerCase()):undefined):undefined);
  if(match)return `@UUID[${match}]${label?'{'+label+'}':''}`;
  if(id.startsWith('Compendium.tormenta20.'))return full;
  unresolved.push({owner,uuid:id,label:label??null});
  // These were links to the original author's private world, not usable references.
  return label??id.split('.').at(-1);
 });
}
function walk(v,owner){if(typeof v==='string')return rewriteString(v,owner);if(Array.isArray(v))return v.map(x=>walk(x,owner));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,owner)]));return v;}
function clean(d){d.ownership={default:0};if(d._stats){d._stats.lastModifiedBy=null;d._stats.compendiumSource=null;d._stats.duplicateSource=null;}for(const child of [...(d.items??[]),...(d.effects??[])]){clean(child);child.folder=null;}}
const counts={},compatibilityPatches=[];
for(const p of packs){const out='packs-src/'+p.name;fs.mkdirSync(out,{recursive:true});const folderIds=new Set(p.docs.filter(d=>d._key?.startsWith('!folders!')).map(d=>d._id));let n=0;
 for(const original of p.docs){const d=walk(structuredClone(original),original.name);clean(d);
  if(d.folder&&!folderIds.has(d.folder))d.folder=null;
  if(!d._key?.startsWith('!folders!')){
   n++;d.flags??={};d.flags['t20-theme-overhaul']={...d.flags['t20-theme-overhaul'],importedCreature:{module:'bestiario-de-arton',version:'0.8.6',pack:p.old,id:d._id}};
  }
  for(const effect of [...(d.effects??[]),...(d.items??[]).flatMap(i=>i.effects??[])])for(const change of effect.changes??[]){
   if(change.key==='system.tracos.resistencias.veneno.bonus'){
    if(effect.changes.length!==1)throw Error('Efeito misto de veneno exige revisão: '+d.name);
    // Poison resistance is a situational saving-throw bonus, not a damage RD.
    change.key='roll';effect.disabled=true;effect.flags??={};
    effect.flags.tormenta20={...effect.flags.tormenta20,onuse:true,durationScene:false,self:false,attack:false,skill:true,ability:false,power:false,equipment:false,spell:false,consumable:false,items:'Fortitude;Reflexos;Vontade',aumenta:false,custo:''};
    effect.description=(effect.description??'')+'<p>Bônus contra venenos; selecione no teste de resistência apropriado.</p>';
    compatibilityPatches.push({id:d._id,name:d.name,conversion:'poison-save-bonus',value:change.value});
   }else if(change.key==='system.tracos.resistencias.veneno.imunidade'){
    change.key='system.tracos.ic.value';change.mode=2;change.value='veneno';
    compatibilityPatches.push({id:d._id,name:d.name,conversion:'poison-effect-immunity'});
   }
  }
  if(d.type==='npc'){
   const footprint={min:0.25,peq:1,med:1,gra:2,eno:3,col:6}[d.system.tracos?.tamanho];
   if(footprint&&d.prototypeToken){d.prototypeToken.width=footprint;d.prototypeToken.height=footprint;}
  }
  const slug=(d.name??'folder').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  fs.writeFileSync(path.join(out,slug+'-'+d._id+'.json'),JSON.stringify(d,null,2)+'\n');
 }
 counts[p.name]=n;
}
fs.mkdirSync('docs/imports',{recursive:true});
fs.writeFileSync('docs/imports/criaturas-integradas.json',JSON.stringify({sourceModule:'bestiario-de-arton',sourceVersion:'0.8.6',counts,compatibilityPatches,unresolvedLegacyLinks:unresolved,assets:assetMap},null,2)+'\n');
console.log(JSON.stringify({counts,unresolvedLegacyLinks:unresolved.length,assets:Object.keys(assetMap).length}));
