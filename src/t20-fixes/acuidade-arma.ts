/**
 * T20 fix — Acuidade com Arma aplicando Destreza ao DANO de armas leves de
 * corpo-a-corpo e de armas de arremesso.
 *
 * Regra: "Quando usa uma arma corpo a corpo leve ou uma arma de arremesso, você
 * pode usar sua Destreza em vez de Força nos testes de ataque e rolagens de dano."
 *
 * ── O que o T20 já faz (e onde falha) ──────────────────────────────────────────
 * O poder seta `flags.tormenta20.acuidade = true` no ator.
 *
 * ATAQUE (`getAttackToHit`): o T20 só troca For→Des quando o atributo do roll
 * (`roll.parts[1][1]`) está VAZIO **e** a arma é `empunhadura:"leve"` de
 * `corpo-a-corpo`. Isso deixa DOIS buracos:
 *   1. Armas de ARREMESSO — o `case "arremesso"` do T20 nunca seta `des` no
 *      ataque (só trata `arremessoPotente`). Uma adaga arremessada com perícia
 *      Luta (Força) ataca com Força mesmo com Acuidade.
 *   2. Armas com atributo EXPLÍCITO (`parts[1][1] === "for"`, comum em armas
 *      importadas do bestiário) — o T20 vê o atributo preenchido e PULA a lógica
 *      de Acuidade por completo.
 *
 * DANO (`rollDamage`): o T20 troca For→Des nativamente SÓ quando a part de dano
 * é o sentinela `"padrao"` (escolha "Padrão" no item). Armas configuradas com o
 * atributo de dano explícito guardam o literal `@for` nas parts, e aí o T20 não
 * aplica Acuidade — fica em Força.
 *
 * ── A correção ────────────────────────────────────────────────────────────────
 * Para armas elegíveis (leve corpo-a-corpo OU arremesso) cujo ator tem
 * `flags.tormenta20.acuidade` e Des > For:
 *   • `getAttackToHit` — embrulhamos forçando `roll.parts[1][1] = "des"` antes do
 *     original (cobre arremesso E atributo explícito; é no-op se já for `des`).
 *   • `rollDamage` — embrulhamos trocando `@for` → `@des` nas parts de dano com
 *     literal `@for` (parts `"padrao"` continuam tratadas nativamente pelo T20).
 * As mutações são in-place e restauradas no `finally`. Mesma condição do T20
 * (flag + Des>For), então ataque e dano ficam consistentes.
 */

import { log, warn } from "@/utils/logging";

type RollPart = [string, string?, string?];

interface DanoRollLike {
    type?:  string;
    parts?: RollPart[];
}

interface ItemForAcuidade {
    type?:   string;
    system?: { empunhadura?: string; proposito?: string; rolls?: DanoRollLike[] };
    actor?:  {
        flags?:  { tormenta20?: { acuidade?: unknown } };
        system?: { atributos?: { for?: { value?: number }; des?: { value?: number } } };
    } | null;
}

/** A arma é elegível à Acuidade? Leve de corpo-a-corpo OU de arremesso. */
export function isAcuidadeWeapon(item: ItemForAcuidade): boolean {
    if (item.type !== "arma") return false;
    const prop = item.system?.proposito ?? "";
    const emp  = item.system?.empunhadura ?? "";
    if (prop.includes("arremesso")) return true;                       // arma de arremesso
    if (emp === "leve" && prop.includes("corpo-a-corpo")) return true; // arma leve de corpo-a-corpo
    return false;
}

/** A Acuidade está ativa e vale a pena (flag do poder + Destreza > Força)? */
export function acuidadeActive(actor: ItemForAcuidade["actor"]): boolean {
    if (!actor?.flags?.tormenta20?.acuidade) return false;
    const des   = actor.system?.atributos?.des?.value ?? 0;
    const forca = actor.system?.atributos?.for?.value ?? 0;
    return des > forca;
}

/**
 * Troca `@for` → `@des` nas parts de um roll de dano. Retorna o novo array de
 * parts se houve troca, ou null caso contrário (sem `@for`, ou não é dano).
 */
export function swapDanoForToDes(roll: DanoRollLike): RollPart[] | null {
    if (roll.type !== "dano") return null;
    const parts = roll.parts ?? [];
    let changed = false;
    const next = parts.map(p => {
        const v = p?.[0] ?? "";
        if (typeof v === "string" && /@for\b/.test(v)) {
            changed = true;
            return [v.replace(/@for\b/g, "@des"), p[1], p[2]] as RollPart;
        }
        return p;
    });
    return changed ? next : null;
}

/**
 * Troca (mutando in-place) `@for` → `@des` nas parts de dano do item elegível e
 * retorna uma função que restaura as parts originais. No-op se não elegível.
 */
export function injectAcuidadeDano(item: ItemForAcuidade): () => void {
    const noop = (): void => {};
    if (!isAcuidadeWeapon(item) || !acuidadeActive(item.actor)) return noop;

    const rolls = item.system?.rolls ?? [];
    const touched: Array<[DanoRollLike, RollPart[] | undefined]> = [];
    for (const r of rolls) {
        const swapped = swapDanoForToDes(r);
        if (swapped) {
            touched.push([r, r.parts]);
            r.parts = swapped;
        }
    }
    if (!touched.length) return noop;

    return () => {
        for (const [r, orig] of touched) r.parts = orig;
    };
}

/**
 * Força (mutando in-place) o atributo do TESTE DE ATAQUE para `des` na arma
 * elegível e retorna uma função que restaura o atributo original. No-op se não
 * elegível, se já for `des`, ou se a part de ataque não tiver perícia.
 *
 * `roll.parts[1]` = `[pericia, atributo, extra]`. Setar `atributo = "des"` faz o
 * T20 (getAttackToHit) computar a perícia trocando o atributo base por Destreza
 * — cobre arremesso (que o T20 não trata) e armas com atributo explícito `for`
 * (que o T20 pularia). Para corpo-a-corpo leve com atributo vazio o resultado é
 * idêntico ao caminho nativo (sem dupla aplicação — é seleção de atributo).
 */
export function injectAcuidadeAtaque(item: ItemForAcuidade): () => void {
    const noop = (): void => {};
    if (!isAcuidadeWeapon(item) || !acuidadeActive(item.actor)) return noop;

    const rolls = item.system?.rolls ?? [];
    const atk = rolls.find(r => r.type === "ataque");
    const part1 = atk?.parts?.[1];
    if (!part1 || !part1[0]) return noop;     // precisa de perícia em parts[1][0]
    if (part1[1] === "des") return noop;      // já é Destreza

    const orig = part1[1];
    part1[1] = "des";
    return () => { part1[1] = orig; };
}

type ItemProtoLike = {
    rollDamage?:             (this: ItemForAcuidade, arg?: Record<string, unknown>) => Promise<unknown>;
    getAttackToHit?:         (this: ItemForAcuidade, ...args: unknown[]) => unknown;
    _t20AcuidadePatched?:    boolean;
};

export function setupAcuidadeArma(): void {
    Hooks.once("ready", () => {
        const docClass = (CONFIG as unknown as { Item?: { documentClass?: { prototype: object } } })
            .Item?.documentClass;
        const proto = docClass?.prototype as ItemProtoLike | undefined;
        if (!proto || typeof proto.rollDamage !== "function") {
            warn(`acuidade-arma: ItemT20.prototype.rollDamage não encontrado.`);
            return;
        }
        if (proto._t20AcuidadePatched) return;

        // ── DANO: troca @for → @des nas parts literais ───────────────────────────
        const origDano = proto.rollDamage;
        proto.rollDamage = async function (this: ItemForAcuidade, arg?: Record<string, unknown>) {
            let restore = (): void => {};
            try {
                restore = injectAcuidadeDano(this);
            } catch (err) {
                warn(`acuidade-arma: troca de dano abortada (dano intacto):`, err);
                restore = () => {};
            }
            try {
                return await origDano.call(this, arg);
            } finally {
                try { restore(); } catch { /* ignore */ }
            }
        };

        // ── ATAQUE: força atributo "des" (arremesso + atributo explícito) ────────
        if (typeof proto.getAttackToHit === "function") {
            const origAtk = proto.getAttackToHit;
            proto.getAttackToHit = function (this: ItemForAcuidade, ...args: unknown[]) {
                let restore = (): void => {};
                try {
                    restore = injectAcuidadeAtaque(this);
                } catch (err) {
                    warn(`acuidade-arma: troca de ataque abortada (ataque intacto):`, err);
                    restore = () => {};
                }
                try {
                    return origAtk.apply(this, args);
                } finally {
                    try { restore(); } catch { /* ignore */ }
                }
            };
        } else {
            warn(`acuidade-arma: ItemT20.prototype.getAttackToHit não encontrado — ataque não patcheado.`);
        }

        proto._t20AcuidadePatched = true;
        log(`ItemT20 patched — Acuidade com Arma aplica @des no ataque E no dano de armas leves/arremesso.`);
    });
}
