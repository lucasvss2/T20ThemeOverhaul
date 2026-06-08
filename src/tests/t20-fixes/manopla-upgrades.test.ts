import { describe, it, expect } from "vitest";
import {
    isManopla, buildUpgradeOptionsHtml, isUnarmedWeapon, isManoplaEquipped,
    getManoplaWeaponUpgradeKeys, buildManoplaUpgradeAE,
} from "@/t20-fixes/manopla-upgrades";

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

describe("isUnarmedWeapon", () => {
    it("true para arma cujo nome contém 'desarmado'", () => {
        expect(isUnarmedWeapon({ type: "arma", name: "Ataque desarmado" })).toBe(true);
        expect(isUnarmedWeapon({ type: "arma", name: "ATAQUE DESARMADO" })).toBe(true);
    });
    it("false para outras armas / não-armas", () => {
        expect(isUnarmedWeapon({ type: "arma", name: "Adaga" })).toBe(false);
        expect(isUnarmedWeapon({ type: "equipamento", name: "Ataque desarmado" })).toBe(false);
        expect(isUnarmedWeapon(null)).toBe(false);
    });
});

describe("isManoplaEquipped", () => {
    it("true com equipado legacy (bool/num/string) ou slot > 0", () => {
        expect(isManoplaEquipped({ system: { equipado: true } })).toBe(true);
        expect(isManoplaEquipped({ system: { equipado: 1 } })).toBe(true);
        expect(isManoplaEquipped({ system: { equipado2: { slot: 2 } } })).toBe(true);
    });
    it("false quando não equipado", () => {
        expect(isManoplaEquipped({ system: { equipado: false, equipado2: { slot: 0 } } })).toBe(false);
        expect(isManoplaEquipped({ system: { equipado: "0" } })).toBe(false);
        expect(isManoplaEquipped({ system: {} })).toBe(false);
        expect(isManoplaEquipped(null)).toBe(false);
    });
});

describe("getManoplaWeaponUpgradeKeys", () => {
    const weaponMap = { accurate: {}, precise: {}, cruel: {}, status: {} };
    it("retorna só as keys presentes no mapa de melhorias de arma", () => {
        const ups = { melhoria1: "accurate", melhoria2: "golden", melhoria3: "cruel", melhoria4: "", material: "ruby-steel" };
        expect(getManoplaWeaponUpgradeKeys(ups, weaponMap).sort()).toEqual(["accurate", "cruel"]);
    });
    it("deduplica e ignora 'status' e vazios", () => {
        const ups = { melhoria1: "precise", melhoria2: "precise", melhoria3: "status", melhoria4: "" };
        expect(getManoplaWeaponUpgradeKeys(ups, weaponMap)).toEqual(["precise"]);
    });
    it("vazio sem upgrades", () => {
        expect(getManoplaWeaponUpgradeKeys(undefined, weaponMap)).toEqual([]);
        expect(getManoplaWeaponUpgradeKeys({}, weaponMap)).toEqual([]);
    });
});

describe("buildManoplaUpgradeAE", () => {
    const tpl = {
        name: "T20.WeaponUpgradesAccurate",
        description: "T20.WeaponUpgradesTooltipAccurate",
        changes: [{ key: "ataque", value: "1", mode: 2 }],
        flags: { tormenta20: { onuse: true, self: true, upgrade: "accurate" } },
        transfer: false,
    };
    const L = (s: string) => (s === "T20.WeaponUpgradesAccurate" ? "Certeira" : s);

    it("prefixa 'Manopla — ', preserva changes/flags T20 e marca o flag de limpeza", () => {
        const ae = buildManoplaUpgradeAE("accurate", tpl, "icon.png", "Item.abc", L) as Record<string, unknown>;
        expect(ae.name).toBe("Manopla — Certeira");
        expect(ae.origin).toBe("Item.abc");
        expect(ae.icon).toBe("icon.png");
        expect(ae.changes).toEqual([{ key: "ataque", value: "1", mode: 2 }]);
        const flags = ae.flags as Record<string, Record<string, unknown>>;
        expect(flags.tormenta20).toEqual({ onuse: true, self: true, upgrade: "accurate" });
        expect(flags["aeris-bg3-rolls-t20"]).toEqual({ manoplaUpgrade: "accurate" });
    });
});
