import { describe, expect, it } from "vitest";
import { cruzadoLevel, giftBudget, summonedGiftData, validateGiftPlan, type GiftPlan } from "@/cruzado/gift-format";
import { deriveCruzadoProficiencies } from "@/cruzado/proficiencies";
const plan = (): GiftPlan => ({ weapon: { _id: "base", name: "Machado", type: "arma", system: { preco: 20, espacos: 2 } }, improvements: ["accurate"], enchantments: [], milestone: 1 });
describe("Presente dos Deuses — configuração e invocação", () => {
    it("preserva outras proficiências ao conceder as da classe Cruzado",()=>{
        const actor={items:[{name:"Cruzado",type:"classe",system:{niveis:6}}],system:{tracos:{profArmas:{value:["fogo"]},profArmaduras:{value:[] as string[]}}}};
        deriveCruzadoProficiencies(actor);deriveCruzadoProficiencies(actor);
        expect(actor.system.tracos.profArmas.value).toEqual(["fogo","simples","marcial"]);
        expect(actor.system.tracos.profArmaduras.value).toEqual(["lev","pes","esc"]);
    });
    it("usa somente níveis de Cruzado na ficha multiclasse", () => {
        expect(cruzadoLevel({ items: [{ type: "classe", name: "Cruzado", system: { niveis: 5 } }, { type: "classe", name: "Guerreiro", system: { niveis: 15 } }] })).toBe(5);
        expect(cruzadoLevel({ items: [{ type: "classe", name: "Clérigo", system: { niveis: 20 } }] })).toBe(0);
    });
    it.each([[1,1,0],[4,1,0],[5,2,0],[7,2,0],[8,3,0],[9,3,1],[10,3,1],[11,4,1],[13,4,1],[14,4,2],[17,4,2],[18,4,3],[20,4,3]])("nível %i concede %i melhorias e %i encantos", (level, improvements, enchantments) => {
        expect(giftBudget(level)).toMatchObject({ improvements, enchantments });
    });
    it("permite somente os preços, materiais e escolhas válidos", () => {
        expect(validateGiftPlan(plan(),1,["accurate"],[])).toBeNull();
        const expensive=plan(); expensive.weapon.system={preco:201};
        expect(validateGiftPlan(expensive,1,["accurate"],[])).toMatch(/500/);
        const material=plan();material.improvements=["specialmaterial"];
        expect(validateGiftPlan(material,1,["specialmaterial"],[])).toMatch(/inválido/);
        expect(validateGiftPlan(plan(),5,["accurate"],[])).toMatch(/Preencha/);
    });
    it("rejeita duplicação e pré-requisitos ausentes", () => {
        const p=plan();p.improvements=["accurate","accurate"];
        expect(validateGiftPlan(p,5,["accurate"],[])).toMatch(/uma vez/);
        p.improvements=["pungent"];
        expect(validateGiftPlan(p,1,["pungent"],[])).toMatch(/Certeira/);
    });
    it("invocação cria um item temporário de espaço zero sem alterar o plano salvo", () => {
        const p=plan(), before=JSON.stringify(p), data=summonedGiftData(p,"power","scene",[]);
        expect(JSON.stringify(p)).toBe(before);
        expect(data._id).toBeUndefined();
        expect(data.system).toMatchObject({ espacos:0, qtd:1, upgrades:{melhoria1:"accurate"} });
        expect(data.flags).toEqual({"t20-theme-overhaul":{presenteDosDeuses:true,presenteTemporario:{powerId:"power",sceneId:"scene"}}});
    });
});
