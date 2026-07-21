import { describe, it, expect } from "vitest";
import {
    TERRAINS,
    PATAMARES,
    getTerrain,
    getPatamar,
    findEncounterRow,
    validateTerrains,
    type TerrainDef,
} from "@/encounter-roller/encounter-data";
import { resolveEncounter } from "@/encounter-roller/index";

// ── dataset integrity ─────────────────────────────────────────────────────────

describe("TERRAINS data", () => {
    it("tem 18 terrenos com ids únicos", () => {
        expect(TERRAINS.length).toBe(18);
        const ids = TERRAINS.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const core of ["aquatico", "deserto", "floresta", "urbano", "subterraneo"]) {
            expect(ids).toContain(core);
        }
    });

    it("cada terreno tem 28 faixas cobrindo 1..201+ sem buracos", () => {
        expect(validateTerrains()).toEqual([]);
        for (const t of TERRAINS) {
            expect(t.rows.length).toBe(28);
            expect(t.rows[0].min).toBe(1);
            expect(t.rows[t.rows.length - 1].max).toBeNull();  // 201+
        }
    });

    it("504 encontros no total, nenhum vazio", () => {
        let count = 0;
        for (const t of TERRAINS) for (const r of t.rows) {
            expect(r.encounter.trim().length).toBeGreaterThan(0);
            count++;
        }
        expect(count).toBe(18 * 28);
    });
});

// ── patamares ─────────────────────────────────────────────────────────────────

describe("PATAMARES", () => {
    it("Iniciante/Veterano/Campeão/Lenda com +0/+30/+70/+110", () => {
        expect(getPatamar("iniciante")?.mod).toBe(0);
        expect(getPatamar("veterano")?.mod).toBe(30);
        expect(getPatamar("campeao")?.mod).toBe(70);
        expect(getPatamar("lenda")?.mod).toBe(110);
        expect(PATAMARES.length).toBe(4);
    });
});

// ── findEncounterRow ──────────────────────────────────────────────────────────

describe("findEncounterRow", () => {
    const aq = getTerrain("aquatico")!;

    it("acha a faixa contendo o total (bordas inclusivas)", () => {
        expect(findEncounterRow(aq, 1)?.label).toBe("1-2");
        expect(findEncounterRow(aq, 2)?.label).toBe("1-2");
        expect(findEncounterRow(aq, 3)?.label).toBe("3-6");
        expect(findEncounterRow(aq, 100)?.label).toBe("99-100");
    });

    it("faixa aberta 201+ pega qualquer total ≥ 201", () => {
        expect(findEncounterRow(aq, 201)?.label).toBe("201+");
        expect(findEncounterRow(aq, 999)?.label).toBe("201+");
    });

    it("total < 1 não casa nenhuma faixa", () => {
        expect(findEncounterRow(aq, 0)).toBeNull();
    });
});

// ── resolveEncounter (patamar shift + Rhandomm) ───────────────────────────────

describe("resolveEncounter", () => {
    const aq = getTerrain("aquatico")!;
    const inic = getPatamar("iniciante")!;
    const veterano = getPatamar("veterano")!;
    const lenda = getPatamar("lenda")!;

    it("Iniciante: d100 puro resolve a faixa", async () => {
        const out = (await resolveEncounter(aq, inic, 1))!;
        expect(out.total).toBe(1);
        expect(out.rangeLabel).toBe("1-2");
        expect(out.encounter).toContain("hynne");
    });

    it("Veterano: soma +30 ao d100 (10 → 40 → faixa 36-40)", async () => {
        const out = (await resolveEncounter(aq, veterano, 10))!;
        expect(out.total).toBe(40);
        expect(out.rangeLabel).toBe("36-40");
    });

    it("Lenda: 100 natural + 1d4=1 vira Rhandomm", async () => {
        const out = (await resolveEncounter(aq, lenda, 100, 1))!;
        expect(out.rhandomm).toBe(true);
        expect(out.encounter).toContain("Rhandomm");
        expect(out.total).toBe(210); // 100 + 110 → faixa 201+
        expect(out.rangeLabel).toBe("201+");
    });

    it("Lenda: 100 natural mas 1d4≠1 mantém o encontro da tabela", async () => {
        const out = (await resolveEncounter(aq, lenda, 100, 3))!;
        expect(out.rhandomm).toBe(false);
        expect(out.encounter).not.toContain("Rhandomm");
    });

    it("Rhandomm NÃO ocorre fora do patamar Lenda (Veterano, 100 nat)", async () => {
        const out = (await resolveEncounter(aq, veterano, 100, 1))!;
        expect(out.rhandomm).toBe(false);
    });
});

// ── validateTerrains ──────────────────────────────────────────────────────────

describe("validateTerrains", () => {
    const mk = (rows: TerrainDef["rows"]): TerrainDef => ({ id: "x", label: "X", rows });

    it("aceita uma partição contígua 1..201+", () => {
        const rows = [
            { min: 1, max: 100, label: "1-100", encounter: "a" },
            { min: 101, max: null, label: "101+", encounter: "b" },
        ];
        // 2 faixas não passa na regra de 28, mas cobertura contígua ok:
        const out = validateTerrains([mk(rows)]);
        expect(out.some(p => /esperado 28/.test(p))).toBe(true);
        expect(out.some(p => /buraco|sobreposi/i.test(p))).toBe(false);
    });

    it("acusa buraco na cobertura", () => {
        const rows = [
            { min: 1, max: 40, label: "1-40", encounter: "a" },
            { min: 50, max: null, label: "50+", encounter: "b" },
        ];
        expect(validateTerrains([mk(rows)]).some(p => /buraco|sobreposi/i.test(p))).toBe(true);
    });

    it("acusa encontro vazio", () => {
        const rows = [{ min: 1, max: null, label: "1+", encounter: "  " }];
        expect(validateTerrains([mk(rows)]).some(p => /vazio/i.test(p))).toBe(true);
    });
});
