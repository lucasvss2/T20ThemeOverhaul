/**
 * Riqueza — seleção interativa do que a riqueza "é".
 *
 * O campo `exemplos` de uma riqueza vem como linhas separadas por categoria de
 * espaço, ex.:
 *   "0,5 espaço: ágata trincada, anel de hematita, jarro de mel;
 *    1 espaço: caixa com velas aromáticas, roldana de ferro;
 *    —: vaca leiteira (irá acompanhá-lo se você for treinado em Adestramento)"
 *
 * Fluxo: o GM marca as categorias cabíveis → rola 1d(nº marcadas) para escolher a
 * linha → rola 1d(nº itens) para sortear o item → resolve fórmula de quantidade
 * (ex.: "1d4+1 soldadinhos de chumbo"). Helpers puros/testáveis.
 */

import { rollFormula, type DieRoller } from "./treasure-engine";

/** Categoria de riqueza (uma linha de espaço). */
export interface RiquezaCategory {
    /** Rótulo do espaço: "0,5", "1", "2", "5", "10", "20", "100", "—". */
    space: string;
    /** Itens possíveis dessa categoria. */
    items: string[];
}

/** Divide uma string de itens por vírgula, respeitando parênteses. */
export function splitItems(body: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of body) {
        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.map(s => s.replace(/;+\s*$/, "").trim()).filter(Boolean);
}

/** Parseia o campo `exemplos` de uma riqueza em categorias por espaço. */
export function parseRiquezaCategories(exemplos: string): RiquezaCategory[] {
    if (!exemplos || !exemplos.trim()) return [];
    const out: RiquezaCategory[] = [];
    for (const raw of exemplos.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const ci = line.indexOf(":");
        if (ci < 0) continue;
        const head = line.slice(0, ci).trim();
        const body = line.slice(ci + 1).trim();
        const space = head.replace(/\s*espa[çc]os?\b/i, "").trim() || head;
        const items = splitItems(body);
        if (items.length) out.push({ space, items });
    }
    return out;
}

/** Resultado do sorteio final de um item de riqueza. */
export interface RiquezaPick {
    space: string;
    /** Texto original do item sorteado. */
    raw: string;
    /** Texto final (com quantidade resolvida, se houver). */
    text: string;
    /** Quantidade resolvida (1 se não houver fórmula). */
    qty: number;
}

/**
 * Sorteia um item dentro de uma categoria. `itemRoll` é 1..items.length.
 * Resolve fórmula de quantidade no início do texto ("1d4+1 soldadinhos" → rola).
 */
export function pickRiquezaItem(cat: RiquezaCategory, itemRoll: number, roll: DieRoller): RiquezaPick {
    const idx = Math.max(0, Math.min(cat.items.length - 1, itemRoll - 1));
    const raw = cat.items[idx] ?? "";
    const m = raw.match(/^(\d+d\d+(?:[+-]\d+)?|\d+)\s+(.*)$/);
    if (m && /d\d/i.test(m[1])) {
        const qty = Math.max(1, rollFormula(m[1], roll));
        return { space: cat.space, raw, text: `${qty} ${m[2]}`, qty };
    }
    return { space: cat.space, raw, text: raw, qty: 1 };
}
