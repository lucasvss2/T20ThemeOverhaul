import { named } from "@/ataque-furtivo/format";

interface ProficiencyActor {
    items?: { contents?: Array<{ type?: string; name?: string }> };
    system?: { tracos?: {
        profArmas?: { value?: string[] | string };
        profArmaduras?: { value?: string[] | string };
    } };
    update(data: Record<string, string[]>): Promise<unknown>;
}

/** Concede as proficiências sem substituir escolhas de outras classes/origens. */
export function capangaProficiencyUpdate(actor: ProficiencyActor): Record<string, string[]> {
    if (!actor.items?.contents?.some(i => i.type === "classe" && named(i.name, "capanga"))) return {};
    const changes: Record<string, string[]> = {};
    for (const [field, grant] of [["profArmas", "simples"], ["profArmaduras", "lev"]] as const) {
        const current = actor.system?.tracos?.[field]?.value;
        const values = Array.isArray(current) ? current : current ? [current] : [];
        if (!values.includes(grant)) changes[`system.tracos.${field}.value`] = [...values, grant];
    }
    return changes;
}

const pending = new WeakMap<ProficiencyActor, Promise<unknown>>();
export function grantCapangaProficiencies(actor: ProficiencyActor): Promise<unknown> {
    const next = (pending.get(actor) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const changes = capangaProficiencyUpdate(actor);
        if (Object.keys(changes).length) await actor.update(changes);
    });
    pending.set(actor, next);
    void next.finally(() => { if (pending.get(actor) === next) pending.delete(actor); }).catch(() => undefined);
    return next;
}
