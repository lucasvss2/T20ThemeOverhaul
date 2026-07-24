import type { ClassLevelVM } from "./types";

/** Itens `type:"classe"` do ator, com nível (`system.niveis`). Ordem = ordem dos itens. */
export function classesForActor(actor: FoundryActor | null): ClassLevelVM[] {
    const items = actor?.items?.contents ?? [];
    return items
        .filter((i) => i.type === "classe")
        .map((i) => ({ name: i.name, level: Number((i.system as { niveis?: number })?.niveis ?? 0) }));
}
