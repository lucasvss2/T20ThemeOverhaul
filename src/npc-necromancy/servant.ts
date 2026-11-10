/** Shared by the runtime and the compendium generator. */
export const SHADOW_IMAGE = "modules/t20-theme-overhaul/assets/necromancia/servo-de-sombra.png";
export const SHADOW_TEMPLATE_ID = "7b0ca91044e557aa";

export function buildShadowTemplate(defense = 22, damage = "1d8") {
    const attribute = (value: number) => ({ value, base: value, bonus: 0, racial: 0 });
    const resistances = Object.fromEntries(["dano", "perda", "acido", "corte", "eletricidade", "essencia", "fogo", "frio", "impacto", "luz", "psiquico", "perfuracao", "trevas"]
        .map(type => [type, { value: 0, base: 0, bonus: [] as string[], excecao: 0, imunidade: type === "frio", vulnerabilidade: false, danoPorDado: false }]));
    return {
        _id: SHADOW_TEMPLATE_ID, _key: "!actors!" + SHADOW_TEMPLATE_ID,
        name: "Servo de Sombra (Iniciado)", type: "npc", img: SHADOW_IMAGE,
        folder: "X9TuFXCvny1ptG5G", ownership: { default: 0 },
        prototypeToken: { name: "Servo de Sombra", actorLink: false, width: 1, height: 1,
            disposition: -1, texture: { src: SHADOW_IMAGE }, bar1: { attribute: "attributes.pv" } },
        flags: { "t20-theme-overhaul": { necromancyTemplate: true } },
        system: {
            atributos: { for: attribute(3), des: attribute(3), con: attribute(0), int: attribute(0), sab: attribute(0), car: attribute(0) },
            attributes: { nd: "0", cd: 0, pv: { value: 1, max: 1, min: 0, temp: 0 }, pm: { value: 0, max: 0, temp: 0 },
                defesa: { base: 10, outros: defense - 13, atributo: "des" }, movement: { walk: { base: 9 } } },
            detalhes: { tipo: "mor", raca: "Morto-vivo de sombra", role: "lackey", tesouro: "Nenhum",
                biography: { value: "<p>Servo conjurado por Ergam-se! do Necromante Iniciado. For 3, Des 3, demais atributos 0; 1 PV, Defesa 22, deslocamento 9m. No turno de seu mestre, uma vez por rodada, causa 1d8 de trevas em uma criatura adjacente, sem teste de ataque. Falha automaticamente em resistências e testes opostos.</p><p>Imune a atordoamento, dano não letal, doença, encantamento, fadiga, frio, ilusão, paralisia, sono e veneno.</p>" } },
            tracos: { tamanho: "med", resistencias: resistances,
                ic: { value: ["atordoado", "doente", "encantamento", "fatigado", "exausto", "ilusao", "paralisado", "sono", "envenenado"],
                    custom: "Imune a dano não letal. Falha automaticamente em resistências e testes opostos." } },
        },
        items: [{ _id: "f3f457b7745ff491", _key: "!actors.items!" + SHADOW_TEMPLATE_ID + ".f3f457b7745ff491",
            name: "Golpe de Sombra", type: "poder", img: SHADOW_IMAGE,
            flags: { "t20-theme-overhaul": { npcPower: { limit: "round", save: true } } },
            system: { tipo: "geral", ativacao: { execucao: "standard", custo: 0 }, alcance: "touch", alvo: "1 criatura adjacente",
                resistencia: { txt: "", pericia: "", atributo: "", bonus: 0 }, duracao: { units: "inst" },
                rolls: [{ name: "Dano", key: "dano0", type: "dano", parts: [[damage, "trevas", ""]] }],
                description: { value: "<p>No turno do mestre, uma vez por rodada, causa " + damage + " de trevas em uma criatura adjacente, sem teste de ataque.</p>" } },
        }],
    };
}
