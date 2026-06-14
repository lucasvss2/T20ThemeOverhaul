/**
 * T20 fix — Penalidade por Não Proficiência (armas, armaduras e escudos).
 *
 * ── Regras implementadas ────────────────────────────────────────────────────
 * 1. ARMAS: atacar com uma arma sem proficiência → −5 nos testes de ataque.
 *    Toda criatura é proficiente em ataques desarmados e em armas naturais
 *    (proficiencia "natural"), então estes NUNCA recebem a penalidade.
 * 2. ARMADURAS/ESCUDOS: vestir armadura ou empunhar escudo sem proficiência →
 *    a penalidade de armadura passa a se aplicar a TODAS as perícias baseadas
 *    em Força e Destreza (não só às já marcadas com `pda`).
 *
 * ── Por que o T20 nativo não cobre ──────────────────────────────────────────
 * O T20 computa `pda` (penalidade de armadura, sempre ≤ 0 — ver PenaltyField) e
 * já a aplica às perícias com `skill.pda === true` (Acrobacia, Furtividade,
 * Ladinagem…). Mas NÃO há penalidade de ataque por arma não-proficiente, nem o
 * alargamento da penalidade de armadura para todas as perícias de For/Des quando
 * o personagem não tem a proficiência. Estas duas regras são adicionadas aqui.
 *
 * ── Como ────────────────────────────────────────────────────────────────────
 * • Arma −5: embrulha `ItemT20.prototype.getAttackToHit`. Esse método alimenta
 *   tanto a rolagem real (`rollAttack`) quanto o label `labels.toHit`
 *   (`_prepareLabels`), então a penalidade aparece nos dois lugares de uma vez.
 * • Armadura: embrulha `CreatureData.prototype.prepareSkills` (base compartilhada
 *   de character/npc). ANTES do prepare nativo das perícias — que roda depois de
 *   `prepareDefense` já ter populado `rollData.pda` — marca `pericia.pda = true`
 *   em toda perícia de atributo `for`/`des` quando há armadura/escudo sem
 *   proficiência. Assim a penalidade entra tanto no VALOR exibido na ficha
 *   (`prepareSkill` soma `@pda`) quanto na rolagem. (Fazer isso depois, no
 *   `prepareDerivedData`, só corrigia a rolagem — a listagem já tinha sido
 *   calculada sem o `@pda`.)
 *
 * Apenas personagens (`type === "character"`) são afetados — fichas de Ameaça
 * (npc) têm valores de ataque/perícia já calibrados pelo ND e não devem ser
 * penalizadas.
 */

import { log, warn } from "@/utils/logging";
import { SYSTEM_ID } from "@/constants";

const PENALIDADE_ATAQUE = "-5";

interface ProfItemSystem {
    proficiencia?: string;
    tipo?:         string;
    equipado?:     unknown;
    equipado2?:    { slot?: number };
}
interface ProfItem {
    type?:   string;
    name?:   string;
    system?: ProfItemSystem;
    actor?:  ProfActor | null;
}
interface ProfActor {
    type?: string;
    system?: {
        tracos?: {
            profArmas?:     { value?: string[] | string };
            profArmaduras?: { value?: string[] | string };
        };
        pericias?: Record<string, { atributo?: string; pda?: boolean }>;
    };
    itemTypes?: { equipamento?: ProfItem[] };
}

/** Normaliza nomes (lowercase, sem acentos) para comparação tolerante. */
export function normalizeName(s: string): string {
    return (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
}

function toSet(v: string[] | string | undefined): Set<string> {
    if (!v) return new Set();
    return new Set(Array.isArray(v) ? v : [v]);
}

/** Proficiências de arma do ator (simples/marcial/exotica/fogo). */
export function getActorWeaponProfs(actor: ProfActor | null | undefined): Set<string> {
    return toSet(actor?.system?.tracos?.profArmas?.value);
}

/** Proficiências de armadura do ator (lev/pes/esc). */
export function getActorArmorProfs(actor: ProfActor | null | undefined): Set<string> {
    return toSet(actor?.system?.tracos?.profArmaduras?.value);
}

/** Ataque desarmado ou arma natural? (proficiência universal de toda criatura). */
export function isUnarmedOrNatural(item: ProfItem): boolean {
    if (item.system?.proficiencia === "natural") return true;
    return normalizeName(item.name ?? "").includes("desarmad");
}

/**
 * O ator é proficiente com esta arma?
 * NPCs e itens não-arma nunca recebem penalidade (retorna true).
 * Desarmado/natural sempre proficiente. Caso a proficiência da arma seja
 * desconhecida (vazia), não penalizamos.
 */
export function isWeaponProficient(actor: ProfActor | null | undefined, item: ProfItem): boolean {
    if (!actor || actor.type !== "character") return true;
    if (item.type !== "arma") return true;
    if (isUnarmedOrNatural(item)) return true;
    const prof = item.system?.proficiencia;
    if (!prof) return true;
    return getActorWeaponProfs(actor).has(prof);
}

/** Tipo de item de equipamento → código de proficiência de armadura exigido (ou null). */
export function armorTipoToProf(tipo: string | undefined): string | null {
    switch (tipo) {
        case "leve":    return "lev";
        case "pesada":  return "pes";
        case "escudo":  return "esc";
        default:        return null; // traje, acessórios etc. não exigem proficiência
    }
}

/** Há armadura/escudo equipado para o qual o ator NÃO tem proficiência? */
export function hasNonProficientArmorEquipped(actor: ProfActor | null | undefined): boolean {
    if (!actor || actor.type !== "character") return false;
    const profs = getActorArmorProfs(actor);
    const useSlots = !!safeGetSetting("equipmentSlots");
    const equips = actor.itemTypes?.equipamento ?? [];
    for (const it of equips) {
        const equipped = useSlots ? !!it.system?.equipado2?.slot : !!it.system?.equipado;
        if (!equipped) continue;
        const need = armorTipoToProf(it.system?.tipo);
        if (need && !profs.has(need)) return true;
    }
    return false;
}

function safeGetSetting(key: string): unknown {
    try {
        return (game as unknown as { settings?: { get?: (n: string, k: string) => unknown } })
            .settings?.get?.("tormenta20", key);
    } catch {
        return undefined;
    }
}

/**
 * Marca `pda = true` em todas as perícias de For/Des do system, retornando as
 * chaves alteradas. Mutação in-place (usada no prepareDerivedData). Não desmarca
 * nada — só adiciona, preservando as perícias que já tinham `pda` por padrão.
 */
export function broadenArmorPenaltyToStrDexSkills(
    pericias: Record<string, { atributo?: string; pda?: boolean }> | undefined,
): string[] {
    if (!pericias) return [];
    const changed: string[] = [];
    for (const [key, sk] of Object.entries(pericias)) {
        if ((sk.atributo === "for" || sk.atributo === "des") && !sk.pda) {
            sk.pda = true;
            changed.push(key);
        }
    }
    return changed;
}

/* -------------------------------------------------------------------------- */
/*  Patches                                                                   */
/* -------------------------------------------------------------------------- */

type GetAttackToHit = (this: ProfItem) => { rollData: unknown; parts: string[] } | undefined;
type ItemProto = { getAttackToHit?: GetAttackToHit; _bg3ProfWeaponPatched?: boolean };

/** Modelo de dados (system) com `pericias` e `parent` (o ator dono). */
interface CreatureDataLike {
    parent?: ProfActor | null;
    pericias?: Record<string, { atributo?: string; pda?: boolean }>;
}
type PrepareSkills = (this: CreatureDataLike, opts?: unknown) => unknown;
type CreatureProto = { prepareSkills?: PrepareSkills; _bg3ProfArmorPatched?: boolean };

function patchWeaponPenalty(): void {
    const proto = (CONFIG as unknown as { Item?: { documentClass?: { prototype: ItemProto } } })
        .Item?.documentClass?.prototype;
    if (!proto || typeof proto.getAttackToHit !== "function") {
        warn(`proficiencia: ItemT20.prototype.getAttackToHit não encontrado.`);
        return;
    }
    if (proto._bg3ProfWeaponPatched) return;
    const orig = proto.getAttackToHit;
    proto.getAttackToHit = function (this: ProfItem) {
        const result = orig.call(this);
        try {
            if (result?.parts && !isWeaponProficient(this.actor, this)) {
                result.parts.push(PENALIDADE_ATAQUE);
            }
        } catch (err) {
            warn(`proficiencia: penalidade de ataque abortada:`, err);
        }
        return result;
    };
    proto._bg3ProfWeaponPatched = true;
    log(`ItemT20.getAttackToHit patched — −5 de ataque para armas sem proficiência.`);
}

function patchArmorPenalty(): void {
    const charProto = (CONFIG as unknown as {
        Actor?: { dataModels?: { character?: { prototype?: object } } };
    }).Actor?.dataModels?.character?.prototype;
    // prepareSkills mora na base compartilhada (CreatureData) — sobe a cadeia até o dono.
    let proto = charProto as (CreatureProto & object) | undefined;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, "prepareSkills")) {
        proto = Object.getPrototypeOf(proto) as (CreatureProto & object) | undefined;
    }
    if (!proto || typeof proto.prepareSkills !== "function") {
        warn(`proficiencia: CreatureData.prototype.prepareSkills não encontrado.`);
        return;
    }
    if (proto._bg3ProfArmorPatched) return;
    const orig = proto.prepareSkills;
    proto.prepareSkills = function (this: CreatureDataLike, opts?: unknown) {
        try {
            const actor = this.parent;
            if (actor?.type === "character" && hasNonProficientArmorEquipped(actor)) {
                broadenArmorPenaltyToStrDexSkills(this.pericias);
            }
        } catch (err) {
            warn(`proficiencia: alargamento de penalidade de armadura abortado:`, err);
        }
        return orig.call(this, opts);
    };
    proto._bg3ProfArmorPatched = true;
    log(`CreatureData.prepareSkills patched — penalidade de armadura em todas perícias For/Des sem proficiência.`);
}

/**
 * IMPORTANTE — instalado em `init` (não `ready`): `prepareSkills` roda durante o
 * carregamento do mundo (antes de `ready`), então a penalidade de armadura
 * precisa estar embrulhada ANTES da primeira preparação dos atores, senão fichas
 * que já entram com armadura não-proficiente equipada exibem o valor antigo até
 * um re-prepare. Não forçamos `actor.prepareData()` (dispararia o bug de
 * acúmulo de ArrayField em pm/pv — ver histórico v1.19.4); confiamos no prepare
 * natural do load. Deve ser chamado no top-level do módulo (antes do hook init).
 */
export function setupProeficiencia(): void {
    Hooks.once("init", () => {
        if ((game as unknown as { system?: { id?: string } }).system?.id !== SYSTEM_ID) return;
        patchWeaponPenalty();
        patchArmorPenalty();
    });
}
