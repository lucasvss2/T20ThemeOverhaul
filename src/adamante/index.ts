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
 *   • tools.adamant — marcador (categoria `tools` do T20 = ferramenta/traje,
 *     inclui instrumentos musicais). Efeito "+1 no bônus da Inspiração" é lógica
 *     custom em `src/inspiracao`; o template só faz o material aparecer como
 *     Automatizado (mesmo tratamento das armas) e ser gated por equipado.
 *
 * Com isso, escolher "Adamante" no slot de material (com a Automação do item
 * ligada) passa pelo fluxo NATIVO do T20 (`_createEffect`/`_deleteEffect` +
 * gating por equipado). Não tocamos no dropdown — `specialMaterials.adamant` já
 * existe; só damos efeito mecânico ao que antes era cosmético.
 */

import { log, warn } from "@/utils/logging";

/** Modo de Active Effect ADD (espelha CONST.ACTIVE_EFFECT_MODES.ADD). */
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

/**
 * Template do Adamante para ARMA: **marcador** (sem changes).
 *
 * O "+1 passo de dano" NÃO é feito pela change `passos` do T20 — na prática o
 * T20 não aplica o `passos` de forma confiável em armas (testado ao vivo: 1d8
 * permanecia 1d8 / 4d8 no crítico). O passo real é aplicado pelo nosso patch de
 * `rollDamage` (`injectAdamanteWeaponStep`), que sobe o dado ANTES do roll —
 * assim o multiplicador de crítico do T20 incide sobre o dado já elevado. O AE
 * existe só como marcador visual/UI (status DONE).
 */
export function buildWeaponAdamante(): UpgradeTemplate {
    return {
        name: "Adamante",
        description: "Adamante: aumenta o dano da arma em um passo.",
        tint: TINT,
        changes: [],
        flags: { tormenta20: { onuse: false, durationScene: false, upgrade: ADAMANTE_KEY, self: false } },
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

/**
 * Template do Adamante para FERRAMENTA/TRAJE (categoria `tools` do T20).
 * **Marcador** (sem changes): cobre instrumentos musicais de Adamante, cujo
 * efeito ("+1 no bônus da Inspiração") é lógica custom em `src/inspiracao`. O
 * template existe pra que a seleção "Material Especial: Adamante" apareça como
 * **Automatizado** no item (mesmo tratamento das armas) e seja gated por
 * equipado pelo fluxo nativo (`isSuppressedUnnequipped`).
 */
export function buildToolAdamante(): UpgradeTemplate {
    return {
        name: "Adamante",
        description:
            "Adamante: um instrumento musical de Adamante aumenta em +1 o bônus concedido pela Inspiração do bardo.",
        tint: TINT,
        changes: [],
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
    tools?: UpgradeCategory;
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

    if (upgrades.tools) {
        // Ferramentas/trajes (inclui instrumentos musicais). O efeito mecânico
        // (Inspiração +1) é custom em src/inspiracao; aqui só marcamos como
        // Automatizado + status DONE.
        upgrades.tools[ADAMANTE_KEY] = buildToolAdamante();
        setStatus(upgrades.tools);
        n++;
    }

    return n;
}

// ── Adamante ARMA: +1 passo de dano (implementação própria no rollDamage) ───────

/**
 * Sobe um dado `NdF` um passo na tabela `passosDano` do T20. Mantém qualquer
 * sufixo (ex.: `[corte]`, `+2`). Retorna a string original se não houver dado
 * `NdF` no início ou se o dado não estiver na tabela. Puro/testável.
 */
export function stepDie(die: string, table: string[][], steps = 1): string {
    const s = String(die);
    const m = s.match(/^(\d+d\d+)/);
    if (!m) return die;
    const base = m[1];
    const row = table.find(r => r.includes(base));
    if (!row) return die;
    const idx = row.indexOf(base);
    const ni = Math.max(0, Math.min(idx + steps, row.length - 1));
    return s.replace(/^\d+d\d+/, row[ni] ?? base);
}

interface DanoRoll { type?: string; parts?: Array<[string, string?, string?]> }
interface WeaponForStep {
    type?: string;
    system?: { upgrades?: { material?: string }; rolls?: DanoRoll[] };
}

/** A arma tem material Adamante selecionado? */
export function isAdamanteWeapon(item: WeaponForStep): boolean {
    return item.type === "arma" && item.system?.upgrades?.material === ADAMANTE_KEY;
}

/**
 * Sobe (in-place) o PRIMEIRO dado de cada roll de dano da arma Adamante um passo
 * e retorna uma função que restaura. No-op se não for arma Adamante. Roda ANTES
 * do `rollDamage` original — o multiplicador de crítico do T20 incide depois,
 * sobre o dado já elevado (1d8→1d10; no crítico ×N → Nd10).
 */
export function injectAdamanteWeaponStep(item: WeaponForStep, table: string[][]): () => void {
    const noop = (): void => {};
    if (!isAdamanteWeapon(item) || !table?.length) return noop;
    const touched: Array<[[string, string?, string?], string]> = [];
    for (const r of item.system?.rolls ?? []) {
        if (r.type !== "dano") continue;
        const part = (r.parts ?? []).find(p => /^\d+d\d+/.test(String(p?.[0] ?? "")));
        if (!part) continue;
        const orig = part[0];
        const next = stepDie(orig, table);
        if (next !== orig) { part[0] = next; touched.push([part, orig]); }
    }
    if (!touched.length) return noop;
    return () => { for (const [p, o] of touched) p[0] = o; };
}

type ItemProtoStep = {
    rollDamage?: (this: WeaponForStep, arg?: Record<string, unknown>) => Promise<unknown>;
    _t20AdamanteStepPatched?: boolean;
};

function setupAdamanteWeaponStep(): void {
    Hooks.once("ready", () => {
        const proto = (CONFIG as unknown as { Item?: { documentClass?: { prototype: object } } })
            .Item?.documentClass?.prototype as ItemProtoStep | undefined;
        if (!proto || typeof proto.rollDamage !== "function") {
            warn(`adamante: ItemT20.prototype.rollDamage não encontrado — passo de dano não patcheado.`);
            return;
        }
        if (proto._t20AdamanteStepPatched) return;
        const orig = proto.rollDamage;
        proto.rollDamage = async function (this: WeaponForStep, arg?: Record<string, unknown>) {
            let restore = (): void => {};
            try {
                const table = (CONFIG as unknown as { T20?: { passosDano?: string[][] } }).T20?.passosDano ?? [];
                restore = injectAdamanteWeaponStep(this, table);
            } catch (err) {
                warn(`adamante: step de dano abortado (dano intacto):`, err);
                restore = () => {};
            }
            try {
                return await orig.call(this, arg);
            } finally {
                try { restore(); } catch { /* ignore */ }
            }
        };
        proto._t20AdamanteStepPatched = true;
        log(`ItemT20.rollDamage patched — Adamante sobe o dado da arma um passo.`);
    });
}

export function setupAdamante(): void {
    const cfg = (CONFIG as unknown as { T20?: { upgrades?: T20UpgradesConfig } }).T20;
    const upgrades = cfg?.upgrades;
    if (!upgrades) {
        warn(`adamante: CONFIG.T20.upgrades não encontrado — melhoria Adamante não registrada.`);
    } else {
        try {
            const n = injectAdamanteUpgrades(upgrades);
            log(`Adamante registrado em ${n} categoria(s) de melhoria (arma/armadura/escudo/esotérico).`);
        } catch (err) {
            warn(`adamante: falha ao injetar templates:`, err);
        }
    }
    // Passo de dano da arma Adamante: patch próprio (T20 não aplica o passos nativo).
    setupAdamanteWeaponStep();
}
