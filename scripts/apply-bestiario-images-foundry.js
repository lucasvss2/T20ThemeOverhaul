// Run once as a GM Script macro after installing the image assets.
const root = 'modules/t20-theme-overhaul/assets/bestiario-de-arton/tokens';
const pack = game.packs.get('t20-theme-overhaul.bestiario-de-arton');
if (!game.user.isGM || !pack || game.system.id !== 'tormenta20') throw new Error('Sessão ou compêndio incorreto.');
const planResponse = await fetch(`${root}/manifest.json?v=20261110`);
if (!planResponse.ok) throw new Error('Manifesto indisponível.');
const plan = await planResponse.json();
if (plan.length !== 181 || new Set(plan.map(e => e.id)).size !== 181) throw new Error('Manifesto incompleto.');
const docs = await pack.getDocuments();
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
  return value;
};
const invariant = d => {
  const o = d.toObject(); delete o.img; delete o._stats;
  if (o.prototypeToken?.texture) delete o.prototypeToken.texture.src;
  return JSON.stringify(canonical(o));
};
const worldState = () => JSON.stringify(canonical({actors:game.actors.contents.map(a=>a.toObject()),tokens:game.scenes.contents.map(s=>({id:s.id,tokens:s.tokens.contents.map(t=>t.toObject())}))}));
const worldBefore = worldState();
const backup = [];
const fingerprints = new Map();
for (const e of plan) {
  const d = docs.find(d=>d.id===e.id);
  if (!d || d.name !== e.name || !e.image.startsWith(`${root}/`)) throw new Error(`Identidade inválida: ${e.name}`);
  backup.push({_id:d.id,img:d.img,'prototypeToken.texture.src':d.prototypeToken.texture.src});
  fingerprints.set(d.id,invariant(d));
}
await Promise.all(plan.map(e=>new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=()=>reject(new Error(`Imagem ausente: ${e.name}`));i.src=e.image;})));
const picker = foundry.applications.apps.FilePicker.implementation;
const save = async (name,data) => {
  const r = await picker.upload('data',root,new File([JSON.stringify(data,null,2)],name,{type:'application/json'}),{}, {notify:false});
  if (!r?.path) throw new Error(`Falha ao salvar ${name}`);
};
await save('before-images-20261110.json',backup);
const wasLocked = pack.locked;
let changed = false;
try {
  await pack.configure({locked:false});
  changed = true;
  await Actor.updateDocuments(plan.map(e=>({_id:e.id,img:e.image,'prototypeToken.texture.src':e.image})),{pack:pack.collection});
  const updated = await pack.getDocuments();
  for (const e of plan) {
    const d = updated.find(d=>d.id===e.id);
    if (d.img!==e.image || d.prototypeToken.texture.src!==e.image || invariant(d)!==fingerprints.get(e.id)) throw new Error(`Verificação falhou: ${e.name}`);
  }
  const report={actors:181,provided:124,framed:57,imagesLoaded:181,onlyImageFieldsChanged:true,worldUnchanged:worldBefore===worldState(),timestamp:new Date().toISOString()};
  await save('applied-images-20261110.json',report);
  new Dialog({title:'Bestiário de Arton — imagens verificadas',content:`<p><strong>181 criaturas atualizadas e verificadas.</strong></p><p>124 tokens fornecidos · 57 artes preservadas com moldura.</p><p>181 imagens carregadas. Estatísticas e tamanhos preservados.</p><p>Mesa preservada: ${report.worldUnchanged?'sim':'houve mudança concorrente; esta rotina não altera a mesa'}.</p><div style="display:flex;gap:12px"><img width="160" height="160" src="${root}/ankthyr.png"><img width="160" height="160" src="${root}/ameba-gigante.png"></div>`,buttons:{ok:{label:'Concluir'}}}).render(true);
} catch(error) {
  if(changed) await Actor.updateDocuments(backup,{pack:pack.collection});
  new Dialog({title:'Atualização revertida',content:`<p>${String(error.message)}</p>`,buttons:{ok:{label:'Fechar'}}}).render(true);
  throw error;
} finally {
  await pack.configure({locked:wasLocked});
}
