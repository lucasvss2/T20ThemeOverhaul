import { getVisiblePacks, stripPackLabelPrefix } from "./skills-menu";

export function normalizeCompendiumSearch(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function matchesCompendiumSearch(name: string, query: string): boolean {
    const normalized = normalizeCompendiumSearch(name);
    return normalizeCompendiumSearch(query).split(/\s+/).every(word => normalized.includes(word));
}

export interface CompendiumResult { uuid: string; name: string; packLabel: string }
interface IndexedPack {
    visible?: boolean;
    getIndex(): Promise<{ contents: Array<{ _id: string; name: string }> }>;
}

/** Uses Foundry's cached name index only; never loads the complete actor/item documents. */
export async function searchCompendiumContents(query: string): Promise<{
    results: CompendiumResult[]; total: number; failed: number;
}> {
    if (normalizeCompendiumSearch(query).length < 2) return { results: [], total: 0, failed: 0 };
    const packs = (game as unknown as { packs?: { get(id: string): IndexedPack | undefined } }).packs;
    const found: CompendiumResult[] = [];
    let failed = 0;
    await Promise.all(getVisiblePacks().map(async info => {
        try {
            const pack = packs?.get(info.id);
            if (!pack || pack.visible === false) return;
            const index = await pack.getIndex();
            // Recheck visibility after the asynchronous read, including permission changes.
            if (!getVisiblePacks().some(p => p.id === info.id)) return;
            for (const entry of index.contents) {
                if (!entry._id || !entry.name || !matchesCompendiumSearch(entry.name, query)) continue;
                found.push({ uuid: `Compendium.${info.id}.${entry._id}`, name: entry.name,
                    packLabel: stripPackLabelPrefix(info.label) });
            }
        } catch { failed++; }
    }));
    const normalized = normalizeCompendiumSearch(query);
    const rank = (name: string) => normalizeCompendiumSearch(name) === normalized ? 0
        : normalizeCompendiumSearch(name).startsWith(normalized) ? 1 : 2;
    found.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "pt-BR")
        || a.packLabel.localeCompare(b.packLabel, "pt-BR"));
    return { results: found.slice(0, 60), total: found.length, failed };
}
