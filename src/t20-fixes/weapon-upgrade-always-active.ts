/**
 * T20 weapon upgrade — display permanent na ficha.
 *
 * O T20 nativo marca as melhorias de arma (precise, accurate, balanced, etc.)
 * com `flags.tormenta20.onuse: true`. Isso faz com que o AE da melhoria SÓ seja
 * aplicado durante o roll do ataque (via `applyOnUseEffects`) — o valor real
 * `system.criticoM` permanece como o base (20 para um Mangual Preciso).
 *
 * Resultado: a ficha mostra "Crítico: 20" mesmo que internamente, no momento
 * do ataque, o T20 use criticoM=19 para o d20.options.critical. O jogador
 * acha que a melhoria está quebrada — porque na UI nada mudou.
 *
 * Fix (não-invasivo): patchamos `Tormenta20Item.prototype._prepareLabels` para
 * sobrescrever `this.labels.critico` com o valor com AEs upgrade aplicados.
 *
 * Importante: NÃO modificamos `system.criticoM`. O T20 internal já aplica o
 * `-1` da Precisa via `applyOnUseEffects` no clone durante o roll — modificar
 * `system.criticoM` aqui causaria DUPLA aplicação (clone começa 19, AE -1 = 18).
 * Apenas o label exibido na UI é alterado.
 */

import { log, warn } from "@/utils/logging";

interface AEChange {
    key?:   string;
    value?: string | number;
    mode?:  number;
}

interface AELike {
    disabled?: boolean;
    changes?:  AEChange[];
    flags?: {
        tormenta20?: {
            upgrade?: string;
            onuse?:   boolean;
        };
    };
}

interface ItemWithLabels {
    type?:   string;
    labels?: { critico?: string | number };
    system?: { criticoM?: number; criticoX?: number };
    effects?: { contents?: AELike[] };
}

type ItemProtoLike = {
    _prepareLabels?:           (this: ItemWithLabels) => void;
    _bg3WeaponUpgradePatched?: boolean;
};

/** Aplica um change ao valor numérico segundo o mode AE. */
function applyChange(current: number, ch: AEChange): number {
    const v = Number(ch.value ?? 0);
    if (!Number.isFinite(v)) return current;
    switch (ch.mode) {
        case 1: return current * v;             // MULTIPLY
        case 2: return current + v;             // ADD
        case 3: return Math.min(current, v);    // DOWNGRADE
        case 4: return Math.max(current, v);    // UPGRADE
        case 5: return v;                       // OVERRIDE
        default: return current;                // CUSTOM (0) — ignore
    }
}

/**
 * Computa criticoM e criticoX efetivos para um item arma, aplicando AEs com
 * flag `tormenta20.upgrade` ao valor base de `system.criticoM` / `system.criticoX`.
 */
function computeEffectiveCritical(item: ItemWithLabels): { criticoM: number; criticoX: number } {
    let criticoM = item.system?.criticoM ?? 20;
    let criticoX = item.system?.criticoX ?? 2;
    const effects = item.effects?.contents ?? [];
    for (const eff of effects) {
        if (eff.disabled) continue;
        const t20Flags = eff.flags?.tormenta20;
        if (!t20Flags?.upgrade) continue;
        for (const ch of (eff.changes ?? [])) {
            if (ch.key === "criticoM") criticoM = applyChange(criticoM, ch);
            else if (ch.key === "criticoX") criticoX = applyChange(criticoX, ch);
        }
    }
    return { criticoM, criticoX };
}

export function patchT20WeaponUpgradeLabels(): void {
    // Pegamos a documentClass do Item via CONFIG (genérico, igual para T20).
    type FoundryGlobal = { Item?: { documentClass?: { prototype: object } } };
    const cfg = (globalThis as unknown as { CONFIG?: FoundryGlobal }).CONFIG;
    const ItemCls = cfg?.Item?.documentClass;
    if (!ItemCls) {
        warn(`CONFIG.Item.documentClass não encontrado — patch de labels não aplicado.`);
        return;
    }

    const proto = ItemCls.prototype as ItemProtoLike;
    if (proto._bg3WeaponUpgradePatched) return;
    if (typeof proto._prepareLabels !== "function") {
        warn(`Tormenta20Item.prototype._prepareLabels não encontrado — patch de labels não aplicado.`);
        return;
    }

    const origPrepareLabels = proto._prepareLabels;
    proto._prepareLabels = function(this: ItemWithLabels): void {
        // 1. Original (T20 seta `this.labels.critico` com base em system.criticoM/X)
        origPrepareLabels.call(this);
        // 2. Override para armas: aplica AEs upgrade no label sem mexer em system.*
        if (this.type !== "arma") return;
        if (!this.labels) return;
        const { criticoM, criticoX } = computeEffectiveCritical(this);
        this.labels.critico = (criticoX === 2) ? `${criticoM}` : `${criticoM}/${criticoX}x`;
    };
    proto._bg3WeaponUpgradePatched = true;

    log(`Tormenta20Item._prepareLabels patched — labels de crítico em armas refletem AEs upgrade.`);

    // ⚠️ NÃO chamamos `actor.prepareData()` em loop aqui. T20 armazena bônus em
    // ArrayField acumulativo (ex: `pm.bonus.total`); cada `prepareData()` extra
    // duplica entradas — múltiplas chamadas inflam pm.max/bonus indefinidamente.
    // O patch entrará em vigor no próximo prepareData natural (abrir ficha,
    // fazer roll, mudar AE, etc.).
}
