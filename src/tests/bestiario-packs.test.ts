import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackDocument {
    _id: string;
    _key: string;
    name: string;
    type: string;
    folder: string | null;
    img?: string;
    prototypeToken?: { texture: { src: string }; width: number; height: number };
    system?: {
        atributos?: Record<string, number>;
        atributosDinamicos?: { value: string[] };
        attributes?: { nd: string; pv: { max: number } };
        detalhes?: { role: string };
        tracos?: { tamanho: string };
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
                /^modules\/t20-theme-overhaul\/assets\/bestiario-de-arton\/tokens\/[a-z0-9-]+\.png$/,
            );
            expect(creature.prototypeToken?.texture.src, creature.name).toBe(path);
            const asset = new URL(`../../public/${path.replace("modules/t20-theme-overhaul/", "")}`, import.meta.url);
            expect(readFileSync(asset).subarray(0, 8), creature.name).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
            paths.add(path);
        }

        expect(paths.size).toBe(creatures.length);
    });

    it("preserves the original Bestiário portraits for races and partners", () => {
        const mappings = JSON.parse(readFileSync(new URL("../../scripts/data/bestiario-token-images.json", import.meta.url), "utf8"))
            .mappings as Array<{ name: string; originalPortrait: string }>;
        const creatures = new Map(mappings.map(entry => [entry.name.toLowerCase(), entry.originalPortrait]));
        const racePortraits = new Map([
            ["Elfo-do-Gelo", "Elfo-do-Gelo Caçador"],
            ["Lâmia", "Lâmia"],
            ["Manotauro", "Manotauro Selvagem"],
            ["Salamandra", "Salamandra Guerreira"],
            ["Vampiro", "Vampiro Fidalgo"],
        ]);
        const races = readPack("racas-bestiario").filter(doc => doc.type === "race");
        const partners = readPack("parceiros-bestiario").filter(doc => doc.type === "poder");

        for (const item of [...races, ...partners]) {
            const creatureName = item.type === "race" ? racePortraits.get(item.name) : item.name;
            const portrait = creatures.get(creatureName?.toLowerCase() ?? "");
            expect(portrait, item.name).toBeDefined();
            expect(item.img, item.name).toBe(portrait);
        }
    });

    it("sets both token dimensions from the creature size", () => {
        const sizes = new Map([
            ["min", 0.25],
            ["peq", 1],
            ["med", 1],
            ["gra", 2],
            ["eno", 3],
            ["col", 6],
        ]);
        const creatures = readPack("bestiario-de-arton").filter(doc => doc.type === "npc");

        for (const creature of creatures) {
            const size = sizes.get(creature.system?.tracos?.tamanho ?? "");
            expect(size, creature.name).toBeDefined();
            expect(creature.prototypeToken, creature.name).toMatchObject({ width: size, height: size });
        }
    });
});
