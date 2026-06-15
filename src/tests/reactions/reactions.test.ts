import { describe, it, expect } from "vitest";
import {
    DEFENSE_REACTIONS,
    POSTDAMAGE_REACTIONS,
    COUNTER_REACTIONS,
    ONMISS_COUNTER_REACTIONS,
    CONTEST_REACTIONS,
    REROLL_REACTIONS,
    normalizeName,
    canBlock,
    reactionAvailable,
    getBlockingDefenseReactions,
    getPostDamageReactions,
    getCounterReactions,
    getMissCounterReactions,
    getContestReactions,
    getRerollReactions,
    getMagicReactions,
    MAGIC_REACTIONS,
    reduceDamage,
    hasPresenca,
    presencaCD,
    presencaNegates,
    presencaAlreadyUsedThisScene,
    actorHasShieldEquipped,
    actorHasActiveEffectNamed,
    splitAmigoProtetor,
    getAmigoProtetorOption,
    getMissDebuffReactions,
    MISS_DEBUFF_REACTIONS,
    getEvasaoLevel,
    applyEvasao,
} from "@/reactions";

describe("DEFENSE_REACTIONS registry", () => {
    it("contém as 3 magias confirmadas com custos corretos", () => {
        expect(DEFENSE_REACTIONS["armadura arcana"]).toMatchObject({ bonus: 5, pm: 2 });
        expect(DEFENSE_REACTIONS["escudo da fe"]).toMatchObject({ bonus: 2, pm: 1 });
        expect(DEFENSE_REACTIONS["salto dimensional"]).toMatchObject({ bonus: 5, pm: 5, reflex: 5, moveM: 1.5 });
    });
    it("chaves são normalizadas (sem acento)", () => {
        expect(normalizeName("Escudo da Fé")).toBe("escudo da fe");
        expect(normalizeName("Salto Dimensional")).toBe("salto dimensional");
    });
});

describe("canBlock", () => {
    it("bloqueia quando o ataque acerta mas o bônus o transforma em erro", () => {
        // ataque 24, Defesa 20, +5 → 25 > 24 → bloqueia (exemplo do usuário)
        expect(canBlock(24, 20, 5)).toBe(true);
    });
    it("não bloqueia se o bônus é insuficiente", () => {
        expect(canBlock(30, 20, 5)).toBe(false); // 25 ainda < 30
        expect(canBlock(25, 20, 5)).toBe(false); // exatamente igual = ainda acerta
    });
    it("não oferece se o ataque já erraria (não acerta a Defesa base)", () => {
        expect(canBlock(19, 20, 5)).toBe(false);
    });
    it("+2 (Escudo da Fé) bloqueia margem de 2", () => {
        expect(canBlock(21, 20, 2)).toBe(true);
        expect(canBlock(22, 20, 2)).toBe(false);
    });
});

describe("reactionAvailable", () => {
    it("fora de combate (sem round): sempre disponível", () => {
        expect(reactionAvailable("qualquer", null)).toBe(true);
    });
    it("disponível se ainda não usou nesta rodada", () => {
        expect(reactionAvailable("c1:2", "c1:3")).toBe(true);
        expect(reactionAvailable(undefined, "c1:3")).toBe(true);
    });
    it("indisponível se já reagiu nesta rodada", () => {
        expect(reactionAvailable("c1:3", "c1:3")).toBe(false);
    });
});

describe("getBlockingDefenseReactions", () => {
    const makeActor = (opts: { pm: number; spells: string[]; usedRound?: unknown }) => ({
        system: { attributes: { pm: { value: opts.pm } } },
        items: opts.spells.map((name, i) => ({ type: "magia", name, id: `i${i}` })),
        getFlag: (_s: string, _k: string) => opts.usedRound,
    });

    it("oferece a reação que conhece, pode pagar e que bloqueia", () => {
        const actor = makeActor({ pm: 10, spells: ["Armadura Arcana"] });
        const out = getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" });
        expect(out.map((r) => r.key)).toEqual(["armadura arcana"]);
        expect(out[0]).toMatchObject({ bonus: 5, pm: 2, label: "Armadura Arcana" });
    });

    it("não oferece se PM insuficiente", () => {
        const actor = makeActor({ pm: 1, spells: ["Armadura Arcana"] }); // custa 2
        expect(getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("não oferece se o bônus não bloqueia (ataque muito alto)", () => {
        const actor = makeActor({ pm: 10, spells: ["Escudo da Fé"] }); // +2
        expect(getBlockingDefenseReactions({ actor, attackTotal: 30, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("não oferece se já reagiu nesta rodada", () => {
        const actor = makeActor({ pm: 10, spells: ["Armadura Arcana"], usedRound: "c1:1" });
        expect(getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("ignora magias que não estão no registro", () => {
        const actor = makeActor({ pm: 10, spells: ["Bola de Fogo", "Curar Ferimentos"] });
        expect(getBlockingDefenseReactions({ actor, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
    });

    it("ordena pela mais barata e dedup por magia", () => {
        const actor = makeActor({ pm: 10, spells: ["Armadura Arcana", "Escudo da Fé", "Armadura Arcana"] });
        const out = getBlockingDefenseReactions({ actor, attackTotal: 21, defesa: 20, currentRoundKey: "c1:1" });
        // ataque 21 vs 20: Escudo (+2→22) bloqueia, Armadura (+5→25) bloqueia. Mais barata primeiro = Escudo (1 PM)
        expect(out.map((r) => r.key)).toEqual(["escudo da fe", "armadura arcana"]);
    });
});

describe("POSTDAMAGE_REACTIONS registry", () => {
    it("contém as reações pós-dano com mecânica correta", () => {
        expect(POSTDAMAGE_REACTIONS["rolamento defensivo"]).toMatchObject({ kind: "half", pm: 2, status: "caido" });
        expect(POSTDAMAGE_REACTIONS["duro na queda"]).toMatchObject({ kind: "flat", pm: 1, flat: 5 });
        expect(POSTDAMAGE_REACTIONS["forca dos penhascos"]).toMatchObject({ kind: "flat-per-pm", perPmAmount: 10, maxPmAttr: "sab" });
        expect(POSTDAMAGE_REACTIONS["intimidar a morte"]).toMatchObject({ kind: "roll-reduce", pm: 2, rollSkill: "inti" });
        expect(POSTDAMAGE_REACTIONS["sacrificar servo"]).toMatchObject({ kind: "to-zero", pm: 0 });
        expect(POSTDAMAGE_REACTIONS["heroi da realidade"]).toMatchObject({ kind: "half", pm: 5 });
    });
});

describe("reduceDamage", () => {
    it("half arredonda para baixo", () => {
        expect(reduceDamage("half", 21)).toBe(10);
        expect(reduceDamage("half", 20)).toBe(10);
    });
    it("flat subtrai e nunca fica negativo", () => {
        expect(reduceDamage("flat", 12, { flat: 5 })).toBe(7);
        expect(reduceDamage("flat", 3, { flat: 5 })).toBe(0);
    });
    it("to-zero anula", () => {
        expect(reduceDamage("to-zero", 99)).toBe(0);
    });
    it("flat-per-pm reduz 10 por PM gasto", () => {
        expect(reduceDamage("flat-per-pm", 25, { perPmAmount: 10, pmSpent: 2 })).toBe(5);
        expect(reduceDamage("flat-per-pm", 25, { perPmAmount: 10, pmSpent: 3 })).toBe(0);
    });
    it("roll-reduce subtrai o resultado da rolagem", () => {
        expect(reduceDamage("roll-reduce", 18, { rolled: 11 })).toBe(7);
        expect(reduceDamage("roll-reduce", 8, { rolled: 20 })).toBe(0);
    });
});

describe("getPostDamageReactions", () => {
    const makeActor = (opts: { pm: number; powers: string[]; usedRound?: unknown }) => ({
        system: { attributes: { pm: { value: opts.pm } } },
        items: opts.powers.map((name, i) => ({ type: "poder", name, id: `p${i}` })),
        getFlag: (_s: string, _k: string) => opts.usedRound,
    });

    it("lista poderes pós-dano que conhece e pode pagar", () => {
        const actor = makeActor({ pm: 10, powers: ["Rolamento Defensivo", "Duro na Queda"] });
        const out = getPostDamageReactions({ actor, currentRoundKey: "c1:1" });
        expect(out.map((r) => r.key).sort()).toEqual(["duro na queda", "rolamento defensivo"]);
    });
    it("Força dos Penhascos aparece com pelo menos 1 PM (custo variável)", () => {
        const actor = makeActor({ pm: 1, powers: ["Força dos Penhascos"] });
        expect(getPostDamageReactions({ actor, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["forca dos penhascos"]);
    });
    it("não lista se PM insuficiente para o custo fixo", () => {
        const actor = makeActor({ pm: 1, powers: ["Rolamento Defensivo"] }); // custa 2
        expect(getPostDamageReactions({ actor, currentRoundKey: "c1:1" })).toEqual([]);
    });
    it("não lista se já reagiu na rodada", () => {
        const actor = makeActor({ pm: 10, powers: ["Rolamento Defensivo"], usedRound: "c1:1" });
        expect(getPostDamageReactions({ actor, currentRoundKey: "c1:1" })).toEqual([]);
    });
    it("ignora poderes fora do registro", () => {
        const actor = makeActor({ pm: 10, powers: ["Ataque Reflexo", "Especialista"] });
        expect(getPostDamageReactions({ actor, currentRoundKey: "c1:1" })).toEqual([]);
    });
    it("inclui magias pós-dano (Instante Estoico, Campo de Força)", () => {
        const actor = {
            system: { attributes: { pm: { value: 10 } } },
            items: [{ type: "magia", name: "Instante Estoico", id: "m0" }, { type: "magia", name: "Campo de Força", id: "m1" }],
            getFlag: () => undefined,
        };
        const out = getPostDamageReactions({ actor, currentRoundKey: "c1:1" });
        expect(out.map((r) => r.key).sort()).toEqual(["campo de forca", "instante estoico"]);
    });
});

describe("registries novas (contra-ataque / aparar / rerolar)", () => {
    it("COUNTER tem Revide e Arma Espiritual", () => {
        expect(COUNTER_REACTIONS["revide"]).toMatchObject({ pm: 2, kind: "melee-attack" });
        expect(COUNTER_REACTIONS["arma espiritual"]).toMatchObject({ kind: "fixed-damage", damage: "2d6" });
    });
    it("CONTEST tem Aparar", () => {
        expect(CONTEST_REACTIONS["aparar"]).toMatchObject({ pm: 1 });
    });
    it("REROLL: Reparar Injustiça mantém pior, Premonição aceita novo", () => {
        expect(REROLL_REACTIONS["reparar injustica"]).toMatchObject({ pm: 2, keepWorst: true });
        expect(REROLL_REACTIONS["premonicao"]).toMatchObject({ keepWorst: false });
    });
    it("POSTDAMAGE: Bloqueio Brutal usa roll-weapon", () => {
        expect(POSTDAMAGE_REACTIONS["bloqueio brutal"]).toMatchObject({ kind: "roll-weapon", pm: 2 });
        expect(POSTDAMAGE_REACTIONS["instante estoico"]).toMatchObject({ kind: "flat", flat: 10 });
        expect(POSTDAMAGE_REACTIONS["campo de forca"]).toMatchObject({ kind: "flat", flat: 30 });
    });

    const actor = (pm: number, items: Array<{ type: string; name: string }>, used?: unknown) => ({
        system: { attributes: { pm: { value: pm } } },
        items: items.map((it, i) => ({ ...it, id: `x${i}` })),
        getFlag: () => used,
    });

    it("getCounterReactions lista contra-ataques conhecidos e pagáveis", () => {
        const a = actor(5, [{ type: "poder", name: "Revide" }, { type: "magia", name: "Arma Espiritual" }]);
        expect(getCounterReactions({ actor: a, currentRoundKey: "c1:1" }).map((r) => r.key).sort())
            .toEqual(["arma espiritual", "revide"]);
    });
    it("Contra-Ataque é on-miss: aparece em getMissCounterReactions, não em getCounterReactions", () => {
        const a = actor(5, [{ type: "poder", name: "Contra-Ataque" }]);
        expect(getCounterReactions({ actor: a, currentRoundKey: "c1:1" })).toEqual([]);
        expect(getMissCounterReactions({ actor: a, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["contra-ataque"]);
        expect(ONMISS_COUNTER_REACTIONS["contra-ataque"]).toMatchObject({ pm: 2, kind: "melee-attack" });
    });
    it("Revide (on-hit) não aparece como contra-ataque no erro", () => {
        const a = actor(5, [{ type: "poder", name: "Revide" }]);
        expect(getMissCounterReactions({ actor: a, currentRoundKey: "c1:1" })).toEqual([]);
    });
    it("getContestReactions só quando o ataque acerta", () => {
        const a = actor(5, [{ type: "poder", name: "Aparar" }]);
        expect(getContestReactions({ actor: a, attackTotal: 22, defesa: 18, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["aparar"]);
        expect(getContestReactions({ actor: a, attackTotal: 15, defesa: 18, currentRoundKey: "c1:1" })).toEqual([]);
    });
    it("getRerollReactions respeita PM (Premonição custa 13)", () => {
        const a = actor(5, [{ type: "poder", name: "Reparar Injustiça" }, { type: "magia", name: "Premonição" }]);
        // só Reparar Injustiça (2 PM) cabe em 5 PM
        expect(getRerollReactions({ actor: a, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["reparar injustica"]);
    });
    it("nenhuma reação se já usou a reação da rodada", () => {
        const a = actor(20, [{ type: "poder", name: "Revide" }, { type: "poder", name: "Aparar" }], "c1:1");
        expect(getCounterReactions({ actor: a, currentRoundKey: "c1:1" })).toEqual([]);
        expect(getContestReactions({ actor: a, attackTotal: 22, defesa: 18, currentRoundKey: "c1:1" })).toEqual([]);
    });
});

describe("getMagicReactions (reações contra magia)", () => {
    const actor = (pm: number, items: Array<{ type: string; name: string }>, used?: unknown) => ({
        system: { attributes: { pm: { value: pm } } },
        items: items.map((it, i) => ({ ...it, id: `m${i}` })),
        getFlag: () => used,
    });
    it("registro tem as 5 reações contra magia com kinds corretos", () => {
        expect(MAGIC_REACTIONS["alterar destino"]).toMatchObject({ kind: "reroll", rerollBonus: 10, pm: 15 });
        expect(MAGIC_REACTIONS["premonicao"]).toMatchObject({ kind: "reroll", pm: 10 });
        expect(MAGIC_REACTIONS["heroi da realidade"]).toMatchObject({ kind: "reroll", pm: 5 });
        expect(MAGIC_REACTIONS["aparar magia"]).toMatchObject({ kind: "aparar", pm: 2 });
        expect(MAGIC_REACTIONS["refletir magia"]).toMatchObject({ kind: "reflect", pm: 6 });
    });
    it("ao FALHAR: oferece reroll + aparar, não reflexão", () => {
        const a = actor(20, [{ type: "magia", name: "Alterar Destino" }, { type: "poder", name: "Aparar Magia" }, { type: "poder", name: "Refletir Magia" }]);
        expect(getMagicReactions({ actor: a, passed: false, currentRoundKey: "c1:1" }).map((r) => r.key).sort())
            .toEqual(["alterar destino", "aparar magia"]);
    });
    it("ao PASSAR: oferece só Refletir Magia", () => {
        const a = actor(20, [{ type: "magia", name: "Alterar Destino" }, { type: "poder", name: "Refletir Magia" }]);
        expect(getMagicReactions({ actor: a, passed: true, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["refletir magia"]);
    });
    it("respeita PM (Alterar Destino custa 15)", () => {
        const a = actor(5, [{ type: "magia", name: "Alterar Destino" }, { type: "poder", name: "Aparar Magia" }]);
        expect(getMagicReactions({ actor: a, passed: false, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["aparar magia"]);
    });
    it("nenhuma se já reagiu na rodada", () => {
        const a = actor(20, [{ type: "poder", name: "Aparar Magia" }], "c1:1");
        expect(getMagicReactions({ actor: a, passed: false, currentRoundKey: "c1:1" })).toEqual([]);
    });
});

describe("reduceDamage roll-weapon", () => {
    it("subtrai a rolagem de arma", () => {
        expect(reduceDamage("roll-weapon", 18, { rolled: 7 })).toBe(11);
        expect(reduceDamage("roll-weapon", 5, { rolled: 9 })).toBe(0);
    });
});

describe("Presença Aristocrática", () => {
    it("hasPresenca detecta o poder (com prefixo/acento)", () => {
        expect(hasPresenca(["Presença Aristocrática"])).toBe(true);
        expect(hasPresenca(["presenca aristocratica"])).toBe(true);
        expect(hasPresenca(["Bênção: Presença Aristocrática"])).toBe(true);
        expect(hasPresenca(["Aura Sagrada", "Revide"])).toBe(false);
        expect(hasPresenca([])).toBe(false);
    });
    it("presencaCD = 10 + ½ nível + Carisma", () => {
        expect(presencaCD(0, 3)).toBe(13);
        expect(presencaCD(10, 4)).toBe(19);
        expect(presencaCD(7, 2)).toBe(15); // 10 + 3 + 2
    });
    it("presencaNegates quando o atacante FALHA na Vontade (total < CD)", () => {
        expect(presencaNegates(12, 15)).toBe(true);
        expect(presencaNegates(15, 15)).toBe(false); // empate passa
        expect(presencaNegates(20, 15)).toBe(false);
    });
    it("presencaAlreadyUsedThisScene compara mapa por chave+cena", () => {
        const map = { "tokenA": "scene1" };
        expect(presencaAlreadyUsedThisScene(map, "tokenA", "scene1")).toBe(true);
        expect(presencaAlreadyUsedThisScene(map, "tokenA", "scene2")).toBe(false);
        expect(presencaAlreadyUsedThisScene(map, "tokenB", "scene1")).toBe(false);
        expect(presencaAlreadyUsedThisScene(undefined, "tokenA", "scene1")).toBe(false);
    });
});

describe("Bloqueio Divino / Gingado Elusivo (defesa condicional)", () => {
    const baseActor = (opts: { pm: number; powers: string[]; equip?: any[]; effects?: string[]; usedRound?: unknown }) => ({
        system: { attributes: { pm: { value: opts.pm } } },
        items: [
            ...opts.powers.map((name, i) => ({ type: "poder", name, id: `p${i}` })),
            ...(opts.equip ?? []),
        ],
        effects: (opts.effects ?? []).map((name) => ({ name, disabled: false })),
        getFlag: (_s: string, _k: string) => opts.usedRound,
    });
    const escudo = { type: "equipamento", name: "Escudo de Aço", id: "e1", system: { equipado: true, tipo: "escudo" } };

    it("registro tem Bloqueio Divino (+5, escudo) e Gingado (+5, Dança Marcial)", () => {
        expect(DEFENSE_REACTIONS["bloqueio divino"]).toMatchObject({ bonus: 5, pm: 2, itemType: "poder", requiresShield: true });
        expect(DEFENSE_REACTIONS["gingado elusivo"]).toMatchObject({ bonus: 5, pm: 2, requiresDancaMarcial: true, reflex: 5 });
    });

    it("actorHasShieldEquipped detecta escudo equipado", () => {
        expect(actorHasShieldEquipped(baseActor({ pm: 5, powers: [], equip: [escudo] }) as any)).toBe(true);
        expect(actorHasShieldEquipped(baseActor({ pm: 5, powers: [], equip: [{ type: "equipamento", name: "Adaga", system: { equipado: true, tipo: "arma" } }] }) as any)).toBe(false);
    });

    it("actorHasActiveEffectNamed acha Dança Marcial ativa (e ignora desabilitada)", () => {
        expect(actorHasActiveEffectNamed(baseActor({ pm: 5, powers: [], effects: ["Dança Marcial"] }) as any, "danca marcial")).toBe(true);
        const off = { system: { attributes: { pm: { value: 5 } } }, items: [], effects: [{ name: "Dança Marcial", disabled: true }] };
        expect(actorHasActiveEffectNamed(off as any, "danca marcial")).toBe(false);
    });

    it("Bloqueio Divino só aparece com escudo equipado", () => {
        const semEscudo = baseActor({ pm: 10, powers: ["Bloqueio Divino"] });
        expect(getBlockingDefenseReactions({ actor: semEscudo as any, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
        const comEscudo = baseActor({ pm: 10, powers: ["Bloqueio Divino"], equip: [escudo] });
        const out = getBlockingDefenseReactions({ actor: comEscudo as any, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" });
        expect(out.map((r) => r.key)).toEqual(["bloqueio divino"]);
    });

    it("Gingado Elusivo só aparece sob efeito de Dança Marcial", () => {
        const semDanca = baseActor({ pm: 10, powers: ["Gingado Elusivo"] });
        expect(getBlockingDefenseReactions({ actor: semDanca as any, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" })).toEqual([]);
        const comDanca = baseActor({ pm: 10, powers: ["Gingado Elusivo"], effects: ["Dança Marcial"] });
        const out = getBlockingDefenseReactions({ actor: comDanca as any, attackTotal: 24, defesa: 20, currentRoundKey: "c1:1" });
        expect(out.map((r) => r.key)).toEqual(["gingado elusivo"]);
    });
});

describe("Rilhar os Dentes (flat-attr)", () => {
    it("registro: RD = 5 + Con, 1 PM, corpo a corpo", () => {
        expect(POSTDAMAGE_REACTIONS["rilhar os dentes"]).toMatchObject({ kind: "flat-attr", pm: 1, flatBase: 5, flatAttr: "con" });
    });
    it("reduceDamage flat-attr usa o flat calculado", () => {
        expect(reduceDamage("flat-attr", 18, { flat: 9 })).toBe(9);   // 5 + Con 4 = 9
        expect(reduceDamage("flat-attr", 6, { flat: 9 })).toBe(0);
    });
});

describe("Amigo Protetor", () => {
    it("splitAmigoProtetor divide metade/metade (resto ao aliado)", () => {
        expect(splitAmigoProtetor(10)).toEqual({ toHolder: 5, toAlly: 5 });
        expect(splitAmigoProtetor(7)).toEqual({ toHolder: 3, toAlly: 4 });
        expect(splitAmigoProtetor(0)).toEqual({ toHolder: 0, toAlly: 0 });
    });
    const mk = (pm: number, powers: string[], used?: unknown) => ({
        system: { attributes: { pm: { value: pm } } },
        items: powers.map((name, i) => ({ type: "poder", name, id: `p${i}` })),
        getFlag: () => used,
    });
    it("getAmigoProtetorOption requer o poder, ≥2 PM e reação disponível", () => {
        expect(getAmigoProtetorOption({ actor: mk(5, ["Amigo Protetor"]) as any, currentRoundKey: "c1:1" })).toEqual({ pm: 2 });
        expect(getAmigoProtetorOption({ actor: mk(1, ["Amigo Protetor"]) as any, currentRoundKey: "c1:1" })).toBeNull();
        expect(getAmigoProtetorOption({ actor: mk(5, ["Revide"]) as any, currentRoundKey: "c1:1" })).toBeNull();
        expect(getAmigoProtetorOption({ actor: mk(5, ["Amigo Protetor"], "c1:1") as any, currentRoundKey: "c1:1" })).toBeNull();
    });
});

describe("Bloqueio Desconcertante (miss-debuff)", () => {
    it("registro: Desprevenido, 1 PM", () => {
        expect(MISS_DEBUFF_REACTIONS["bloqueio desconcertante"]).toMatchObject({ pm: 1, status: "desprevenido" });
    });
    const mk = (pm: number, powers: string[], used?: unknown) => ({
        system: { attributes: { pm: { value: pm } } },
        items: powers.map((name, i) => ({ type: "poder", name, id: `p${i}` })),
        getFlag: () => used,
    });
    it("getMissDebuffReactions lista quando conhece e pode pagar", () => {
        expect(getMissDebuffReactions({ actor: mk(5, ["Bloqueio Desconcertante"]) as any, currentRoundKey: "c1:1" }).map((r) => r.key)).toEqual(["bloqueio desconcertante"]);
        expect(getMissDebuffReactions({ actor: mk(0, ["Bloqueio Desconcertante"]) as any, currentRoundKey: "c1:1" })).toEqual([]);
    });
});

describe("Futuro Melhor (magic bonus)", () => {
    it("registro: magia, 1 PM, kind bonus +2", () => {
        expect(MAGIC_REACTIONS["futuro melhor"]).toMatchObject({ pm: 1, kind: "bonus", bonus: 2 });
    });
    it("getMagicReactions oferece Futuro Melhor só quando FALHOU", () => {
        const actor = { system: { attributes: { pm: { value: 5 } } }, items: [{ type: "magia", name: "Futuro Melhor", id: "m0" }], getFlag: () => undefined } as any;
        const onFail = getMagicReactions({ actor, passed: false, currentRoundKey: "c1:1" }).map((r) => r.key);
        const onPass = getMagicReactions({ actor, passed: true, currentRoundKey: "c1:1" }).map((r) => r.key);
        expect(onFail).toContain("futuro melhor");
        expect(onPass).not.toContain("futuro melhor");
    });
});

describe("Evasão / Evasão Aprimorada", () => {
    const mk = (powers: string[], effects: string[] = []) => ({
        system: { attributes: { pm: { value: 5 } } },
        items: powers.map((name, i) => ({ type: "poder", name, id: `p${i}` })),
        effects: effects.map((name) => ({ name, disabled: false })),
        getFlag: () => undefined,
    });
    it("getEvasaoLevel detecta nível (aprimorada vence) e variantes do Ladino", () => {
        expect(getEvasaoLevel(mk(["Evasão"]) as any)).toBe("evasao");
        expect(getEvasaoLevel(mk(["Evasão (Ladino)"]) as any)).toBe("evasao");
        expect(getEvasaoLevel(mk(["Evasão", "Evasão Aprimorada"]) as any)).toBe("aprimorada");
        expect(getEvasaoLevel(mk(["Evasão Aprimorada (Ladino)"]) as any)).toBe("aprimorada");
        expect(getEvasaoLevel(mk(["Bola de Fogo"]) as any)).toBe("none");
    });
    it("anulada quando Imóvel (exige liberdade de movimento)", () => {
        expect(getEvasaoLevel(mk(["Evasão Aprimorada"], ["Imóvel"]) as any)).toBe("none");
    });
    it("applyEvasao: sem Evasão = comportamento padrão (metade/cheio)", () => {
        expect(applyEvasao("none", true, 20, 10)).toBe(10);
        expect(applyEvasao("none", false, 20, 10)).toBe(20);
    });
    it("applyEvasao: Evasão → passou 0, falhou cheio", () => {
        expect(applyEvasao("evasao", true, 20, 10)).toBe(0);
        expect(applyEvasao("evasao", false, 20, 10)).toBe(20);
    });
    it("applyEvasao: Aprimorada → passou 0, falhou metade", () => {
        expect(applyEvasao("aprimorada", true, 20, 10)).toBe(0);
        expect(applyEvasao("aprimorada", false, 20, 10)).toBe(10);
    });
});
