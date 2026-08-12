import { describe, expect, it } from "vitest";

import { buildCraftedScrollDoc, craftPrice } from "@/pocoes-pergaminhos/craft";

describe("craftPrice", () => {
    it("30 x custo^2, custo mínimo 1", () => {
        expect(craftPrice(1)).toBe(30);
        expect(craftPrice(3)).toBe(270);
        expect(craftPrice(0)).toBe(30); // piso 1
    });
});

describe("buildCraftedScrollDoc", () => {
    it("monta um pergaminho com a flag identificado:true (fabricado pelo próprio conjurador)", () => {
        const doc = buildCraftedScrollDoc({ uuid: "Compendium.x.y.Item.z", name: "Bola de Fogo" }, 3);
        expect(doc["name"]).toBe("Pergaminho de Bola de Fogo");
        expect(doc["type"]).toBe("consumivel");
        const flags = doc["flags"] as Record<string, Record<string, unknown>>;
        const flag = flags["t20-theme-overhaul"]?.["pocaoPergaminho"] as Record<string, unknown>;
        expect(flag).toMatchObject({
            kind: "pergaminho", spellUuid: "Compendium.x.y.Item.z", spellName: "Bola de Fogo",
            custoPM: 3, aprimoramentoName: null, identificado: true,
        });
    });

    it("system.ativacao.custo é 0 — sem cobrar PM de novo ao usar (já pago na fabricação)", () => {
        const doc = buildCraftedScrollDoc({ uuid: "u", name: "Magia" }, 5);
        const system = doc["system"] as Record<string, unknown>;
        const ativacao = system["ativacao"] as Record<string, unknown>;
        expect(ativacao["custo"]).toBe(0);
        expect(system["rolls"]).toEqual([]);
    });

    it("preço reflete o custo efetivo da magia", () => {
        const doc = buildCraftedScrollDoc({ uuid: "u", name: "Magia" }, 3);
        const system = doc["system"] as Record<string, unknown>;
        expect(system["preco"]).toBe(craftPrice(3));
    });
});
