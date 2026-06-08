/**
 * T20 fix — Manopla exibindo os APRIMORAMENTOS DE ARMA.
 *
 * Regra: "Uma manopla conta como uma arma para receber melhorias e encantos
 * para usá-los em seus ataques desarmados."
 *
 * ── O problema ────────────────────────────────────────────────────────────────
 * A Manopla é um item `type: "equipamento"` (tipo "traje"). A aba de
 * aprimoramentos (`enhancements`) do sheet do T20 escolhe a lista de melhorias
 * pelo TIPO do item (template `item-enhancements.hbs`):
 *
 *     type === "arma"            → config.weaponUpgrades  (Certeira, Pungente, …)
 *     equipamento leve/pesada    → config.armorUpgrades
 *     equipamento escudo         → config.shieldUpgrades
 *     … (traje cai no genérico)  → config.toolUpgrades    (Banhado a ouro, …)
 *
 * Logo a Manopla mostra melhorias genéricas (toolUpgrades), e não as de ARMA.
 *
 * ── A correção ────────────────────────────────────────────────────────────────
 * Como o template é do sistema, fazemos um pós-processamento no DOM: no
 * `renderItemSheet`, para itens Manopla, repopulamos os selects de melhoria
 * (`system.upgrades.melhoria1..4`) com `CONFIG.T20.weaponUpgrades` (localizados,
 * com tooltips), preservando o valor salvo no item. A seleção continua sendo
 * gravada pelo handler nativo do T20 (`.updateUpgrades`) em
 * `system.upgrades.melhoriaN`, então melhorias de arma passam a aparecer e a
 * ser salvas corretamente.
 */

import { normalizeCondName } from "@/spell-resistance/index";
import { log, warn } from "@/utils/logging";

interface ItemLike {
    type?: string;
    name?: string;
    system?: { upgrades?: Record<string, string | undefined> };
}

/** O item é uma Manopla? (equipamento cujo nome normalizado contém "manopla") */
export function isManopla(item: ItemLike | null | undefined): boolean {
    if (!item || item.type !== "equipamento") return false;
    return normalizeCondName(item.name ?? "").includes("manopla");
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * HTML das <option> para um select de melhoria, a partir do mapa de upgrades
 * (key → label i18n) e tooltips. Sempre inclui a opção em branco "-". Função
 * pura (recebe o localizador) → testável.
 */
export function buildUpgradeOptionsHtml(
    upgrades: Record<string, string>,
    tooltips: Record<string, string>,
    localize: (s: string) => string,
): string {
    const out = ['<option value="">-</option>'];
    for (const [key, label] of Object.entries(upgrades)) {
        const tipRaw = tooltips[key];
        const tip = tipRaw ? ` title="${esc(localize(tipRaw))}"` : "";
        out.push(`<option value="${esc(key)}"${tip}>${esc(localize(String(label)))}</option>`);
    }
    return out.join("");
}

interface T20Config {
    weaponUpgrades?: Record<string, string>;
    weaponUpgradesTooltips?: Record<string, string>;
}

/** Repopula os selects de melhoria do DOM com as melhorias de arma. */
function rebuildMelhoriaSelects(root: ParentNode, item: ItemLike): number {
    const cfg = (CONFIG as unknown as { T20?: T20Config }).T20;
    const upgrades = cfg?.weaponUpgrades ?? {};
    if (!Object.keys(upgrades).length) return 0;
    const tooltips = cfg?.weaponUpgradesTooltips ?? {};
    const localize = (s: string): string => game.i18n?.localize(s) ?? s;
    const optionsHtml = buildUpgradeOptionsHtml(upgrades, tooltips, localize);

    const selects = root.querySelectorAll<HTMLSelectElement>(
        'select.updateUpgrades[data-name^="system.upgrades.melhoria"]',
    );
    for (const sel of selects) {
        const key = (sel.getAttribute("data-name") ?? "").split(".").pop() ?? "";
        const saved = item.system?.upgrades?.[key] ?? "";
        sel.innerHTML = optionsHtml;
        sel.value = saved;
    }
    return selects.length;
}

export function setupManoplaUpgrades(): void {
    Hooks.on("renderItemSheet", (...args: unknown[]) => {
        const app = args[0] as { item?: ItemLike; object?: ItemLike; document?: ItemLike } | undefined;
        const item = app?.item ?? app?.object ?? app?.document;
        if (!isManopla(item)) return;
        const htmlArg = args[1] as { 0?: HTMLElement } | HTMLElement | undefined;
        const root = ((htmlArg as { 0?: HTMLElement })?.[0] ?? htmlArg) as ParentNode | undefined;
        if (!root || typeof root.querySelectorAll !== "function") return;
        try {
            const n = rebuildMelhoriaSelects(root, item!);
            if (n) log(`Manopla: ${n} slot(s) de melhoria exibindo aprimoramentos de arma.`);
        } catch (err) {
            warn(`manopla-upgrades: falha ao repopular melhorias:`, err);
        }
    });
}
