/**
 * Resolução de item de loot → ficha do personagem.
 *
 * 1. Procura o item pelo nome em TODOS os compêndios de Item (sistema + módulos).
 * 2. Achou → copia pra ficha. Com melhorias → renomeia "Base (Melhoria…)" e anexa
 *    nota na descrição listando as melhorias a aplicar (GM finaliza os slots).
 * 3. Não achou → cria um item placeholder do tipo adequado + nota, e avisa o GM
 *    para preencher os atributos depois.
 */

import type { LootItem } from "./loot";
import { warn } from "@/utils/logging";

const norm = (s: string): string =>
    String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Tipo de item Foundry por categoria de loot. */
function itemTypeFor(category: string): string {
    switch (category) {
        case "arma": return "arma";
        case "armadura": case "esoterico": case "acessorio": return "equipamento";
        case "pocao": return "consumivel";
        default: return "tesouro"; // item diverso / riqueza
    }
}

interface PackLike {
    metadata?: { type?: string };
    documentName?: string;
    getIndex: () => Promise<Iterable<{ _id?: string; name?: string }>>;
    getDocument: (id: string) => Promise<{ toObject: () => Record<string, unknown>; name?: string } | null>;
    collection?: string;
}

/** Busca um item por nome (igualdade normalizada) nos compêndios de Item. Sistema primeiro. */
export async function findCompendiumItem(name: string): Promise<Record<string, unknown> | null> {
    const target = norm(name);
    if (!target) return null;
    const packs = ((game as unknown as { packs?: { contents?: PackLike[] } }).packs?.contents ?? []) as PackLike[];
    const itemPacks = packs.filter(p => (p.metadata?.type ?? p.documentName) === "Item");
    // sistema tormenta20 primeiro, depois o resto
    itemPacks.sort((a, b) => {
        const as = a.collection?.startsWith("tormenta20") ? 0 : 1;
        const bs = b.collection?.startsWith("tormenta20") ? 0 : 1;
        return as - bs;
    });
    for (const pack of itemPacks) {
        try {
            const idx = await pack.getIndex();
            for (const e of idx) {
                if (e.name && e._id && norm(e.name) === target) {
                    const doc = await pack.getDocument(e._id);
                    if (doc) return doc.toObject();
                }
            }
        } catch (err) { warn(`item-resolver: falha lendo pack ${pack.collection}:`, err); }
    }
    return null;
}

interface ActorLike {
    name?: string;
    createEmbeddedDocuments: (type: string, data: Array<Record<string, unknown>>) => Promise<unknown>;
}

function upgradeNote(upgrades: string[]): string {
    return upgrades.length
        ? `<hr><p><strong>⚙️ Melhorias a aplicar (GM):</strong> ${upgrades.join(", ")}.</p>`
        : "";
}

function appendDescription(data: Record<string, unknown>, html: string): void {
    const sys = (data["system"] ??= {}) as Record<string, unknown>;
    const desc = (sys["description"] ??= {}) as Record<string, unknown>;
    desc["value"] = `${String(desc["value"] ?? "")}${html}`;
}

export interface DeliverResult { itemName: string; found: boolean; needsAttention: boolean }

/** Resolve e adiciona o item à ficha. Retorna info para o resumo/aviso ao GM. */
export async function deliverItemToActor(actor: ActorLike, item: LootItem): Promise<DeliverResult> {
    const base = await findCompendiumItem(item.name);
    if (base) {
        delete base["_id"];
        const withUpg = item.upgrades.length;
        if (withUpg) {
            base["name"] = `${item.name} (${item.upgrades.join(", ")})`;
            appendDescription(base, upgradeNote(item.upgrades));
        }
        await actor.createEmbeddedDocuments("Item", [base]);
        return { itemName: String(base["name"]), found: true, needsAttention: !!withUpg };
    }
    // placeholder
    const placeholder: Record<string, unknown> = {
        name: item.display,
        type: itemTypeFor(item.category),
        img: "icons/svg/chest.svg",
        system: {
            description: {
                value: `<p><em>Item de tesouro gerado — atribua os atributos.</em></p>` +
                    `<p>Categoria: ${item.category}${item.preco ? ` · Preço: ${item.preco} T$` : ""}${item.ref ? ` · ${item.ref}` : ""}</p>` +
                    upgradeNote(item.upgrades),
            },
        },
    };
    await actor.createEmbeddedDocuments("Item", [placeholder]);
    return { itemName: item.display, found: false, needsAttention: true };
}
