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

/**
 * As 6 variantes de Ofício do T20 (`trainedOnly`, atributo Int) — NÃO estão em
 * `T20_SKILLS` (que são as 28 fixas). Só aparecem na barra quando TREINADAS.
 * Labels default vêm do `CONFIG.T20.pericias[key].label` ("Ofício: Armeiro"),
 * mas o ator pode ter um label custom.
 */
const OFICIO_KEYS = ["alfa", "alqu", "arme", "arte", "cozi", "enge"] as const;

interface OficioPericia { treinado?: boolean; label?: string }

/** Slots das perícias de Ofício TREINADAS do ator (usa o ícone "Ofício" do design). */
export function buildOficioSlots(actor: FoundryActor): SkillSlotVM[] {
    const pericias = actor.system?.pericias as Record<string, OficioPericia> | undefined;
    if (!pericias) return [];
    const cfg = (CONFIG as unknown as { T20?: { pericias?: Record<string, { label?: string }> } }).T20?.pericias ?? {};
    const oficioIcon = iconForLabel("Ofício");
    const slots: SkillSlotVM[] = [];
    for (const key of OFICIO_KEYS) {
        const s = pericias[key];
        if (!s?.treinado) continue;
        const raw = (s.label && s.label.trim()) || cfg[key]?.label || "Ofício";
        // Rótulo compacto pro slot (o ícone já diz que é Ofício): "Ofício: Armeiro" → "Armeiro".
        const label = raw.replace(/^of[ií]cio:\s*/i, "").trim() || "Ofício";
        slots.push({ key, label, total: computeSkillTotal(actor, key), iconSvgDataUri: oficioIcon });
    }
    return slots;
}

/** Constrói os slots de perícia (view model): as 28 fixas + as de Ofício treinadas. */
export function buildSkillSlots(actor: FoundryActor): SkillSlotVM[] {
    const fixed = T20_SKILLS.map(({ key, label }) => ({
        key,
        label,
        total: computeSkillTotal(actor, key),
        iconSvgDataUri: iconForLabel(label),
    }));
    return [...fixed, ...buildOficioSlots(actor)];
}

/** Ícone para uma perícia de Ofício custom (alfa/alqu/arme/arte/cozi/enge) — sem ícone dedicado. */
export function ofiOficioIcon(label: string): string {
    if (!warnedMissingIcon.has(label)) {
        warnedMissingIcon.add(label);
        warn(`hud: sem ícone dedicado para "${label}" — usando fallback "Ofício".`);
    }
    return iconForLabel("Ofício");
}
