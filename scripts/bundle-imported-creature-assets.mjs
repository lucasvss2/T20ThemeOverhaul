import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const source=process.argv[2]??'node_modules/.cache/servos-importacao/extracted';
const allowed=new Set(['i.imgur.com','i.ibb.co','files.d20.io','i.postimg.cc','imgur.com']);
const urls=new Set();
const localPortraits=new Set();
const alternatives=new Map();
function scan(v){if(typeof v==='string'&&/^https?:\/\//.test(v)&&/\.(png|jpe?g|webp|gif)(?:\?.*)?$/i.test(v))urls.add(v);else if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==='object')Object.values(v).forEach(scan);}
for(const pack of fs.readdirSync(source))for(const f of fs.readdirSync(path.join(source,pack)).filter(f=>f.endsWith('.json'))){
 const doc=JSON.parse(fs.readFileSync(path.join(source,pack,f),'utf8'));scan(doc);
 if(doc.type==='npc')for(const p of [doc.img,doc.prototypeToken?.texture?.src])if(p&&!/^https?:\/\//.test(p)){
  localPortraits.add(p);alternatives.set(p,[doc.img,doc.prototypeToken?.texture?.src].filter(x=>x&&x!==p));
 }
}
const file='scripts/data/imported-creature-assets.json';
const map=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
const out='public/assets/criaturas-integradas';fs.mkdirSync(out,{recursive:true});
for(const portrait of localPortraits){
 const root=portrait.startsWith('icons/')?'D:/Foundry/Foundry13app/Foundry Virtual Tabletop/resources/app/public':'D:/Foundry/USER DATA FOUNDRY/Data';
 const sourcePath=path.resolve(root,decodeURIComponent(portrait));
 if(!sourcePath.startsWith(path.resolve(root)+path.sep))throw Error('Retrato fora da pasta de recursos');
 if(!fs.existsSync(sourcePath)){
  const alternate=alternatives.get(portrait)?.find(p=>map[p]?.path&&!map[p]?.unavailable);
  if(!alternate)throw Error('Retrato local indisponível: '+portrait);
  map[portrait]={path:map[alternate].path,replacedMissingPath:true};continue;
 }
 const name=crypto.createHash('sha256').update(portrait).digest('hex').slice(0,20)+path.extname(sourcePath);
 fs.copyFileSync(sourcePath,path.join(out,name));map[portrait]={path:'modules/t20-theme-overhaul/assets/criaturas-integradas/'+name};
}
// A neutral bundled silhouette is used only if the original host no longer serves an image.
const fallback='D:/Foundry/Foundry13app/Foundry Virtual Tabletop/resources/app/public/icons/svg/mystery-man.svg';
fs.copyFileSync(fallback,path.join(out,'retrato-indisponivel.svg'));
async function image(url){for(let redirects=0;redirects<4;redirects++){
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||!allowed.has(parsed.hostname))throw Error('Host fora da lista de imagens originais');
 const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'T20ThemeOverhaul-AssetBundle/1.0'}});
 if(r.status>=300&&r.status<400){url=new URL(r.headers.get('location'),url).href;continue;}
 if(!r.ok)throw Error('HTTP '+r.status);const bytes=Buffer.from(await r.arrayBuffer());
 const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216?'jpg':bytes.subarray(0,4).toString()==='RIFF'?'webp':bytes.subarray(0,3).toString()==='GIF'?'gif':null;
 if(!ext||bytes.length<1500)throw Error('Imagem original indisponível ou inválida');return {bytes,ext};
 }throw Error('Redirecionamentos excessivos');}
let completed=0;const queue=[...urls];
async function worker(){while(queue.length){const url=queue.shift();if(map[url]?.path&&!map[url]?.unavailable){completed++;continue;}
 try{const {bytes,ext}=await image(url);const name=crypto.createHash('sha256').update(url).digest('hex').slice(0,20)+'.'+ext;fs.writeFileSync(path.join(out,name),bytes);map[url]={path:'modules/t20-theme-overhaul/assets/criaturas-integradas/'+name};}
 catch(e){map[url]={path:'modules/t20-theme-overhaul/assets/criaturas-integradas/retrato-indisponivel.svg',unavailable:true,reason:String(e.message)};}
 completed++;if(completed%40===0){fs.writeFileSync(file,JSON.stringify(map,null,2)+'\n');console.log(completed+'/'+urls.size);}
}}
await Promise.all(Array.from({length:4},worker));fs.writeFileSync(file,JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({urls:urls.size,bundled:Object.values(map).filter(x=>!x.unavailable).length,unavailable:Object.values(map).filter(x=>x.unavailable).length}));
