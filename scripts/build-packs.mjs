/**
 * Compila os compêndios do módulo a partir das fontes JSON em packs-src/.
 *
 * Fontes: packs-src/<pack>/<doc>.json — um documento por arquivo, cada um com
 * `_key` ("!actors!<id>" / "!folders!<id>"). Saída: packs/<pack>/ (LevelDB),
 * consumida pelo Foundry via entrada "packs" do module.json.
 *
 * Uso: node scripts/build-packs.mjs   (roda no `npm run build:packs`)
 */

import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { readdirSync, existsSync, rmSync } from "fs";
import { resolve } from "path";

const SRC_ROOT = resolve("packs-src");
const OUT_ROOT = resolve("packs");

if (!existsSync(SRC_ROOT)) {
    console.error("packs-src/ não existe — nada a compilar.");
    process.exit(1);
}

const packs = readdirSync(SRC_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

for (const pack of packs) {
    const src = resolve(SRC_ROOT, pack);
    const out = resolve(OUT_ROOT, pack);
    // recompila do zero (LevelDB acumula tombstones se sobrescrever)
    if (existsSync(out)) rmSync(out, { recursive: true, force: true });
    console.log(`Compilando pack "${pack}" → packs/${pack}`);
    await compilePack(src, out, { log: false });
}
console.log(`OK — ${packs.length} pack(s) compilado(s).`);
