/**
 * Gera o compêndio packs-src/pocoes-pergaminhos/ a partir de um harvest ao vivo
 * de todas as magias (arc/div/uni) dos compêndios de Item instalados no mundo.
 *
 * O harvest é colhido rodando um script no console do Foundry (logado como GM,
 * `game.packs` + `pack.getDocument`), salvo como JSON. NÃO é gerado por este
 * script — este script só CONSOME o harvest e emite os documentos do pack.
 * Ver CLAUDE.md ("Poções, Pergaminhos e Identificação") pro script de harvest.
 *
 * Regras (Tormenta20 — Fabricando itens mágicos):
 *   - Pergaminho: 1 por magia elegível (tipo arc/div/uni), sem restrição de
 *     alvo. Preço = 30 × custoPM² (mín 1).
 *   - Poção: só magias cujo alvo é criatura/objeto ou têm efeito em área
 *     (exclui alcance "self"/"none" SEM área, e "spec"). 1 variante base +
 *     1 variante por CADA aprimoramento individual do catálogo da magia
 *     (decisão do usuário: sem combinar 2+ aprimoramentos, evita explosão
 *     combinatória). Preço recomputado com o custo efetivo (base+aprimoramento).
 *   - Ambos nascem com o NOME REAL no documento do compêndio (uso do GM —
 *     precisa achar/arrastar o item certo) + flag `pocaoPergaminho.identificado:
 *     false`. O mascaramento pro jogador ("Poção desconhecida") acontece em
 *     RUNTIME (src/pocoes-pergaminhos/), só na cópia entregue a um ator jogador
 *     — não aqui.
 *
 * Uso: node scripts/gen-pocoes-pergaminhos.mjs [caminho-do-harvest.json]
 *      (default: C:\Users\lucas\.claude\plans\t20-harvest-magias.json)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ID = "t20-theme-overhaul";
const HARVEST_PATH = process.argv[2] || "C:\\Users\\lucas\\.claude\\plans\\t20-harvest-magias.json";
const OUT_DIR = join(__dirname, "..", "packs-src", "pocoes-pergaminhos");

const POCAO_IMG = `modules/${MODULE_ID}/assets/Items/po%C3%A7%C3%A3o.png`;
const PERGAMINHO_IMG = `modules/${MODULE_ID}/assets/Items/pergaminho.png`;

// ── helpers puros ───────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function randomId(len = 16) {
    let s = "";
    for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
}

function slugify(s) {
    return s
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

/** Preço T$ = 30 × custo² (mín custo 1). Regra do livro. */
function craftPrice(custoPM) {
    const c = Math.max(1, custoPM);
    return 30 * c * c;
}

/** Elegível a virar POÇÃO: alvo criatura/objeto ou área (exclui self/none sem área, e spec). */
function isEligibleForPotion(alcance, area) {
    if (alcance === "spec") return false;
    if ((alcance === "self" || alcance === "none") && !area) return false;
    return true;
}

/**
 * Rótulo do "tipo de frasco", replicando a MESMA lógica nativa do T20 pro
 * "brew" de poções (tormenta20.mjs, Item#roll): tem área → Granada; alvo
 * objeto → Óleo; senão → Poção. Usado no NOME pra bater com a convenção já
 * usada na tabela de tesouro (`treasure-data.ts`: "Bola de Fogo (granada)",
 * "Arma Mágica (óleo)").
 */
function potionKindLabel(spell) {
    if (spell.area) return "Granada";
    if (/objeto/i.test(spell.alvo || "")) return "Óleo";
    return "Poção";
}

function escHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function realDescriptionHtml({ spellName, custoPM, aprimoramentoName, kind }) {
    const aprim = aprimoramentoName
        ? `<p>Aprimoramento fixado na fabricação: <em>${escHtml(aprimoramentoName)}</em>.</p>`
        : (kind === "pergaminho" ? `<p>Aprimoramentos podem ser escolhidos ao ativar (custam PM extra de quem ativa).</p>` : "");
    return `<p>Contém a magia <strong>${escHtml(spellName)}</strong> (custo ${custoPM} PM). Ao usar, a magia é conjurada automaticamente.</p>${aprim}`;
}

// ── construção dos documentos ───────────────────────────────────────────────

function baseItemDoc({ name, img, tipo, price, description, flagData }) {
    const id = randomId();
    return {
        doc: {
            name,
            type: "consumivel",
            img,
            system: {
                description: { value: description, unidentified: "" },
                source: "",
                carregado: true,
                peso: 0.5,
                espacos: 0.5,
                qtd: 1,
                preco: price,
                pv: { value: 0, max: 0 },
                rd: 0,
                ativacao: { execucao: "action", custo: 0, qtd: "", condicao: "", special: "" },
                duracao: { value: 0, units: "inst", special: "" },
                range: { value: null, units: "" },
                consume: { type: "", target: "", amount: null, mpMultiplier: false },
                efeito: "",
                alcance: "touch",
                alvo: "",
                area: "",
                resistencia: { pericia: "", atributo: "", bonus: 0, txt: "" },
                rolls: [],
                tipo,
                chatFlavor: "",
                origin: "",
                tags: [],
                chatGif: "",
                upgrades: {
                    melhoria1: "", melhoria2: "", melhoria3: "", melhoria4: "",
                    material: "", encanto1: "", encanto2: "", encanto3: "",
                },
                subtipo: "",
                rolltags: [],
                automationtags: [],
                enableAutoUpgrades: true,
            },
            effects: [],
            folder: null,
            sort: 0,
            ownership: { default: 0 },
            flags: { [MODULE_ID]: { pocaoPergaminho: flagData } },
            _stats: {
                compendiumSource: null, duplicateSource: null, exportSource: null,
                coreVersion: "13.351", systemId: "tormenta20", systemVersion: "1.5.015",
                createdTime: Date.now(), modifiedTime: Date.now(), lastModifiedBy: null,
            },
            _id: id,
            _key: `!items!${id}`,
        },
        id,
    };
}

function buildPergaminho(spell) {
    const price = craftPrice(spell.custo);
    const name = `Pergaminho de ${spell.name}`;
    const flagData = {
        kind: "pergaminho",
        spellUuid: spell.uuid,
        spellName: spell.name,
        custoPM: spell.custo,
        aprimoramentoName: null,
        identificado: false,
    };
    return baseItemDoc({
        name, img: PERGAMINHO_IMG, tipo: "scroll", price,
        description: realDescriptionHtml({ spellName: spell.name, custoPM: spell.custo, aprimoramentoName: null, kind: "pergaminho" }),
        flagData,
    });
}

function buildPocaoBase(spell) {
    const price = craftPrice(spell.custo);
    const name = `${potionKindLabel(spell)} de ${spell.name}`;
    const flagData = {
        kind: "pocao",
        spellUuid: spell.uuid,
        spellName: spell.name,
        custoPM: spell.custo,
        aprimoramentoName: null,
        identificado: false,
    };
    return baseItemDoc({
        name, img: POCAO_IMG, tipo: "potion", price,
        description: realDescriptionHtml({ spellName: spell.name, custoPM: spell.custo, aprimoramentoName: null, kind: "pocao" }),
        flagData,
    });
}

function buildPocaoAprimorada(spell, aprimoramento, index) {
    const custoEfetivo = spell.custo + (aprimoramento.custo || 0);
    const price = craftPrice(custoEfetivo);
    const label = `Aprimorada ${index + 1}`;
    const name = `${potionKindLabel(spell)} de ${spell.name} (${label})`;
    const flagData = {
        kind: "pocao",
        spellUuid: spell.uuid,
        spellName: spell.name,
        custoPM: custoEfetivo,
        aprimoramentoName: aprimoramento.name,
        identificado: false,
    };
    return baseItemDoc({
        name, img: POCAO_IMG, tipo: "potion", price,
        description: realDescriptionHtml({ spellName: spell.name, custoPM: custoEfetivo, aprimoramentoName: aprimoramento.name, kind: "pocao" }),
        flagData,
    });
}

function folderDoc(name, sort) {
    const id = randomId();
    return {
        _id: id, name, type: "Item", folder: null, sorting: "a", sort, color: null, flags: {},
        _key: `!folders!${id}`,
    };
}

// ── main ──────────────────────────────────────────────────────────────────

function main() {
    if (!existsSync(HARVEST_PATH)) {
        console.error(`Harvest não encontrado em ${HARVEST_PATH}. Rode o script de harvest ao vivo primeiro.`);
        process.exit(1);
    }
    const spells = JSON.parse(readFileSync(HARVEST_PATH, "utf-8"));

    // dedup por nome normalizado — prefere o pack canônico do sistema.
    const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const byName = new Map();
    for (const e of spells) {
        const key = norm(e.name);
        const cur = byName.get(key);
        if (!cur) { byName.set(key, e); continue; }
        if (cur.pack !== "tormenta20.magias" && e.pack === "tormenta20.magias") byName.set(key, e);
    }
    const unique = [...byName.values()].filter((e) => ["arc", "div", "uni"].includes(e.tipo));

    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });

    const fPergaminhos = folderDoc("Pergaminhos", 0);
    const fPocoes = folderDoc("Poções", 100000);
    writeFileSync(join(OUT_DIR, `_folder-pergaminhos-${fPergaminhos._id.slice(0, 6)}.json`), JSON.stringify(fPergaminhos, null, 1));
    writeFileSync(join(OUT_DIR, `_folder-pocoes-${fPocoes._id.slice(0, 6)}.json`), JSON.stringify(fPocoes, null, 1));

    let nPergaminhos = 0;
    let nPocoesBase = 0;
    let nPocoesAprim = 0;

    for (const spell of unique) {
        const { doc: pDoc, id: pId } = buildPergaminho(spell);
        pDoc.folder = fPergaminhos._id;
        writeFileSync(join(OUT_DIR, `pergaminho-${slugify(spell.name)}-${pId.slice(0, 6)}.json`), JSON.stringify(pDoc, null, 1));
        nPergaminhos++;

        if (!isEligibleForPotion(spell.alcance, spell.area)) continue;

        const { doc: bDoc, id: bId } = buildPocaoBase(spell);
        bDoc.folder = fPocoes._id;
        writeFileSync(join(OUT_DIR, `pocao-${slugify(spell.name)}-${bId.slice(0, 6)}.json`), JSON.stringify(bDoc, null, 1));
        nPocoesBase++;

        spell.aprimoramentos.forEach((aprim, i) => {
            const { doc: aDoc, id: aId } = buildPocaoAprimorada(spell, aprim, i);
            aDoc.folder = fPocoes._id;
            writeFileSync(join(OUT_DIR, `pocao-${slugify(spell.name)}-aprim${i + 1}-${aId.slice(0, 6)}.json`), JSON.stringify(aDoc, null, 1));
            nPocoesAprim++;
        });
    }

    console.log(`Magias no harvest: ${spells.length} (${unique.length} únicas arc/div/uni após dedup)`);
    console.log(`Pergaminhos gerados: ${nPergaminhos}`);
    console.log(`Poções base geradas: ${nPocoesBase}`);
    console.log(`Poções com aprimoramento geradas: ${nPocoesAprim}`);
    console.log(`Total de itens: ${nPergaminhos + nPocoesBase + nPocoesAprim}`);
    console.log(`Arquivos escritos em ${OUT_DIR} (${readdirSync(OUT_DIR).length} arquivos, incl. 2 pastas)`);
}

main();
