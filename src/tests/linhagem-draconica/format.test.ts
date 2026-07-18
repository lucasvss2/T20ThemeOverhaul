import { describe, it, expect } from "vitest";
import {
    LINHAGEM_ELEMENTS,
    isLinhagemElement,
    linhagemKindOf,
    buildBasicaChanges,
    buildSuperiorChanges,
    buildAprimoradaChanges,
    superiorTempPmForCircle,
    damageMatchesElement,
} from "@/linhagem-draconica/format";

describe("linhagemKindOf", () => {
    it("classifica os 3 poderes pelo nome normalizado", () => {
        expect(linhagemKindOf("linhagem draconica basica")).toBe("basica");
        expect(linhagemKindOf("linhagem draconica aprimorada")).toBe("aprimorada");
        expect(linhagemKindOf("linhagem draconica superior")).toBe("superior");
    });
    it("ignora o item genérico e nomes não relacionados", () => {
        expect(linhagemKindOf("linhagem draconica")).toBeNull();
        expect(linhagemKindOf("heranca draconica")).toBeNull();
        expect(linhagemKindOf("linhagem rubra")).toBeNull();
    });
});

describe("isLinhagemElement", () => {
    it("aceita só os 4 elementos", () => {
        for (const el of LINHAGEM_ELEMENTS) expect(isLinhagemElement(el)).toBe(true);
        expect(isLinhagemElement("luz")).toBe(false);
        expect(isLinhagemElement("trevas")).toBe(false);
        expect(isLinhagemElement(null)).toBe(false);
    });
});

describe("buildBasicaChanges", () => {
    it("+Car nos PV iniciais + RD 5 no elemento", () => {
        const ch = buildBasicaChanges("fogo");
        expect(ch).toEqual([
            { key: "system.attributes.pv.atributos.car", value: "true", mode: 5, priority: 20 },
            { key: "system.tracos.resistencias.fogo.bonus", value: "5", mode: 2, priority: 20 },
        ]);
    });
});

describe("buildSuperiorChanges", () => {
    it("2×Car (atributos.car + bonus.total @car) + imunidade", () => {
        const ch = buildSuperiorChanges("frio");
        expect(ch.map((c) => c.key)).toEqual([
            "system.attributes.pv.atributos.car",
            "system.attributes.pv.bonus.total",
            "system.tracos.resistencias.frio.imunidade",
        ]);
        expect(ch[1]).toMatchObject({ value: "@car", mode: 2 });
        expect(ch[2]).toMatchObject({ value: "true", mode: 5 });
    });
});

describe("buildAprimoradaChanges", () => {
    it("dano:<el> com d*1 (por-dado nativo, mode CUSTOM)", () => {
        expect(buildAprimoradaChanges("acido")).toEqual([
            { key: "dano:acido", value: "d*1", mode: 0, priority: 20 },
        ]);
    });
});

describe("superiorTempPmForCircle", () => {
    it("círculo → PM temp (≥0, inteiro)", () => {
        expect(superiorTempPmForCircle(3)).toBe(3);
        expect(superiorTempPmForCircle(0)).toBe(0);
        expect(superiorTempPmForCircle(-1)).toBe(0);
        expect(superiorTempPmForCircle(NaN)).toBe(0);
    });
});

describe("damageMatchesElement", () => {
    it("casa pelo damageType do modal", () => {
        expect(damageMatchesElement("fogo", "fogo")).toBe(true);
        expect(damageMatchesElement("fogo", "frio")).toBe(false);
    });
    it("fallback pela fórmula [elemento]", () => {
        expect(damageMatchesElement("fogo", null, "6d6[fogo]")).toBe(true);
        expect(damageMatchesElement("fogo", null, "2d8[trevas]")).toBe(false);
        expect(damageMatchesElement("fogo", null, null)).toBe(false);
    });
});
