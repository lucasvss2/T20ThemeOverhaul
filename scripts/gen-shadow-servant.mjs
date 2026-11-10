import {writeFileSync} from 'node:fs';
import {buildShadowTemplate} from '../src/npc-necromancy/servant.ts';
writeFileSync('packs-src/ameacas/servo-de-sombra-iniciado.json',JSON.stringify(buildShadowTemplate(),null,2)+'\n');
console.log('Servo de Sombra adicionado ao compêndio.');
