/**
 * T20 fix — Estilo de Disparo aplicando Destreza ao dano de armas de disparo
 * configuradas com um atributo de dano explícito (ex.: Arco de Guerra).
 *
 * ── O problema ────────────────────────────────────────────────────────────────
 * O Estilo de Disparo é implementado NATIVAMENTE pelo T20. No `rollDamage`, uma
 * part de dano com o valor literal `"padrao"` é convertida — para armas de
 * `proposito: "disparo"` — em `"@des"` quando o ator tem a flag
 * `flags.tormenta20.estiloDisparo` (setada pelo AE do poder). O switch do T20:
 *
 *     case "disparo": dano = flags?.estiloDisparo ? "@des" : ""; break;
 *
 * Porém, armas cujo atributo de dano foi configurado com um token EXPLÍCITO
 * (o Arco de Guerra usa `"@for"` porque sua regra própria é aplicar Força)
 * nunca passam pelo ramo `"padrao"`. Logo o T20 jamais injeta o `@des` do
 * Estilo de Disparo, e o arqueiro de Destreza perde o bônus inteiro.
 *
 * O T20 não tem mecanismo nativo para um arco somar Força no `proposito:
 * "disparo"` (o switch só produz `@des` ou nada), então o `@for` explícito é a
 * forma correta de modelar a regra do Arco de Guerra — mas isso "atropela" o
 * Estilo de Disparo.
 *
 * ── A correção ────────────────────────────────────────────────────────────────
 * Embrulhamos `ItemT20.prototype.rollDamage`. Imediatamente antes de chamar o
 * original, para armas de disparo cujo ator tem `estiloDisparo` e cujos rolls
 * de dano ainda NÃO possuem uma part `"padrao"` (nem `@des` literal), anexamos
 * uma part `["padrao","",""]` a cada roll de dano elegível. As parts originais
 * são restauradas no `finally`.
 *
 * O T20 lê `r.parts` de forma SÍNCRONA (monta o array local de parts antes do
 * primeiro `await damageRoll(...)`), então a injeção é vista pelo cálculo e a
 * restauração após o `await` é segura.
 *
 * Reaproveita 100% a engine nativa do T20 (que converte `"padrao"` → `"@des"`,
 * respeitando a flag, o crítico e os flavors). Armas bem configuradas (já com
 * `"padrao"`) funcionam nativamente → no-op, sem duplicar `@des`. O `@for`
 * explícito do Arco de Guerra continua somando, como manda a regra da arma.
 */

import { log, warn } from "@/utils/logging";

type RollPart = [string, string?, string?];

interface DanoRollLike {
    type?:  string;
    parts?: RollPart[];
}

interface ItemForEstilo {
    type?:   string;
    system?: { proposito?: string; rolls?: DanoRollLike[] };
    actor?:  { flags?: { tormenta20?: { estiloDisparo?: unknown } } } | null;
}

/** Tipos de part que representam cura/perda — nunca recebem atributo de dano. */
const HEAL_LOSS_TYPES = new Set(["curapv", "curatpv", "curapm", "curatpm", "perda"]);

/**
 * O ator/arma é elegível ao Estilo de Disparo? Arma + `proposito: "disparo"` +
 * flag `tormenta20.estiloDisparo` presente no ator.
 */
export function isEstiloDisparoEligible(item: ItemForEstilo): boolean {
    if (item.type !== "arma") return false;
    if (item.system?.proposito !== "disparo") return false;
    return Boolean(item.actor?.flags?.tormenta20?.estiloDisparo);
}

/**
 * Esse roll de dano deve receber uma part `"padrao"` injetada? Verdadeiro quando
 * é um roll de dano que ainda não tem `"padrao"` nem `@des` literal e não é
 * uma part de cura/perda.
 */
export function danoRollNeedsPadrao(roll: DanoRollLike): boolean {
    if (roll.type !== "dano") return false;
    const parts = roll.parts ?? [];
    if (parts.some(p => p?.[0] === "padrao")) return false;
    if (parts.some(p => typeof p?.[0] === "string" && p[0].includes("@des"))) return false;
    if (parts.some(p => HEAL_LOSS_TYPES.has(String(p?.[1] ?? "")))) return false;
    return true;
}

/**
 * Injeta (mutando in-place) uma part `"padrao"` nos rolls de dano elegíveis do
 * item e retorna uma função que restaura as parts originais. No-op (retorna
 * função vazia) se o item não for elegível ou nenhum roll precisar da injeção.
 */
export function injectEstiloDisparoPadrao(item: ItemForEstilo): () => void {
    const noop = (): void => {};
    if (!isEstiloDisparoEligible(item)) return noop;

    const rolls = item.system?.rolls ?? [];
    const touched: Array<[DanoRollLike, RollPart[] | undefined]> = [];
    for (const r of rolls) {
        if (!danoRollNeedsPadrao(r)) continue;
        const orig = r.parts;
        touched.push([r, orig]);
        r.parts = [...(orig ?? []), ["padrao", "", ""]];
    }
    if (!touched.length) return noop;

    return () => {
        for (const [r, orig] of touched) r.parts = orig;
    };
}

type ItemProtoLike = {
    rollDamage?:                (this: ItemForEstilo, arg?: Record<string, unknown>) => Promise<unknown>;
    _t20EstiloDisparoPatched?:  boolean;
};

export function setupEstiloDisparoDano(): void {
    // Patch precisa do game.tormenta20 inicializado → roda no ready.
    Hooks.once("ready", () => {
        const docClass = (CONFIG as unknown as { Item?: { documentClass?: { prototype: object } } })
            .Item?.documentClass;
        const proto = docClass?.prototype as ItemProtoLike | undefined;
        if (!proto || typeof proto.rollDamage !== "function") {
            warn(`estilo-disparo-dano: ItemT20.prototype.rollDamage não encontrado.`);
            return;
        }
        if (proto._t20EstiloDisparoPatched) return;

        const orig = proto.rollDamage;
        proto.rollDamage = async function (this: ItemForEstilo, arg?: Record<string, unknown>) {
            let restore = (): void => {};
            try {
                restore = injectEstiloDisparoPadrao(this);
            } catch (err) {
                warn(`estilo-disparo-dano: injeção abortada (dano intacto):`, err);
                restore = () => {};
            }
            try {
                return await orig.call(this, arg);
            } finally {
                try { restore(); } catch { /* ignore */ }
            }
        };
        proto._t20EstiloDisparoPatched = true;
        log(`ItemT20.rollDamage patched — Estilo de Disparo aplica @des em armas de disparo.`);
    });
}
