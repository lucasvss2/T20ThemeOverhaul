import { describe, it, expect } from "vitest";
import { listConsumables } from "@/coragem-liquida/index";

describe("listConsumables", () => {
    it("lista consumíveis com qtd ≥ 1", () => {
        const items = [
            { id: "a", type: "consumivel", name: "Cerveja Anã", img: "x.png", system: { qtd: 3 } },
            { id: "b", type: "consumivel", name: "Poção Vazia", system: { qtd: 0 } },
            { id: "c", type: "arma", name: "Espada", system: { qtd: 5 } },
            { id: "d", type: "consumivel", name: "Rum", system: { qtd: 1 } },
            { id: null, type: "consumivel", name: "Sem id", system: { qtd: 2 } },
        ];
        const out = listConsumables(items as never);
        expect(out.map((d) => d.id)).toEqual(["a", "d"]);
        expect(out[0]).toMatchObject({ name: "Cerveja Anã", qtd: 3 });
    });
    it("qtd não numérica não entra", () => {
        const out = listConsumables([{ id: "x", type: "consumivel", name: "?", system: { qtd: "muitas" } }] as never);
        expect(out).toEqual([]);
    });
});
