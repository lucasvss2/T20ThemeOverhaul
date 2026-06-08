import { describe, it, expect } from "vitest";
import { isManopla, buildUpgradeOptionsHtml } from "@/t20-fixes/manopla-upgrades";

describe("isManopla", () => {
    it("é true para equipamento cujo nome contém 'manopla' (case/acento-insensível)", () => {
        expect(isManopla({ type: "equipamento", name: "Manopla" })).toBe(true);
        expect(isManopla({ type: "equipamento", name: "MANOPLA" })).toBe(true);
        expect(isManopla({ type: "equipamento", name: "Manoplas da Força do Ogro" })).toBe(true);
    });
    it("é false para não-equipamentos ou outros nomes", () => {
        expect(isManopla({ type: "arma", name: "Manopla" })).toBe(false);
        expect(isManopla({ type: "equipamento", name: "Armadura de Couro" })).toBe(false);
        expect(isManopla(null)).toBe(false);
        expect(isManopla(undefined)).toBe(false);
    });
});

describe("buildUpgradeOptionsHtml", () => {
    const id = (s: string) => s; // localizador identidade

    it("começa com a opção em branco e gera uma <option> por upgrade", () => {
        const html = buildUpgradeOptionsHtml(
            { accurate: "Certeira", cruel: "Cruel" }, {}, id,
        );
        expect(html).toBe(
            '<option value="">-</option>' +
            '<option value="accurate">Certeira</option>' +
            '<option value="cruel">Cruel</option>',
        );
    });

    it("inclui tooltip (title) quando há tooltip para a key", () => {
        const html = buildUpgradeOptionsHtml(
            { accurate: "Certeira" }, { accurate: "Aumenta a margem de ameaça" }, id,
        );
        expect(html).toContain('title="Aumenta a margem de ameaça"');
    });

    it("usa o localizador fornecido nos labels e tooltips", () => {
        const dict: Record<string, string> = { "T20.Acc": "Certeira", "T20.AccTip": "Tooltip" };
        const html = buildUpgradeOptionsHtml(
            { accurate: "T20.Acc" }, { accurate: "T20.AccTip" }, (s) => dict[s] ?? s,
        );
        expect(html).toContain(">Certeira<");
        expect(html).toContain('title="Tooltip"');
    });

    it("escapa caracteres HTML perigosos", () => {
        const html = buildUpgradeOptionsHtml({ "x<y": '"a"&b' }, {}, id);
        expect(html).toContain('value="x&lt;y"');
        expect(html).toContain(">&quot;a&quot;&amp;b<");
    });
});
