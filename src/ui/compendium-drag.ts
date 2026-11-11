import type { CompendiumResult } from "./compendium-search";

interface DragEventLike {
    dataTransfer: { setData(format: string, data: string): void; effectAllowed: string } | null;
    stopPropagation(): void;
}
/** Mesmo contrato usado pelos diretórios nativos: o drop importa o documento
 * pelo UUID, preservando descrições, efeitos e automações do sistema. */
export function startCompendiumDrag(event: DragEventLike, result: Pick<CompendiumResult, "uuid" | "documentName">): boolean {
    if (!event.dataTransfer || !result.documentName || !result.uuid.startsWith("Compendium.")) return false;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: result.documentName, uuid: result.uuid }));
    return true;
}
