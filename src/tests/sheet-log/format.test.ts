import { describe, it, expect } from "vitest";
import {
    flattenLeaves,
    getByPath,
    labelForPath,
    humanizePath,
    shouldSkipPath,
    describeChange,
    diffChanges,
    originPhrase,
} from "@/sheet-log/format";

describe("flattenLeaves", () => {
    it("achata objeto aninhado em dot-paths", () => {
        expect(flattenLeaves({ system: { attributes: { pv: { value: 20 } } } }))
            .toEqual({ "system.attributes.pv.value": 20 });
    });
    it("trata arrays como folha", () => {
        expect(flattenLeaves({ system: { bonus: { total: [1, 2] } } }))
            .toEqual({ "system.bonus.total": [1, 2] });
    });
    it("múltiplas folhas", () => {
        const f = flattenLeaves({ system: { a: 1, b: { c: 2 } }, name: "x" });
        expect(f).toEqual({ "system.a": 1, "system.b.c": 2, name: "x" });
    });
});

describe("getByPath", () => {
    const obj = { system: { attributes: { pv: { value: 25 } } } };
    it("lê caminho existente", () => {
        expect(getByPath(obj, "system.attributes.pv.value")).toBe(25);
    });
    it("retorna undefined em caminho ausente", () => {
        expect(getByPath(obj, "system.attributes.pm.value")).toBeUndefined();
        expect(getByPath(obj, "a.b.c")).toBeUndefined();
    });
});

describe("labelForPath", () => {
    it("mapeia campos conhecidos (com ou sem prefixo system.)", () => {
        expect(labelForPath("system.attributes.pv.value")).toBe("PV");
        expect(labelForPath("attributes.pv.value")).toBe("PV");
        expect(labelForPath("attributes.pm.value")).toBe("PM");
        expect(labelForPath("attributes.pv.temp")).toBe("PV temporário");
        expect(labelForPath("nivel.value")).toBe("Nível");
    });
    it("atributos", () => {
        expect(labelForPath("atributos.for.value")).toBe("Força");
        expect(labelForPath("atributos.des.value")).toBe("Destreza");
    });
    it("moedas", () => {
        expect(labelForPath("dinheiro.to")).toBe("T$ (Ouro)");
        expect(labelForPath("dinheiro.tc")).toBe("T$ (Cobre)");
    });
    it("perícia", () => {
        expect(labelForPath("pericias.luta.value")).toBe("Perícia (luta)");
    });
    it("name → Nome", () => {
        expect(labelForPath("name")).toBe("Nome");
    });
    it("fallback humaniza caminho desconhecido", () => {
        expect(labelForPath("system.detalhes.tendencia")).toBe(humanizePath("detalhes.tendencia"));
    });
});

describe("shouldSkipPath", () => {
    it("pula acumuladores/derivados", () => {
        expect(shouldSkipPath("system.attributes.pm.bonus.total")).toBe(true);
        expect(shouldSkipPath("system.attributes.pv.bonus")).toBe(true);
        expect(shouldSkipPath("_stats.modifiedTime")).toBe(true);
    });
    it("não pula campos reais", () => {
        expect(shouldSkipPath("system.attributes.pv.value")).toBe(false);
        expect(shouldSkipPath("system.dinheiro.to")).toBe(false);
    });
});

describe("describeChange", () => {
    it("delta negativo (dano) com sinal", () => {
        const e = describeChange("system.attributes.pv.value", 25, 20);
        expect(e).not.toBeNull();
        expect(e!.label).toBe("PV");
        expect(e!.delta).toBe(-5);
        expect(e!.detail).toBe("25 → 20 (-5)");
    });
    it("delta positivo (cura) com sinal +", () => {
        const e = describeChange("system.attributes.pv.value", 18, 20);
        expect(e!.detail).toBe("18 → 20 (+2)");
        expect(e!.delta).toBe(2);
    });
    it("no-op retorna null", () => {
        expect(describeChange("system.attributes.pv.value", 20, 20)).toBeNull();
    });
    it("caminho ruído retorna null", () => {
        expect(describeChange("system.attributes.pm.bonus.total", [1], [1, 2])).toBeNull();
    });
    it("valores não-numéricos sem delta", () => {
        const e = describeChange("name", "Drake", "Sir Drake");
        expect(e!.delta).toBeNull();
        expect(e!.detail).toBe("Drake → Sir Drake");
    });
});

describe("diffChanges", () => {
    it("diffa changes contra snapshot, ignorando no-ops e ruído", () => {
        const changes = {
            system: {
                attributes: { pv: { value: 20 }, pm: { bonus: { total: [1, 2] } } },
                dinheiro: { to: 50 },
            },
        };
        const snapshot = {
            "system.attributes.pv.value": 25,
            "system.attributes.pm.bonus.total": [1],
            "system.dinheiro.to": 250,
        };
        const out = diffChanges(changes, snapshot);
        const labels = out.map((e) => e.label).sort();
        expect(labels).toEqual(["PV", "T$ (Ouro)"]);
        const money = out.find((e) => e.label === "T$ (Ouro)")!;
        expect(money.delta).toBe(-200);
    });
});

describe("originPhrase", () => {
    it("sem origem → alteração manual", () => {
        expect(originPhrase()).toBe("alteração manual");
    });
    it("dano com fonte e tipo traduzido", () => {
        expect(originPhrase({ kind: "damage", source: "Esqueleto", type: "perfuracao" }))
            .toBe("dano de Esqueleto (perfuração)");
    });
    it("dano sem tipo", () => {
        expect(originPhrase({ kind: "damage", source: "Goblin" }))
            .toBe("dano de Goblin");
    });
    it("cura", () => {
        expect(originPhrase({ kind: "heal", source: "Clériga" }))
            .toBe("cura de Clériga");
    });
    it("custo de PM", () => {
        expect(originPhrase({ kind: "pm-cost", source: "Bola de Fogo" }))
            .toBe("custo de PM — Bola de Fogo");
    });
});
