export interface NamedItem { name?: string; type?: string; system?: { niveis?: number | string } }
export interface ClassActor { items?: { contents?: NamedItem[] } }
export interface SneakRoll {
    type?: string;
    name?: string;
    parts?: string[][];
    clone?(data: { parts?: string[][] }): SneakRoll;
    toObject?(source?: boolean): SneakRoll;
}
export interface Analysis {
    casterUuid: string;
    targetUuid: string;
    targetTokenUuid: string;
    targetName: string;
    sceneId: string;
    combatId?: string;
    endsRemaining: number;
    lastTransition?: string;
}
export interface AssassinarPayload { casterUuid: string; effectId: string; targetUuid: string }

export function norm(value?: string): string {
    return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
export function named(value: string | undefined, name: string): boolean {
    const normalized = norm(value);
    return normalized === name || normalized.endsWith(`: ${name}`) || normalized === `${name} (ladino)` || normalized === `${name} (capanga)`;
}
export function isSneakPower(name?: string): boolean { return named(name, "ataque furtivo") || named(name, "ataque furtivo brutal"); }
export function isAnatomicalSneak(name?: string): boolean { return norm(name).includes("conhecimento anatomico"); }
export function isSneakEffect(name?: string): boolean { return isSneakPower(name) || isAnatomicalSneak(name); }
export function capangaLevel(actor?: ClassActor | null): number {
    return Math.min(20, (actor?.items?.contents ?? []).filter(i => i.type === "classe" && named(i.name, "capanga"))
        .reduce((sum, i) => sum + Math.max(0, Number(i.system?.niveis) || 0), 0));
}
export function rogueLevel(actor?: ClassActor | null): number {
    return Math.min(20, (actor?.items?.contents ?? []).filter(i => i.type === "classe" && (named(i.name, "ladino") || named(i.name, "capanga")))
        .reduce((sum, i) => sum + Math.max(0, Number(i.system?.niveis) || 0), 0));
}
export function sneakLevel(actor: ClassActor | null | undefined, powerName?: string): number {
    return named(powerName, "ataque furtivo brutal") ? capangaLevel(actor) : rogueLevel(actor);
}
export function sneakDice(level: number): number { return Math.ceil(Math.max(0, Math.min(20, level)) / 2); }

export function scaleSneakRolls(rolls: SneakRoll[], level: number, faces = 6): SneakRoll[] {
    if (!level) return rolls; // Ameaças com furtivo fixo não recebem nível de personagem.
    return rolls.map(roll => {
        const parts = roll.parts?.map((part, i) =>
            roll.type === "dano" && i === 0 && /^\d+d[68]$/i.test(part[0]) ? [`${sneakDice(level)}d${faces}`, ...part.slice(1)] : [...part],
        );
        // system.rolls contém RollData: EmbeddedDataField exige toObject na ficha.
        // Clonar pelo próprio modelo preserva o schema e deixa a origem intacta.
        return roll.clone ? roll.clone({ parts }) : { ...roll, parts };
    });
}
export function analysisMatches(analysis: Analysis, targetTokenUuid: string, sceneId: string, combatId?: string): boolean {
    return analysis.endsRemaining > 0 && analysis.targetTokenUuid === targetTokenUuid && analysis.sceneId === sceneId
        && (!analysis.combatId || analysis.combatId === combatId);
}
export function advanceAnalysis(analysis: Analysis, endingActorUuid: string, transition: string): Analysis | null {
    if (analysis.casterUuid !== endingActorUuid || analysis.lastTransition === transition) return analysis;
    return analysis.endsRemaining <= 1 ? null : { ...analysis, endsRemaining: analysis.endsRemaining - 1, lastTransition: transition };
}
