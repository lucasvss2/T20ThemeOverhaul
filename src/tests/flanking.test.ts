import { afterEach, describe, expect, it, vi } from "vitest";
import { flankingConfiguration, hasAttackRoll, setupFlanking } from "@/flanking";

const attack = { system: { rolls: [{ type: "ataque" }, { type: "dano" }] } };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Flanquear no diálogo nativo", () => {
    it.each(["character", "npc", "vehicle"])("oferece para ataques de %s sem exigir classe ou poder", type => {
        expect(hasAttackRoll({ ...attack, actor: { type } } as typeof attack)).toBe(true);
    });
    it("não adiciona flanquear a dano isolado, perícias ou magias sem ataque", () => {
        expect(hasAttackRoll({ system: { rolls: [{ type: "dano" }] } })).toBe(false);
        expect(flankingConfiguration({}, { t20Flanking: true, bonus: "3" })).toEqual({ t20Flanking: true, bonus: "3" });
    });
    it("marcar soma exatamente 2, preservando a expressão manual e os demais efeitos", () => {
        const config = { t20Flanking: true, bonus: "1d4 - 1", bonusdano: "7", aprs: { improved: { aplica: 1 } } };
        expect(flankingConfiguration(attack, config)).toEqual({ ...config, bonus: "(1d4 - 1) + 2" });
        expect(config.bonus).toBe("1d4 - 1");
        expect(flankingConfiguration(attack, { t20Flanking: true, bonus: 0 })?.bonus).toBe("2");
    });
    it("desmarcar ou cancelar não acrescenta bônus", () => {
        const config = { bonus: "3", t20Flanking: false };
        expect(flankingConfiguration(attack, config)).toBe(config);
        expect(flankingConfiguration(attack, null)).toBeNull();
    });
    it("o wrapper preserva a cadeia de diálogos e não se instala duas vezes", async () => {
        const original = vi.fn(async (_item: typeof attack) => ({ t20Flanking: true, bonus: "3" }));
        const dialog = { create: original };
        const once = vi.spyOn(Hooks, "once");
        vi.stubGlobal("game", { tormenta20: { applications: { AbilityUseDialog: dialog } } });
        setupFlanking();
        setupFlanking();
        for (const [, callback] of once.mock.calls) callback();
        expect(await dialog.create(attack)).toEqual({ t20Flanking: true, bonus: "(3) + 2" });
        expect(original).toHaveBeenCalledTimes(1);
    });
});
