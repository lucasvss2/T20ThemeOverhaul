/**
 * T20 fix — bônus de dano "on-use" com FACE de dado diferente da base.
 *
 * ── O bug do T20 ──────────────────────────────────────────────────────────────
 * Quando um efeito on-use adiciona dano no formato `NdM(+K)` (ex.: "Tomo do
 * Rancor: +2d8+2"), o `applyRollChanges` do T20 faz parsing via
 * `re.split = /(d)|([+-])|(\d+)|.../g` e extrai apenas a CONTAGEM (N) e o número
 * fixo (K) — a FACE (M) é descartada. Depois aplica via `Roll.alter(1, N)`, que
 * apenas SOMA N dados à contagem do dado BASE. Não existe mecanismo no T20 para
 * somar um dado de face diferente a uma parte de dano existente.
 *
 * Resultado: numa Bola de Fogo (base 6d6), "+2d8+2" vira "+2d6+2" — face errada
 * (d6 em vez de d8).
 *
 * ── A correção ────────────────────────────────────────────────────────────────
 * Em vez de mexer na engine privada de rolagem do T20, embrulhamos o método
 * público `ItemT20.prototype.rollDamage` (assíncrono). Depois que o T20 rola o
 * dano (resultado em `this.system.rolled[name]`, ANTES de montar o card):
 *
 *   1. Lê os onUseEffects aplicados (de `options.onUseEffects`) + a face base
 *      (de `this.system.rolls`).
 *   2. Para cada efeito com change `dano` de valor `NdM(+K)` onde M != face base:
 *      reduz a contagem do dado base em N (desfaz os dados base somados por
 *      engano) e ANEXA `NdM` como termo próprio (face correta). O fixo (+K) já
 *      está no roll (addNum do T20) — não é duplicado.
 *   3. Re-avalia o roll corrigido (async OK aqui) e substitui o resultado.
 *
 * No-op total se: não há efeito de face estrangeira, a face base é desconhecida,
 * ou a contagem do dado base é menor que o total a reduzir. Tudo em try/catch.
 */

import { log, warn } from "@/utils/logging";

const STR_VALUE_RE = /^(\d+)d(\d+)([+-]\d+)?$/;

interface AEChange { key?: string; value?: string; mode?: number }
interface AELike   { name?: string; changes?: AEChange[] }
interface OnUseEntry { description?: string; qty?: number }
interface ForeignBonus { count: number; faces: number; dmgType: string }

interface ItemLike {
    actor?: FoundryActor | null;
    effects?: { contents: unknown[] };
    system?: {
        rolls?: Array<{ type?: string; name?: string; parts?: Array<[string, string?, string?]> }>;
        rolled?: Record<string, Roll>;
    };
}

/** Face do dado base do dano (de system.rolls, parte 0 do primeiro roll de dano). 0 = desconhecida. */
function baseDamageFace(item: ItemLike): number {
    const dano = item.system?.rolls?.find(r => r.type === "dano");
    const expr = dano?.parts?.[0]?.[0];
    const m = typeof expr === "string" ? expr.match(/\d*d(\d+)/) : null;
    return m ? parseInt(m[1], 10) : 0;
}

/** AEs candidatas: efeitos do ator + efeitos do próprio item (melhorias). */
function collectCandidateEffects(item: ItemLike): AELike[] {
    const out: AELike[] = [];
    for (const e of (item.actor?.effects?.contents ?? [])) out.push(e as unknown as AELike);
    for (const e of (item.effects?.contents ?? []))         out.push(e as AELike);
    return out;
}

/** Bônus de dano `NdM(+K)` de um efeito on-use aplicado (count/flat já × qty). */
export interface OnUseDanoBonus {
    count: number;       // N × qty
    faces: number;       // M
    flat: number;        // K × qty (0 se ausente)
    dmgType: string;     // tipo do dano (de "dano:tipo"), "" se não especificado
    description: string; // descrição do onUseEffect (pra filtrar imp1 etc.)
}

/**
 * Coleta TODOS os bônus de dano `NdM(+K)` (mode CUSTOM, key "dano"/"dano:tipo")
 * dos efeitos on-use APLICADOS, casando cada entry (por descrição) com a AE
 * correspondente entre `candidates` (effects do ator e/ou do item).
 *
 * O chamador filtra conforme o caso (face estrangeira no cast; exclusão do
 * aprimoramento próprio da magia na esfera/pedra; etc.).
 */
export function collectOnUseDanoBonuses(
    onUseEffects: unknown,
    candidates: AELike[],
): OnUseDanoBonus[] {
    if (!Array.isArray(onUseEffects)) return [];
    const result: OnUseDanoBonus[] = [];
    for (const entry of onUseEffects as OnUseEntry[]) {
        const desc = entry.description ?? "";
        const qty  = Number.isFinite(entry.qty) && (entry.qty ?? 0) > 0 ? (entry.qty as number) : 1;
        const ae = candidates.find(c => (c.name ?? "") === desc)
            ?? candidates.find(c => desc !== "" && (c.name ?? "").length > 0 && desc.includes(c.name ?? ""));
        if (!ae?.changes) continue;
        for (const ch of ae.changes) {
            if (ch.mode !== 0) continue;                       // CUSTOM
            const key = String(ch.key ?? "");
            if (!/^dano(?::\w+)?$/.test(key)) continue;        // "dano" ou "dano:tipo"
            const m = String(ch.value ?? "").match(STR_VALUE_RE);
            if (!m) continue;
            const faces = parseInt(m[2], 10);
            if (faces < 2) continue;
            const count = parseInt(m[1], 10) * qty;
            if (count < 1) continue;
            const flat = (m[3] ? parseInt(m[3], 10) : 0) * qty;
            result.push({ count, faces, flat, dmgType: key.includes(":") ? key.split(":")[1] : "", description: desc });
        }
    }
    return result;
}

/** Bônus de dano de face estrangeira (M != face base) — usado na correção do cast. */
function collectForeignBonuses(
    onUseEffects: unknown,
    candidates: AELike[],
    baseFace: number,
): ForeignBonus[] {
    return collectOnUseDanoBonuses(onUseEffects, candidates)
        .filter(b => b.faces !== baseFace)
        .map(b => ({ count: b.count, faces: b.faces, dmgType: b.dmgType }));
}

/** Fórmula de um bônus de dano (valor COMPLETO, ex.: "2d8+2"). Para fórmulas montadas do zero. */
export function danoBonusToFormula(b: OnUseDanoBonus): string {
    const flatStr = b.flat ? (b.flat > 0 ? `+${b.flat}` : `${b.flat}`) : "";
    return `${b.count}d${b.faces}${flatStr}${b.dmgType ? `[${b.dmgType}]` : ""}`;
}

/**
 * Corrige uma fórmula-string já mangleada pelo T20 (ex.: "8d6 + 2"): reduz a
 * contagem do PRIMEIRO dado da face base em Σcount e anexa os dados de face
 * correta. O fixo (+K) permanece (T20 já o aplicou via addNum). Retorna null
 * se não conseguir reduzir com segurança (→ no-op).
 *
 * Ex.: ("8d6 + 2", base 6, [{count:2,faces:8}]) → "6d6 + 2 + 2d8".
 */
export function correctMangledDanoFormula(
    formula: string,
    baseFace: number,
    foreign: ForeignBonus[],
): string | null {
    const totalReduce = foreign.reduce((s, f) => s + f.count, 0);
    if (totalReduce < 1) return null;
    let reduced = false;
    const baseRe = new RegExp(`(\\d+)d${baseFace}\\b`);
    const reducedFormula = formula.replace(baseRe, (whole, nStr: string) => {
        if (reduced) return whole;
        const newN = parseInt(nStr, 10) - totalReduce;
        if (newN < 1) return whole;
        reduced = true;
        return `${newN}d${baseFace}`;
    });
    if (!reduced) return null;
    const extra = foreign.map(f => ` + ${f.count}d${f.faces}${f.dmgType ? `[${f.dmgType}]` : ""}`).join("");
    return reducedFormula + extra;
}

type DieTermLike = { faces?: number; number?: number; operator?: string; expression?: string; options?: { flavor?: string } };

/**
 * Reconstrói a fórmula corrigida a partir dos termos do roll mangleado,
 * preservando flavors. Reduz a contagem do PRIMEIRO dado da face base em
 * totalReduce e anexa os bônus de face correta. Retorna null se não conseguir
 * reduzir com segurança (→ no-op).
 */
function buildCorrectedFormula(roll: Roll, baseFace: number, foreign: ForeignBonus[]): string | null {
    const totalReduce = foreign.reduce((s, f) => s + f.count, 0);
    if (totalReduce < 1) return null;

    const parts: string[] = [];
    let reduced = false;
    for (const term of roll.terms as unknown as DieTermLike[]) {
        if (typeof term.faces === "number" && typeof term.number === "number") {
            let n = term.number;
            if (!reduced && term.faces === baseFace && n > totalReduce) {
                n -= totalReduce;
                reduced = true;
            }
            const fl = term.options?.flavor;
            parts.push(`${n}d${term.faces}${fl ? `[${fl}]` : ""}`);
        } else if (typeof term.operator === "string") {
            parts.push(term.operator);
        } else if (typeof (term as { number?: number }).number === "number") {
            const fl = term.options?.flavor;
            parts.push(`${(term as { number: number }).number}${fl ? `[${fl}]` : ""}`);
        } else {
            parts.push(term.expression ?? "");
        }
    }
    if (!reduced) return null;

    for (const f of foreign) {
        parts.push("+", `${f.count}d${f.faces}${f.dmgType ? `[${f.dmgType}]` : ""}`);
    }
    return parts.join(" ").trim();
}

async function correctRolledDamage(item: ItemLike, onUseEffects: unknown): Promise<void> {
    const baseFace = baseDamageFace(item);
    if (baseFace < 2) return;

    const foreign = collectForeignBonuses(onUseEffects, collectCandidateEffects(item), baseFace);
    if (!foreign.length) return;

    const rolled = item.system?.rolled;
    const danoRolls = item.system?.rolls?.filter(r => r.type === "dano") ?? [];
    if (!rolled || !danoRolls.length) return;

    for (const r of danoRolls) {
        const name = r.name ?? "";
        const roll = rolled[name];
        if (!roll || !Array.isArray((roll as { terms?: unknown[] }).terms)) continue;

        const corrected = buildCorrectedFormula(roll, baseFace, foreign);
        if (!corrected) continue;

        // Preserva options do roll original (sobretudo options.type === "damage",
        // que auto-damage / spell-resistance usam pra detectar a rolagem de dano).
        const prevOptions = (roll as unknown as { options?: Record<string, unknown> }).options ?? {};
        const RollCtor = Roll as unknown as new (f: string, d?: object, o?: object) => Roll;
        const newRoll = new RollCtor(corrected, {}, { ...prevOptions });
        await (newRoll as unknown as { evaluate: (o?: object) => Promise<unknown> }).evaluate();
        rolled[name] = newRoll;

        const dmgList = foreign.map(f => `${f.count}d${f.faces}`).join(" + ");
        log(`dano de face estrangeira corrigido (base d${baseFace} → +${dmgList}). `
            + `Fórmula: ${corrected}`,
        );
    }
}

export function setupOnUseForeignDieDano(): void {
    // Patch precisa do game.tormenta20 inicializado → roda no ready.
    Hooks.once("ready", () => {
        const docClass = (CONFIG as unknown as { Item?: { documentClass?: { prototype: Record<string, unknown> } } })
            .Item?.documentClass;
        const proto = docClass?.prototype as
            | (Record<string, unknown> & { _t20ForeignDiePatched?: boolean })
            | undefined;
        if (!proto || typeof proto["rollDamage"] !== "function") {
            warn(`onuse-foreign-die-dano: ItemT20.prototype.rollDamage não encontrado.`);
            return;
        }
        if (proto._t20ForeignDiePatched) return;

        const orig = proto["rollDamage"] as (this: ItemLike, arg?: Record<string, unknown>) => Promise<unknown>;
        proto["rollDamage"] = async function (this: ItemLike, arg?: Record<string, unknown>) {
            const ret = await orig.call(this, arg);
            try {
                const options = (arg?.["options"] ?? {}) as { onUseEffects?: unknown };
                await correctRolledDamage(this, options.onUseEffects);
            } catch (err) {
                warn(`onuse-foreign-die-dano: correção abortada (dano intacto):`, err);
            }
            return ret;
        };
        proto._t20ForeignDiePatched = true;
        log(`ItemT20.rollDamage patched (bônus de dano de face estrangeira).`);
    });
}
