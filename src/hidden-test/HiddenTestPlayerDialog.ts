import { MODULE_ID } from "@/constants";
import { computeSkillTotal } from "./skills";
import type { HiddenTestFlag, HiddenTestRequest, TestOutcome } from "./types";

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Activatable items via T20 ActiveEffect system ─────────────────────────────

export interface ActivatableItem {
    id: string;
    name: string;
    /** Tipo do item de origem, ex: "poder", "tesouro", "equipamento" */
    itemType: string;
    pm: number;
    bonusFormula: string;  // "+9", "kh" (advantage), or ""
    bonusLabel: string;    // "+9 CAR", "Vantagem", etc.
    isAdvantage: boolean;
}

export function getActivatableItems(actor: FoundryActor, skillLabel: string): ActivatableItem[] {
    const items = actor.items?.contents ?? [];
    const result: ActivatableItem[] = [];

    for (const item of items) {
        const effects = item.effects?.contents ?? [];
        for (const effect of effects) {
            const t20 = (effect.flags?.["tormenta20"] ?? {}) as Record<string, unknown>;
            if (!t20["onuse"] || !t20["skill"]) continue;

            // Efeitos com requisito de nível ainda não atingido têm "(Xº nível)" no nome
            // Ex: "Vindicação Refletir Magia (11º nível)" — ignora estes
            if (/\(\d+º\s*n[íi]vel\)/i.test(effect.name)) continue;

            // Skill filter: semicolon-separated labels like "Fortitude;Reflexos;Vontade"
            const itemsFilter = ((t20["items"] as string) ?? "").trim();
            if (itemsFilter) {
                const allowed = itemsFilter.split(";").map((s) => s.trim().toLowerCase());
                if (!allowed.includes(skillLabel.toLowerCase())) continue;
            }

            let formula = "";
            let label = "?";
            let isAdvantage = false;

            for (const change of effect.changes) {
                const val = (change.value ?? "").trim();

                if (val === "kh") {
                    isAdvantage = true;
                    formula = "kh";
                    label = "Vantagem";
                    break;
                }

                if (val.startsWith("@")) {
                    const attrKey = val.substring(1);
                    const attrVal = (actor.system?.atributos as Record<string, { value?: number }>)?.[attrKey]?.value ?? 0;
                    const sign = attrVal >= 0 ? "+" : "";
                    formula = `${sign}${attrVal}`;
                    label = `${sign}${attrVal} ${attrKey.toUpperCase()}`;
                    break;
                }

                const num = parseInt(val, 10);
                if (!isNaN(num)) {
                    const sign = num >= 0 ? "+" : "";
                    formula = `${sign}${num}`;
                    label = formula;
                    break;
                }
            }

            if (label === "?") continue;

            const pm = parseInt((t20["custo"] as string) ?? "0", 10) || 0;

            result.push({
                id: `${item.id}::${effect.id}`,
                name: effect.name || item.name,
                itemType: item.type,
                pm,
                bonusFormula: formula,
                bonusLabel: label,
                isAdvantage,
            });
        }
    }

    return result;
}

// ── Chat card HTML ────────────────────────────────────────────────────────────

function buildHiddenTestCardHtml(
    skillLabel: string,
    actorName: string,
    roll: Roll,
    outcome: TestOutcome,
    appliedBonuses: string[],
): string {
    const total = roll.total ?? 0;
    const formula = roll.formula ?? "1d20";

    // Individual d20 result(s)
    const dieResults = roll.dice[0]?.results ?? [];
    const active = dieResults.find((r) => r.active)?.result ?? 0;
    const dropped = dieResults.filter((r) => !r.active).map((r) => r.result);
    const diceDisplay = dropped.length > 0
        ? `d20: ${active} <span class="htc-dice-dropped">(${[active, ...dropped].sort((a, b) => b - a).join(", ")})</span>`
        : `d20: ${active}`;

    const outcomeLabel: Record<TestOutcome, string> = {
        critico:       "SUCESSO CRÍTICO",
        sucesso:       "SUCESSO",
        falha:         "FALHA",
        falha_critica: "FALHA CRÍTICA",
    };
    const outcomeCss: Record<TestOutcome, string> = {
        critico:       "htc-crit",
        sucesso:       "htc-success",
        falha:         "htc-failure",
        falha_critica: "htc-fumble",
    };

    const bonusesHtml = appliedBonuses.length > 0
        ? appliedBonuses.map((b) => `<div class="htc-applied-bonus">${esc(b)}</div>`).join("")
        : "";

    return `
        <div class="aeris-hidden-test-card">
            <div class="htc-header">
                <div class="htc-header-top">
                    <span class="htc-actor-name">${esc(actorName.toUpperCase())}</span>
                </div>
                <div class="htc-skill-name">${esc(skillLabel)}</div>
                <div class="htc-subtitle">TESTE DE PERÍCIA</div>
                ${bonusesHtml}
            </div>
            <div class="htc-divider"></div>
            <div class="htc-body">
                <div class="htc-formula">${esc(formula)}</div>
                <div class="htc-dice-result">${diceDisplay}</div>
                <div class="htc-total ${outcomeCss[outcome]}">${total}</div>
                <div class="htc-outcome ${outcomeCss[outcome]}">${outcomeLabel[outcome]}</div>
            </div>
        </div>
    `.trim();
}

// ── Player dialog ─────────────────────────────────────────────────────────────

export function openHiddenTestPlayerDialog(request: HiddenTestRequest): void {
    const actor = game.actors?.get(request.actorId);
    const actorName = actor?.name ?? "Personagem";
    const skillTotal = actor ? computeSkillTotal(actor, request.skillKey) : 0;
    const bonusStr = skillTotal >= 0 ? `+${skillTotal}` : `${skillTotal}`;
    const powers = actor ? getActivatableItems(actor, request.skillLabel) : [];

    const powersHtml = powers.length > 0 ? `
        <div class="htg-divider"></div>
        <div class="htg-powers-section">
            <div class="htg-powers-header">
                <span class="htg-label-sm">APLICAR</span>
                <span class="htg-label-sm">PM</span>
                <span class="htg-label-sm">PODER / ITEM</span>
                <span class="htg-label-sm htg-col-bonus">BÔNUS</span>
            </div>
            ${powers.map((p) => `
            <div class="htg-power-row">
                <input type="checkbox" class="htg-power-check"
                    data-pm="${p.pm}"
                    data-bonus="${esc(p.bonusFormula)}"
                    data-advantage="${p.isAdvantage}"
                    data-label="${esc(p.bonusLabel)}"
                    data-name="${esc(p.name)}">
                <span class="htg-pm-cost">${p.pm > 0 ? p.pm : "—"}</span>
                <span class="htg-power-name">${esc(p.name)}</span>
                <span class="htg-power-bonus ${p.isAdvantage ? "htg-bonus-advantage" : "htg-bonus-known"}">${esc(p.bonusLabel)}</span>
            </div>`).join("")}
            <div class="htg-pm-total-row">
                <span class="htg-label-sm">CUSTO DE MANA TOTAL</span>
                <span class="htg-pm-display" id="htg-pm-total">0</span>
            </div>
        </div>` : "";

    const content = `
        <div class="htg-body">
            <div class="htg-request-banner">
                <div class="htg-label-sm">O MESTRE SOLICITA</div>
                <div class="htg-skill-name-lg">${esc(request.skillLabel)}</div>
                <div class="htg-divider"></div>
            </div>
            <div class="htg-target-row">
                <span class="htg-label-sm">PERSONAGEM</span>
                <span class="htg-value-lg">${esc(actorName)}</span>
            </div>
            <div class="form-group">
                <label>BÔNUS DE PERÍCIA</label>
                <span class="htg-bonus-display">${bonusStr}</span>
            </div>
            ${powersHtml}
            <div class="htg-divider"></div>
            <div class="form-group">
                <label>BÔNUS NO TESTE</label>
                <input type="text" name="bonusExtra" value="" placeholder="ex. +1d4 ou -3" />
            </div>
        </div>
    `;

    void foundry.applications.api.DialogV2.wait({
        id: "hidden-test-player",
        classes: ["t20-dialog"],
        window: { title: "Teste" },
        position: { width: 440 },
        content,
        buttons: [
            {
                type: "submit",
                action: "roll",
                label: "Rolar Teste",
                icon: "fas fa-dice-d20",
                default: true,
                callback: (_event, _button, dialog) => {
                    const root = dialog.element;
                    const bonusExtra = (root.querySelector<HTMLInputElement>('[name="bonusExtra"]')?.value ?? "").trim();
                    const selected = Array.from(root.querySelectorAll<HTMLElement>(".htg-power-check:checked")).map((el) => ({
                        pm:         parseInt(el.dataset["pm"]       ?? "0", 10),
                        bonus:      el.dataset["bonus"]     ?? "",
                        advantage:  el.dataset["advantage"] === "true",
                        bonusLabel: el.dataset["label"]     ?? "",
                        name:       el.dataset["name"]      ?? "",
                    }));
                    void executeHiddenTestRoll(request, actorName, skillTotal, bonusExtra, selected);
                },
            },
        ],
        render: (_event, dialog) => {
            const root = dialog.element;
            root.querySelectorAll(".htg-power-check").forEach((el) => {
                el.addEventListener("change", () => {
                    const totalPm = Array.from(root.querySelectorAll<HTMLElement>(".htg-power-check:checked"))
                        .reduce((s, e) => s + parseInt(e.dataset["pm"] ?? "0", 10), 0);
                    const pmTotal = root.querySelector("#htg-pm-total");
                    if (pmTotal) pmTotal.textContent = String(totalPm);
                });
            });
        },
        rejectClose: false,
    });
}

// ── Roll execution ────────────────────────────────────────────────────────────

async function executeHiddenTestRoll(
    request: HiddenTestRequest,
    actorName: string,
    skillTotal: number,
    extraBonus: string,
    selectedPowers: Array<{ pm: number; bonus: string; advantage: boolean; bonusLabel: string; name: string }>,
): Promise<void> {
    const gmBonus = request.gmBonus ?? 0;
    const baseBonus = skillTotal + gmBonus;

    const hasAdvantage = selectedPowers.some((p) => p.advantage);
    const parts: string[] = [hasAdvantage ? "2d20kh1" : "1d20"];

    if (baseBonus !== 0) parts.push(baseBonus > 0 ? `+ ${baseBonus}` : `- ${Math.abs(baseBonus)}`);

    for (const p of selectedPowers) {
        if (!p.bonus || p.bonus === "kh") continue;
        const b = p.bonus.trim();
        parts.push(b.startsWith("+") || b.startsWith("-") ? b : `+ ${b}`);
    }

    if (extraBonus) {
        const b = extraBonus.trim();
        parts.push(b.startsWith("+") || b.startsWith("-") ? b : `+ ${b}`);
    }

    const roll = new Roll(parts.join(" "));
    await roll.evaluate({ async: true });

    // Deduct PM
    const totalPm = selectedPowers.reduce((s, p) => s + p.pm, 0);
    if (totalPm > 0) {
        const actor = game.actors?.get(request.actorId);
        if (actor) {
            const currentPm = actor.system?.attributes?.pm?.value ?? 0;
            await actor.update({ "system.attributes.pm.value": Math.max(0, currentPm - totalPm) });
        }
    }

    const nat   = roll.dice[0]?.results?.find((r) => r.active)?.result ?? 0;
    const total = roll.total ?? 0;

    const outcome: TestOutcome =
        nat === 1  ? "falha_critica"
        : nat === 20 ? "critico"
        : total >= request.dc ? "sucesso"
        : "falha";

    // Build applied bonus labels for chat card
    const appliedBonuses: string[] = selectedPowers.map((p) => {
        const pmStr = p.pm > 0 ? ` (${p.pm} PM)` : "";
        return `${p.bonusLabel} · ${p.name}${pmStr}`;
    });
    if (extraBonus) appliedBonuses.push(`${extraBonus} (manual)`);

    const flag: HiddenTestFlag = { outcome, skillLabel: request.skillLabel, actorName, appliedBonuses };

    await ChatMessage.create({
        content: buildHiddenTestCardHtml(request.skillLabel, actorName, roll, outcome, appliedBonuses),
        flavor: `Teste de ${request.skillLabel}`,
        speaker: ChatMessage.getSpeaker({ actor: game.actors?.get(request.actorId) ?? null }),
        rolls: [roll.toJSON()],
        type: 5,
        flags: { [MODULE_ID]: { hiddenTest: flag } },
    });
}
