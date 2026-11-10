import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Effect = { disabled?: boolean; flags?: { tormenta20?: { onuse?: boolean; skill?: boolean } }; changes?: Array<{ key: string; value?: string }> };
type Document = { _id: string; _key: string; name: string; type: string; img?: string; items?: Document[];
    effects?: Effect[];
    system?: { tracos?: { tamanho: string; resistencias?: Record<string, { bonus: unknown }> }; pericias?: Record<string, unknown>; rolls?: Array<{ type: string; parts: string[][] }> };
    prototypeToken?: { width: number; height: number; texture: { src: string } } };
const root = resolve("packs-src");
const read = (pack: string): Document[] => readdirSync(resolve(root, pack)).filter(f => f.endsWith(".json"))
    .map(file => JSON.parse(readFileSync(resolve(root, pack, file), "utf8")) as Document);
const actors = [...read("ameacas-de-arton"), ...read("ameacas-livro-basico")].filter(d => d.type === "npc");

describe("Criaturas integradas dos compêndios externos", () => {
    it("preserva as 525 fichas e as 83 habilidades como documentos nativos", () => {
        expect(read("ameacas-de-arton").filter(d => d.type === "npc")).toHaveLength(442);
        expect(read("ameacas-livro-basico").filter(d => d.type === "npc")).toHaveLength(83);
        expect(read("habilidades-ameacas").filter(d => !d._key.startsWith("!folders!"))).toHaveLength(83);
        for (const actor of actors) {
            expect(actor._key).toBe("!actors!" + actor._id);
            const items = actor.items ?? [];
            expect(new Set(items.map(i => i._id)).size, actor.name).toBe(items.length);
            expect(items.every(i => i.type !== "script"), actor.name).toBe(true);
            const effects = [...(actor.effects ?? []), ...items.flatMap(i => i.effects ?? [])];
            for (const change of effects.flatMap(e => e.changes ?? [])) {
                const type = change.key.match(/^system\.tracos\.resistencias\.([^.]+)\./)?.[1];
                if (type && !type.includes("?")) expect(Array.isArray(actor.system?.tracos?.resistencias?.[type]?.bonus), actor.name + ": " + change.key).toBe(true);
                expect(change.key, actor.name).not.toContain("system.tracos.resistencias.veneno.");
            }
            for (const item of items) for (const roll of item.system?.rolls ?? []) {
                const skill = roll.parts?.[1]?.[0];
                if (roll.type === "ataque" && skill) expect(actor.system?.pericias?.[skill], actor.name + "/" + item.name).toBeDefined();
            }
        }
    });
    it("inclui os retratos e tokens sem depender de imagens do módulo de origem", () => {
        for (const actor of actors) for (const image of [actor.img, actor.prototypeToken?.texture.src]) {
            expect(image, actor.name).toMatch(/^modules\/t20-theme-overhaul\/assets\/criaturas-integradas\//);
            const file = resolve("public", image!.replace("modules/t20-theme-overhaul/", ""));
            expect(existsSync(file), actor.name + ": " + image).toBe(true);
            expect(readFileSync(file).length, actor.name).toBeGreaterThan(100);
        }
    }, 20000);
    it("usa o tamanho solicitado e remove links quebrados do mundo do autor", () => {
        const sizes: Record<string, number> = { min: 0.25, peq: 1, med: 1, gra: 2, eno: 3, col: 6 };
        for (const actor of actors) {
            const size = sizes[actor.system?.tracos?.tamanho ?? ""];
            expect(actor.prototypeToken?.width, actor.name).toBe(size);
            expect(actor.prototypeToken?.height, actor.name).toBe(size);
            const data = JSON.stringify(actor);
            expect(data, actor.name).not.toMatch(/@UUID\[(?:Actor\.|Item\.|JournalEntry\.|Compendium\.world\.|Compendium\.bestiario-de-arton\.)/);
            expect(data, actor.name).not.toContain("modules/bestiario-de-arton/");
        }
    });
    it("preserva o bônus contra venenos como efeito de teste e a imunidade como categoria", () => {
        for (const id of ["5zMkjxa1nif9hiWk", "9tzwp5CvcIoeYocG"]) {
            const actor = actors.find(a => a._id === id)!;
            const bonus = actor.effects?.find(e => e.changes?.some(c => c.key === "roll" && c.value === "5"));
            expect(bonus, actor.name).toMatchObject({ disabled: true, flags: { tormenta20: { onuse: true, skill: true } } });
        }
        const swarm = actors.find(a => a._id === "g9zOEnYNR7AItlbY")!;
        expect(swarm.effects?.some(e => e.changes?.some(c => c.key === "system.tracos.ic.value" && c.value === "veneno"))).toBe(true);
    });
});
