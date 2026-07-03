import { describe, it, expect, beforeAll } from "vitest";
import {
    countOtherTormentaPowers, computeDamageSteps, steppedWeaponDie, buildAberrantWeaponData,
    getActorWeaponProficiencies, isProficientWith, isTormentaPower, tormentaPowerWeight,
} from "@/armamento-aberrante/index";
import { ABERRANT_WEAPONS } from "@/armamento-aberrante/weapons";

// passosDano do T20 (3 trilhas) — necessário para steppedWeaponDie.
beforeAll(() => {
    (globalThis as unknown as { CONFIG: { T20: { passosDano: string[][] } } }).CONFIG = {
        T20: {
            passosDano: [
                ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "1d12", "3d6", "4d6", "4d8", "4d10", "4d12"],
                ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "3d8", "4d8", "4d10", "4d12"],
                ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "2d10", "3d10", "4d10", "4d12"],
            ],
        },
    };
});

const mkPower = (name: string, subtipo?: string, desc?: string, type = "poder") =>
    ({ type, name, system: { subtipo, description: { value: desc } } });

describe("isTormentaPower + tormentaPowerWeight (cláusula)", () => {
    it("detecta por subtipo Tormenta", () => {
        expect(isTormentaPower(mkPower("Olhos Vermelhos", "Tormenta"))).toBe(true);
    });
    it("detecta pela cláusula na descrição (sem subtipo Tormenta)", () => {
        const cour = mkPower("Couraça Rubra", "Kaijin", "<p>Você recebe RD 2. Sua couraça <b>conta como um poder da Tormenta</b>, exceto para perda de Carisma.</p>");
        const disf = mkPower("Disforme", "Kaijin", "<p>Esta habilidade conta como um poder da Tormenta, exceto para perda de Carisma.</p>");
        const linh = mkPower("Linhagem Rubra", "Arcanista", "<p>Esta herança conta como um poder da Tormenta.</p>");
        expect(isTormentaPower(cour)).toBe(true);
        expect(isTormentaPower(disf)).toBe(true);
        expect(isTormentaPower(linh)).toBe(true);
        expect(tormentaPowerWeight(cour)).toBe(1);
    });
    it("Deformidade (Lefou) pesa 2", () => {
        const def = mkPower("Deformidade", "Lefou", "<p>+2 em duas perícias. Cada um desses bônus conta como um poder da Tormenta.</p>");
        expect(isTormentaPower(def)).toBe(true);
        expect(tormentaPowerWeight(def)).toBe(2);
    });
    it("não conta poderes sem subtipo nem cláusula", () => {
        expect(isTormentaPower(mkPower("Ataque Poderoso", "Combate", "<p>+2 de dano.</p>"))).toBe(false);
        expect(tormentaPowerWeight(mkPower("Ataque Poderoso", "Combate", "<p>+2 de dano.</p>"))).toBe(0);
    });
    it("o próprio Armamento Aberrante pesa 0 (não conta a si mesmo)", () => {
        expect(tormentaPowerWeight(mkPower("Armamento Aberrante", "Tormenta"))).toBe(0);
    });
});

describe("countOtherTormentaPowers", () => {
    const mk = (name: string, subtipo?: string, type = "poder") => ({ type, name, system: { subtipo } });
    it("conta poderes subtipo Tormenta, excluindo o próprio Armamento Aberrante", () => {
        const items = [
            mk("Armamento Aberrante", "Tormenta"),
            mk("Afinidade com a Tormenta", "Tormenta"),
            mk("Olhos Vermelhos", "Tormenta"),
            mk("Desprezar a Realidade", "Tormenta"),
            mk("Ataque Poderoso", "Combate"), // não Tormenta
            mk("Adaga", undefined, "arma"),    // não poder
        ];
        expect(countOtherTormentaPowers(items)).toBe(3);
    });
    it("soma poderes por cláusula + Deformidade(2)", () => {
        const items = [
            mkPower("Armamento Aberrante", "Tormenta"),
            mkPower("Olhos Vermelhos", "Tormenta"),
            mkPower("Couraça Rubra", "Kaijin", "<p>conta como um poder da Tormenta</p>"),
            mkPower("Deformidade", "Lefou", "<p>Cada um desses bônus conta como um poder da Tormenta.</p>"),
        ];
        expect(countOtherTormentaPowers(items)).toBe(4); // 1 (Olhos) + 1 (Couraça) + 2 (Deformidade)
    });
    it("é 0 quando só tem o próprio poder", () => {
        expect(countOtherTormentaPowers([mk("Armamento Aberrante", "Tormenta")])).toBe(0);
    });
});

describe("computeDamageSteps", () => {
    it("1 passo para cada 2 outros poderes (floor)", () => {
        expect(computeDamageSteps(0)).toBe(0);
        expect(computeDamageSteps(1)).toBe(0);
        expect(computeDamageSteps(2)).toBe(1);
        expect(computeDamageSteps(3)).toBe(1); // caso Lancry
        expect(computeDamageSteps(4)).toBe(2);
        expect(computeDamageSteps(7)).toBe(3);
    });
});

describe("steppedWeaponDie", () => {
    it("sobe o dado N passos na tabela do T20", () => {
        expect(steppedWeaponDie("1d8", 1)).toBe("1d10"); // Maça → 1d10
        expect(steppedWeaponDie("1d6", 2)).toBe("1d10");
        expect(steppedWeaponDie("1d4", 0)).toBe("1d4");  // sem passo
    });
    it("no-op para dado vazio (Rede/Desmontador)", () => {
        expect(steppedWeaponDie("", 2)).toBe("");
    });
});

describe("buildAberrantWeaponData", () => {
    it("crava o dano stepado no roll de dano + a flag da cena", () => {
        const maca = ABERRANT_WEAPONS.find(w => w.name === "Maça")!;
        const data = buildAberrantWeaponData(maca, 1, "scene123", 999) as {
            name: string; type: string;
            system: { proficiencia: string; rolls: Array<{ type: string; parts: string[][] }> };
            flags: Record<string, Record<string, { sceneId: string; steps: number }>>;
        };
        expect(data.type).toBe("arma");
        expect(data.name).toContain("Maça");
        const dano = data.system.rolls.find(r => r.type === "dano")!;
        expect(dano.parts[0][0]).toBe("1d10");     // 1d8 +1 passo
        expect(dano.parts[0][1]).toBe("impacto");  // tipoDano
        expect(dano.parts[1][0]).toBe("@for");     // atributo de dano
        const atk = data.system.rolls.find(r => r.type === "ataque")!;
        expect(atk.parts[1][0]).toBe("luta");
        expect(data.flags["t20-theme-overhaul"].armamentoAberrante.sceneId).toBe("scene123");
        expect(data.flags["t20-theme-overhaul"].armamentoAberrante.steps).toBe(1);
    });
    it("não adiciona parte de atributo quando a arma não tem (danoAttr vazio)", () => {
        const w = ABERRANT_WEAPONS.find(x => x.name === "Besta leve")!; // danoAttr ""
        const data = buildAberrantWeaponData(w, 0, null, 0) as {
            system: { rolls: Array<{ type: string; parts: string[][] }> };
        };
        const dano = data.system.rolls.find(r => r.type === "dano")!;
        expect(dano.parts.length).toBe(1); // só o dado, sem @attr
    });
});

describe("getActorWeaponProficiencies + isProficientWith", () => {
    const w = (name: string) => ABERRANT_WEAPONS.find(x => x.name === name)!;

    it("filtra por categoria (Everton: simples+marcial)", () => {
        const prof = getActorWeaponProficiencies({ system: { tracos: { profArmas: { value: ["marcial", "simples"] } } } });
        expect(prof.known).toBe(true);
        expect(isProficientWith(w("Adaga"), prof)).toBe(true);      // simples
        expect(isProficientWith(w("Katana"), prof)).toBe(false);    // exótica
        expect(isProficientWith(w("Pistola"), prof)).toBe(false);   // fogo
        expect(isProficientWith(w("Alabarda"), prof)).toBe(true);   // marcial
    });

    it("inclui armas de fogo/exóticas quando o personagem tem a categoria", () => {
        const prof = getActorWeaponProficiencies({ system: { tracos: { profArmas: { value: ["exotica", "fogo"] } } } });
        expect(isProficientWith(w("Katana"), prof)).toBe(true);
        expect(isProficientWith(w("Mosquete"), prof)).toBe(true);
        expect(isProficientWith(w("Adaga"), prof)).toBe(false);
    });

    it("honra proficiências específicas no campo custom (por nome)", () => {
        const prof = getActorWeaponProficiencies({ system: { tracos: { profArmas: { value: [], custom: "Katana; Rapieira" } } } });
        expect(prof.known).toBe(true);
        expect(isProficientWith(w("Katana"), prof)).toBe(true);
        expect(isProficientWith(w("Rapieira"), prof)).toBe(true);
        expect(isProficientWith(w("Adaga"), prof)).toBe(false);
    });

    it("ficha SEM proficiência registrada → known=false → não esconde nada (fallback)", () => {
        const prof = getActorWeaponProficiencies({ system: { tracos: { profArmas: { value: [] } } } }); // caso Lancry
        expect(prof.known).toBe(false);
        expect(isProficientWith(w("Katana"), prof)).toBe(true);
        expect(isProficientWith(w("Bacamarte"), prof)).toBe(true);
    });
});

describe("ABERRANT_WEAPONS", () => {
    it("tem as 100 armas da lista", () => {
        expect(ABERRANT_WEAPONS.length).toBe(100);
    });
    it("inclui as armas adicionadas dos suplementos", () => {
        const names = new Set(ABERRANT_WEAPONS.map(w => w.name));
        expect(names.has("Maça de guerra")).toBe(true);
        expect(names.has("Cajado de batalha")).toBe(true);
        expect(names.has("Machado de Lenha")).toBe(true);
        expect(names.has("Pistola Tambor")).toBe(true);
    });
    it("todas têm categoria de proficiência válida", () => {
        const valid = new Set(["simples", "marcial", "exotica", "fogo"]);
        expect(ABERRANT_WEAPONS.every(w => valid.has(w.prof))).toBe(true);
    });
});
