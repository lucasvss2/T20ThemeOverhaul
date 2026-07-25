/**
 * Reordenação por arrastar-e-soltar (Perícias e painel direito). Puro/testável
 * — persistência (client setting) fica em `state.ts`; aqui só a matemática de
 * "aplicar uma ordem salva" e "recalcular a ordem após soltar um item".
 */

export interface KeyedItem { key: string }

/** Aplica `order` (array de chaves) sobre `items`: chaves conhecidas na ordem salva vêm primeiro (na ordem salva), o resto mantém a ordem natural ao final. Chaves na ordem salva que não existem mais em `items` são ignoradas. */
export function applyCustomOrder<T extends KeyedItem>(items: T[], order: string[]): T[] {
    if (!order.length) return items;
    const byKey = new Map(items.map((i) => [i.key, i] as const));
    const ordered: T[] = [];
    for (const k of order) {
        const it = byKey.get(k);
        if (it) { ordered.push(it); byKey.delete(k); }
    }
    for (const it of items) if (byKey.has(it.key)) ordered.push(it);
    return ordered;
}

/**
 * Recalcula a ordem completa após soltar `draggedKey` sobre `targetKey`
 * (o item arrastado passa a ficar IMEDIATAMENTE ANTES do alvo). `currentKeys`
 * deve ser a ordem completa atualmente exibida (todas as páginas, não só a
 * visível). Retorna `null` se a operação for inválida/no-op.
 */
export function computeReorderedKeys(currentKeys: string[], draggedKey: string, targetKey: string): string[] | null {
    if (draggedKey === targetKey) return null;
    if (!currentKeys.includes(draggedKey) || !currentKeys.includes(targetKey)) return null;
    const arr = currentKeys.filter((k) => k !== draggedKey);
    const idx = arr.indexOf(targetKey);
    arr.splice(idx, 0, draggedKey);
    return arr;
}
