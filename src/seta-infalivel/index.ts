/**
 * Seta Infalível de Talude — Arcana 1 (Evocação). Lança 2 setas (1d4+1 de
 * essência cada), com aprimoramentos que trocam pra lanças de energia (1d8+1)
 * e/ou aumentam o número de setas/lanças pra 3/5/10. Um eventual bônus de
 * dano de magias (ex.: Arcano de Batalha) é aplicado em APENAS UMA seta.
 *
 * O T20 nativo trata a magia como um único alvo — o dano total (todas as
 * setas somadas) vai inteiro pro primeiro alvo em `game.user.targets`. Esta
 * automação intercepta o cast (em `spell-resistance/index.ts`, ANTES do loop
 * genérico de despacho por alvo) quando há MAIS DE 1 alvo marcado: abre um
 * prompt pro conjurador escolher quantas setas vão pra cada alvo (usando os
 * resultados REAIS já rolados, sem re-rolar nada) e qual delas carrega o
 * bônus extra. Com 1 alvo só não há nada pra dividir — o total já é o valor
 * certo, então a função devolve `handled:false` e deixa o fluxo genérico
 * seguir (só cuidamos da animação nesse caso).
 *
 * Animação: dispara `AutomatedAnimations.playAnimation` uma vez por seta
 * (mesmo padrão de `baforada/index.ts`), direcionada ao alvo real de cada
 * uma. ⚠️ Não cancelamos o cast nativo (ao contrário da Baforada) — o
 * picker nativo de aprimoramentos continua intacto. Isso significa que o
 * A-A pode ALSO disparar automaticamente por conta própria no cast nativo;
 * não há como suprimir esse disparo sem reimplementar o fluxo inteiro.
 * Precisa de verificação ao vivo pra confirmar a contagem final observada.
 */

import { norm } from "@/inspiracao/format";
import { warn } from "@/utils/logging";

export const SPELL_NAME_NORM = "seta infalivel";

// ── Tipos mínimos (desacoplados dos globais, p/ testabilidade) ─────────────────

export interface OnUseEffectLike {
    description?: unknown;
    cost?: unknown;
    qty?: unknown;
}

export interface DieResultLike { result: number; active?: boolean }
export interface DieTermLike { faces?: number; results?: DieResultLike[] }
export interface RollLike { dice?: DieTermLike[]; total?: number | null }

export interface SetaTokenLike {
    id: string;
    name?: string;
    actor?: { id?: string; name?: string } | null;
}

interface AAItemLike { name?: string }
interface AAActorLike {
    getActiveTokens?: () => unknown[];
    items?: { contents: AAItemLike[] };
}

// ── Funções puras (testáveis) ───────────────────────────────────────────────────

/**
 * Nº de setas/lanças a partir dos aprimoramentos selecionados (base 2).
 * Os textos são mutuamente exclusivos no livro — se por algum motivo mais de
 * um bater, usa o maior (mais seguro do que subestimar).
 */
export function computeArrowCount(onUseEffects: OnUseEffectLike[]): number {
    let count = 2;
    for (const e of onUseEffects) {
        const desc = String(e.description ?? "");
        if (/\bdez\b/i.test(desc)) count = Math.max(count, 10);
        else if (/\bcinco\b/i.test(desc)) count = Math.max(count, 5);
        else if (/\btr[eê]s\b/i.test(desc)) count = Math.max(count, 3);
    }
    return count;
}

/**
 * Aprimoramento "muda as setas para lanças de energia" (troca o dado pra d8).
 * ⚠️ Não basta procurar "lança" — os aprimoramentos de CONTAGEM usam o texto
 * genérico "setas/lanças" mesmo sem trocar o dado. A cláusula "surgem e caem
 * do céu" é exclusiva do aprimoramento que muda o tipo de dado.
 */
export function isLancaVariant(onUseEffects: OnUseEffectLike[]): boolean {
    return onUseEffects.some((e) => /surgem e caem do c[eé]u/i.test(String(e.description ?? "")));
}

export function arrowDieFaces(isLanca: boolean): number {
    return isLanca ? 8 : 4;
}

/** Resultados brutos (sem o "+1" fixo) de cada dado ATIVO com as faces dadas. */
export function extractArrowResults(roll: RollLike | null | undefined, dieFaces: number): number[] {
    const group = (roll?.dice ?? []).find((d) => Number(d.faces) === dieFaces);
    return (group?.results ?? []).filter((r) => r.active !== false).map((r) => r.result);
}

/**
 * Bônus extra de dano de magias (ex.: Arcano de Batalha) aplicado em apenas
 * uma seta. `total` já é a soma de todos os dados + todos os modificadores
 * planos do roll; cada seta sempre carrega um "+1" fixo (texto do livro),
 * então o que sobra depois de descontar dados + N×1 é o bônus extra.
 */
export function computeExtraBonus(total: number, arrowResults: number[], arrowCount: number): number {
    const rawSum = arrowResults.reduce((s, v) => s + v, 0);
    return Math.max(0, total - rawSum - arrowCount);
}

/**
 * Agrupa o dano por alvo: cada seta vale `resultado+1`, mais o `extraBonus`
 * se for a seta marcada como portadora do bônus.
 */
export function groupArrowDamage(
    arrowResults: number[],
    targetIdPerArrow: string[],
    bonusArrowIndex: number | null,
    extraBonus: number,
): Map<string, number> {
    const totals = new Map<string, number>();
    arrowResults.forEach((v, i) => {
        const value = v + 1 + (i === bonusArrowIndex ? extraBonus : 0);
        const tid = targetIdPerArrow[i];
        if (!tid) return;
        totals.set(tid, (totals.get(tid) ?? 0) + value);
    });
    return totals;
}

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Animação (Automated Animations) ─────────────────────────────────────────────

function findSetaItem(actor: AAActorLike | null | undefined): AAItemLike | undefined {
    return actor?.items?.contents.find((i) => norm(i.name ?? "").includes(SPELL_NAME_NORM));
}

function getFirstActiveToken(actor: AAActorLike | null | undefined): unknown {
    return actor?.getActiveTokens?.()[0];
}

/**
 * Dispara a animação da magia 1x por seta, cada uma em direção ao alvo real
 * que a recebeu (staggered, ~180ms entre cada uma pra parecer uma rajada).
 * No-op silencioso sem Automated Animations instalado — não bloqueia o fluxo.
 */
function fireSetaAnimations(sourceToken: unknown, item: AAItemLike | undefined, arrowTargets: SetaTokenLike[]): void {
    try {
        const AA = (globalThis as unknown as {
            AutomatedAnimations?: { playAnimation?: (src: unknown, item: unknown, opts?: unknown) => unknown };
        }).AutomatedAnimations;
        if (typeof AA?.playAnimation !== "function") return;
        if (!sourceToken || !item || arrowTargets.length === 0) return;

        let i = 0;
        const fire = (): void => {
            if (i >= arrowTargets.length) return;
            const target = arrowTargets[i];
            try { void AA.playAnimation!(sourceToken, item, { targets: [target] }); }
            catch (e) { warn("seta-infalivel: falha ao disparar animação de uma seta:", e); }
            i++;
            setTimeout(fire, 180);
        };
        fire();
    } catch (e) {
        warn("seta-infalivel: falha ao preparar animação:", e);
    }
}

// ── Prompt de divisão (multi-alvo) ──────────────────────────────────────────────

interface SplitTargetOption { id: string; name: string }

function buildSplitContent(args: {
    casterName: string;
    arrowResults: number[];
    extraBonus: number;
    targets: SplitTargetOption[];
}): string {
    const { casterName, arrowResults, extraBonus, targets } = args;

    const rows = arrowResults.map((v, i) => {
        const defaultTargetId = targets[i % targets.length]!.id;
        const options = targets
            .map((t) => `<option value="${esc(t.id)}"${t.id === defaultTargetId ? " selected" : ""}>${esc(t.name)}</option>`)
            .join("");
        const bonusCell = extraBonus > 0
            ? `<td style="text-align:center;padding:3px 6px"><input type="radio" name="t20-seta-bonus" value="${i}"${i === 0 ? " checked" : ""}></td>`
            : "";
        return `<tr>
            <td style="padding:3px 6px">Seta ${i + 1}</td>
            <td style="padding:3px 6px">${v}+1 = <b>${v + 1}</b></td>
            <td style="padding:3px 6px"><select data-seta-target="${i}" style="width:100%">${options}</select></td>
            ${bonusCell}
        </tr>`;
    }).join("");

    const bonusHeader = extraBonus > 0 ? `<th style="text-align:left;padding:3px 6px">Bônus (+${extraBonus})</th>` : "";
    const bonusNote = extraBonus > 0
        ? `<p style="margin:4px 0 8px;color:#c8a96e">Bônus de dano da magia: <b>+${extraBonus}</b> — aplicado em apenas 1 seta. Marque qual.</p>`
        : "";

    return `
        <div class="t20-seta-split" style="padding:2px 4px;line-height:1.5">
            <p style="margin:0 0 6px"><b>${esc(casterName)}</b> lançou <b>${arrowResults.length}</b> seta(s)/lança(s) contra <b>${targets.length}</b> alvos. Escolha para onde cada uma vai:</p>
            ${bonusNote}
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr>
                    <th style="text-align:left;padding:3px 6px">Seta</th>
                    <th style="text-align:left;padding:3px 6px">Dano</th>
                    <th style="text-align:left;padding:3px 6px">Alvo</th>
                    ${bonusHeader}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── Orquestração ─────────────────────────────────────────────────────────────

export interface SetaHandleArgs {
    /** `flags.tormenta20.onUseEffects` da mensagem — aprimoramentos selecionados. */
    onUseEffects: OnUseEffectLike[];
    damageRoll: RollLike | null | undefined;
    /** Dano total já ajustado (ex.: pós-reroll do Adamante esotérico). */
    effectiveDamage: number;
    effectiveTargets: SetaTokenLike[];
    casterActor: AAActorLike | null | undefined;
    casterName: string;
    spellName: string;
    /** Chamado 1x por alvo com o dano final agrupado dele. */
    dispatch: (targetId: string, damageTotal: number) => void;
}

/**
 * Retorna `true` quando assumiu o fluxo (o chamador deve pular o despacho
 * genérico); `false` quando não se aplica (não é esta magia, alvo único,
 * roll com formato inesperado, etc.) — o chamador segue normalmente.
 */
export async function maybeHandleSetaInfalivel(args: SetaHandleArgs): Promise<boolean> {
    const { onUseEffects, damageRoll, effectiveDamage, effectiveTargets, casterActor, casterName, spellName, dispatch } = args;

    if (!norm(spellName).includes(SPELL_NAME_NORM)) return false;
    if (!damageRoll || effectiveTargets.length === 0) return false;

    const arrowCount = computeArrowCount(onUseEffects);
    if (arrowCount <= 1) return false;

    const dieFaces = arrowDieFaces(isLancaVariant(onUseEffects));
    const arrowResults = extractArrowResults(damageRoll, dieFaces);
    if (arrowResults.length !== arrowCount) {
        warn(`seta-infalivel: esperava ${arrowCount} dado(s) de d${dieFaces} na rolagem, achou ${arrowResults.length} — divisão automática ignorada.`);
        return false;
    }

    const extraBonus = computeExtraBonus(effectiveDamage, arrowResults, arrowCount);
    const item = findSetaItem(casterActor);
    const sourceToken = getFirstActiveToken(casterActor);

    if (effectiveTargets.length <= 1) {
        // Alvo único: o total genérico já está certo — só cuidamos da animação.
        fireSetaAnimations(sourceToken, item, arrowResults.map(() => effectiveTargets[0]!));
        return false;
    }

    const targets: SplitTargetOption[] = effectiveTargets.map((t) => ({ id: t.id, name: t.actor?.name ?? t.name ?? "Alvo" }));

    await foundry.applications.api.DialogV2.wait({
        classes: ["t20-dialog", "t20-seta-infalivel-dialog"],
        window: { title: `Seta Infalível — dividir ${arrowCount} setas` },
        position: { width: 480 },
        content: buildSplitContent({ casterName, arrowResults, extraBonus, targets }),
        buttons: [
            {
                type: "submit",
                action: "confirm",
                label: "Confirmar",
                icon: "fas fa-check",
                default: true,
                callback: (_ev, _btn, dialog) => {
                    const root = dialog.element;
                    const targetIdPerArrow = arrowResults.map((_, i) =>
                        root.querySelector<HTMLSelectElement>(`select[data-seta-target="${i}"]`)?.value ?? targets[0]!.id);
                    const checkedRadio = root.querySelector<HTMLInputElement>('input[name="t20-seta-bonus"]:checked');
                    const bonusArrowIndex = checkedRadio ? Number(checkedRadio.value) : (extraBonus > 0 ? 0 : null);

                    const totals = groupArrowDamage(arrowResults, targetIdPerArrow, bonusArrowIndex, extraBonus);
                    for (const [targetId, dmg] of totals) {
                        if (dmg > 0) dispatch(targetId, dmg);
                    }

                    const arrowTokens = targetIdPerArrow.map((tid) =>
                        effectiveTargets.find((t) => t.id === tid) ?? effectiveTargets[0]!);
                    fireSetaAnimations(sourceToken, item, arrowTokens);
                },
            },
            {
                type: "button",
                action: "cancel",
                label: "Cancelar",
                icon: "fas fa-ban",
                callback: () => {
                    ui.notifications?.warn(`${casterName} cancelou a divisão de "${spellName}" — nenhum dano foi aplicado.`);
                },
            },
        ],
        rejectClose: false,
    });

    return true;
}
