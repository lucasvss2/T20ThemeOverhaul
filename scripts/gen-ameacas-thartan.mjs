/**
 * Gera as ameaças criadas via skill /criar-ameaca (Thartan/Deserto/Avulsos/Ahlen)
 * + a pasta nova "Guilda de Ladrões de Thartan" em packs-src/ameacas/.
 *
 * NÃO editar os .json de saída à mão — ajustar este gerador e rodar de novo:
 *   node scripts/gen-ameacas-thartan.mjs && npm run build:packs
 *
 * Imagens: os campos `img`/`texture.src` apontam pra `public/assets/<pasta>/<Nome>.png`
 * (empacotadas no módulo, module-relative, URL-encoded — regra do projeto desde
 * v1.65.2). Ao adicionar uma ameaça nova, colocar o arquivo em `public/assets/`
 * ANTES do `npm run build` (Vite copia `public/` → `dist/assets`); sem o arquivo
 * o Foundry mostra ícone quebrado até chegar.
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("packs-src/ameacas");
mkdirSync(OUT_DIR, { recursive: true });

// Magias REAIS colhidas ao vivo do compêndio tormenta20.magias (Item#toObject,
// ver scripts/data/ameacas-spells.json) — embutidas por inteiro (mesma
// convenção das ameaças oficiais tipo "Sílfide Feiticeira": item `magia` REAL
// duplicado, com custo/circulo/resistência/rolls originais intactos), só com
// _id/_key regerados por ator. NÃO editar à mão — recolher de novo ao vivo se
// precisar (ver CLAUDE.md → seção desta feature).
const SPELL_DATA = JSON.parse(readFileSync(resolve("scripts/data/ameacas-spells.json"), "utf8"));

// ── RNG determinístico simples pra ids estáveis entre re-runs ──────────────────
let seed = 42;
function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
}
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function makeId(len = 16) {
    let s = "";
    for (let i = 0; i < len; i++) s += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
    return s;
}
function slug(name) {
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
function encodeAssetPath(rel) {
    return rel.split("/").map(encodeURIComponent).join("/");
}
function imgFor(rel) {
    return `modules/t20-theme-overhaul/assets/${encodeAssetPath(rel)}`;
}
// Fixo (não Date.now()) — re-rodar o gerador não deve gerar diff de timestamp
// em ameaças que não mudaram de conteúdo.
const now = 1789162447241;
function stats(extra = {}) {
    return {
        compendiumSource: null, duplicateSource: null, exportSource: null,
        coreVersion: "13.351", systemId: "tormenta20", systemVersion: "1.5.015",
        modifiedTime: now, lastModifiedBy: null,
        ...extra,
    };
}

// ── Perícias: skeleton completo (30 chaves), default T20 ───────────────────────
const PERICIA_ATTR = {
    acro: "des", ades: "car", atle: "for", atua: "car", cava: "des", conh: "int",
    cura: "sab", dipl: "car", enga: "car", fort: "con", furt: "des", guer: "int",
    inic: "des", inti: "car", intu: "sab", inve: "int", joga: "car", ladi: "des",
    luta: "for", mist: "int", nobr: "int", ofi0: "int", perc: "sab", pilo: "des",
    pont: "des", refl: "des", reli: "sab", sobr: "sab", vont: "sab", _pc0: "int",
};
function buildPericias(overrides = {}) {
    const out = {};
    for (const [key, atributo] of Object.entries(PERICIA_ATTR)) {
        out[key] = {
            outros: 0, treinado: false, atributo, st: false, pda: false, size: false,
            value: 0, condi: 0, bonus: [], custom: false, label: "",
        };
    }
    for (const [key, v] of Object.entries(overrides)) {
        out[key] = { ...out[key], ...v };
    }
    return out;
}

// ── Atributos (Passo 6 — cosmético) ─────────────────────────────────────────────
function buildAtributos({ for: f = 0, des = 0, con = 0, int: i = 0, sab = 0, car = 0 }) {
    const mk = (v) => ({ value: v, base: v, racial: 0, bonus: 0 });
    return { for: mk(f), des: mk(des), con: mk(con), int: mk(i), sab: mk(sab), car: mk(car) };
}

// ── Traços (resistências a dano, tamanho, sentidos) ─────────────────────────────
const DANO_KEYS = ["dano", "perda", "acido", "corte", "eletricidade", "essencia", "fogo",
    "frio", "impacto", "luz", "psiquico", "perfuracao", "trevas"];
function buildResistenciasDano(overrides = {}) {
    const out = {};
    for (const k of DANO_KEYS) {
        out[k] = { value: 0, base: 0, bonus: [], excecao: 0, imunidade: false, vulnerabilidade: false, danoPorDado: false };
    }
    for (const [k, v] of Object.entries(overrides)) out[k] = { ...out[k], ...v };
    return out;
}
function buildTracos({ tamanho = "med", resistenciasDano = {} }) {
    return {
        tamanho,
        resistencias: buildResistenciasDano(resistenciasDano),
        ic: { value: [] },
        idiomas: { value: [] },
        profArmaduras: { value: [] },
        profArmas: { value: [] },
    };
}

function buildModificadores() {
    return {
        custoPM: 0,
        atributos: { for: [], des: [], con: [], int: [], sab: [], car: [], fisicos: [], mentais: [], geral: [] },
        ataque: { geral: [], cac: [], ad: [] },
        cura: { geral: [], mag: [] },
        dano: { ad: [], alq: [], cac: [], geral: [], mag: [] },
        pericias: { geral: [], resistencia: [], semataque: [], ataque: [], atr: { for: [], des: [], con: [], int: [], sab: [], car: [] } },
    };
}
function buildResources() {
    return {
        primary: { value: 0, max: 0, label: "Recurso 1" },
        secondary: { value: 0, max: 0, label: "Recurso 2" },
        tertiary: { value: 0, max: 0, label: "Recurso 3" },
        deathsave: { value: 0, max: 3, label: "Falha na Morte" },
        shadow: { value: 0, max: 5, label: "Pontos de Sombra" },
        catarse: { value: 0, max: 3, label: "Catarse" },
    };
}

function buildPrototypeToken(name, img, disposition) {
    return {
        name, actorLink: false, disposition,
        texture: {
            src: img, anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, fit: "contain",
            scaleX: 1, scaleY: 1, rotation: 0, tint: "#ffffff", alphaThreshold: 0.75,
        },
        sight: { enabled: true, range: 0, angle: 360, visionMode: "basic", color: null, attenuation: 0.1, brightness: 0, saturation: 0, contrast: 0 },
        displayName: 0, width: 1, height: 1, lockRotation: false, rotation: 0, alpha: 1, displayBars: 0,
        bar1: { attribute: "attributes.pv" }, bar2: { attribute: "attributes.pm" },
        light: {
            negative: false, priority: 0, alpha: 0.5, angle: 360, bright: 0, color: null, coloration: 1,
            dim: 0, attenuation: 0.5, luminosity: 0.5, saturation: 0, contrast: 0, shadows: 0,
            animation: { type: null, speed: 5, intensity: 5, reverse: false }, darkness: { min: 0, max: 1 },
        },
        detectionModes: [], occludable: { radius: 0 },
        ring: { enabled: false, colors: { ring: null, background: null }, effects: 1, subject: { scale: 1, texture: null } },
        turnMarker: { mode: 1, animation: null, src: null, disposition: false },
        movementAction: null, flags: {}, randomImg: false, appendNumber: false, prependAdjective: false,
    };
}

// ── Item: arma (ataque com bônus/dano LITERAIS, sem depender de perícia) ───────
function weaponItem(actorId, { name, atk, dmgFormula, critM = 20, critX = 2, tipoDano = "", alcance = "melee", proposito = "melee", descricao = "" }) {
    const id = makeId();
    return {
        name, type: "arma", img: "icons/svg/sword.svg",
        system: {
            proposito, proficiencia: "simples", empunhadura: "uma", criticoM: critM, criticoX: critX,
            tipoUso: "sim", equipado: 1,
            description: { value: `<p>${descricao}</p>`, unidentified: "" },
            rolls: [
                { name: "Ataque", key: "ataque0", type: "ataque", parts: [["1d20", "", ""], [String(atk), "", ""], ["0", "", ""]], adaptavel: "", versatil: "" },
                { name: "Dano", key: "dano1", type: "dano", parts: [[dmgFormula, tipoDano, ""], ["", "", ""]], adaptavel: "", versatil: "" },
            ],
            equipado2: { type: "hand", slot: 0 }, carregado: true, espacos: 0, peso: 0, qtd: 1, preco: 0,
            pv: { value: 0, max: 0 }, rd: 0,
            ativacao: { custo: 0, condicao: "", execucao: "passive", qtd: "", special: "" },
            consume: { amount: 0, mpMultiplier: false, target: "", type: "" },
            alcance,
            upgrades: { melhoria1: "", melhoria2: "", melhoria3: "", melhoria4: "", material: "", encanto1: "", encanto2: "", encanto3: "" },
            enableAutoUpgrades: true, ataques: 1,
            propriedades: { ada: false, agi: false, alo: false, des: false, dup: false, ver: false, hib: false },
            size: "normal", source: "", origin: "", tags: [], rolltags: [], automationtags: [], chatFlavor: "", chatGif: "",
        },
        _id: id, effects: [], folder: null, sort: 0, ownership: { default: 0 }, flags: {},
        _stats: stats(), _key: `!actors.items!${actorId}.${id}`,
    };
}

// ── Item: poder (habilidade — passiva/ativada/reação) ───────────────────────────
// `pm` (custo em Pontos de Mana): quando > 0, grava em ativacao.custo (o T20
// debita automaticamente ao usar o poder, `automaticManaSpend` está LIGADO
// neste mundo) — substitui o antigo padrão "1×/cena" sem custo. Passivas
// (execucao:"passive") continuam sempre de graça, nunca recebem `pm`.
function powerItem(actorId, {
    name, execucao = "passive", alcance = "", area = "", duracaoUnits = "inst",
    resistPericia = "", resistTxt = "", dmgFormula = "", dmgTipo = "", descricao, pm = 0,
}) {
    const id = makeId();
    const rolls = dmgFormula
        ? [{ key: "dano0", name: "Dano", type: "dano", adaptavel: "", versatil: "", parts: [[dmgFormula, dmgTipo, ""]] }]
        : [];
    return {
        name, type: "poder", img: "systems/tormenta20/icons/svg/skills.svg",
        system: {
            ativacao: { execucao, custo: pm, condicao: "", qtd: "", special: "" },
            alcance, area, duracao: { units: duracaoUnits, value: 0, special: "" },
            resistencia: { pericia: resistPericia, atributo: "", bonus: 0, txt: resistTxt },
            rolls,
            description: { value: `<p>${descricao}</p>`, unidentified: "" },
            source: "", origin: "", tags: [], rolltags: [], automationtags: [], chatFlavor: "", chatGif: "",
            range: { units: "", value: 0 }, efeito: "", tipo: "geral", subtipo: "",
        },
        _id: id, effects: [], folder: null, sort: 0, ownership: { default: 0 }, flags: {},
        _stats: stats(), _key: `!actors.items!${actorId}.${id}`,
    };
}

// ── Item: magia REAL (duplicada do compêndio tormenta20.magias) ────────────────
// `key` = nome exato em SPELL_DATA. Preserva ativacao/circulo/resistencia/rolls
// originais (o débito de PM do cast usa esse custo, igual a qualquer magia real
// na ficha de um PJ) — só troca _id/_key/effects-ids pra não colidir entre atores.
function spellItem(actorId, key) {
    const src = SPELL_DATA[key];
    if (!src) throw new Error(`Magia "${key}" não encontrada em scripts/data/ameacas-spells.json`);
    const id = makeId();
    const effects = (src.effects ?? []).map((e) => {
        const effectId = makeId();
        return { ...e, _id: effectId, _key: `!actors.items.effects!${actorId}.${id}.${effectId}` };
    });
    return {
        ...src,
        _id: id,
        effects,
        folder: null, sort: 0, ownership: { default: 0 }, flags: {},
        _stats: stats(), _key: `!actors.items!${actorId}.${id}`,
    };
}

// ── Ator (ameaça / npc) ──────────────────────────────────────────────────────────
function buildActor(spec) {
    const actorId = makeId();
    const img = imgFor(spec.img);
    const pvMax = spec.pv;
    const desMod = spec.atributos.des ?? 0;
    const defOutros = spec.def - 10 - desMod;

    const items = (spec.items ?? []).map((it) => {
        if (it.kind === "weapon") return weaponItem(actorId, it);
        if (it.kind === "spell") return spellItem(actorId, it.key);
        return powerItem(actorId, it);
    });
    const pmMax = spec.pmMax ?? 0;

    return {
        name: spec.name, type: "npc", img,
        prototypeToken: buildPrototypeToken(spec.name, img, spec.disposition),
        system: {
            atributos: buildAtributos(spec.atributos),
            attributes: {
                cd: spec.cd, conjuracao: spec.conjuracao ?? "",
                pv: { value: pvMax, max: pvMax, min: -Math.floor(pvMax / 2), temp: 0 },
                pm: { value: pmMax, max: pmMax, min: 0, temp: 0 },
                defesa: { atributo: "des", pda: 0, outros: defOutros, condi: 0, bonus: [], value: 10, base: 10 },
                movement: {
                    walk: { base: spec.movement?.walk ?? 9, bonus: [] },
                    burrow: { base: 0, bonus: [] },
                    climb: { base: spec.movement?.climb ?? 0, bonus: [] },
                    fly: { base: spec.movement?.fly ?? 0, bonus: [] },
                    swim: { base: spec.movement?.swim ?? 0, bonus: [] },
                    unit: "m", hover: false, tags: [],
                },
                sentidos: { value: spec.sentidos ?? [], custom: "" },
                nd: String(spec.nd),
                carga: { value: 0, atributo: "for", base: 10, bonus: [], limit: 0, max: 0, pct: 0, encumbered: false },
                nivel: { value: 0, xp: { value: 0, pct: 0, proximo: 0 } },
                treino: 0,
            },
            pericias: buildPericias(spec.pericias ?? {}),
            detalhes: {
                role: spec.role, tipo: spec.tipo, raca: spec.raca,
                ataquescac: spec.ataquescac ?? "", ataquesad: spec.ataquesad ?? "",
                tesouro: spec.tesouro,
                biography: { value: `<p>${spec.bio}</p>`, public: "" },
                origem: "", divindade: "", equipamento: "", resistencias: "", movimento: "",
            },
            tracos: buildTracos({ tamanho: spec.tamanho, resistenciasDano: spec.resistenciasDano ?? {} }),
            dinheiro: { tc: 0, tl: 0, to: 0, tp: 0 },
            modificadores: buildModificadores(),
            resources: buildResources(),
        },
        items,
        _id: actorId, effects: [], folder: spec.folder, sort: spec.sort ?? 100000,
        ownership: { default: 0 }, flags: {},
        _stats: stats({ compendiumSource: null, duplicateSource: null, exportSource: null, createdTime: now }),
        _key: `!actors!${actorId}`,
    };
}

// ── Resistências Fort/Ref/Von: guarda os 3 valores da linha do ND na ficha ──────
// (RF/RM/RFr da tabela já viram os "outros" das 3 perícias de resistência —
// perícias fort/refl/vont usam esse valor direto, sem recomputar half-nd+treino,
// pois a linha do ND já É o valor final.)
function saves(fort, refl, vont) {
    return {
        fort: { outros: fort, treinado: false, atributo: "con", st: false, pda: false, size: false, value: 0, condi: 0, bonus: [], custom: false, label: "" },
        refl: { outros: refl, treinado: false, atributo: "des", st: false, pda: false, size: false, value: 0, condi: 0, bonus: [], custom: false, label: "" },
        vont: { outros: vont, treinado: false, atributo: "sab", st: false, pda: false, size: false, value: 0, condi: 0, bonus: [], custom: false, label: "" },
    };
}
function skill(outros, extra = {}) {
    return { outros, treinado: true, ...extra };
}

// Custo padrão (PM) de uma habilidade ativa não-mágica, escalado pelo ND —
// substitui o antigo "1×/cena" de graça. Passivas nunca usam isso (ficam 0).
function pmCostForNd(nd) {
    return Math.max(1, Math.round(nd / 2));
}
// Piso de PM pro ator MESMO sem magias reais — cobre as habilidades ativas
// acima (guideline da skill /criar-ameaca: "3 PM por ND" quando não usa a
// habilidade Magias formal).
function pmPoolForNd(nd) {
    return Math.max(6, nd * 3);
}

// ── Pastas ───────────────────────────────────────────────────────────────────────
const FOLDER_AHLEN = "FMIEwltYudrY66ci";
const FOLDER_CUSTOM_DESERTO = "pr9E79ep3uamweOv";
const FOLDER_CUSTOM_MADE = "X9TuFXCvny1ptG5G";
const FOLDER_THARTAN_ID = "Thart" + makeId(11);

const folderThartan = {
    _id: FOLDER_THARTAN_ID, name: "Guilda de Ladrões de Thartan", type: "Actor",
    folder: null, sorting: "a", sort: 0, color: "#6a1b1b", flags: {},
    _key: `!folders!${FOLDER_THARTAN_ID}`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 28 NPCs
// ═══════════════════════════════════════════════════════════════════════════════
const NPCS = [];

// ── 1. Sarim Punho-do-Sol — Místico Elemental, ND8, Especial ───────────────────
NPCS.push({
    name: "Sarim Punho-do-Sol", nd: 8, role: "special", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_CUSTOM_DESERTO, img: "Deserto da Perdição/Sarim, Punho Solar.png",
    disposition: 0, tesouro: "Metade", cd: 28, def: 31, movement: { walk: 9 },
    sentidos: ["Percepção 18"],
    bio: "Um místico do Deserto da Perdição que aprendeu a dobrar fogo e areia à própria vontade, moldando os elementos como extensões do próprio corpo. Sua estatura de 2,2m e a pele curtida pelo sol o tornam uma figura imponente mesmo antes de invocar suas chamas.<br><br><strong>Magias — Como um místico de 8º nível (CD 28):</strong> Controlar Fogo, Despedaçar, Perdição.",
    ataquescac: "", ataquesad: "Rajadas Elementais +24 (2x, 1d10+29 fogo ou terra, 20/×2, alcance médio)",
    atributos: { for: 3, des: 0, con: 4, int: 1, sab: 5, car: 2 }, conjuracao: "sab", pmMax: 18,
    pericias: {
        ...saves(15, 8, 21),
        mist: skill(19, { outros: 19 }), perc: skill(18, { outros: 18 }), sobr: skill(18, { outros: 18 }),
    },
    pv: 224,
    items: [
        { kind: "weapon", name: "Rajadas Elementais", atk: 24, dmgFormula: "1d10+29", critM: 20, critX: 2, tipoDano: "fogo", alcance: "medium", proposito: "disparo", descricao: "Duas rajadas de fogo ou areia densa, à escolha, disparadas das mãos abertas de Sarim." },
        { kind: "power", name: "Afinidade Elemental Dupla", execucao: "passive", descricao: "Sarim tem afinidade com Fogo e Terra: recebe <strong>Redução de Dano 5</strong> contra esses dois tipos e pode alternar livremente o tipo de dano de qualquer habilidade sua entre os dois, a cada uso." },
        { kind: "power", name: "Tempestade de Areia", execucao: "standard", pm: 4, alcance: "Médio (18m)", area: "Círculo 6m", resistPericia: "refl", resistTxt: "Reflexos CD 28 reduz à metade", dmgFormula: "4d6", dmgTipo: "impacto", descricao: "<strong>Padrão, 4 PM.</strong> Uma nuvem de areia cortante e escaldante explode num círculo de 6m. <strong>Reflexos CD 28</strong> reduz o dano à metade; quem falha fica <strong>Ofuscado</strong> até o fim do próximo turno. Habilidade mágica." },
        { kind: "power", name: "Corpo de Magma", execucao: "passive", descricao: "Sempre que é atingido por um ataque corpo a corpo, o atacante sofre <strong>1d6 pontos de dano de fogo</strong>." },
        { kind: "power", name: "Resistência do Deserto", execucao: "passive", descricao: "Sarim é imune a exaustão por calor ou sede, enxerga perfeitamente através de tempestades de areia e nunca se perde no deserto." },
        { kind: "spell", key: "Controlar Fogo" },
        { kind: "spell", key: "Despedaçar" },
        { kind: "spell", key: "Perdição" },
    ],
});

// ── 2. Comandante Herwin Aço-Puro — Comandante Purista, ND5, Solo ───────────────
NPCS.push({
    name: "Comandante Herwin Aço-Puro", nd: 5, role: "solo", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Comandante Herwin Aço-Puro.png",
    disposition: -1, tesouro: "Padrão", cd: 20, def: 24, movement: { walk: 9 },
    sentidos: ["Percepção 3"],
    bio: "Comandante de campo dos Puristas — fanáticos que veem toda magia e diversidade de Arton como corrupção a ser exterminada. Combate na linha de frente com a espada, mas carrega magias de guerra próprias, forjadas para punir conjuradores.<br><br><strong>Magias — Como um conjurador divino de 5º nível (CD 20):</strong> Arma Espiritual, Despedaçar, Infligir Ferimentos, Dissipar Magia.",
    ataquescac: "Golpe de Aço Purista +17 (2d10+29, 19-20/×2, corte)", ataquesad: "",
    atributos: { for: 4, des: 0, con: 3, int: 1, sab: 1, car: 3 }, conjuracao: "sab", pmMax: 15,
    pericias: {
        ...saves(17, 5, 11),
        inti: skill(12, { outros: 12 }), guer: skill(5, { outros: 5 }), mist: skill(10, { outros: 10 }),
    },
    pv: 200,
    items: [
        { kind: "weapon", name: "Golpe de Aço Purista", atk: 17, dmgFormula: "2d10+29", critM: 19, critX: 2, tipoDano: "corte", alcance: "melee", descricao: "Uma espada longa purista, forjada para golpear com força brutal e disciplinada." },
        { kind: "power", name: "Fúria Antimagia", execucao: "passive", descricao: "Herwin recebe <strong>+5</strong> em testes de resistência contra magias. Quando resiste a uma magia com sucesso, o conjurador responsável fica marcado — Herwin recebe <strong>+2</strong> no próximo ataque contra ele." },
        { kind: "power", name: "Comando Purista", execucao: "free", pm: 3, resistPericia: "", descricao: "<strong>Ação livre, 3 PM.</strong> Até 3 aliados próximos (9m) recebem <strong>+2</strong> em testes de ataque até o início do próximo turno de Herwin." },
        { kind: "power", name: "Armadura Purista", execucao: "passive", descricao: "A armadura purista de Herwin concede <strong>Redução de Dano 5</strong> contra dano físico." },
        { kind: "spell", key: "Arma Espiritual" },
        { kind: "spell", key: "Despedaçar" },
        { kind: "spell", key: "Infligir Ferimentos" },
        { kind: "spell", key: "Dissipar Magia" },
    ],
});

// ── 3. Jacelin — Recepcionista da Guilda de Aventureiros, ND2, Especial ─────────
NPCS.push({
    name: "Jacelin", nd: 2, role: "special", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_AHLEN, img: "Ahlen/Jacelin.png",
    disposition: 0, tesouro: "Metade", cd: 18, def: 17, movement: { walk: 9 },
    sentidos: ["Percepção 9"],
    bio: "Recepcionista da guilda de aventureiros na área nobre de Ahlen. Fachada impecável e sorriso pronto escondem alguém que nota cada mentira, cada movimento suspeito e cada oportunidade — furtiva, ardilosa e muito mais perigosa do que aparenta.",
    ataquescac: "Adaga Escondida +10 (1d4+16, 19-20/×2, perfuração)", ataquesad: "",
    atributos: { for: -1, des: 2, con: 0, int: 2, sab: 1, car: 3 }, pmMax: 6,
    pericias: {
        ...saves(2, 13, 7),
        furt: skill(10, { outros: 10 }), enga: skill(11, { outros: 11 }), intu: skill(9, { outros: 9 }), dipl: skill(6, { outros: 6 }),
    },
    pv: 49,
    items: [
        { kind: "weapon", name: "Adaga Escondida", atk: 10, dmgFormula: "1d4+16", critM: 19, critX: 2, tipoDano: "perfuração", alcance: "melee", descricao: "Uma pequena adaga escondida na manga, usada só em último caso." },
        { kind: "power", name: "Leitura Perfeita", execucao: "passive", descricao: "Jacelin nunca é surpreendida e sempre percebe uma mentira óbvia ou desajeitada." },
        { kind: "power", name: "Sumiço Discreto", execucao: "move", pm: 1, descricao: "<strong>Movimento, 1 PM.</strong> Jacelin desaparece entre a movimentação do saguão, tornando-se impossível de localizar por 1 rodada." },
        { kind: "power", name: "Fachada Impecável", execucao: "passive", descricao: "Enquanto mantém uma fachada ou disfarce, Jacelin recebe <strong>+5</strong> em Enganação." },
    ],
});

// ── 4. Kara Thur — Líder da Guilda de Ladrões de Thartan, ND12, Solo ────────────
NPCS.push({
    name: "Kara Thur", nd: 12, role: "solo", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Kara Thur.png",
    disposition: -1, tesouro: "Dobro", cd: 33, def: 43, movement: { walk: 12 },
    sentidos: ["Percepção 12"],
    bio: "Assassina implacável que subiu ao topo da Guilda de Ladrões de Thartan lâmina por lâmina. Governa a cidade baixa com uma rede de informantes tão afiada quanto suas adagas — ninguém trai Kara Thur duas vezes.",
    ataquescac: "Adagas Gêmeas +36 (2x, 1d10+67, 19-20/×3, perfuração)", ataquesad: "",
    atributos: { for: 0, des: 5, con: 1, int: 3, sab: 2, car: 4 }, pmMax: 36,
    pericias: {
        ...saves(12, 26, 20),
        furt: skill(25, { outros: 25 }), ladi: skill(20, { outros: 20 }), enga: skill(19, { outros: 19 }), perc: skill(12, { outros: 12 }), inti: skill(14, { outros: 14 }),
    },
    pv: 600,
    items: [
        { kind: "weapon", name: "Adagas Gêmeas", atk: 36, dmgFormula: "1d10+67", critM: 19, critX: 3, tipoDano: "perfuração", alcance: "melee", descricao: "Um par de adagas curvas banhadas em veneno paralisante, manejadas com precisão letal." },
        { kind: "power", name: "Ataque Furtivo", execucao: "passive", dmgFormula: "4d6", dmgTipo: "perfuração", descricao: "Quando ataca um alvo Desprevenido ou flanqueado, Kara Thur causa <strong>+4d6</strong> de dano extra." },
        { kind: "power", name: "Veneno Paralisante", execucao: "passive", resistPericia: "fort", resistTxt: "Fortitude CD 33 ou Paralisado por 1 rodada", descricao: "Uma criatura atingida pelas adagas de Kara Thur faz <strong>Fortitude CD 33</strong> ou fica <strong>Paralisada</strong> por 1 rodada, 1×/cena por alvo." },
        { kind: "power", name: "Sombra Perfeita", execucao: "passive", descricao: "Kara Thur recebe <strong>+10</strong> em Furtividade e nunca deixa rastros de sua passagem." },
        { kind: "power", name: "Golpe Fatal", execucao: "free", pm: 6, descricao: "<strong>Ação livre, 6 PM.</strong> O próximo ataque de Kara Thur que acertar é automaticamente um crítico." },
        { kind: "power", name: "Rede de Informantes", execucao: "passive", descricao: "Kara Thur sempre sabe o que se passa nas ruas de Thartan sob seu domínio — raramente é pega de surpresa por eventos da cidade." },
    ],
});

// ── 5. Astralos — Mago poderoso, ND15, Especial ─────────────────────────────────
NPCS.push({
    name: "Astralos", nd: 15, role: "special", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Astralos.png",
    disposition: 0, tesouro: "Dobro", cd: 42, def: 48, movement: { walk: 9 },
    sentidos: ["Percepção 17"],
    bio: "Um arquimago cuja compreensão dos arcanos ultrapassa a de qualquer academia viva. Estuda os mistérios de Arton há décadas e raramente se envolve em conflitos — quando o faz, poucos sobrevivem para contar.<br><br><strong>Magias — Como um arcanista de 15º nível (CD 42):</strong> Explosão de Chamas, Bola de Fogo, Toque Vampírico, Dissipar Magia, Explosão Caleidoscópica.",
    ataquescac: "", ataquesad: "Rajadas Arcanas Gêmeas +41 (2x, 2d8+84, 20/×2, alcance longo)",
    atributos: { for: -2, des: 1, con: 2, int: 8, sab: 4, car: 3 }, conjuracao: "int", pmMax: 40,
    pericias: {
        ...saves(15, 28, 22),
        mist: skill(31, { outros: 31 }), conh: skill(31, { outros: 31 }), perc: skill(17, { outros: 17 }), dipl: skill(16, { outros: 16 }),
    },
    pv: 525,
    items: [
        { kind: "weapon", name: "Rajadas Arcanas Gêmeas", atk: 41, dmgFormula: "2d8+84", critM: 20, critX: 2, tipoDano: "arcano", alcance: "far", proposito: "disparo", descricao: "Dois mísseis de energia arcana pura, lançados de suas mãos erguidas." },
        { kind: "power", name: "Arquimestre dos Arcanos", execucao: "passive", descricao: "Astralos é imune a Contramágica de conjuradores inferiores a Superior e recebe <strong>+10</strong> em Misticismo." },
        { kind: "power", name: "Explosão Cataclísmica", execucao: "standard", pm: 12, alcance: "Longo (54m)", area: "Círculo 12m", resistPericia: "refl", resistTxt: "Reflexos CD 42 reduz à metade", dmgFormula: "10d10", dmgTipo: "arcano", descricao: "<strong>Padrão, 12 PM.</strong> Uma explosão devastadora de energia arcana pura. <strong>Reflexos CD 42</strong> reduz o dano à metade. Habilidade mágica." },
        { kind: "power", name: "Escudo Arcano", execucao: "reaction", pm: 5, descricao: "<strong>Reação, 5 PM.</strong> Quando é atingido por um ataque, Astralos reduz o dano recebido à metade." },
        { kind: "power", name: "Teleporte Instantâneo", execucao: "move", pm: 4, descricao: "<strong>Movimento, 4 PM.</strong> Astralos se teleporta até 18m, ignorando obstáculos e terreno difícil. Habilidade mágica." },
        { kind: "power", name: "Domínio da CD", execucao: "passive", descricao: "Uma criatura que falhe um teste de resistência contra uma magia de Astralos por 5 ou mais fica <strong>Pasma</strong> até o início do próximo turno dela." },
        { kind: "spell", key: "Explosão de Chamas" },
        { kind: "spell", key: "Bola de Fogo" },
        { kind: "spell", key: "Toque Vampírico" },
        { kind: "spell", key: "Dissipar Magia" },
        { kind: "spell", key: "Explosão Caleidoscópica" },
    ],
});

// ── 6. Elfarion — Arqueiro arcano, ND10, Solo ───────────────────────────────────
NPCS.push({
    name: "Elfarion", nd: 10, role: "solo", tipo: "hum", raca: "Elfo",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Elfarion.png",
    disposition: 0, tesouro: "Padrão", cd: 30, def: 36, movement: { walk: 12 },
    sentidos: ["Percepção 22", "Visão no escuro"],
    bio: "Um arqueiro élfico que fundiu séculos de treino marcial com estudo arcano — cada flecha que dispara carrega um fragmento de magia, guiada com precisão sobre-humana.<br><br><strong>Magias — Como um caçador arcano de 10º nível (CD 30):</strong> Explosão de Chamas, Bola de Fogo, Sussurros Insanos.",
    ataquescac: "", ataquesad: "Flechas Arcanas Gêmeas +29 (2x, 1d10+35, 19-20/×3, perfuração)",
    atributos: { for: 0, des: 6, con: 1, int: 2, sab: 3, car: 1 }, conjuracao: "int", pmMax: 14,
    pericias: {
        ...saves(10, 22, 16),
        pont: skill(20, { outros: 20 }), perc: skill(22, { outros: 22 }), furt: skill(20, { outros: 20 }), mist: skill(11, { outros: 11 }),
    },
    pv: 400,
    items: [
        { kind: "weapon", name: "Flechas Arcanas Gêmeas", atk: 29, dmgFormula: "1d10+35", critM: 19, critX: 3, tipoDano: "perfuração", alcance: "far", proposito: "disparo", descricao: "Um arco élfico entalhado com runas — cada flecha disparada arde com uma trilha de energia arcana." },
        { kind: "power", name: "Tiro Certeiro Mágico", execucao: "passive", descricao: "As flechas de Elfarion ignoram metade de qualquer cobertura ou Redução de Dano do alvo." },
        { kind: "power", name: "Flecha Explosiva", execucao: "standard", pm: 5, alcance: "Longo (54m)", area: "Círculo 3m", resistPericia: "refl", resistTxt: "Reflexos CD 30 reduz à metade", dmgFormula: "6d6", dmgTipo: "arcano", descricao: "<strong>Padrão, 5 PM.</strong> Uma flecha explode numa pequena área ao atingir o alvo. <strong>Reflexos CD 30</strong> reduz o dano à metade. Habilidade mágica." },
        { kind: "power", name: "Passos Élficos", execucao: "passive", descricao: "Elfarion recebe <strong>+5</strong> em Furtividade e Acrobacia em terrenos naturais, e seu deslocamento nunca é reduzido por vegetação." },
        { kind: "power", name: "Visão de Águia", execucao: "passive", descricao: "Elfarion recebe <strong>+10</strong> em Percepção à distância e nunca sofre penalidade por vento ou longo alcance." },
        { kind: "spell", key: "Explosão de Chamas" },
        { kind: "spell", key: "Bola de Fogo" },
        { kind: "spell", key: "Sussurros Insanos" },
    ],
});

// ── 7. Trabalhadores da guilda — ND6, Lacaio ─────────────────────────────────────
NPCS.push({
    name: "Azathot", nd: 6, role: "lacaio", tipo: "hum", raca: "Sulfure",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Azathot.png",
    disposition: 0, tesouro: "Padrão", cd: 22, def: 26, movement: { walk: 9 },
    sentidos: ["Percepção 3"],
    bio: "Ferreiro sulfure da Guilda de Ladrões de Thartan — forja armas e prende favores na mesma bigorna incandescente. O calor da forja nunca o incomoda; corre em suas veias.",
    ataquescac: "Martelo de Forja Flamejante +24 (1d12+56, ×3, impacto)", ataquesad: "",
    atributos: { for: 4, des: 0, con: 3, int: 0, sab: 1, car: -1 }, pmMax: 18,
    pericias: { ...saves(17, 12, 7), ofi0: skill(10, { outros: 10, label: "Ofício (Ferreiro)" }), atle: skill(9, { outros: 9 }) },
    pv: 48,
    items: [
        { kind: "weapon", name: "Martelo de Forja Flamejante", atk: 24, dmgFormula: "1d12+56", critM: 20, critX: 3, tipoDano: "impacto", alcance: "melee", descricao: "Um martelo de ferreiro pesado, a cabeça ainda incandescente da forja." },
        { kind: "power", name: "Sangue de Sulfure", execucao: "passive", descricao: "Azathot é imune a fogo e resistente a calor extremo." },
        { kind: "power", name: "Golpe Incandescente", execucao: "passive", descricao: "Em acertos críticos, o martelo de Azathot causa <strong>+2d6</strong> de dano de fogo extra." },
    ],
});
NPCS.push({
    name: "Megarah Al'Jaffar", nd: 6, role: "lacaio", tipo: "hum", raca: "Meio-Elfa",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Megarah Al'Jaffar.png",
    disposition: 0, tesouro: "Padrão", cd: 22, def: 26, movement: { walk: 9 },
    sentidos: ["Percepção 3", "Visão no escuro"],
    bio: "Artífice meio-elfa da guilda, responsável pelas engenhocas, fechaduras e armadilhas que protegem (e assaltam) meio Thartan.",
    ataquescac: "", ataquesad: "Lança-Engenhoca de Precisão +24 (1d8+58, 20/×2, perfuração)",
    atributos: { for: -1, des: 3, con: 0, int: 5, sab: 1, car: 1 }, pmMax: 18,
    pericias: { ...saves(7, 17, 12), ofi0: skill(15, { outros: 15, label: "Ofício (Engenheira)" }), inve: skill(10, { outros: 10 }) },
    pv: 48,
    items: [
        { kind: "weapon", name: "Lança-Engenhoca de Precisão", atk: 24, dmgFormula: "1d8+58", critM: 20, critX: 2, tipoDano: "perfuração", alcance: "far", proposito: "disparo", descricao: "Um lança-dardos mecânico de própria autoria, carregado com uma carga elétrica residual." },
        { kind: "power", name: "Engenhoca de Emergência", execucao: "standard", pm: 3, descricao: "<strong>Padrão, 3 PM.</strong> Megarah arremessa um dispositivo que concede <strong>+5</strong> na Defesa de um aliado até o início do próximo turno dele." },
        { kind: "power", name: "Reflexos Mecânicos", execucao: "passive", descricao: "Megarah recebe <strong>+5</strong> em Reflexos contra armadilhas e explosões." },
    ],
});
NPCS.push({
    name: "Alef, o Canhoto", nd: 6, role: "lacaio", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Alef, O Canhoto.png",
    disposition: 0, tesouro: "Padrão", cd: 22, def: 26, movement: { walk: 9 },
    sentidos: ["Percepção 3"],
    bio: "Conjurador sonso da guilda, canhoto por natureza e por magia — sua mão esquerda nunca joga limpo, seja nas cartas ou no combate.<br><br><strong>Magias — Como um bardo de 6º nível (CD 22):</strong> Enfeitiçar, Disfarce Ilusório, Sussurros Insanos.",
    ataquescac: "", ataquesad: "Rajada Sonsa +24 (1d6+59, 20/×2, arcano)",
    atributos: { for: -1, des: 2, con: 0, int: 2, sab: 1, car: 4 }, conjuracao: "car", pmMax: 16,
    pericias: { ...saves(7, 12, 17), enga: skill(14, { outros: 14 }), joga: skill(14, { outros: 14 }), mist: skill(7, { outros: 7 }) },
    pv: 48,
    items: [
        { kind: "weapon", name: "Rajada Sonsa", atk: 24, dmgFormula: "1d6+59", critM: 20, critX: 2, tipoDano: "arcano", alcance: "medium", proposito: "disparo", descricao: "Uma rajada de energia arcana disparada da mão esquerda de Alef, sempre com um sorriso." },
        { kind: "power", name: "Truque de Cartas", execucao: "standard", pm: 3, resistPericia: "vont", resistTxt: "Vontade CD 22 nega", descricao: "<strong>Padrão, 3 PM.</strong> Um alvo em alcance curto fica <strong>Desprevenido</strong> por 1 rodada. <strong>Vontade CD 22</strong> nega. Habilidade mágica." },
        { kind: "power", name: "Sortudo", execucao: "passive", descricao: "Alef pode rerolar um teste de resistência próprio, 1×/cena." },
        { kind: "spell", key: "Enfeitiçar" },
        { kind: "spell", key: "Disfarce Ilusório" },
        { kind: "spell", key: "Sussurros Insanos" },
    ],
});

// ── 8. Atendentes e garçonetes — ND1, Lacaio ─────────────────────────────────────
function staff8(name, raca, ability, atributos, periciaOverrides, img) {
    NPCS.push({
        name, nd: 1, role: "lacaio", tipo: "hum", raca,
        tamanho: "med", folder: FOLDER_THARTAN_ID, img: `Thartan/${img ?? name}.png`,
        disposition: 0, tesouro: "Nenhum", cd: 14, def: 15, movement: { walk: 9 },
        sentidos: [], bio: `Funcionária(o) de atendimento da Guilda de Ladrões de Thartan.`,
        ataquescac: "Ataque Improvisado +11 (1d4+15, ×2, impacto)", ataquesad: "",
        atributos: { ...atributos }, pmMax: 6, pericias: { ...saves(1, 10, 5), ...periciaOverrides }, pv: 9,
        items: [
            { kind: "weapon", name: "Ataque Improvisado", atk: 11, dmgFormula: "1d4+15", critM: 20, critX: 2, tipoDano: "impacto", alcance: "melee", descricao: "Uma bandeja, uma faca de cozinha ou o que estiver à mão." },
            ability,
        ],
    });
}
staff8("Milla", "Humana",
    { kind: "power", name: "Atenciosa", execucao: "passive", descricao: "Milla sempre sabe onde cada membro da guilda está no momento." },
    { for: -1, des: 0, con: 0, int: 0, sab: 1, car: 2 }, { dipl: skill(4, { outros: 4 }) });
staff8("Alphonse", "Humano",
    { kind: "power", name: "Registro Perfeito", execucao: "passive", descricao: "Alphonse tem memória fotográfica para números e contas." },
    { for: -1, des: -1, con: 0, int: 2, sab: 1, car: 0 }, { inve: skill(4, { outros: 4 }) });
staff8("Liana", "Humana",
    { kind: "power", name: "Toque Revigorante", execucao: "standard", pm: 1, descricao: "<strong>Padrão, 1 PM.</strong> Uma bebida especial preparada por Liana cura <strong>1d6</strong> pontos de vida de quem a bebe." },
    { for: -1, des: 1, con: 0, int: 0, sab: 1, car: 2 }, { cura: skill(3, { outros: 3 }) });
staff8("Falira", "Humana",
    { kind: "power", name: "Ágil entre Mesas", execucao: "passive", descricao: "Falira nunca provoca ataques de oportunidade ao se mover entre criaturas." },
    { for: -1, des: 2, con: 0, int: 0, sab: 0, car: 1 }, { acro: skill(2, { outros: 2 }) });
staff8("Aika", "Humana",
    { kind: "power", name: "Leitura de Sala", execucao: "passive", descricao: "Aika recebe <strong>+5</strong> em Percepção para notar brigas antes que comecem." },
    { for: -1, des: 1, con: 0, int: 0, sab: 2, car: 0 }, { perc: skill(7, { outros: 7 }) });
staff8("Valk", "Humana",
    { kind: "power", name: "Força de Carga", execucao: "passive", descricao: "Valk recebe <strong>+5</strong> em Atletismo e carrega o dobro do normal sem penalidade." },
    { for: 2, des: -1, con: 1, int: -1, sab: 0, car: 1 }, { atle: skill(7, { outros: 7 }) });
staff8("Albur", "Elfa",
    { kind: "power", name: "Graça Élfica", execucao: "passive", descricao: "Albur recebe <strong>+5</strong> em Acrobacia e nunca deixa cair o que carrega." },
    { for: -1, des: 2, con: -1, int: 0, sab: 0, car: 1 }, { acro: skill(7, { outros: 7 }) });

// ── 9. Bandidos da guilda — NDs variados, Lacaio ────────────────────────────────
NPCS.push({
    name: "Dhoreon", nd: 6, role: "lacaio", tipo: "hum", raca: "Anão",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Dhoreon.png",
    disposition: -1, tesouro: "Padrão", cd: 22, def: 26, movement: { walk: 6 },
    sentidos: ["Percepção 3", "Visão no escuro"],
    bio: "Bandido anão da guilda, manco desde um acidente nas minas — mas ninguém que já viu o machado dele em ação zomba da perna.",
    ataquescac: "Machado de Batalha +24 (1d12+56, ×3, corte)", ataquesad: "",
    atributos: { for: 3, des: -1, con: 3, int: 0, sab: 0, car: -1 }, pmMax: 18,
    pericias: { ...saves(17, 7, 12), atle: skill(8, { outros: 8 }) }, pv: 48,
    items: [
        { kind: "weapon", name: "Machado de Batalha", atk: 24, dmgFormula: "1d12+56", critM: 20, critX: 3, tipoDano: "corte", alcance: "melee", descricao: "Um machado de batalha anão pesado, cabo reforçado." },
        { kind: "power", name: "Resistência Anã", execucao: "passive", descricao: "Dhoreon recebe <strong>+5</strong> em Fortitude contra veneno e doença." },
        { kind: "power", name: "Teimosia", execucao: "passive", descricao: "Dhoreon não pode ser derrubado ou empurrado contra sua vontade sem que o responsável gaste o dobro de esforço." },
    ],
});
NPCS.push({
    name: "Arabella", nd: 5, role: "lacaio", tipo: "hum", raca: "Hinne",
    tamanho: "peq", folder: FOLDER_THARTAN_ID, img: "Thartan/Arabella.png",
    disposition: -1, tesouro: "Padrão", cd: 20, def: 23, movement: { walk: 6 },
    sentidos: ["Percepção 3"],
    bio: "Bandida hinne, pequena, ágil e ignorada até ser tarde demais — a especialidade dela é chegar perto o suficiente pra usar as duas facas de uma vez.",
    ataquescac: "Facas Gêmeas +20 (2x, 1d6+25, 19-20/×2, perfuração)", ataquesad: "",
    atributos: { for: -2, des: 4, con: 0, int: 1, sab: 1, car: 2 }, pmMax: 15,
    pericias: { ...saves(6, 16, 11), furt: skill(13, { outros: 13 }), ladi: skill(8, { outros: 8 }) }, pv: 40,
    items: [
        { kind: "weapon", name: "Facas Gêmeas", atk: 20, dmgFormula: "1d6+25", critM: 19, critX: 2, tipoDano: "perfuração", alcance: "melee", descricao: "Duas facas curtas, fáceis de esconder nas mangas." },
        { kind: "power", name: "Pequena e Ágil", execucao: "passive", descricao: "Arabella recebe <strong>+5</strong> na Defesa contra ataques de oportunidade e é frequentemente subestimada por seu tamanho." },
    ],
});
NPCS.push({
    name: "Marian", nd: 6, role: "lacaio", tipo: "con", raca: "Golem de Bronze",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Marian.png",
    disposition: -1, tesouro: "Nenhum", cd: 22, def: 26, movement: { walk: 9 },
    sentidos: ["Percepção 3"],
    bio: "Um golem de bronze animado por magia antiga, usado pela guilda como músculo silencioso — não sente medo, não sente dor, não hesita.",
    ataquescac: "Punhos de Bronze +24 (2x, 1d8+27, ×2, impacto)", ataquesad: "",
    // Construto sem mente (Int -4) — sem PM de propósito, nenhuma habilidade sua usa mana.
    atributos: { for: 6, des: -1, con: 0, int: -4, sab: 0, car: -3 },
    pericias: { ...saves(17, 7, 12), atle: skill(11, { outros: 11 }) }, pv: 48,
    items: [
        { kind: "weapon", name: "Punhos de Bronze", atk: 24, dmgFormula: "1d8+27", critM: 20, critX: 2, tipoDano: "impacto", alcance: "melee", descricao: "Os punhos maciços de bronze de Marian, capazes de amassar metal." },
        { kind: "power", name: "Corpo de Construto", execucao: "passive", descricao: "Marian é imune a veneno, doença, sono, medo e sangramento; não precisa respirar, comer ou dormir." },
    ],
});
NPCS.push({
    name: "Diomedes", nd: 3, role: "lacaio", tipo: "hum", raca: "Trog",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Diomedes.png",
    disposition: -1, tesouro: "Metade", cd: 17, def: 20, movement: { walk: 9, swim: 6 },
    sentidos: ["Percepção 4"],
    bio: "O mais novo e inexperiente dos bandidos da guilda, um trog que ainda está aprendendo a confiar em outra coisa além dos próprios instintos.",
    ataquescac: "Mordida +16 (1d6+21, ×2, perfuração)", ataquesad: "",
    atributos: { for: 1, des: 1, con: 2, int: -1, sab: 0, car: -2 }, pmMax: 9,
    pericias: { ...saves(14, 9, 4), atle: skill(4, { outros: 4 }), furt: skill(4, { outros: 4 }) }, pv: 21,
    items: [
        { kind: "weapon", name: "Mordida", atk: 16, dmgFormula: "1d6+21", critM: 20, critX: 2, tipoDano: "perfuração", alcance: "melee", descricao: "Mandíbulas reptilianas fortes o bastante para perfurar couro." },
        { kind: "power", name: "Sangue-Frio Reptiliano", execucao: "passive", descricao: "Diomedes recebe <strong>+5</strong> em Fortitude contra veneno e pode prender a respiração por longos períodos." },
    ],
});

// ── 10. Funcionários da guilda — ND3, Lacaio ────────────────────────────────────
function staff10(name, raca, ability, atributos, periciaOverrides) {
    NPCS.push({
        name, nd: 3, role: "lacaio", tipo: "hum", raca,
        tamanho: "med", folder: FOLDER_THARTAN_ID, img: `Thartan/${name}.png`,
        disposition: 0, tesouro: "Metade", cd: 17, def: 20, movement: { walk: 9 },
        sentidos: [], bio: `Funcionária(o) da Guilda de Ladrões de Thartan.`,
        ataquescac: "Ataque Improvisado +16 (1d6+21, ×2, impacto)", ataquesad: "",
        atributos: { ...atributos }, pmMax: 9, pericias: { ...saves(14, 9, 4), ...periciaOverrides }, pv: 21,
        items: [
            { kind: "weapon", name: "Ataque Improvisado", atk: 16, dmgFormula: "1d6+21", critM: 20, critX: 2, tipoDano: "impacto", alcance: "melee", descricao: "Uma faca de cozinha, um caixote ou o que estiver à mão." },
            ability,
        ],
    });
}
staff10("Jarif", "Humana",
    { kind: "power", name: "Tempero Especial", execucao: "passive", descricao: "Quem descansa e come uma refeição preparada por Jarif recupera <strong>+1</strong> ponto de vida extra." },
    { for: 1, des: -1, con: 2, int: 0, sab: 1, car: 0 }, { ofi0: skill(8, { outros: 8, label: "Ofício (Culinária)" }) });
staff10("Karin", "Humana",
    { kind: "power", name: "Faca Rápida", execucao: "passive", descricao: "Karin recebe <strong>+5</strong> em Iniciativa." },
    { for: -1, des: 2, con: 0, int: 1, sab: 0, car: 0 }, { ofi0: skill(9, { outros: 9, label: "Ofício (Culinária)" }) });
staff10("Almanfi", "Humano",
    { kind: "power", name: "Mão Pesada", execucao: "passive", descricao: "Uma refeição farta preparada por Almanfi concede <strong>2</strong> pontos de vida temporários a quem a come antes de uma cena de risco." },
    { for: 2, des: -1, con: 2, int: 0, sab: 1, car: 1 }, { ofi0: skill(13, { outros: 13, label: "Ofício (Culinária)" }) });
staff10("Sadira", "Moreau (Gato)",
    { kind: "power", name: "Reflexos Felinos", execucao: "passive", descricao: "Sadira nunca sofre dano de queda e sempre cai de pé." },
    { for: 0, des: 3, con: 0, int: 0, sab: 2, car: 1 }, { acro: skill(11, { outros: 11 }), perc: skill(5, { outros: 5 }) });
staff10("Fillion", "Hobgoblin",
    { kind: "power", name: "Vigilância Militar", execucao: "passive", descricao: "Fillion recebe <strong>+5</strong> em Percepção e nunca é surpreendido." },
    { for: 3, des: 0, con: 2, int: 0, sab: 1, car: -1 }, { perc: skill(9, { outros: 9 }), atle: skill(6, { outros: 6 }) });
staff10("Silvaril", "Dahlan",
    { kind: "power", name: "Presença Magnética", execucao: "passive", descricao: "Silvaril recebe <strong>+10</strong> em Diplomacia ao vender algo, e <strong>+5</strong> em testes de resistência contra intimidação — sua beleza etérea desarma qualquer hostilidade." },
    { for: -2, des: 1, con: -1, int: 1, sab: 1, car: 5 }, { dipl: skill(18, { outros: 18 }), enga: skill(13, { outros: 13 }) });
staff10("Augustus", "Humano",
    { kind: "power", name: "Carisma de Palco", execucao: "passive", descricao: "Augustus recebe <strong>+10</strong> em Diplomacia e Atuação diante de público — dificilmente alguém sai bravo de um leilão conduzido por ele." },
    { for: 0, des: 1, con: 0, int: 1, sab: 0, car: 5 }, { dipl: skill(18, { outros: 18 }), atua: skill(13, { outros: 13 }) });

// ── 11. Vaskrith — Dragão Lefeu, ND5, Solo ──────────────────────────────────────
NPCS.push({
    name: "Vaskrith", nd: 5, role: "solo", tipo: "mon", raca: "Dragão (Lefeu)",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Vaskrith.png",
    disposition: -1, tesouro: "Padrão", cd: 20, def: 24, movement: { walk: 9, fly: 18 },
    sentidos: ["Percepção 12", "Visão no escuro"],
    bio: "Um dragão jovem cujo corpo foi corrompido pela Tormenta, manifestando as marcas de um lefeu: escamas rachadas com veios pulsantes de energia corrompida, olhar fragmentado e insano. Continua sendo um dragão — só que quebrado.",
    ataquescac: "Mordida e Garras +17 (2x, 1d8+16, ×2, perfuração/corte)", ataquesad: "",
    atributos: { for: 3, des: 1, con: 3, int: -1, sab: 3, car: 0 }, pmMax: 15,
    pericias: { ...saves(17, 11, 5), perc: skill(12, { outros: 12 }), inti: skill(4, { outros: 4 }) }, pv: 200,
    items: [
        { kind: "weapon", name: "Mordida e Garras", atk: 17, dmgFormula: "1d8+16", critM: 20, critX: 2, tipoDano: "perfuração", alcance: "melee", descricao: "As presas e garras de Vaskrith, cobertas por escamas rachadas que exalam uma névoa roxa." },
        { kind: "power", name: "Sopro Tormentoso", execucao: "standard", pm: 3, alcance: "Pessoal", area: "Cone 6m", resistPericia: "refl", resistTxt: "Reflexos CD 20 reduz à metade", dmgFormula: "4d6", dmgTipo: "trevas", descricao: "<strong>Padrão, 3 PM.</strong> Vaskrith expele um cone de energia corrompida pela Tormenta. <strong>Reflexos CD 20</strong> reduz o dano à metade. Habilidade mágica." },
        { kind: "power", name: "Imunidades Lefeu", execucao: "passive", descricao: "Vaskrith é imune a acertos críticos, ácido, cansaço, eletricidade, fogo, frio, luz, paralisia, metabolismo, metamorfose, trevas e veneno." },
        { kind: "power", name: "Insanidade da Tormenta", execucao: "passive", resistPericia: "vont", resistTxt: "Vontade CD 20 ou perde PM", descricao: "Uma criatura que veja Vaskrith deve fazer <strong>Vontade CD 20</strong> ou perder <strong>1d4</strong> pontos de mana. Se chegar a 0 PM, fica <strong>Confusa</strong>. Cada criatura só é afetada uma vez por dia." },
        { kind: "power", name: "Percepção Temporal", execucao: "passive", descricao: "Vaskrith soma sua Sabedoria em testes de ataque, na Defesa e em Reflexos — valores já contabilizados nesta ficha." },
        { kind: "power", name: "Visão Ampla", execucao: "passive", descricao: "Vaskrith recebe <strong>+5</strong> em Percepção e não pode ser flanqueado." },
    ],
});

// ── 12. Dafodil — Apresentadora do Leilão Subterrâneo, Dahlan, ND3, Lacaio ──────
// (idêntica a Silvaril — mesmo cargo, raça, estatísticas e habilidade — só muda
// nome/gênero/arte; adicionada no FIM do array de propósito, pra não deslocar
// os ids aleatórios das 28 ameaças já geradas/deployadas em v1.116.0.)
NPCS.push({
    name: "Dafodil", nd: 3, role: "lacaio", tipo: "hum", raca: "Dahlan",
    tamanho: "med", folder: FOLDER_THARTAN_ID, img: "Thartan/Dafodil.png",
    disposition: 0, tesouro: "Metade", cd: 17, def: 20, movement: { walk: 9 },
    sentidos: [], bio: "Apresentadora do leilão subterrâneo da Guilda de Ladrões de Thartan — dahlan de beleza etérea e charme magnético, capaz de vender qualquer item duvidoso como se fosse a última maravilha de Arton.",
    ataquescac: "Ataque Improvisado +16 (1d6+21, ×2, impacto)", ataquesad: "",
    atributos: { for: -2, des: 1, con: -1, int: 1, sab: 1, car: 5 }, pmMax: 9,
    pericias: {
        ...saves(14, 9, 4),
        dipl: skill(18, { outros: 18 }), enga: skill(13, { outros: 13 }),
    },
    pv: 21,
    items: [
        { kind: "weapon", name: "Ataque Improvisado", atk: 16, dmgFormula: "1d6+21", critM: 20, critX: 2, tipoDano: "impacto", alcance: "melee", descricao: "Um martelo de leiloeiro ou o que estiver à mão." },
        { kind: "power", name: "Presença Magnética", execucao: "passive", descricao: "Dafodil recebe <strong>+10</strong> em Diplomacia ao vender algo, e <strong>+5</strong> em testes de resistência contra intimidação — sua beleza etérea desarma qualquer hostilidade." },
    ],
});

// ── 13/14. Aslan Vesper (Guerreiro, ND8, Solo) e Sanaa Vesper (Feiticeira, ND7, Especial) ──
// (adicionadas no FIM, mesmo motivo de Dafodil — não perturbar ids já deployados)
NPCS.push({
    name: "Aslan Vesper", nd: 8, role: "solo", tipo: "hum", raca: "Humano",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Aslan Vesper.png",
    disposition: 0, tesouro: "Padrão", cd: 26, def: 33, movement: { walk: 9 },
    sentidos: ["Percepção 4"],
    bio: "Guerreiro implacável da família Vesper, sua espada é conhecida tanto pelos golpes certeiros quanto pela fúria que desperta em batalha. Costuma lutar ao lado da irmã (ou esposa) Sanaa Vesper.",
    ataquescac: "Espada Vesper +26 (2d10+57, 19-20/×2, corte)", ataquesad: "",
    atributos: { for: 5, des: 1, con: 4, int: 0, sab: 0, car: 1 }, pmMax: 24,
    pericias: {
        ...saves(21, 8, 15),
        inti: skill(14, { outros: 14 }), atle: skill(13, { outros: 13 }),
    },
    pv: 320,
    items: [
        { kind: "weapon", name: "Espada Vesper", atk: 26, dmgFormula: "2d10+57", critM: 19, critX: 2, tipoDano: "corte", alcance: "melee", descricao: "A espada longa da família Vesper, passada de geração em geração." },
        { kind: "power", name: "Fúria de Batalha", execucao: "standard", pm: 4, descricao: "<strong>Padrão, 4 PM.</strong> No próximo ataque, Aslan recebe <strong>+5</strong> no teste e, se acertar, dobra o dano causado." },
        { kind: "power", name: "Guarda Inabalável", execucao: "passive", descricao: "Aslan recebe <strong>Redução de Dano 5</strong> contra dano físico." },
        { kind: "power", name: "Golpe Giratório", execucao: "standard", pm: 4, descricao: "<strong>Padrão, 4 PM.</strong> Aslan ataca todos os inimigos adjacentes com o mesmo bônus de ataque, causando metade do dano normal da espada em cada um que acertar." },
        { kind: "power", name: "Presença de Guerreiro", execucao: "passive", descricao: "Aslan recebe <strong>+5</strong> em Intimidação." },
    ],
});
NPCS.push({
    name: "Sanaa Vesper", nd: 7, role: "special", tipo: "hum", raca: "Humana",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Sanaa Vesper.png",
    disposition: 0, tesouro: "Padrão", cd: 26, def: 29, movement: { walk: 9 },
    sentidos: ["Percepção 4"],
    bio: "Feiticeira da família Vesper — seu poder arcano nasce do próprio sangue, não de estudo, e se manifesta em rajadas de energia que dispensam gestos ou palavras. Luta lado a lado com o irmão (ou marido) Aslan Vesper, cujos golpes ela reforça com magia.<br><br><strong>Magias — Como uma arcanista de 7º nível (CD 26):</strong> Explosão de Chamas, Bola de Fogo, Toque Vampírico.",
    ataquescac: "", ataquesad: "Rajada Arcana +22 (2d8+53, 20/×2, dano arcano)",
    atributos: { for: -2, des: 1, con: 0, int: 2, sab: 1, car: 6 }, conjuracao: "car", pmMax: 16,
    pericias: {
        ...saves(7, 14, 20),
        mist: skill(23, { outros: 23, atributo: "car" }),
    },
    pv: 196,
    items: [
        { kind: "weapon", name: "Rajada Arcana", atk: 22, dmgFormula: "2d8+53", critM: 20, critX: 2, tipoDano: "arcano", alcance: "medium", proposito: "disparo", descricao: "Uma rajada de energia arcana crua, canalizada diretamente do sangue de feiticeira de Sanaa." },
        { kind: "power", name: "Sangue de Feiticeira", execucao: "passive", descricao: "Sanaa recebe <strong>+5</strong> em Misticismo e conjura suas magias sem gestos ou palavras visíveis." },
        { kind: "power", name: "Explosão Arcana", execucao: "standard", pm: 4, alcance: "Médio (18m)", area: "Círculo 6m", resistPericia: "refl", resistTxt: "Reflexos CD 26 reduz à metade", dmgFormula: "6d6", dmgTipo: "arcano", descricao: "<strong>Padrão, 4 PM.</strong> Uma explosão de energia arcana crua. <strong>Reflexos CD 26</strong> reduz o dano à metade. Habilidade mágica." },
        { kind: "power", name: "Escudo de Força", execucao: "reaction", pm: 4, descricao: "<strong>Reação, 4 PM.</strong> Quando é atingida por um ataque, Sanaa reduz o dano recebido à metade." },
        { kind: "power", name: "Vínculo de Sangue", execucao: "passive", descricao: "Enquanto luta ao lado de Aslan Vesper, ambos recebem <strong>+2</strong> em testes de ataque." },
        { kind: "spell", key: "Explosão de Chamas" },
        { kind: "spell", key: "Bola de Fogo" },
        { kind: "spell", key: "Toque Vampírico" },
    ],
});

// ── 15. Mia — Moreau Felina, Batedora dos Bosques, ND2, Solo ────────────────────
// (adicionada no FIM, mesmo motivo de Dafodil/Vesper — não perturbar ids já deployados)
NPCS.push({
    name: "Mia", nd: 2, role: "solo", tipo: "hum", raca: "Moreau (Felino)",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Mia.png",
    disposition: 0, tesouro: "Metade", cd: 16, def: 19, movement: { walk: 9, climb: 6 },
    sentidos: ["Percepção 9", "Visão no escuro"],
    bio: "Batedora moreau felina que patrulha os bosques, usando reflexos ágeis e garras silenciosas para rastrear e emboscar intrusos antes que percebam que estão sendo observados.",
    ataquescac: "", ataquesad: "Arco Curto +12 (1d6+15, 20/×3, perfuração, alcance longo)",
    atributos: { for: 0, des: 4, con: 1, int: 0, sab: 3, car: 1 }, pmMax: 6,
    pericias: {
        ...saves(7, 13, 2),
        furt: skill(10, { outros: 10 }), sobr: skill(9, { outros: 9 }), perc: skill(9, { outros: 9 }), acro: skill(7, { outros: 7 }),
    },
    pv: 70,
    items: [
        { kind: "weapon", name: "Arco Curto", atk: 12, dmgFormula: "1d6+15", critM: 20, critX: 3, tipoDano: "perfuração", alcance: "far", proposito: "disparo", descricao: "Um arco curto de caça, usado por Mia para abater alvos de longe antes que percebam sua presença." },
        { kind: "power", name: "Emboscada Silenciosa", execucao: "passive", dmgFormula: "1d6", dmgTipo: "perfuração", descricao: "Quando ataca um alvo Desprevenido ou surpreso, Mia causa <strong>+1d6</strong> de dano extra." },
        { kind: "power", name: "Salto Felino", execucao: "move", pm: 1, descricao: "<strong>Movimento, 1 PM.</strong> Mia salta até 6m em qualquer direção, inclusive na vertical, ignorando terreno difícil." },
    ],
});

// ── 16. Grom — Moreau Urso, Lenhador e Guarda de Carga, ND3, Solo ───────────────
NPCS.push({
    name: "Grom", nd: 3, role: "solo", tipo: "hum", raca: "Moreau (Urso)",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Grom.png",
    disposition: 0, tesouro: "Metade", cd: 17, def: 21, movement: { walk: 9 },
    sentidos: ["Percepção 8"],
    bio: "Moreau urso, lenhador de ofício e guarda de confiança das caravanas de carga que cruzam a região — não fala muito, mas seu machado e a força bruta resolvem qualquer problema que apareça no caminho.",
    ataquescac: "Machado de Lenhador +14 (1d12+15, 20/×3, corte)", ataquesad: "",
    atributos: { for: 6, des: 0, con: 4, int: -2, sab: 1, car: -1 }, pmMax: 9,
    pericias: {
        ...saves(15, 9, 3),
        atle: skill(15, { outros: 15 }), inti: skill(10, { outros: 10 }), perc: skill(8, { outros: 8 }),
    },
    pv: 105,
    items: [
        { kind: "weapon", name: "Machado de Lenhador", atk: 14, dmgFormula: "1d12+15", critM: 20, critX: 3, tipoDano: "corte", alcance: "melee", descricao: "Um machado pesado de lenhador, tão útil para derrubar árvores quanto para derrubar quem se meter no caminho de Grom." },
        { kind: "power", name: "Golpe Derrubador", execucao: "standard", pm: 2, resistPericia: "fort", resistTxt: "Fortitude CD 17 evita (imune se Grande ou maior)", descricao: "<strong>Padrão, 2 PM.</strong> O próximo ataque corpo a corpo de Grom que acertar também derruba o alvo ao chão, a menos que seja de tamanho Grande ou maior. <strong>Fortitude CD 17</strong> evita." },
        { kind: "power", name: "Couro Espesso", execucao: "passive", descricao: "O pelo grosso e a pele curtida de Grom concedem <strong>Redução de Dano 3</strong> contra dano físico." },
    ],
});

// ── 17. Cedric — Elfo, Vigia da Milícia, ND1, Lacaio ────────────────────────────
NPCS.push({
    name: "Cedric", nd: 1, role: "lacaio", tipo: "hum", raca: "Elfo",
    tamanho: "med", folder: FOLDER_CUSTOM_MADE, img: "Avulsos/Cedric.png",
    disposition: 0, tesouro: "Nenhum", cd: 14, def: 15, movement: { walk: 9 },
    sentidos: ["Percepção 6", "Visão no escuro"],
    bio: "Elfo vigia da milícia local, sempre alerta nas muralhas ou nas estradas — treinado para notar o menor sinal de perigo e soar o alarme antes que seja tarde.",
    ataquescac: "Espada da Milícia +11 (1d8+13, ×2, corte)", ataquesad: "",
    atributos: { for: 1, des: 2, con: 0, int: 0, sab: 1, car: 0 }, pmMax: 6,
    pericias: {
        ...saves(5, 10, 1),
        perc: skill(6, { outros: 6 }), inic: skill(4, { outros: 4 }),
    },
    pv: 9,
    items: [
        { kind: "weapon", name: "Espada da Milícia", atk: 11, dmgFormula: "1d8+13", critM: 20, critX: 2, tipoDano: "corte", alcance: "melee", descricao: "Uma espada padrão distribuída aos vigias da milícia local." },
        { kind: "power", name: "Visão Élfica", execucao: "passive", descricao: "Cedric enxerga perfeitamente no escuro parcial, é imune a magias de sono e recebe <strong>+2</strong> em testes de resistência contra efeitos de Encantamento." },
        { kind: "power", name: "Grito de Alarme", execucao: "free", pm: 1, descricao: "<strong>Ação livre, 1 PM.</strong> Cedric alerta até 6 aliados num raio de 9m, que não podem ser surpreendidos até o fim da cena." },
    ],
});

// ── Escrita dos arquivos ─────────────────────────────────────────────────────────
writeFileSync(resolve(OUT_DIR, `_folder-thartan-${FOLDER_THARTAN_ID.slice(-6)}.json`), JSON.stringify(folderThartan, null, 2) + "\n");

let sortCounter = 100000;
for (const spec of NPCS) {
    spec.sort = sortCounter;
    sortCounter += 50000;
    const actor = buildActor(spec);
    const fname = `${slug(spec.name)}-${actor._id.slice(0, 6)}.json`;
    writeFileSync(resolve(OUT_DIR, fname), JSON.stringify(actor, null, 2) + "\n");
    console.log(`  ${spec.name} (ND ${spec.nd}, ${spec.role}) → ${fname}`);
}
console.log(`\nOK — ${NPCS.length} ameaças + 1 pasta nova geradas em packs-src/ameacas/.`);
