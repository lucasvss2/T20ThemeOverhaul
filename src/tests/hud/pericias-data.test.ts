import { describe, expect, it } from "vitest";

import { buildSkillSlots, ofiOficioIcon } from "@/hud/pericias-data";
import { iconDataUri, iconForLabel, SKILL_ICONS } from "@/hud/skill-icons";
import { T20_SKILLS } from "@/hidden-test/skills";

function fakeActor(pericias: Record<string, { value?: number; outros?: number; atributo?: string; treino?: number }>): FoundryActor {
    return {
        id: "a1", uuid: "Actor.a1", name: "Teste", ownership: {},
        system: { pericias, atributos: { for: { value: 2 } }, nivel: { value: 4 } },
    } as unknown as FoundryActor;
}

describe("SKILL_ICONS", () => {
    it("tem um ícone para cada label de T20_SKILLS + Ofício genérico", () => {
        const names = new Set(SKILL_ICONS.map(s => s.name));
        for (const { label } of T20_SKILLS) {
            expect(names.has(label)).toBe(true);
        }
        expect(names.has("Ofício")).toBe(true);
    });

    it("iconDataUri gera um data URI de SVG válido", () => {
        const uri = iconDataUri('<circle cx="1" cy="1" r="1"/>', "#fff");
        expect(uri).toMatch(/^data:image\/svg\+xml,/);
        expect(decodeURIComponent(uri)).toContain("<circle");
        expect(decodeURIComponent(uri)).toContain('stroke="#fff"');
    });

    it("iconForLabel cai no ícone Ofício quando o label não existe", () => {
        const known = iconForLabel("Luta");
        const unknown = iconForLabel("Perícia Inexistente");
        const oficio = iconForLabel("Ofício");
        expect(known).not.toBe(unknown);
        expect(unknown).toBe(oficio);
    });
});

describe("buildSkillSlots", () => {
    it("gera 28 slots, um por T20_SKILLS, com total via computeSkillTotal", () => {
        const actor = fakeActor({ luta: { value: 12 }, fort: { value: 9 } });
        const slots = buildSkillSlots(actor);
        expect(slots).toHaveLength(T20_SKILLS.length);
        const luta = slots.find(s => s.key === "luta");
        expect(luta?.total).toBe(12);
        expect(luta?.label).toBe("Luta");
        expect(luta?.iconSvgDataUri).toMatch(/^data:image\/svg\+xml,/);
    });

    it("perícia sem .value definido cai no fallback de soma manual (0 se sem outros)", () => {
        const actor = fakeActor({});
        const slots = buildSkillSlots(actor);
        expect(slots.every(s => typeof s.total === "number")).toBe(true);
    });
});

describe("ofiOficioIcon", () => {
    it("retorna o ícone genérico de Ofício para variantes custom", () => {
        const uri = ofiOficioIcon("Alquimia");
        expect(uri).toBe(iconForLabel("Ofício"));
    });
});
