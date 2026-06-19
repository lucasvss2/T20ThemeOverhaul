/**
 * Patches openUnifiedSpellModal in spell-resistance/index.ts:
 * replaces the legacy `new Dialog(...)` block with a DialogV2.wait() call.
 */
"use strict";
const fs = require("fs");

const filePath = "src/spell-resistance/index.ts";
let src = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

const startMarker = "\n    new Dialog(\n";
const endMarker   = "\n    ).render(true);\n";

const si = src.indexOf(startMarker);
const ei = src.indexOf(endMarker, si);
if (si < 0 || ei < 0) {
    console.error("ERROR: markers not found", si, ei);
    process.exit(1);
}

const before = src.slice(0, si);
const after  = src.slice(ei + endMarker.length);

const replacement = `

    // ── Dialog ────────────────────────────────────────────────────────────────

    void foundry.applications.api.DialogV2.wait({
        id:      \`spell-modal-\${preReq.requestId}\`,
        classes: ["t20-dialog", "smf-dialog"],
        window:  { title: \`\${preReq.spellName} \\u2014 \${targetName}\` },
        position: { width: 480 },
        content,
        buttons: [
            {
                type:    "submit",
                action:  "finalize",
                label:   "Finalizar",
                icon:    "fas fa-check",
                default: true,
                callback: () => { /* todos os efeitos já foram aplicados inline */ },
            },
        ],
        render: (_event, dialog) => {
            const root = dialog.element;

            // ── Collapse sections ─────────────────────────────────────────────
            // Only section-title elements that have a .smf-collapse-btn child are
            // collapsible — prevents inner sub-titles from toggling the parent.
            root.querySelectorAll<HTMLElement>(".smf-section-title").forEach((title) => {
                if (!title.querySelector(".smf-collapse-btn")) return;
                title.addEventListener("click", () => {
                    title.closest(".smf-section")?.classList.toggle("smf-collapsed");
                });
            });

            // ── PM total ──────────────────────────────────────────────────────
            root.querySelectorAll(".smf-power-check").forEach((el) => {
                el.addEventListener("change", () => {
                    const total = Array.from(root.querySelectorAll<HTMLElement>(".smf-power-check:checked"))
                        .reduce((s, e) => s + parseInt(e.dataset["pm"] ?? "0", 10), 0);
                    const pmTotalEl = root.querySelector("#smf-pm-total");
                    if (pmTotalEl) pmTotalEl.textContent = String(total);
                });
            });

            // ── Rolar Resist\\u00eancia (suporta reroll) ────────────────────────────
            let hasRolledResist = false;
            const rollResistBtn = root.querySelector<HTMLButtonElement>("#smf-roll-resist");
            rollResistBtn?.addEventListener("click", function () {
                const btn = this;
                btn.disabled = true;

                const bonusExtra = (root.querySelector<HTMLInputElement>('[name="bonusExtra"]')?.value ?? "").trim();
                const selected = Array.from(root.querySelectorAll<HTMLElement>(".smf-power-check:checked")).map((el) => ({
                    pm:         parseInt(el.dataset["pm"]        ?? "0", 10),
                    bonus:      el.dataset["bonus"]     ?? "",
                    advantage:  el.dataset["advantage"] === "true",
                    bonusLabel: el.dataset["label"]     ?? "",
                    name:       el.dataset["name"]      ?? "",
                }));

                const hasAdvantage = selected.some((p) => p.advantage);
                const parts: string[] = [hasAdvantage ? "2d20kh1" : "1d20"];
                if (baseBonus !== 0) {
                    parts.push(baseBonus > 0 ? \`+ \${baseBonus}\` : \`- \${Math.abs(baseBonus)}\`);
                }
                for (const p of selected) {
                    if (!p.bonus || p.bonus === "kh") continue;
                    const b = p.bonus.trim();
                    parts.push(b.startsWith("+") || b.startsWith("-") ? b : \`+ \${b}\`);
                }
                if (bonusExtra) {
                    const b = bonusExtra.trim();
                    parts.push(b.startsWith("+") || b.startsWith("-") ? b : \`+ \${b}\`);
                }

                void (async () => {
                    const roll = new Roll(parts.join(" "));
                    await roll.evaluate({ async: true });

                    // Desconta PM apenas na PRIMEIRA rolagem; rerolls s\\u00e3o livres
                    if (!hasRolledResist) {
                        const totalPm = selected.reduce((s, p) => s + p.pm, 0);
                        if (totalPm > 0 && targetActor) {
                            const cur = targetActor.system?.attributes?.pm?.value ?? 0;
                            await targetActor.update({ "system.attributes.pm.value": Math.max(0, cur - totalPm) });
                        }
                    }

                    const d20Res = (roll.dice?.[0] as { results?: { active?: boolean; result?: number }[] } | undefined)
                        ?.results?.find((r) => r.active)?.result ?? 0;
                    const total    = roll.total ?? 0;
                    const critFail = d20Res === 1;
                    const critPass = d20Res === 20;
                    const passed   = critPass || (!critFail && total >= preReq.cd);
                    const sl       = skillKey ? SKILL_LABELS[skillKey] : "Resist\\u00eancia";

                    const appliedLabels: string[] = selected.map((p) => {
                        const pmStr = p.pm > 0 ? \` (\${p.pm} PM)\` : "";
                        return \`\${p.bonusLabel} \\u00b7 \${p.name}\${pmStr}\`;
                    });
                    if (bonusExtra) appliedLabels.push(\`\${bonusExtra} (manual)\`);

                    const chatBadge = critPass ? "\\u2726 SUCESSO CR\\u00cdTICO" : critFail ? "\\u2620 FALHA CR\\u00cdTICA" : (passed ? "\\u2713 PASSOU" : "\\u2717 FALHOU");
                    await ChatMessage.create({
                        content: await roll.render({ flavor: \`Resist\\u00eancia \\u2014 \${sl} (\${targetName}) vs CD \${preReq.cd} \${chatBadge}\` }),
                        rolls:   [roll.toJSON()],
                        type:    5,
                        speaker: ChatMessage.getSpeaker({ actor: targetActor ?? null }),
                        flags:   { [MODULE_ID]: { resistanceRoll: true } },
                    });

                    const outcomeText = passed
                        ? (preReq.resistOutcome === "anula"   ? "Sem efeito (passou)" :
                           preReq.resistOutcome === "metade"  ? "Metade do dano (passou)" :
                           preReq.resistOutcome === "parcial" ? "Metade + sem condi\\u00e7\\u00f5es (passou)" :
                           "Passou \\u2014 veja texto da magia")
                        : "Falhou \\u2014 efeito completo";

                    const passClass  = passed ? "smf-rr-pass"       : "smf-rr-fail";
                    const badgeClass = passed ? "smf-rr-badge-pass" : "smf-rr-badge-fail";
                    const badgeText  = critPass ? "SUCESSO CR\\u00cdTICO" : critFail ? "FALHA CR\\u00cdTICA" : (passed ? "PASSOU" : "FALHOU");
                    const powersHtmlResult = appliedLabels.length > 0
                        ? \`<div class="smf-applied-powers">\${appliedLabels.map((l) => \`<div class="smf-applied-power">\\u2726 \${esc(l)}</div>\`).join("")}</div>\`
                        : "";

                    const resistResultEl = root.querySelector<HTMLElement>("#smf-resist-result");
                    if (resistResultEl) {
                        resistResultEl.innerHTML = \`
                            <div class="smf-rr-row">
                                <span class="smf-label-sm">\${esc(sl.toUpperCase())}</span>
                                <span class="\${passClass}">\${total}</span>
                                <span class="smf-label-sm">d20: \${d20Res} + \${baseBonus}</span>
                                <span class="smf-label-sm">CD \${preReq.cd}</span>
                                <span class="\${badgeClass}">\${badgeText}</span>
                            </div>
                            \${powersHtmlResult}
                            <div class="smf-rr-outcome">\${esc(outcomeText)}</div>
                        \`;
                        resistResultEl.style.display = "";
                    }

                    const powersWrap = root.querySelector<HTMLElement>("#smf-powers-wrap");
                    if (powersWrap) powersWrap.style.display = "none";
                    if (!hasRolledResist) {
                        btn.innerHTML = \`<i class="fas fa-rotate"></i> Rerolar \${esc(skillLabel)} (CD \${preReq.cd})\`;
                        hasRolledResist = true;
                    }
                    btn.disabled = false;
                })();
            });

            // ── Consagrar (maximiza cura) ─────────────────────────────────────
            const consagrarCb = root.querySelector<HTMLInputElement>("#smf-consagrar");
            consagrarCb?.addEventListener("change", () => {
                const checked = consagrarCb.checked;
                const healBtn = root.querySelector<HTMLButtonElement>("#smf-heal-full");
                if (!healBtn) return;
                const baseVal = parseInt(healBtn.dataset["healBase"] ?? "", 10) || preReq.damageTotal;
                const maxVal  = parseInt(healBtn.dataset["healMax"]  ?? "", 10) || preReq.damageTotal;
                const val     = checked ? maxVal : baseVal;
                const halfU   = Math.floor(val / 2);
                const healNum = root.querySelector<HTMLElement>("#smf-heal-number");
                if (healNum) healNum.textContent = String(val);
                healBtn.dataset["healCurrent"] = String(val);
                healBtn.innerHTML = \`<i class="fas fa-heart"></i> Curar (\${val})\${preReq.removeFadiga ? " e Remover Fadiga" : ""}\`;
                const undeadFull = root.querySelector<HTMLButtonElement>("#smf-undead-full");
                const undeadHalf = root.querySelector<HTMLButtonElement>("#smf-undead-half");
                if (undeadFull) undeadFull.innerHTML = \`<i class="fas fa-skull-crossbones"></i> Dano Completo (\${val})\`;
                if (undeadHalf) undeadHalf.innerHTML = \`<i class="fas fa-shield-halved"></i> Metade do Dano (\${halfU})\`;
            });

            // ── Auto-marca Consagrar se o alvo est\\u00e1 em \\u00e1rea de Consagrar ──────
            if (preReq.isHeal && targetActor) {
                const hasBoost = (targetActor.effects?.contents ?? []).some((e) => {
                    const f = e.flags?.[MODULE_ID] as Record<string, unknown> | undefined;
                    return f?.["consagrarHealingBoost"] === true;
                });
                if (hasBoost && consagrarCb && !consagrarCb.checked) {
                    consagrarCb.checked = true;
                    consagrarCb.dispatchEvent(new Event("change"));
                    consagrarCb.closest<HTMLElement>(".smf-consagrar-label")?.setAttribute("title", "Alvo est\\u00e1 em \\u00e1rea de Consagrar \\u2014 b\\u00f4nus auto-aplicado");
                }
            }

            // ── Morto-Vivo ────────────────────────────────────────────────────
            const mortoCb = root.querySelector<HTMLInputElement>("#smf-morto-vivo");
            const undeadSection = root.querySelector<HTMLElement>("#smf-undead-section");
            mortoCb?.addEventListener("change", () => {
                if (undeadSection) undeadSection.style.display = mortoCb.checked ? "" : "none";
            });

            // ── Truque de Curar Ferimentos ────────────────────────────────────
            if (preReq.truqueAtivo) {
                consagrarCb?.closest<HTMLElement>(".smf-consagrar-label")?.style.setProperty("display", "none");
                const healFullBtn = root.querySelector<HTMLElement>("#smf-heal-full");
                if (healFullBtn) healFullBtn.style.display = "none";
                if (mortoCb) {
                    mortoCb.checked  = true;
                    mortoCb.disabled = true;
                    mortoCb.closest<HTMLElement>(".smf-undead-label")?.setAttribute("title", "Truque: alvo j\\u00e1 \\u00e9 morto-vivo (1d8 dano de luz)");
                }
                if (undeadSection) undeadSection.style.display = "";
            }

            // ── Rolar Vontade (resist\\u00eancia do morto-vivo) ─────────────────────
            const undeadRollBtn = root.querySelector<HTMLButtonElement>("#smf-undead-roll");
            undeadRollBtn?.addEventListener("click", function () {
                const btn = this;
                btn.disabled = true;
                const vontBonus = targetActor ? computeSkillTotal(targetActor, "vont") : 0;
                const bonusStr  = vontBonus >= 0 ? \`+\${vontBonus}\` : \`\${vontBonus}\`;
                void (async () => {
                    const roll = new Roll(\`1d20 \${bonusStr}\`);
                    await roll.evaluate({ async: true } as never);
                    const d20Res = (roll.dice?.[0] as { results?: { active?: boolean; result?: number }[] } | undefined)
                        ?.results?.find((r) => r.active)?.result ?? 0;
                    const total    = roll.total ?? 0;
                    const critFail = d20Res === 1;
                    const critPass = d20Res === 20;
                    const passed   = critPass || (!critFail && preReq.cd > 0 && total >= preReq.cd);
                    const cdLabel  = preReq.cd > 0 ? \`CD \${preReq.cd}\` : "CD ?";

                    const chatBadge = critPass ? "\\u2726 SUCESSO CR\\u00cdTICO" : critFail ? "\\u2620 FALHA CR\\u00cdTICA" : (passed ? "\\u2713 PASSOU" : "\\u2717 FALHOU");
                    await ChatMessage.create({
                        content: await roll.render({ flavor: \`Resist\\u00eancia Vontade (\${targetName}) vs \${cdLabel} \\u2014 \${chatBadge}\` }),
                        rolls:   [roll.toJSON()],
                        type:    5,
                        speaker: ChatMessage.getSpeaker({ actor: targetActor ?? null }),
                        flags:   { [MODULE_ID]: { resistanceRoll: true } },
                    });

                    const passClass  = passed ? "smf-rr-pass"       : "smf-rr-fail";
                    const badgeClass = passed ? "smf-rr-badge-pass" : "smf-rr-badge-fail";
                    const badgeText  = critPass ? "SUCESSO CR\\u00cdTICO" : critFail ? "FALHA CR\\u00cdTICA" : (passed ? "PASSOU" : "FALHOU");
                    const outcome    = passed ? "Metade do dano (passou)" : "Dano completo (falhou)";

                    const undeadResultEl = root.querySelector<HTMLElement>("#smf-undead-result");
                    if (undeadResultEl) {
                        undeadResultEl.innerHTML = \`
                            <div class="smf-rr-row">
                                <span class="smf-label-sm">VONTADE</span>
                                <span class="\${passClass}">\${total}</span>
                                <span class="smf-label-sm">d20 + \${vontBonus}</span>
                                <span class="smf-label-sm">\${cdLabel}</span>
                                <span class="\${badgeClass}">\${badgeText}</span>
                            </div>
                            <div class="smf-rr-outcome">\${esc(outcome)}</div>
                        \`;
                        undeadResultEl.style.display = "";
                    }
                    btn.style.display = "none";
                    const dmgBtns = root.querySelector<HTMLElement>("#smf-undead-dmg-btns");
                    if (dmgBtns) dmgBtns.style.display = "";
                })();
            });

            // ── Dano sagrado ao morto-vivo ────────────────────────────────────
            root.querySelectorAll<HTMLButtonElement>(".smf-undead-dmg-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const healNum = root.querySelector<HTMLElement>("#smf-heal-number");
                    const curHeal = parseInt(healNum?.textContent ?? "", 10) || preReq.damageTotal;
                    const halfU   = Math.floor(curHeal / 2);
                    let amt   = 0;
                    let label = "";
                    if (btn.id === "smf-undead-full") {
                        amt   = curHeal;
                        label = \`\\u2713 \${amt} de dano sagrado aplicado\`;
                    } else if (btn.id === "smf-undead-half") {
                        amt   = halfU;
                        label = \`\\u2713 \${amt} de dano sagrado (metade) aplicado\`;
                    } else {
                        label = "\\u2713 Dano sagrado n\\u00e3o aplicado";
                    }
                    if (amt > 0) await applySpellDamage(preReq.targetActorUuid, preReq.targetActorId, amt);
                    root.querySelectorAll(".smf-undead-dmg-btn").forEach((b) => b.classList.add("smf-spent"));
                    const fb = root.querySelector<HTMLElement>("#smf-undead-feedback");
                    if (fb) { fb.textContent = label; fb.style.display = ""; }
                });
            });

            // ── Dano / Cura ───────────────────────────────────────────────────
            root.querySelectorAll<HTMLButtonElement>(".smf-dmg-btn, .smf-heal-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    let label = "";
                    if (btn.id === "smf-heal-full") {
                        const healAmt = parseInt(btn.dataset["healCurrent"] ?? "", 10) || preReq.damageTotal;
                        await applySpellHeal(preReq.targetActorUuid, preReq.targetActorId, healAmt);
                        label = \`\\u2713 Cura de \${healAmt} aplicada\`;
                        if (preReq.removeFadiga) {
                            const removed = await removeFadigaCondition(preReq.targetActorUuid, preReq.targetActorId);
                            label += removed ? " \\u00b7 Fadiga removida" : " \\u00b7 sem Fadiga para remover";
                        }
                    } else if (btn.id === "smf-no-heal" || btn.id === "smf-dmg-none") {
                        label = "\\u2713 N\\u00e3o aplicado";
                    } else {
                        const amt = parseInt(btn.dataset["dmg"] ?? "", 10) || 0;
                        if (amt > 0) await applySpellDamage(preReq.targetActorUuid, preReq.targetActorId, amt);
                        label = amt > 0 ? \`\\u2713 \${amt} de dano aplicado\` : "\\u2713 N\\u00e3o aplicado";
                    }
                    root.querySelectorAll(".smf-dmg-btn, .smf-heal-btn").forEach((b) => b.classList.add("smf-spent"));
                    const fb = root.querySelector<HTMLElement>("#smf-dmg-feedback");
                    if (fb) { fb.textContent = label; fb.style.display = ""; }
                });
            });

            // ── Buff ──────────────────────────────────────────────────────────
            root.querySelectorAll<HTMLButtonElement>(".smf-buff-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    if (!targetActor) return;
                    const idx = parseInt(btn.dataset["effectIndex"] ?? "", 10);
                    if (isNaN(idx)) return;
                    await applyBuffEffect(preReq.messageId, idx, targetActor);
                    btn.classList.add("smf-spent");
                    btn.insertAdjacentText("beforeend", " \\u2713");
                    const fb = root.querySelector<HTMLElement>("#smf-buff-feedback");
                    if (fb) { fb.textContent = "\\u2713 Efeito aplicado"; fb.style.display = ""; }
                });
            });

            // ── Filtro de condi\\u00e7\\u00f5es ───────────────────────────────────────────
            const condFilter = root.querySelector<HTMLInputElement>("#smf-cond-filter");
            condFilter?.addEventListener("input", () => {
                const q = condFilter.value.toLowerCase().trim();
                root.querySelectorAll<HTMLElement>(".smf-cond-item").forEach((el) => {
                    const name = el.dataset["name"] ?? "";
                    el.classList.toggle("smf-hidden", q.length > 0 && !name.includes(q));
                });
            });

            // ── Aplicar condi\\u00e7\\u00f5es ─────────────────────────────────────────────
            root.querySelector("#smf-cond-apply")?.addEventListener("click", () => {
                const checked: string[] = [];
                root.querySelectorAll<HTMLInputElement>(".smf-cond-grid input:checked").forEach((el) => {
                    if (el.value) {
                        void applyCondition(preReq.targetActorUuid, preReq.targetActorId, el.value);
                        checked.push(el.value);
                    }
                });
                if (checked.length > 0) {
                    const fb = root.querySelector<HTMLElement>("#smf-cond-feedback");
                    if (fb) { fb.textContent = \`\\u2713 \${checked.length} condi\\u00e7\\u00e3o(\\u00f5es) aplicada(s)\`; fb.style.display = ""; }
                    root.querySelectorAll<HTMLInputElement>(".smf-cond-grid input:checked").forEach((el) => { el.checked = false; });
                }
            });
        },
        rejectClose: false,
    });
`;

const newSrc = (before + replacement + after).replace(/\n/g, "\r\n");
fs.writeFileSync(filePath, newSrc);
console.log("Done. File written with", newSrc.split("\r\n").length, "lines.");
