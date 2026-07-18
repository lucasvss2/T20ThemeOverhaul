import { describe, it, expect } from "vitest";
import {
    normalizeName,
    getActorWeaponProfs,
    getActorArmorProfs,
    isUnarmedOrNatural,
    isWeaponProficient,
    armorTipoToProf,
    hasNonProficientArmorEquipped,
    broadenArmorPenaltyToStrDexSkills,
} from "@/t20-fixes/proficiencia";

type Item = Parameters<typeof isWeaponProficient>[1];
type Actor = Parameters<typeof isWeaponProficient>[0];

const character = (weaponProfs: string[], armorProfs: string[], equipamento: unknown[] = []) =>
    ({
        type: "character",
        system: {
            tracos: {
                profArmas: { value: weaponProfs },
                profArmaduras: { value: armorProfs },
            },
        },
        itemTypes: { equipamento },
    }) as unknown as Actor;

const weapon = (proficiencia: string, name = "Espada longa") =>
    ({ type: "arma", name, system: { proficiencia } }) as unknown as Item;

describe("getActor*Profs", () => {
    it("lê arrays de proficiência do ator", () => {
        const a = character(["simples", "marcial"], ["lev"]);
        expect(getActorWeaponProfs(a)).toEqual(new Set(["simples", "marcial"]));
        expect(getActorArmorProfs(a)).toEqual(new Set(["lev"]));
    });
    it("aceita valor único (não-array) e vazio", () => {
        const a = { system: { tracos: { profArmas: { value: "simples" } } } } as unknown as Actor;
        expect(getActorWeaponProfs(a)).toEqual(new Set(["simples"]));
        expect(getActorArmorProfs(a)).toEqual(new Set());
    });
});

describe("isUnarmedOrNatural", () => {
    it("arma natural", () => {
        expect(isUnarmedOrNatural(weapon("natural", "Garras"))).toBe(true);
    });
    it("ataque desarmado por nome (com acento/maiúsculas)", () => {
        expect(isUnarmedOrNatural(weapon("simples", "Ataque Desarmado"))).toBe(true);
    });
    it("arma comum não é desarmada/natural", () => {
        expect(isUnarmedOrNatural(weapon("marcial", "Espada longa"))).toBe(false);
    });
});

describe("isWeaponProficient", () => {
    it("personagem proficiente na categoria → true", () => {
        expect(isWeaponProficient(character(["marcial"], []), weapon("marcial"))).toBe(true);
    });
    it("personagem SEM a categoria → false (penalidade aplica)", () => {
        expect(isWeaponProficient(character(["simples"], []), weapon("marcial"))).toBe(false);
    });
    it("desarmado/natural sempre proficiente, mesmo sem categoria", () => {
        expect(isWeaponProficient(character([], []), weapon("simples", "Ataque desarmado"))).toBe(true);
        expect(isWeaponProficient(character([], []), weapon("natural", "Mordida"))).toBe(true);
    });
    it("NPC nunca recebe penalidade", () => {
        const npc = { type: "npc", system: { tracos: {} } } as unknown as Actor;
        expect(isWeaponProficient(npc, weapon("exotica"))).toBe(true);
    });
    it("item não-arma não é penalizado", () => {
        expect(isWeaponProficient(character([], []), { type: "poder", system: {} } as unknown as Item)).toBe(true);
    });
    it("proficiência desconhecida (vazia) não penaliza", () => {
        expect(isWeaponProficient(character([], []), weapon(""))).toBe(true);
    });
});

describe("isWeaponProficient — custom e overrides por poder", () => {
    const withCustom = (custom: string, powers: string[] = []) => {
        const a = character(["simples", "marcial"], []) as unknown as {
            system: { tracos: { profArmas: { value: string[]; custom?: string } } };
            items?: { contents: Array<{ type: string; name: string }> };
        };
        a.system.tracos.profArmas.custom = custom;
        a.items = { contents: powers.map((name) => ({ type: "poder", name })) };
        return a as unknown as Actor;
    };

    it("profArmas.custom com o nome da arma → proficiente", () => {
        expect(isWeaponProficient(withCustom("Katana; Chicote"), weapon("exotica", "Katana"))).toBe(true);
        expect(isWeaponProficient(withCustom("Katana"), weapon("exotica", "Chicote"))).toBe(false);
    });
    it("Arquearia Élfica → qualquer arco vira proficiente (caso Lancry)", () => {
        const lancry = withCustom("", ["Arquearia Élfica"]);
        expect(isWeaponProficient(lancry, weapon("exotica", "Arco de Guerra"))).toBe(true);
        expect(isWeaponProficient(lancry, weapon("exotica", "Katana"))).toBe(false);
    });
    it("sem o poder, arco exótico continua não-proficiente", () => {
        expect(isWeaponProficient(withCustom("", []), weapon("exotica", "Arco de Guerra"))).toBe(false);
    });
});

describe("armorTipoToProf", () => {
    it("mapeia tipos de armadura para códigos de proficiência", () => {
        expect(armorTipoToProf("leve")).toBe("lev");
        expect(armorTipoToProf("pesada")).toBe("pes");
        expect(armorTipoToProf("escudo")).toBe("esc");
    });
    it("traje/acessórios não exigem proficiência", () => {
        expect(armorTipoToProf("traje")).toBeNull();
        expect(armorTipoToProf(undefined)).toBeNull();
    });
});

describe("hasNonProficientArmorEquipped", () => {
    const armorItem = (tipo: string, equipado: boolean) =>
        ({ type: "equipamento", system: { tipo, equipado } });

    it("armadura pesada equipada sem proficiência → true", () => {
        const a = character(["simples"], ["lev"], [armorItem("pesada", true)]);
        expect(hasNonProficientArmorEquipped(a)).toBe(true);
    });
    it("armadura leve equipada COM proficiência → false", () => {
        const a = character(["simples"], ["lev"], [armorItem("leve", true)]);
        expect(hasNonProficientArmorEquipped(a)).toBe(false);
    });
    it("escudo sem proficiência mas NÃO equipado → false", () => {
        const a = character(["simples"], ["lev"], [armorItem("escudo", false)]);
        expect(hasNonProficientArmorEquipped(a)).toBe(false);
    });
    it("traje sem proficiência → false (não exige)", () => {
        const a = character(["simples"], [], [armorItem("traje", true)]);
        expect(hasNonProficientArmorEquipped(a)).toBe(false);
    });
    it("NPC nunca é afetado", () => {
        const npc = { type: "npc", itemTypes: { equipamento: [armorItem("pesada", true)] }, system: { tracos: {} } } as unknown as Actor;
        expect(hasNonProficientArmorEquipped(npc)).toBe(false);
    });
});

describe("broadenArmorPenaltyToStrDexSkills", () => {
    it("marca pda em perícias For/Des ainda não marcadas e ignora as demais", () => {
        const pericias = {
            atle: { atributo: "for", pda: false },
            furt: { atributo: "des", pda: true },  // já marcada — preservada
            ladi: { atributo: "des", pda: false },
            cura: { atributo: "sab", pda: false },  // não For/Des — intocada
            refl: { atributo: "des", pda: false },
        };
        const changed = broadenArmorPenaltyToStrDexSkills(pericias);
        expect(changed.sort()).toEqual(["atle", "ladi", "refl"]);
        expect(pericias.atle.pda).toBe(true);
        expect(pericias.ladi.pda).toBe(true);
        expect(pericias.refl.pda).toBe(true);
        expect(pericias.furt.pda).toBe(true);   // permanece
        expect(pericias.cura.pda).toBe(false);  // intocada
    });
    it("não quebra com pericias indefinidas", () => {
        expect(broadenArmorPenaltyToStrDexSkills(undefined)).toEqual([]);
    });
});

describe("normalizeName", () => {
    it("remove acentos e caixa", () => {
        expect(normalizeName("Ataque Desarmado")).toBe("ataque desarmado");
        expect(normalizeName("AÇBULD")).toBe("acbuld");
    });
});
