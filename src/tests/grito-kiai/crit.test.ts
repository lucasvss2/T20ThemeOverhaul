import { describe, it, expect } from "vitest";
import {
    computeEffectiveCriticoX,
    computeEffectiveCriticoM,
    getKeptD20Natural,
    getBonusDie,
    getBonusDieMax,
} from "@/grito-kiai/index";

// ── Fakes ─────────────────────────────────────────────────────────────────────

type Change = { key: string; value: string; mode: number };
type FakeAE = { name: string; changes: Change[] };

const aeActor = (effects: FakeAE[]) =>
    ({ effects: { contents: effects } } as unknown as FoundryActor);

const aeWeapon = (effects: FakeAE[]) =>
    ({ effects: { contents: effects } } as unknown as FoundryItem);

/** Build a fake message with onUseEffects descriptions and an optional itemData flag. */
const fakeMsg = (descriptions: string[], itemData?: { criticoM?: number }) =>
    ({
        flags: { tormenta20: { onUseEffects: descriptions.map((d) => ({ description: d })) } },
        getFlag: (scope: string, key: string) =>
            scope === "tormenta20" && key === "itemData" ? (itemData ?? null) : undefined,
    } as unknown as ChatMessage);

// ── computeEffectiveCriticoX ───────────────────────────────────────────────────

describe("computeEffectiveCriticoX", () => {
    it("returns the base when no AEs are selected", () => {
        expect(computeEffectiveCriticoX(fakeMsg([]), aeActor([]), 2)).toBe(2);
    });

    it("returns the base when actor is null", () => {
        expect(computeEffectiveCriticoX(fakeMsg(["X"]), null, 2)).toBe(2);
    });

    it("adds an ADD-mode criticoX delta from a selected actor AE", () => {
        const actor = aeActor([{ name: "Ataque Preciso", changes: [{ key: "criticoX", value: "1", mode: 2 }] }]);
        expect(computeEffectiveCriticoX(fakeMsg(["Ataque Preciso"]), actor, 2)).toBe(3);
    });

    it("ignores AEs that were not selected in this roll", () => {
        const actor = aeActor([{ name: "Ataque Preciso", changes: [{ key: "criticoX", value: "1", mode: 2 }] }]);
        expect(computeEffectiveCriticoX(fakeMsg(["Outra Coisa"]), actor, 2)).toBe(2);
    });

    it("ignores non-ADD modes and non-criticoX keys", () => {
        const actor = aeActor([{
            name: "X",
            changes: [
                { key: "criticoX", value: "5", mode: 0 /* CUSTOM */ },
                { key: "dano", value: "2", mode: 2 },
            ],
        }]);
        expect(computeEffectiveCriticoX(fakeMsg(["X"]), actor, 2)).toBe(2);
    });
});

// ── computeEffectiveCriticoM ───────────────────────────────────────────────────

describe("computeEffectiveCriticoM", () => {
    it("defaults the base threshold to 20 when itemData has no criticoM", () => {
        expect(computeEffectiveCriticoM(fakeMsg([]), null, null)).toBe(20);
    });

    it("uses itemData.criticoM as the base (permanent upgrades like Precisa)", () => {
        expect(computeEffectiveCriticoM(fakeMsg([], { criticoM: 19 }), null, null)).toBe(19);
    });

    it("subtracts a selected actor AE criticoM delta (exact name match)", () => {
        // Ataque Preciso lowers the threshold (e.g. -2): 20 → 18
        const actor = aeActor([{ name: "Ataque Preciso", changes: [{ key: "criticoM", value: "-2", mode: 2 }] }]);
        expect(computeEffectiveCriticoM(fakeMsg(["Ataque Preciso"], { criticoM: 20 }), actor, null)).toBe(18);
    });

    it("applies a weapon AE delta matched by ' - AEName' substring", () => {
        const weapon = aeWeapon([{ name: "Medalhão Afiado", changes: [{ key: "criticoM", value: "-1", mode: 2 }] }]);
        const msg = fakeMsg(["Espada Longa - Medalhão Afiado"], { criticoM: 19 });
        expect(computeEffectiveCriticoM(msg, null, weapon)).toBe(18);
    });

    it("stacks actor and weapon deltas onto the base", () => {
        const actor = aeActor([{ name: "Ataque Preciso", changes: [{ key: "criticoM", value: "-2", mode: 2 }] }]);
        const weapon = aeWeapon([{ name: "Medalhão Afiado", changes: [{ key: "criticoM", value: "-1", mode: 2 }] }]);
        const msg = fakeMsg(["Ataque Preciso", "X - Medalhão Afiado"], { criticoM: 20 });
        expect(computeEffectiveCriticoM(msg, actor, weapon)).toBe(17);
    });

    it("ignores a weapon AE when no description carries its ' - name' suffix", () => {
        const weapon = aeWeapon([{ name: "Medalhão Afiado", changes: [{ key: "criticoM", value: "-1", mode: 2 }] }]);
        expect(computeEffectiveCriticoM(fakeMsg(["Medalhão Afiado"], { criticoM: 20 }), null, weapon)).toBe(20);
    });

    // ── self:true weapon AEs (auto-aplicadas) — caso Manopla "Precisa" ──────────
    const selfWeapon = (effects: Array<FakeAE & { self?: boolean; onuse?: boolean }>) =>
        ({ effects: { contents: effects.map(e => ({ ...e, flags: { tormenta20: { self: e.self ?? true, onuse: e.onuse ?? true } } })) } } as unknown as FoundryItem);

    /** Mensagem SEM onUseEffects (caso típico do ataque desarmado). */
    const msgNoOnUse = (itemData?: { criticoM?: number }) =>
        ({
            flags: { tormenta20: {} },
            getFlag: (s: string, k: string) => (s === "tormenta20" && k === "itemData" ? (itemData ?? null) : undefined),
        } as unknown as ChatMessage);

    it("conta AE de arma self:true (Manopla — Precisa) mesmo SEM onUseEffects", () => {
        const weapon = selfWeapon([{ name: "Manopla — Precisa", changes: [{ key: "criticoM", value: "-1", mode: 2 }] }]);
        expect(computeEffectiveCriticoM(msgNoOnUse({ criticoM: 20 }), null, weapon)).toBe(19);
    });

    it("conta AE de arma self:true mesmo com onUseEffects presente (e sem duplicar)", () => {
        const weapon = selfWeapon([{ name: "Manopla — Precisa", changes: [{ key: "criticoM", value: "-1", mode: 2 }] }]);
        // a descrição até casaria o ramo de seleção, mas o AE já foi contado uma vez via self:true
        const msg = fakeMsg(["X - Manopla — Precisa"], { criticoM: 20 });
        expect(computeEffectiveCriticoM(msg, null, weapon)).toBe(19);
    });

    it("NÃO conta AE de arma onuse SEM self quando não selecionado em onUseEffects", () => {
        const weapon = selfWeapon([{ name: "Opcional", self: false, onuse: true, changes: [{ key: "criticoM", value: "-1", mode: 2 }] }]);
        expect(computeEffectiveCriticoM(msgNoOnUse({ criticoM: 20 }), null, weapon)).toBe(20);
    });
});

// ── getKeptD20Natural ──────────────────────────────────────────────────────────

const d20Roll = (results: Array<{ result: number; active?: boolean; discarded?: boolean }>) =>
    ({ dice: [{ faces: 20, results }] } as unknown as Roll);

describe("getKeptD20Natural", () => {
    it("returns the only result for a plain 1d20", () => {
        expect(getKeptD20Natural(d20Roll([{ result: 14 }]))).toBe(14);
    });

    it("returns the kept (active, non-discarded) die in a 2d20kh advantage roll", () => {
        const roll = d20Roll([
            { result: 8, active: false, discarded: true },
            { result: 17, active: true, discarded: false },
        ]);
        expect(getKeptD20Natural(roll)).toBe(17);
    });

    it("does NOT just return results[0] when results[0] was discarded", () => {
        const roll = d20Roll([
            { result: 3, discarded: true, active: false },
            { result: 19, discarded: false, active: true },
        ]);
        expect(getKeptD20Natural(roll)).toBe(19);
    });

    it("returns 0 when there is no d20 in the roll", () => {
        expect(getKeptD20Natural({ dice: [{ faces: 6, results: [{ result: 4 }] }] } as unknown as Roll)).toBe(0);
    });
});

// ── getBonusDie / getBonusDieMax (Samurai level scaling) ──────────────────────

describe("getBonusDie", () => {
    it.each([
        [1, "1d4"], [4, "1d4"],
        [5, "1d6"], [8, "1d6"],
        [9, "1d8"], [12, "1d8"],
        [13, "1d10"], [16, "1d10"],
        [17, "1d12"], [20, "1d12"],
    ])("level %i → %s", (level, die) => {
        expect(getBonusDie(level)).toBe(die);
    });
});

describe("getBonusDieMax", () => {
    it("returns the face value of the die", () => {
        expect(getBonusDieMax("1d12")).toBe(12);
        expect(getBonusDieMax("1d6")).toBe(6);
    });
    it("defaults to 4 for an unparseable die", () => {
        expect(getBonusDieMax("garbage")).toBe(4);
    });
});
