import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackDocument {
    _id: string;
    _key: string;
    name: string;
    type: string;
    folder: string | null;
    img?: string;
    prototypeToken?: { texture: { src: string } };
    system?: {
        atributos?: Record<string, number>;
        atributosDinamicos?: { value: string[] };
        attributes?: { nd: string; pv: { max: number } };
        detalhes?: { role: string };
        grants?: Array<{ choices: Array<{ uuid: string }> }>;
        rolls?: Array<{ type: string; parts: string[][] }>;
    };
    items?: PackDocument[];
}

function readPack(name: string): PackDocument[] {
    const directory = new URL(`../../packs-src/${name}/`, import.meta.url);
    return readdirSync(directory).filter(file => file.endsWith(".json")).map(file =>
        JSON.parse(readFileSync(new URL(file, directory), "utf8")) as PackDocument
    );
}

describe("Bestiário de Arton compendiums", () => {
    it("includes the five playable races and only grants their mandatory powers", () => {
        const pack = readPack("racas-bestiario");
        const races = pack.filter(doc => doc.type === "race");
        const powers = new Map(pack.filter(doc => doc.type === "poder").map(doc => [doc._id, doc.name]));

        expect(races.map(doc => doc.name).sort()).toEqual(["Elfo-do-Gelo", "Lâmia", "Manotauro", "Salamandra", "Vampiro"].sort());
        for (const race of races) {
            const choices = race.system?.grants?.flatMap(grant => grant.choices) ?? [];
            expect(choices.length).toBeGreaterThan(0);
            for (const choice of choices) {
                const id = choice.uuid.match(/^Compendium\.t20-theme-overhaul\.racas-bestiario\.Item\.([a-z0-9]{16})$/)?.[1];
                expect(id && powers.get(id)).toBeTruthy();
            }
        }

        const salamandra = races.find(doc => doc.name === "Salamandra");
        const vampiro = races.find(doc => doc.name === "Vampiro");
        expect(salamandra?.system?.grants?.[0].choices).toHaveLength(4);
        expect(vampiro?.system?.grants?.[0].choices).toHaveLength(4);
        expect(vampiro?.system?.atributosDinamicos?.value).not.toContain("con");
        expect(races.find(doc => doc.name === "Manotauro")?.system?.atributos?.sab).toBe(-2);
    });

    it("covers the appendix with native partner powers and usable creature documents", () => {
        const partners = readPack("parceiros-bestiario").filter(doc => doc.type === "poder");
        const creatures = readPack("bestiario-de-arton").filter(doc => doc.type === "npc");
        expect(partners).toHaveLength(26);
        expect(new Set(partners.map(doc => doc.name)).size).toBe(26);
        expect(creatures).toHaveLength(181);
        expect(new Set(creatures.map(doc => doc._id)).size).toBe(181);
        for (const creature of creatures) {
            const embedded = creature.items ?? [];
            expect(new Set(embedded.map(doc => doc._id)).size, creature.name).toBe(embedded.length);
        }

        const dragon = creatures.find(doc => doc.name === "Dragão-de-Aço");
        expect(dragon?.system?.attributes).toMatchObject({ nd: "17", pv: { max: 1050 } });
        const claw = dragon?.items?.find(doc => doc.type === "arma" && doc.name === "Garras");
        expect(claw?.system?.rolls?.find(roll => roll.type === "dano")?.parts[0]).toEqual(["4d8+15", "corte", ""]);

        const ship = creatures.find(doc => doc.name === "O Profano");
        expect(ship?.system?.attributes).toMatchObject({ nd: "S", pv: { max: 0 } });
        expect(ship?.system?.detalhes?.role).toBe("special");
        expect(creatures.find(doc => doc.name === "Elfo-do-Gelo Caçador")?.system?.detalhes?.role).toBe("lackey");
    });

    it("ships a portrait and default token texture for every creature", () => {
        const creatures = readPack("bestiario-de-arton").filter(doc => doc.type === "npc");
        const paths = new Set<string>();

        for (const creature of creatures) {
            const path = creature.img ?? "";
            expect(path, creature.name).toMatch(
                /^modules\/t20-theme-overhaul\/assets\/bestiario-de-arton\/(originais|criadas)\/[a-z0-9-]+\.webp$/,
            );
            expect(creature.prototypeToken?.texture.src, creature.name).toBe(path);
            const asset = new URL(`../../public/${path.replace("modules/t20-theme-overhaul/", "")}`, import.meta.url);
            expect(readFileSync(asset).toString("ascii", 8, 12), creature.name).toBe("WEBP");
            paths.add(path);
        }

        expect(paths.size).toBe(creatures.length);
    });
});
