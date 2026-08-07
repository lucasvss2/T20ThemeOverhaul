/**
 * Loot: valoração e sumarização de um tesouro para o fluxo de saque/distribuição.
 *
 * A partir da árvore de `ResultLine` (engine), extrai o total em **T$ (prata)** e a
 * lista plana de **itens atribuíveis** (equipamentos, poções, itens diversos,
 * riquezas). Puro/testável — sem dependência de Foundry.
 */

import type { AssignItemInfo, ResultLine } from "./treasure-engine";

/** Item atribuível com id estável para a UI. */
export interface LootItem extends AssignItemInfo {
    /** Id único (para dropdown/atribuição na UI). */
    uid: string;
    /** Rótulo pronto para exibição (nome + melhorias). */
    display: string;
}

/** Resumo de um tesouro para o overlay/distribuição. */
export interface LootSummary {
    /** Total em T$ (prata). */
    totalTibar: number;
    /** Fração de `totalTibar` que veio especificamente de moeda TO (tibares de ouro). */
    totalOuroTibar: number;
    /** Itens atribuíveis (planos). */
    items: LootItem[];
}

function displayName(a: AssignItemInfo): string {
    if (!a.upgrades.length) return a.name;
    return `${a.name} (${a.upgrades.join(", ")})`;
}

/** Percorre a árvore somando `tibar` e coletando `assign`. */
export function summarizeLoot(lines: ResultLine[], idPrefix = "loot"): LootSummary {
    let totalTibar = 0;
    let totalOuroTibar = 0;
    const items: LootItem[] = [];
    let counter = 0;
    const walk = (arr: ResultLine[]): void => {
        for (const l of arr) {
            if (typeof l.tibar === "number") totalTibar += l.tibar;
            if (typeof l.tibarOuro === "number") totalOuroTibar += l.tibarOuro;
            if (l.assign) {
                items.push({ ...l.assign, uid: `${idPrefix}-${counter++}`, display: displayName(l.assign) });
            }
            if (l.children?.length) walk(l.children);
        }
    };
    walk(lines);
    // arredonda pra 2 casas (centavos = TC)
    totalTibar = Math.round(totalTibar * 100) / 100;
    totalOuroTibar = Math.round(totalOuroTibar * 100) / 100;
    return { totalTibar, totalOuroTibar, items };
}

/** Divisão de T$ em prata inteira + cobre (resto), 1 T$ = 10 TC. */
export interface CoinSplit { tp: number; tc: number }

/** Converte um valor em T$ (possivelmente fracionário) em prata+cobre inteiros. */
export function tibarToCoins(tibar: number): CoinSplit {
    const tp = Math.floor(tibar + 1e-9);
    const tc = Math.round((tibar - tp) * 10);
    // 10 TC arredonda pra +1 TP
    return tc >= 10 ? { tp: tp + 1, tc: 0 } : { tp, tc };
}

/** Distribui `totalTibar` igualmente entre `n` personagens: valor por cabeça (T$). */
export function perShareTibar(totalTibar: number, n: number): number {
    if (n <= 0) return 0;
    return Math.round((totalTibar / n) * 100) / 100;
}

/** Divisão de ouro em tibares de ouro inteiros + tibares de prata (resto), 1 TO = 10 TP. */
export interface GoldSplit { to: number; tp: number }

/**
 * Distribui `totalTO` (tibares de ouro) igualmente entre `n` personagens. A parte
 * fracionária do quinhão vira prata (1 TO = 10 TP) — ex.: 90 TO / 4 = 22,5 TO por
 * cabeça → 22 TO + 5 TP.
 */
export function splitGoldShare(totalTO: number, n: number): GoldSplit {
    if (n <= 0 || totalTO <= 0) return { to: 0, tp: 0 };
    const share = totalTO / n;
    const to = Math.floor(share + 1e-9);
    const tp = Math.round((share - to) * 10);
    return tp >= 10 ? { to: to + 1, tp: 0 } : { to, tp };
}
