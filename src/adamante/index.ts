/**
 * Melhoria "Adamante" (material especial) — armas, armaduras, escudos e
 * esotéricos.
 *
 * Regra:
 *   • Arma: aumenta o dano em um passo.
 *   • Armadura e Escudo: RD — armaduras leves e escudos RD 2; armaduras pesadas
 *     RD 5.
 *   • Esotérico: ao lançar uma magia que causa dano, pode pagar +1 PM para
 *     rolar novamente qualquer resultado 1 na rolagem de dano dela.
 *
 * ── Como o T20 já ajuda ─────────────────────────────────────────────────────────
 * O T20 já tem "Adamante" (`specialMaterials.adamant`) como opção no slot
 * dedicado de MATERIAL (`system.upgrades.material`) na aba "Aprimoramentos" de
 * armas/equipamentos — mas SEM efeito mecânico (não há template em
 * `T20.upgrades.<cat>`, então a seleção não cria nenhum Active Effect).
 *
 * ── O que fazemos ───────────────────────────────────────────────────────────────
 * Injetamos os templates de AE keyed `adamant` em `CONFIG.T20.upgrades`:
 *   • weapon.adamant  — change `{key:"passos", value:"1", mode:CUSTOM}` (+1 passo
 *     de dano; o T20 resolve "passos" via `passosDano` no roll). onuse.
 *   • armor.leve/escudo.adamant — `system.tracos.resistencias.dano.bonus += 2`.
 *   • armor.pesada.adamant      — `... += 5`. transfer (persistente; o T20 já
 *     suprime o efeito quando o item NÃO está equipado via isSuppressedUnnequipped).
 *   • esoteric.adamant — marcador (sem changes); o reroll é lógica custom em
 *     `adamante/esoteric.ts` integrada ao fluxo de magia do spell-resistance.
 *
 * Com isso, escolher "Adamante" no slot de material (com a Automação do item
 * ligada) passa pelo fluxo NATIVO do T20 (`_createEffect`/`_deleteEffect` +
 * gating por equipado). Não tocamos no dropdown — `specialMaterials.adamant` já
 * existe; só damos efeito mecânico ao que antes era cosmético.
 */

import { log, warn } from "@/utils/logging";

/** Modos de Active Effect usados (espelha CONST.ACTIVE_EFFECT_MODES). */
const MODE_CUSTOM = 0;
const MODE_ADD = 2;

/** Key do material no T20 (`CONFIG.T20.specialMaterials.adamant`). */
export const ADAMANTE_KEY = "adamant";

interface UpgradeTemplate {
    name: string;
    description: string;
    tint?: string;
    changes: Array<{ key: string; value: string; mode: number; priority: number }>;
    flags: { tormenta20: Record<string, unknown> };
    disabled: boolean;
    transfer: boolean;
}

const TINT = "#7d7f8c"; // cinza-azulado metálico

/** Template do Adamante para ARMA: +1 passo de dano. */
export function buildWeaponAdamante(): UpgradeTemplate {
    return {
        name: "Adamante",
        description: "Adamante: aumenta o dano da arma em um passo.",
        tint: TINT,
        changes: [{ key: "passos", value: "1", mode: MODE_CUSTOM, priority: 0 }],
        flags: { tormenta20: { onuse: true, durationScene: false, upgrade: ADAMANTE_KEY, self: true } },
        disabled: false,
        transfer: false,
    };
}

/** Template do Adamante para ARMADURA/ESCUDO: RD `value` (2 leve/escudo, 5 pesada). */
export function buildArmorAdamante(rd: number): UpgradeTemplate {
    return {
        name: "Adamante",
        description: `Adamante: fornece redução de dano ${rd}.`,
        tint: TINT,
        changes: [
            { key: "system.tracos.resistencias.dano.bonus", value: String(rd), mode: MODE_ADD, priority: 0 },
        ],
        flags: { tormenta20: { onuse: false, durationScene: false, upgrade: ADAMANTE_KEY, self: false } },
        disabled: false,
        transfer: true,
    };
}

/** Template do Adamante para ESOTÉRICO: marcador (reroll de 1s é lógica custom). */
export function buildEsotericAdamante(): UpgradeTemplate {
    return {
        name: "Adamante",
        description:
            "Adamante: ao lançar uma magia que causa dano, pague +1 PM para rolar novamente qualquer resultado 1 na rolagem de dano.",
        tint: TINT,
        changes: [],
        flags: { tormenta20: { onuse: false, durationScene: false, upgrade: ADAMANTE_KEY, self: false, spell: true } },
        disabled: false,
        transfer: true,
    };
}

interface UpgradeCategory {
    status?: Record<string, string>;
    [key: string]: unknown;
}
interface ArmorUpgradeCategory extends UpgradeCategory {
    general?: UpgradeCategory;
    leve?: UpgradeCategory;
    pesada?: UpgradeCategory;
    escudo?: UpgradeCategory;
}
interface T20UpgradesConfig {
    weapon?: UpgradeCategory;
    armor?: ArmorUpgradeCategory;
    esoteric?: UpgradeCategory;
}

/**
 * Injeta os templates do Adamante em `CONFIG.T20.upgrades`. Idempotente.
 * Retorna a contagem de categorias efetivamente populadas (para diagnóstico/teste).
 */
export function injectAdamanteUpgrades(upgrades: T20UpgradesConfig | undefined): number {
    if (!upgrades) return 0;
    let n = 0;

    const setStatus = (cat: UpgradeCategory | undefined): void => {
        if (!cat) return;
        cat.status ??= {};
        cat.status[ADAMANTE_KEY] = "DONE";
    };

    if (upgrades.weapon) {
        upgrades.weapon[ADAMANTE_KEY] = buildWeaponAdamante();
        setStatus(upgrades.weapon);
        n++;
    }

    if (upgrades.armor) {
        // RD por tipo: leve/escudo = 2, pesada = 5.
        if (upgrades.armor.leve)   { upgrades.armor.leve[ADAMANTE_KEY]   = buildArmorAdamante(2); n++; }
        if (upgrades.armor.escudo) { upgrades.armor.escudo[ADAMANTE_KEY] = buildArmorAdamante(2); n++; }
        if (upgrades.armor.pesada) { upgrades.armor.pesada[ADAMANTE_KEY] = buildArmorAdamante(5); n++; }
        setStatus(upgrades.armor);
    }

    if (upgrades.esoteric) {
        upgrades.esoteric[ADAMANTE_KEY] = buildEsotericAdamante();
        setStatus(upgrades.esoteric);
        n++;
    }

    return n;
}

export function setupAdamante(): void {
    const cfg = (CONFIG as unknown as { T20?: { upgrades?: T20UpgradesConfig } }).T20;
    const upgrades = cfg?.upgrades;
    if (!upgrades) {
        warn(`adamante: CONFIG.T20.upgrades não encontrado — melhoria Adamante não registrada.`);
        return;
    }
    try {
        const n = injectAdamanteUpgrades(upgrades);
        log(`Adamante registrado em ${n} categoria(s) de melhoria (arma/armadura/escudo/esotérico).`);
    } catch (err) {
        warn(`adamante: falha ao injetar templates:`, err);
    }
}
