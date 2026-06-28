import { describe, it, expect } from "vitest";
import {
    isAcuidadeWeapon, acuidadeActive, swapDanoForToDes, injectAcuidadeDano,
    injectAcuidadeAtaque,
} from "@/t20-fixes/acuidade-arma";

type Roll = Parameters<typeof swapDanoForToDes>[0];
type Item = Parameters<typeof injectAcuidadeDano>[0];

const arma = (empunhadura: string, proposito: string) =>
    ({ type: "arma", system: { empunhadura, proposito } }) as Item;

describe("isAcuidadeWeapon", () => {
    it("arma leve de corpo-a-corpo é elegível", () => {
        expect(isAcuidadeWeapon(arma("leve", "corpo-a-corpo"))).toBe(true);
    });
    it("qualquer arma de arremesso é elegível (mesmo não-leve)", () => {
        expect(isAcuidadeWeapon(arma("uma", "arremesso"))).toBe(true);
        expect(isAcuidadeWeapon(arma("leve", "corpo-a-corpo-arremesso"))).toBe(true);
    });
    it("arma pesada de corpo-a-corpo NÃO é elegível", () => {
        expect(isAcuidadeWeapon(arma("uma", "corpo-a-corpo"))).toBe(false);
        expect(isAcuidadeWeapon(arma("duas", "corpo-a-corpo"))).toBe(false);
    });
    it("arma de disparo NÃO é elegível", () => {
        expect(isAcuidadeWeapon(arma("duas", "disparo"))).toBe(false);
        expect(isAcuidadeWeapon(arma("leve", "disparo"))).toBe(false);
    });
    it("não-armas não são elegíveis", () => {
        expect(isAcuidadeWeapon({ type: "poder", system: { empunhadura: "leve", proposito: "corpo-a-corpo" } } as Item)).toBe(false);
    });
});

describe("acuidadeActive", () => {
    const actor = (acuidade: boolean, des: number, forca: number) => ({
        flags: { tormenta20: { acuidade } },
        system: { atributos: { des: { value: des }, for: { value: forca } } },
    }) as Item["actor"];
    it("ativa com flag + Des > For", () => {
        expect(acuidadeActive(actor(true, 4, 1))).toBe(true);
    });
    it("inativa sem a flag", () => {
        expect(acuidadeActive(actor(false, 4, 1))).toBe(false);
    });
    it("inativa quando Des <= For (não vale a pena, igual ao T20)", () => {
        expect(acuidadeActive(actor(true, 2, 2))).toBe(false);
        expect(acuidadeActive(actor(true, 1, 3))).toBe(false);
    });
    it("inativa para ator nulo", () => {
        expect(acuidadeActive(null)).toBe(false);
    });
});

describe("swapDanoForToDes", () => {
    const roll = (o: { type: string; parts: string[][] }) => o as Roll;
    it("troca @for por @des numa part de dano", () => {
        expect(swapDanoForToDes(roll({ type: "dano", parts: [["1d4", "perfuracao", ""], ["@for", "", ""]] })))
            .toEqual([["1d4", "perfuracao", ""], ["@des", "", ""]]);
    });
    it("retorna null sem @for", () => {
        expect(swapDanoForToDes(roll({ type: "dano", parts: [["1d6", "fogo", ""]] }))).toBeNull();
    });
    it("não mexe em rolls que não são de dano", () => {
        expect(swapDanoForToDes(roll({ type: "ataque", parts: [["@for", "", ""]] }))).toBeNull();
    });
    it("não confunde @for com @forca/@fortuna (word boundary)", () => {
        expect(swapDanoForToDes(roll({ type: "dano", parts: [["@fortuna", "", ""]] }))).toBeNull();
    });
});

describe("injectAcuidadeDano (in-place + restore)", () => {
    const mkItem = (acuidade: boolean, des: number, forca: number) => ({
        type: "arma",
        system: {
            empunhadura: "leve", proposito: "corpo-a-corpo",
            rolls: [
                { type: "ataque", parts: [["1d20", "", ""], ["luta", "", ""], ["0", "", ""]] },
                { type: "dano", parts: [["1d4", "perfuracao", ""], ["@for", "", ""]] },
            ],
        },
        actor: { flags: { tormenta20: { acuidade } }, system: { atributos: { des: { value: des }, for: { value: forca } } } },
    }) as Item;

    const danoParts = (item: Item) => item.system?.rolls?.[1]?.parts;

    it("troca @for→@des no dano quando elegível e restaura depois", () => {
        const item = mkItem(true, 4, 1);
        const restore = injectAcuidadeDano(item);
        expect(danoParts(item)).toEqual([["1d4", "perfuracao", ""], ["@des", "", ""]]);
        restore();
        expect(danoParts(item)).toEqual([["1d4", "perfuracao", ""], ["@for", "", ""]]);
    });

    it("é no-op quando Acuidade inativa (Des <= For)", () => {
        const item = mkItem(true, 1, 3);
        injectAcuidadeDano(item);
        expect(danoParts(item)).toEqual([["1d4", "perfuracao", ""], ["@for", "", ""]]);
    });

    it("é no-op sem a flag", () => {
        const item = mkItem(false, 4, 1);
        injectAcuidadeDano(item);
        expect(danoParts(item)).toEqual([["1d4", "perfuracao", ""], ["@for", "", ""]]);
    });
});

describe("injectAcuidadeAtaque (in-place + restore)", () => {
    const mkItem = (
        opts: { acuidade: boolean; des: number; forca: number; emp?: string; prop?: string; atributo?: string },
    ) => ({
        type: "arma",
        system: {
            empunhadura: opts.emp ?? "leve",
            proposito: opts.prop ?? "corpo-a-corpo",
            rolls: [
                { type: "ataque", parts: [["1d20", "", ""], ["luta", opts.atributo ?? "", ""], ["0", "", ""]] },
                { type: "dano", parts: [["1d4", "perfuracao", ""], ["@for", "", ""]] },
            ],
        },
        actor: { flags: { tormenta20: { acuidade: opts.acuidade } }, system: { atributos: { des: { value: opts.des }, for: { value: opts.forca } } } },
    }) as Parameters<typeof injectAcuidadeAtaque>[0];

    const atkAtr = (item: Parameters<typeof injectAcuidadeAtaque>[0]) =>
        item.system?.rolls?.[0]?.parts?.[1]?.[1];

    it("força atributo 'des' no ataque de arma leve corpo-a-corpo e restaura depois", () => {
        const item = mkItem({ acuidade: true, des: 4, forca: 1 });
        const restore = injectAcuidadeAtaque(item);
        expect(atkAtr(item)).toBe("des");
        restore();
        expect(atkAtr(item)).toBe("");
    });

    it("cobre arma de arremesso (que o T20 não trata no ataque)", () => {
        const item = mkItem({ acuidade: true, des: 4, forca: 1, emp: "uma", prop: "arremesso" });
        injectAcuidadeAtaque(item);
        expect(atkAtr(item)).toBe("des");
    });

    it("sobrescreve atributo explícito 'for' (que o T20 pularia)", () => {
        const item = mkItem({ acuidade: true, des: 4, forca: 1, atributo: "for" });
        const restore = injectAcuidadeAtaque(item);
        expect(atkAtr(item)).toBe("des");
        restore();
        expect(atkAtr(item)).toBe("for");
    });

    it("é no-op se já for 'des'", () => {
        const item = mkItem({ acuidade: true, des: 4, forca: 1, atributo: "des" });
        const restore = injectAcuidadeAtaque(item);
        expect(atkAtr(item)).toBe("des");
        restore();
        expect(atkAtr(item)).toBe("des");
    });

    it("é no-op quando Acuidade inativa (Des <= For)", () => {
        const item = mkItem({ acuidade: true, des: 1, forca: 3 });
        injectAcuidadeAtaque(item);
        expect(atkAtr(item)).toBe("");
    });

    it("é no-op para arma pesada de corpo-a-corpo (não elegível)", () => {
        const item = mkItem({ acuidade: true, des: 4, forca: 1, emp: "uma", prop: "corpo-a-corpo" });
        injectAcuidadeAtaque(item);
        expect(atkAtr(item)).toBe("");
    });
});
