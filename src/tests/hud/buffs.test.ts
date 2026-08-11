import { describe, expect, it } from "vitest";

import { buildBuffSlots, formatDurationLabel, isVisibleBuff } from "@/hud/buffs";
import { MODULE_ID } from "@/constants";
import type { DurData } from "@/duration-manager/types";

function effect(overrides: Record<string, unknown>): FoundryItemEffect {
    return {
        id: overrides["id"] as string ?? "eff1",
        name: overrides["name"] as string ?? "Efeito",
        disabled: false,
        changes: [],
        flags: {},
        ...overrides,
    } as unknown as FoundryItemEffect;
}

function actorWithEffects(effects: FoundryItemEffect[]): FoundryActor {
    return { effects: { contents: effects } } as unknown as FoundryActor;
}

describe("isVisibleBuff", () => {
    it("esconde desabilitado, suprimido, onuse e transfer", () => {
        expect(isVisibleBuff(effect({ disabled: true, statuses: ["atordoado"] }))).toBe(false);
        expect(isVisibleBuff(effect({ isSuppressed: true, statuses: ["atordoado"] }))).toBe(false);
        expect(isVisibleBuff(effect({ flags: { tormenta20: { onuse: true } } }))).toBe(false);
        expect(isVisibleBuff(effect({ transfer: true, statuses: ["atordoado"] }))).toBe(false);
    });

    it("esconde cópias nativas de traços passivos (sem statuses, sem flag nossa) — achado ao vivo: T20 copia praticamente todo poder/traço de classe pro actor.effects com essa mesma forma", () => {
        expect(isVisibleBuff(effect({ name: "Caminho do Arcanista: Feiticeiro" }))).toBe(false);
        expect(isVisibleBuff(effect({ name: "Aumento de Atributo - Sabedoria" }))).toBe(false);
    });

    it("mostra condições de status mesmo sem flag nossa", () => {
        expect(isVisibleBuff(effect({ statuses: ["atordoado"] }))).toBe(true);
    });

    it("mostra effects que um subsistema nosso tagueou (qualquer flag sob o módulo)", () => {
        expect(isVisibleBuff(effect({ flags: { [MODULE_ID]: { auraSagrada: true } } }))).toBe(true);
    });
});

describe("formatDurationLabel", () => {
    it("undefined sem flag/indeterminado", () => {
        expect(formatDurationLabel(undefined)).toBeUndefined();
        expect(formatDurationLabel({ managed: true, kind: "indeterminate" } as DurData)).toBeUndefined();
    });

    it("rodadas usa remaining, cai pra rounds se ausente", () => {
        expect(formatDurationLabel({ managed: true, kind: "rounds", remaining: 2, rounds: 3 } as DurData)).toBe("2 rodada(s)");
        expect(formatDurationLabel({ managed: true, kind: "rounds", rounds: 3 } as DurData)).toBe("3 rodada(s)");
    });

    it("cena/dia/sustentada têm rótulo fixo", () => {
        expect(formatDurationLabel({ managed: true, kind: "scene" } as DurData)).toBe("até o fim da cena");
        expect(formatDurationLabel({ managed: true, kind: "day" } as DurData)).toBe("até passar 1 dia");
        expect(formatDurationLabel({ managed: true, kind: "sustained" } as DurData)).toBe("sustentada");
    });
});

describe("buildBuffSlots", () => {
    it("filtra os invisíveis e mapeia ícone/nome", () => {
        const dur: DurData = { managed: true, kind: "scene" };
        const actor = actorWithEffects([
            effect({ id: "a", name: "Inspiração (+2)", img: "icons/inspiracao.webp", flags: { [MODULE_ID]: { dur } } }),
            effect({ id: "b", name: "Passiva de item", transfer: true }),
            effect({ id: "c", name: "Onuse", flags: { tormenta20: { onuse: true } } }),
            effect({ id: "d", name: "Traço permanente (cópia nativa T20)" }),
        ]);
        const slots = buildBuffSlots(actor);
        expect(slots).toHaveLength(1);
        expect(slots[0]).toMatchObject({ id: "a", name: "Inspiração (+2)", icon: "icons/inspiracao.webp", isCondition: false });
    });

    it("sem ícone cai no fallback genérico", () => {
        const actor = actorWithEffects([effect({ id: "a", name: "Atordoado", statuses: ["atordoado"] })]);
        expect(buildBuffSlots(actor)[0]!.icon).toBe("icons/svg/aura.svg");
    });

    it("condições vêm antes de buffs (agrupamento visual)", () => {
        const dur: DurData = { managed: true, kind: "scene" };
        const actor = actorWithEffects([
            effect({ id: "buff", name: "Buff", flags: { [MODULE_ID]: { dur } } }),
            effect({ id: "cond", name: "Atordoado", statuses: ["atordoado"] }),
        ]);
        const slots = buildBuffSlots(actor);
        expect(slots.map(s => s.id)).toEqual(["cond", "buff"]);
    });

    it("enriquece o tooltip com a duração do gerenciador quando presente", () => {
        const dur: DurData = { managed: true, kind: "rounds", remaining: 1, rounds: 1 };
        const actor = actorWithEffects([
            effect({ id: "a", name: "Atordoado", statuses: ["atordoado"], flags: { [MODULE_ID]: { dur } } }),
        ]);
        expect(buildBuffSlots(actor)[0]!.durationLabel).toBe("1 rodada(s)");
    });

    it("buff de área (sem dur flag, mas com outra flag nossa) aparece do mesmo jeito", () => {
        const actor = actorWithEffects([
            effect({ id: "a", name: "Aura de Cura", flags: { [MODULE_ID]: { auraSagradaBoost: true } } }),
        ]);
        expect(buildBuffSlots(actor)).toHaveLength(1);
    });
});
