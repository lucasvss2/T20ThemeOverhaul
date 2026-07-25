import { describe, expect, it } from "vitest";

import { applyCustomOrder, computeReorderedKeys } from "@/hud/reorder";

describe("applyCustomOrder", () => {
    it("sem ordem salva → mantém a ordem natural", () => {
        const items = [{ key: "a" }, { key: "b" }, { key: "c" }];
        expect(applyCustomOrder(items, [])).toEqual(items);
    });

    it("aplica a ordem salva", () => {
        const items = [{ key: "a" }, { key: "b" }, { key: "c" }];
        expect(applyCustomOrder(items, ["c", "a", "b"]).map((i) => i.key)).toEqual(["c", "a", "b"]);
    });

    it("itens novos (fora da ordem salva) vão pro final, na ordem natural", () => {
        const items = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
        expect(applyCustomOrder(items, ["c", "a"]).map((i) => i.key)).toEqual(["c", "a", "b", "d"]);
    });

    it("chaves da ordem salva que não existem mais são ignoradas", () => {
        const items = [{ key: "a" }, { key: "b" }];
        expect(applyCustomOrder(items, ["z", "b", "a"]).map((i) => i.key)).toEqual(["b", "a"]);
    });
});

describe("computeReorderedKeys", () => {
    it("move o item arrastado pra logo antes do alvo", () => {
        expect(computeReorderedKeys(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    });
    it("mover pra frente idem", () => {
        expect(computeReorderedKeys(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "a", "c", "d"]);
    });
    it("soltar sobre si mesmo → null (no-op)", () => {
        expect(computeReorderedKeys(["a", "b"], "a", "a")).toBeNull();
    });
    it("chave inexistente → null", () => {
        expect(computeReorderedKeys(["a", "b"], "z", "a")).toBeNull();
        expect(computeReorderedKeys(["a", "b"], "a", "z")).toBeNull();
    });
});
