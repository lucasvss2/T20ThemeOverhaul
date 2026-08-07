/**
 * Motor de resolução de tesouros (Tormenta20).
 *
 * Resolve, a partir da tabela `TREASURE`, a geração completa de um tesouro:
 * rola as colunas Dinheiro e Itens da linha do ND e faz o "drill-down" por
 * todas as sub-tabelas (Equipamentos, Poções, Riquezas, Superiores, Mágicos,
 * Acessórios), respeitando os modificadores +% (+20 na rolagem de riqueza/poção)
 * e 2D (rola 2d6 no tipo e o GM escolhe um).
 *
 * Funções puras: recebem um `DieRoller` injetável → determinísticas nos testes.
 */

import { TREASURE, type ItemRow, type RiquezaRow } from "./treasure-data";

/** Rola um dado de `sides` faces (1..sides). */
export type DieRoller = (sides: number) => number;

export type Quantity = "padrao" | "metade" | "dobro";
export type EquipType = "arma" | "armadura" | "esoterico";
/** Tier de item mágico / acessório (chaves dos dados: menor/medio/maior). */
export type MagicTier = "menor" | "medio" | "maior";
/** Categoria de riqueza (chaves dos dados: menor/media/maior). */
export type RiquezaCat = "menor" | "media" | "maior";

/** Info de um item atribuível (para saque/distribuição). */
export interface AssignItemInfo {
    /** Nome-base do item (ex.: "Espada longa"). */
    name: string;
    /** Categoria: arma/armadura/esoterico/acessorio/pocao/item/riqueza. */
    category: string;
    /** Melhorias/encantos aplicados (nomes). */
    upgrades: string[];
    /** Preço de tabela (T$), se houver. */
    preco?: string;
    /** Referência de livro/página. */
    ref?: string;
}

/** Linha de resultado (árvore): um rótulo + detalhe opcional + filhos. */
export interface ResultLine {
    label: string;
    detail?: string;
    children?: ResultLine[];
    /** Valor monetário desta linha em T$ (prata), quando for dinheiro/riqueza. */
    tibar?: number;
    /** Fração de `tibar` que veio especificamente de moeda TO (tibares de ouro). */
    tibarOuro?: number;
    /** Item atribuível representado por esta linha (equipamento/poção/item diverso). */
    assign?: AssignItemInfo;
}

/** Conversão de moeda T20 → T$ (prata): TO=10, T$/TP=1, TC=0,1. */
export function currencyToTibar(amount: number, cur: string): number {
    const c = cur.toUpperCase();
    const rate = c === "TO" ? 10 : c === "TC" ? 0.1 : 1;
    return amount * rate;
}

// ── Helpers de rolagem ────────────────────────────────────────────────────────

/** Primeira linha cuja faixa [min,max] contém `roll`. */
export function findRow<T extends { range: [number, number] }>(rows: T[], roll: number): T | null {
    return rows.find(r => roll >= r.range[0] && roll <= r.range[1]) ?? null;
}

/** Avalia uma fórmula de dados simples: "2d6", "1d4+1", "4d12", "1d3+1", ou número. */
export function rollFormula(expr: string, roll: DieRoller): number {
    const m = expr.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (m) {
        const n = m[1] ? parseInt(m[1], 10) : 1;
        const sides = parseInt(m[2], 10);
        let total = 0;
        for (let i = 0; i < n; i++) total += roll(sides);
        if (m[3]) total += parseInt(m[3], 10);
        return total;
    }
    const n = parseInt(expr, 10);
    return Number.isFinite(n) ? n : 0;
}

/** Remove separador de milhar "1.000" → 1000. */
function parseAmount(s: string): number {
    return parseInt(s.replace(/\./g, ""), 10) || 0;
}

const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ── Dinheiro ──────────────────────────────────────────────────────────────────

/** Resolve um resultado da coluna Dinheiro. `half` divide moedas pela metade (Metade). */
export function resolveMoney(result: string, roll: DieRoller, half: boolean): ResultLine | null {
    const r = result.trim();
    if (!r || r === "—" || r === "-") return null;

    // "NdMxK CUR" (ex.: "1d6x10 TC", "2d6+1x100 T$", "2d4x1.000 T$")
    const money = r.match(/^(\d*d\d+(?:[+-]\d+)?)\s*x\s*([\d.]+)\s*(TC|T\$|TO)$/i);
    if (money) {
        const dice = money[1];
        const mult = parseAmount(money[2]);
        const cur = money[3];
        const full = rollFormula(dice, roll) * mult;
        const value = half ? Math.floor(full / 2) : full;
        const label = half ? `${value} ${cur} (metade de ${full} ${cur})` : `${value} ${cur}`;
        const tibar = currencyToTibar(value, cur);
        const isOuro = cur.toUpperCase() === "TO";
        return { label: `Dinheiro: ${label}`, detail: `${dice}×${mult} ${cur}`, tibar, tibarOuro: isOuro ? tibar : undefined };
    }

    // "C riqueza(s) CATEGORIA [+%]" também pode aparecer na coluna Dinheiro
    const riq = matchRiqueza(r);
    if (riq) {
        const line = resolveRiquezas(riq.count, riq.category, riq.plus, roll);
        if (line && half) line.label = `${line.label} (metade não se aplica a riquezas)`;
        return line;
    }

    return { label: `Dinheiro: ${result}` };
}

// ── Riquezas ──────────────────────────────────────────────────────────────────

function matchRiqueza(r: string): { count: string; category: RiquezaCat; plus: boolean } | null {
    const m = norm(r).match(/^(\d+d\d+(?:[+-]\d+)?|\d+)\s+riqueza[s]?\s+(men|med|mai)/);
    if (!m) return null;
    const cat: RiquezaCat = m[2] === "men" ? "menor" : m[2] === "med" ? "media" : "maior";
    return { count: m[1], category: cat, plus: /\+\s*%/.test(r) };
}

function riquezaRangeFor(row: RiquezaRow, cat: RiquezaCat): [number, number] | null {
    return cat === "menor" ? row.menor : cat === "media" ? row.media : row.maior;
}

/** Resolve `count` riquezas de uma categoria (com +20 se `plus`). */
export function resolveRiquezas(count: string, cat: RiquezaCat, plus: boolean, roll: DieRoller): ResultLine {
    const n = Math.max(1, rollFormula(count, roll));
    const catLabel = cat === "media" ? "média" : cat;
    const children: ResultLine[] = [];
    for (let i = 0; i < n; i++) {
        const d = Math.min(120, roll(100) + (plus ? 20 : 0));
        const row = TREASURE.riquezas.find(rw => {
            const rng = riquezaRangeFor(rw, cat);
            return rng !== null && d >= rng[0] && d <= rng[1];
        });
        if (!row) { children.push({ label: `Riqueza ${catLabel} (d%=${d}: sem entrada)` }); continue; }
        const value = rollRiquezaValue(row.valor, roll);
        children.push({
            label: `Riqueza ${catLabel}: ${value > 0 ? `${value} T$` : row.valor}`,
            detail: row.exemplos || undefined,
            tibar: value,
            assign: { name: `Riqueza ${catLabel}`, category: "riqueza", upgrades: [], preco: value > 0 ? String(value) : row.valor },
        });
    }
    return { label: `${n} riqueza${n > 1 ? "s" : ""} ${catLabel}${plus ? " (+%)" : ""}`, children };
}

/** Rola o valor de uma riqueza a partir de "2d4x10 (50)" / "4d4 (10)" / "1d10x10.000 (55.000)". */
export function rollRiquezaValue(valor: string, roll: DieRoller): number {
    const dicePart = valor.split("(")[0].trim();
    const xMatch = dicePart.match(/^(\d*d\d+(?:[+-]\d+)?)\s*x\s*([\d.]+)$/i);
    if (xMatch) return rollFormula(xMatch[1], roll) * parseAmount(xMatch[2]);
    const m = dicePart.match(/^\d*d\d+/);
    return m ? rollFormula(dicePart, roll) : 0;
}

// ── Tipo de equipamento / item mágico (1d6, 2D = 2d6 escolha) ─────────────────

function equipTypeFromDie(d: number): EquipType {
    return d <= 3 ? "arma" : d <= 5 ? "armadura" : "esoterico";
}

function magicTypeFromDie(d: number): EquipType | "acessorio" {
    return d <= 2 ? "arma" : d === 3 ? "armadura" : d === 4 ? "esoterico" : "acessorio";
}

/** Rola o(s) tipo(s). Com 2D, rola 2d6 e devolve os dois (deduplicados). */
function rollTypes<T>(roll: DieRoller, twoD: boolean, map: (d: number) => T): T[] {
    if (!twoD) return [map(roll(6))];
    const a = map(roll(6)), b = map(roll(6));
    return a === b ? [a] : [a, b];
}

// ── Itens ─────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
    arma: "arma", armadura: "armadura/escudo", esoterico: "esotérico", acessorio: "acessório",
};

function itemName(row: ItemRow | null): string {
    return row ? (row.nome || row.item || "?") : "(sem entrada)";
}

/** Constrói o AssignItemInfo de uma linha de item a partir da row da tabela. */
function assignFromRow(row: ItemRow | null, category: string, upgrades: string[] = []): AssignItemInfo {
    return {
        name: itemName(row),
        category,
        upgrades,
        preco: row?.preco || undefined,
        ref: row ? (row.livro ? `${row.livro}${row.pagina ? `, p.${row.pagina}` : ""}` : undefined) : undefined,
    };
}

function rollItemTable(rows: ItemRow[], roll: DieRoller, plus = false): ItemRow | null {
    const d = Math.min(120, roll(100) + (plus ? 20 : 0));
    return findRow(rows, d);
}

/** Resolve um resultado da coluna Itens (drill-down completo). */
export function resolveItem(result: string, roll: DieRoller): ResultLine | null {
    const r = result.trim();
    const n = norm(r);
    if (!r || r === "—" || r === "-") return null;

    if (n === "item diverso") {
        const row = rollItemTable(TREASURE.itensDiversos, roll);
        return { label: `Item diverso: ${itemName(row)}`, detail: bookRef(row), assign: assignFromRow(row, "item") };
    }

    if (n.startsWith("equipamento")) {
        const twoD = /2d/i.test(r);
        return { label: `Equipamento${twoD ? " (2D — escolha um)" : ""}`, children: resolveEquipamentos(roll, twoD) };
    }

    // poções: "C poção/poções [+%]"
    const pocM = n.match(/^(\d+d\d+(?:[+-]\d+)?|\d+)\s+poc/);
    if (pocM) {
        const count = Math.max(1, rollFormula(pocM[1], roll));
        const plus = /\+\s*%/.test(r);
        const children: ResultLine[] = [];
        for (let i = 0; i < count; i++) {
            const row = rollItemTable(TREASURE.pocoes, roll, plus);
            children.push({ label: `Poção: ${itemName(row)}`, detail: bookRef(row), assign: assignFromRow(row, "pocao") });
        }
        return { label: `${count} poção${count > 1 ? "/poções" : ""}${plus ? " (+%)" : ""}`, children };
    }

    // superior: "Superior (N melhoria(s)) [2D]"
    const supM = n.match(/^superior\s*\((\d+)\s*melhoria/);
    if (supM) {
        const nMelhorias = parseInt(supM[1], 10);
        const twoD = /2d/i.test(r);
        const children: ResultLine[] = [];
        for (const type of rollTypes(roll, twoD, equipTypeFromDie)) {
            const eq = rollItemTable(TREASURE.equipamentos[type] ?? [], roll);
            const melhorias: ResultLine[] = [];
            const melNames: string[] = [];
            for (let i = 0; i < nMelhorias; i++) {
                const mel = rollItemTable(TREASURE.superiores[type] ?? [], roll);
                melhorias.push({ label: `Melhoria: ${itemName(mel)}`, detail: bookRef(mel) });
                melNames.push(itemName(mel));
            }
            children.push({ label: `${itemName(eq)} (${TYPE_LABEL[type]}) — ${nMelhorias} melhoria${nMelhorias > 1 ? "s" : ""}`, detail: bookRef(eq), children: melhorias, assign: assignFromRow(eq, type, melNames) });
        }
        return { label: `Superior (${nMelhorias} melhoria${nMelhorias > 1 ? "s" : ""})${twoD ? " (2D — escolha um)" : ""}`, children };
    }

    // mágico: "Mágico (menor/médio/maior) [2D]"
    const magM = n.match(/^magico\s*\((men|med|mai)/);
    if (magM) {
        const tier: MagicTier = magM[1] === "men" ? "menor" : magM[1] === "med" ? "medio" : "maior";
        const twoD = /2d/i.test(r);
        return { label: `Mágico (${tier === "medio" ? "médio" : tier})${twoD ? " (2D — escolha um)" : ""}`, children: resolveMagicos(tier, roll, twoD) };
    }

    return { label: `Item: ${result}` };
}

function resolveEquipamentos(roll: DieRoller, twoD: boolean): ResultLine[] {
    return rollTypes(roll, twoD, equipTypeFromDie).map(type => {
        const row = rollItemTable(TREASURE.equipamentos[type] ?? [], roll);
        return { label: `${itemName(row)} (${TYPE_LABEL[type]})`, detail: bookRef(row), assign: assignFromRow(row, type) };
    });
}

const ENCANTOS_POR_TIER: Record<MagicTier, number> = { menor: 1, medio: 2, maior: 3 };

function resolveMagicos(tier: MagicTier, roll: DieRoller, twoD: boolean): ResultLine[] {
    return rollTypes(roll, twoD, magicTypeFromDie).map(type => {
        if (type === "acessorio") {
            const row = rollItemTable(TREASURE.acessorios[tier] ?? [], roll);
            return { label: `Acessório ${tier === "medio" ? "médio" : tier}: ${itemName(row)}`, detail: bookRef(row), assign: assignFromRow(row, "acessorio") };
        }
        const nEnc = ENCANTOS_POR_TIER[tier];
        const eq = rollItemTable(TREASURE.equipamentos[type] ?? [], roll);
        const encantos: ResultLine[] = [];
        const encNames: string[] = [];
        for (let i = 0; i < nEnc; i++) {
            const enc = rollItemTable(TREASURE.magicos[type] ?? [], roll);
            encantos.push({ label: `Encanto: ${itemName(enc)}`, detail: bookRef(enc) });
            encNames.push(itemName(enc));
        }
        return { label: `${itemName(eq)} (${TYPE_LABEL[type]} mágico) — ${nEnc} encanto${nEnc > 1 ? "s" : ""}`, detail: bookRef(eq), children: encantos, assign: assignFromRow(eq, type, encNames) };
    });
}

function bookRef(row: ItemRow | null): string | undefined {
    if (!row) return undefined;
    const parts: string[] = [];
    if (row.preco) parts.push(`${row.preco} T$`);
    if (row.livro) parts.push(`${row.livro}${row.pagina ? `, p.${row.pagina}` : ""}`);
    return parts.length ? parts.join(" · ") : undefined;
}

// ── Topo: resolve um tesouro completo ─────────────────────────────────────────

export function getNDEntry(nd: string): typeof TREASURE.main[number] | null {
    return TREASURE.main.find(e => e.nd === nd) ?? null;
}

/** Lista de NDs disponíveis (na ordem da tabela: 1/4, 1/2, 1..20). */
export function listNDs(): string[] {
    return TREASURE.main.map(e => e.nd);
}

export interface TreasureResult {
    nd: string;
    quantity: Quantity;
    lines: ResultLine[];
}

/**
 * Gera um tesouro para (ND, quantidade). Padrão: 1 rolagem em cada coluna.
 * Metade: 1 em cada, mas Dinheiro pela metade. Dobro: 2 em cada coluna.
 */
export function generateTreasure(nd: string, quantity: Quantity, roll: DieRoller): TreasureResult | null {
    const entry = getNDEntry(nd);
    if (!entry) return null;

    const moneyRolls = quantity === "dobro" ? 2 : 1;
    const itemRolls = quantity === "dobro" ? 2 : 1;
    const half = quantity === "metade";

    const lines: ResultLine[] = [];
    for (let i = 0; i < moneyRolls; i++) {
        const d = roll(100);
        const row = findRow(entry.dinheiro, d);
        const line = row ? resolveMoney(row.result, roll, half) : null;
        lines.push(line ?? { label: `Dinheiro (d%=${d}): —` });
    }
    for (let i = 0; i < itemRolls; i++) {
        const d = roll(100);
        const row = findRow(entry.itens, d);
        const line = row ? resolveItem(row.result, roll) : null;
        lines.push(line ?? { label: `Itens (d%=${d}): —` });
    }
    return { nd, quantity, lines };
}
