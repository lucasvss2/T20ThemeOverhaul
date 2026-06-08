/**
 * T20 fix — Acuidade com Arma aplicando Destreza ao DANO de armas leves de
 * corpo-a-corpo e de armas de arremesso.
 *
 * Regra: "Quando usa uma arma corpo a corpo leve ou uma arma de arremesso, você
 * pode usar sua Destreza em vez de Força nos testes de ataque e rolagens de dano."
 *
 * ── O que o T20 já faz ─────────────────────────────────────────────────────────
 * O poder seta `flags.tormenta20.acuidade = true` no ator. No `getAttackToHit`,
 * o T20 troca a Força pela Destreza no TESTE DE ATAQUE de armas `empunhadura:
 * "leve"` (corpo-a-corpo) quando a flag está ativa e Des > For. Armas de
 * arremesso já usam a perícia Pontaria (Destreza) no ataque. Logo o ATAQUE já
 * fica correto nativamente.
 *
 * ── O gap ──────────────────────────────────────────────────────────────────────
 * O T20 NÃO troca o atributo das ROLAGENS DE DANO: a part de dano usa o token
 * literal `@for` e permanece em Força mesmo com Acuidade. O personagem de
 * Destreza perde o bônus de dano inteiro.
 *
 * ── A correção ────────────────────────────────────────────────────────────────
 * Embrulhamos `ItemT20.prototype.rollDamage`. Antes de chamar o original, para
 * armas elegíveis (leve corpo-a-corpo OU arremesso) cujo ator tem
 * `flags.tormenta20.acuidade` e Des > For, trocamos `@for` → `@des` nas parts de
 * dano. As parts originais são restauradas no `finally`. Mesma condição do T20
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

type ItemProtoLike = {
    rollDamage?:             (this: ItemForAcuidade, arg?: Record<string, unknown>) => Promise<unknown>;
    _bg3AcuidadePatched?:    boolean;
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
        if (proto._bg3AcuidadePatched) return;

        const orig = proto.rollDamage;
        proto.rollDamage = async function (this: ItemForAcuidade, arg?: Record<string, unknown>) {
            let restore = (): void => {};
            try {
                restore = injectAcuidadeDano(this);
            } catch (err) {
                warn(`acuidade-arma: troca abortada (dano intacto):`, err);
                restore = () => {};
            }
            try {
                return await orig.call(this, arg);
            } finally {
                try { restore(); } catch { /* ignore */ }
            }
        };
        proto._bg3AcuidadePatched = true;
        log(`ItemT20.rollDamage patched — Acuidade com Arma aplica @des no dano de armas leves/arremesso.`);
    });
}
