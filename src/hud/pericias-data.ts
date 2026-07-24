/**
 * Liga as 28 perícias fixas do T20 (`T20_SKILLS`) ao bônus real do ator
 * (`computeSkillTotal` — já corrige o bug de double-counting documentado em
 * `hidden-test/skills.ts`) e ao ícone correspondente (`skill-icons.ts`,
 * mapeado por label PT-BR exato, com fallback pro ícone genérico "Ofício").
 */
import { iconForLabel } from "./skill-icons";
import type { SkillSlotVM } from "./types";
import { computeSkillTotal, T20_SKILLS } from "@/hidden-test/skills";
import { warn } from "@/utils/logging";

const warnedMissingIcon = new Set<string>();

/** Constrói os 28 slots de perícia (view model) para o ator ativo. */
export function buildSkillSlots(actor: FoundryActor): SkillSlotVM[] {
    return T20_SKILLS.map(({ key, label }) => ({
        key,
        label,
        total: computeSkillTotal(actor, key),
        iconSvgDataUri: iconForLabel(label),
    }));
}

/** Ícone para uma perícia de Ofício custom (alfa/alqu/arme/arte/cozi/enge) — sem ícone dedicado. */
export function ofiOficioIcon(label: string): string {
    if (!warnedMissingIcon.has(label)) {
        warnedMissingIcon.add(label);
        warn(`hud: sem ícone dedicado para "${label}" — usando fallback "Ofício".`);
    }
    return iconForLabel("Ofício");
}
