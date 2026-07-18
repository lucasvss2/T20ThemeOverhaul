/**
 * T20 fix — Arma Mágica (e sanitização geral de changes de buff do compêndio).
 *
 * O effect-base da magia Arma Mágica no compêndio nativo tem 2 changes quebradas:
 *  - `dano&magico` — a key nunca casa nenhum roll (`r.key.match(new RegExp(key))`
 *    contra "dano1"/"ataque0") → o +1 de dano NUNCA aplicava.
 *  - `?.items.arma` — placeholder manual; `new RegExp("?.items.arma")` LANÇA
 *    SyntaxError ("nothing to repeat") dentro do filtro de rolls do
 *    applyRollChanges → marcar o checkbox quebrava o ataque inteiro.
 *
 * Sanitização aplicada quando o buff passa pelos nossos fluxos de aplicação
 * (auto-apply ⚡ e botões do modal): dropa QUALQUER change com key começando em
 * "?" (guard geral) e, para Arma Mágica, reescreve `dano&magico` → `dano`.
 *
 * Extra (2ª parte da magia): "Caso você esteja empunhando a arma, pode usar seu
 * atributo-chave de magias em vez do atributo original nos testes de ataque."
 * Quando o ALVO do buff é o próprio conjurador, adicionamos um SEGUNDO effect
 * onuse opcional com change `atributoAtq` (OVERRIDE) = atributo de conjuração —
 * vira um checkbox no dialog de ataque, marcado quando vantajoso.
 */

export interface BuffChange {
    key: string;
    value: string;
    mode: number;
    priority?: number | null;
}

export interface BuffEffectData {
    name?: string;
    changes?: BuffChange[];
    flags?: Record<string, unknown>;
    [key: string]: unknown;
}

function normName(s: string | undefined | null): string {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function isArmaMagicaSpell(spellName: string | undefined | null): boolean {
    return normName(spellName).startsWith("arma magica");
}

/**
 * Sanitiza IN-PLACE (nos clones) as changes de um conjunto de grupos de effects:
 *  - remove changes com key iniciando em "?" (SyntaxError garantido no nativo);
 *  - Arma Mágica: `dano&magico` → `dano`.
 * Retorna true se algo mudou.
 */
export function sanitizeBuffEffectGroups(
    spellName: string | undefined | null,
    groups: BuffEffectData[][],
): boolean {
    let changed = false;
    const armaMagica = isArmaMagicaSpell(spellName);
    for (const group of groups) {
        if (!Array.isArray(group)) continue;
        for (const eff of group) {
            if (!Array.isArray(eff?.changes)) continue;
            const before = eff.changes.length;
            eff.changes = eff.changes.filter((c) => !String(c?.key ?? "").startsWith("?"));
            if (eff.changes.length !== before) changed = true;
            if (armaMagica) {
                for (const c of eff.changes) {
                    if (c.key === "dano&magico") { c.key = "dano"; changed = true; }
                }
            }
        }
    }
    return changed;
}

/**
 * Effect onuse extra "atributo-chave nos ataques" da Arma Mágica — só quando o
 * alvo é o próprio conjurador. `attr` = key do atributo de conjuração ("car"…).
 */
export function buildAtributoAtqEffect(attr: string, attrLabel: string): BuffEffectData {
    return {
        name: `Arma Mágica — atributo-chave (${attrLabel}) nos testes de ataque`,
        icon: "icons/weapons/swords/sword-gold-holy.webp",
        disabled: true, // checkbox onuse — default desmarcado
        transfer: false,
        changes: [{ key: "atributoAtq", value: attr, mode: 5, priority: 20 }],
        duration: { seconds: 86400 },
        flags: {
            tormenta20: {
                onuse: true,
                attack: true,
                durationScene: true,
                custo: "0",
                self: false,
                skill: false,
                ability: false,
                power: false,
                spell: false,
                consumable: false,
                aumenta: false,
                items: "",
            },
        },
    };
}
