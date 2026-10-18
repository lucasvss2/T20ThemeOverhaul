import { describe, expect, it } from "vitest";
import { rogueLevel, sneakDice, scaleSneakRolls, advanceAnalysis, analysisMatches, type Analysis } from "@/ataque-furtivo/format";

const actor = (level: number) => ({ items: { contents: [{ name: "Ladino", type: "classe", system: { niveis: level } }, { name: "Guerreiro", type: "classe", system: { niveis: 10 } }] } });
const analysis = (): Analysis => ({ casterUuid: "Actor.rogue", targetUuid: "Actor.target", targetTokenUuid: "Scene.s.Token.t", targetName: "Alvo", sceneId: "s", combatId: "c", endsRemaining: 2 });

describe("Ataque Furtivo — tabela do Ladino", () => {
    it("preserva RollData e sua serialização ao preparar a ficha", () => {
        class RollData {
            readonly type = "dano";
            constructor(public parts: string[][]) {}
            toObject() { return { type: this.type, parts: this.parts.map(part => [...part]) }; }
            clone(data: { parts?: string[][] }) { return new RollData(data.parts ?? this.toObject().parts); }
        }
        const original = new RollData([["1d6", "dano", ""]]);
        const [scaled] = scaleSneakRolls([original], 5);
        // EmbeddedDataField.toObject chama este método ao abrir a ficha real.
        expect(() => (scaled as RollData).toObject()).not.toThrow();
        expect(scaled).toBeInstanceOf(RollData);
        expect((scaled as RollData).toObject().parts[0][0]).toBe("3d6");
        expect(original.toObject().parts[0][0]).toBe("1d6");
        expect((scaleSneakRolls([scaled], 7)[0] as RollData).toObject().parts[0][0]).toBe("4d6");
    });
    it.each(Array.from({ length: 20 }, (_, i) => [i + 1, Math.ceil((i + 1) / 2)]))("Ladino %i recebe %id6", (level, dice) => {
        expect(sneakDice(rogueLevel(actor(level)))).toBe(dice);
    });
    it("conta só níveis de ladino e preserva ameaças sem essa classe", () => {
        expect(rogueLevel(actor(5))).toBe(5);
        expect(rogueLevel({ items: { contents: [{ name: "Guerreiro", type: "classe", system: { niveis: 15 } }] } })).toBe(0);
        const rolls = [{ type: "dano", parts: [["7d6", "dano", ""]] }];
        expect(scaleSneakRolls(rolls, 0)).toBe(rolls);
        expect(scaleSneakRolls(rolls, 5)?.[0].parts?.[0]).toEqual(["3d6", "dano", ""]);
        expect(rolls[0].parts[0][0]).toBe("7d6");
    });
});

describe("Assassinar — alvo e fim do próximo turno", () => {
    it("o bônus só vale para o token analisado na mesma cena e combate", () => {
        expect(analysisMatches(analysis(), "Scene.s.Token.t", "s", "c")).toBe(true);
        expect(analysisMatches(analysis(), "Scene.s.Token.outro", "s", "c")).toBe(false);
        expect(analysisMatches(analysis(), "Scene.s.Token.t", "outra", "c")).toBe(false);
        expect(analysisMatches(analysis(), "Scene.s.Token.t", "s", "outro")).toBe(false);
    });
    it("sobrevive ao fim do turno atual e expira ao fim do próximo turno do ladino", () => {
        const first = advanceAnalysis(analysis(), "Actor.rogue", "c:1:0");
        expect(first?.endsRemaining).toBe(1);
        expect(advanceAnalysis(first!, "Actor.rogue", "c:1:0")).toEqual(first);
        expect(advanceAnalysis(first!, "Actor.outro", "c:1:1")).toEqual(first);
        expect(advanceAnalysis(first!, "Actor.rogue", "c:2:0")).toBeNull();
    });
    it("se ativado fora do próprio turno, expira no fim do próximo turno do ladino", () => {
        expect(advanceAnalysis({ ...analysis(), endsRemaining: 1 }, "Actor.rogue", "c:2:0")).toBeNull();
    });
});
