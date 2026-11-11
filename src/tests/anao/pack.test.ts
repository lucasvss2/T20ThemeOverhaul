import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
describe("Anão — compêndios próprios", () => {
    const root=resolve("packs-src"), powers=readdirSync(resolve(root,"poderes")).filter(f=>f.startsWith("anao-")).map(f=>JSON.parse(readFileSync(resolve(root,"poderes",f),"utf8")));
    const race=JSON.parse(readFileSync(resolve(root,"racas/anao.json"),"utf8"));
    it("empacota a raça e dez poderes, com IDs únicos e imagem local",()=>{
        expect(powers).toHaveLength(10);expect(new Set(powers.map(p=>p._id)).size).toBe(10);
        for(const doc of [race,...powers]){
            expect(doc._id).toMatch(/^[a-zA-Z0-9]{16}$/);
            expect(existsSync(resolve("public",doc.img.replace("modules/t20-theme-overhaul/","")))).toBe(true);
            expect(doc._key).toBe(`!items!${doc._id}`);
            for(const effect of doc.effects??[])expect(effect._key).toBe(`!items.effects!${doc._id}.${effect._id}`);
        }
    });
    it("concede as quatro habilidades e os atributos corretos sem UUIDs de outros módulos",()=>{
        expect(race.type).toBe("race");expect(race.system.atributos).toMatchObject({con:2,sab:1,des:-1});
        const grants=race.system.grants.flatMap((g:{choices:Array<{uuid:string}>})=>g.choices);
        expect(grants).toHaveLength(4);
        for(const choice of grants){expect(choice.uuid).toMatch(/^Compendium\.t20-theme-overhaul\.poderes\.Item\./);expect(powers.some(p=>choice.uuid.endsWith(p._id))).toBe(true)}
    });
});
