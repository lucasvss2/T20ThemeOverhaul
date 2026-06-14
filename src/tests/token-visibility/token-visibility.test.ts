import { describe, it, expect } from "vitest";
import { canUserSee, readWhitelist, resolveSelection } from "@/token-visibility";

describe("canUserSee", () => {
    it("GM sempre vê conforme o base (não é restringido pela lista)", () => {
        expect(canUserSee(true, ["x"], "gm", true)).toBe(true);
        expect(canUserSee(false, ["x"], "gm", true)).toBe(false); // base false continua false
        expect(canUserSee(true, [], "gm", true)).toBe(true);      // lista vazia não afeta GM
    });
    it("sem lista branca → mantém o base do jogador", () => {
        expect(canUserSee(true, null, "u1", false)).toBe(true);
        expect(canUserSee(false, undefined, "u1", false)).toBe(false);
    });
    it("jogador na lista → vê (se o base permitir)", () => {
        expect(canUserSee(true, ["u1", "u2"], "u1", false)).toBe(true);
        expect(canUserSee(false, ["u1"], "u1", false)).toBe(false); // nunca concede além do base
    });
    it("jogador fora da lista → nunca vê", () => {
        expect(canUserSee(true, ["u2"], "u1", false)).toBe(false);
        expect(canUserSee(true, [], "u1", false)).toBe(false); // lista vazia = ninguém
    });
});

describe("readWhitelist", () => {
    const doc = (v: unknown) => ({ getFlag: (_s: string, _k: string) => v });
    it("retorna o array quando a flag é um array", () => {
        expect(readWhitelist(doc(["a", "b"]))).toEqual(["a", "b"]);
        expect(readWhitelist(doc([]))).toEqual([]);
    });
    it("retorna null quando ausente/invalida", () => {
        expect(readWhitelist(doc(undefined))).toBeNull();
        expect(readWhitelist(doc("x"))).toBeNull();
        expect(readWhitelist(null)).toBeNull();
        expect(readWhitelist({})).toBeNull();
    });
});

describe("resolveSelection", () => {
    const all = ["a", "b", "c"];
    it("todos marcados → clear (remove a restrição)", () => {
        expect(resolveSelection(["a", "b", "c"], all)).toEqual({ clear: true, list: [] });
    });
    it("parcial → lista com os marcados, na ordem de allPlayerIds", () => {
        expect(resolveSelection(["c", "a"], all)).toEqual({ clear: false, list: ["a", "c"] });
    });
    it("nenhum marcado → lista vazia (ninguém vê), não é clear", () => {
        expect(resolveSelection([], all)).toEqual({ clear: false, list: [] });
    });
    it("ids marcados fora de allPlayerIds são ignorados", () => {
        expect(resolveSelection(["a", "zzz"], all)).toEqual({ clear: false, list: ["a"] });
    });
    it("sem jogadores → não é clear", () => {
        expect(resolveSelection([], [])).toEqual({ clear: false, list: [] });
    });
});
