/**
 * Análise automática de Redução de Dano (RD) por tipo de dano.
 *
 * Determina o tipo de dano de um roll (pelo flavor dos termos, ex.: "perfuracao",
 * "fogo") e calcula a RD do alvo para esse tipo, lendo de DUAS fontes:
 *  - estrutura `tracos.resistencias[tipo]` (PCs e NPCs importados pelo parser);
 *  - texto livre `detalhes.resistencias` do NPC (ex.: "redução de corte, frio e
 *    perfuração 5"), que muitos NPCs têm sem a estrutura preenchida.
 *
 * A redução genérica ("dano") é somada à do tipo específico. Imunidade anula o
 * dano daquele tipo. Funções puras → testáveis sem Foundry.
 */

/** Chaves de tipo de dano do T20 (CONFIG.T20.damageTypes). */
export const DAMAGE_TYPE_KEYS = [
    "dano", "perda", "acido", "corte", "eletricidade", "essencia",
    "fogo", "frio", "impacto", "luz", "psiquico", "perfuracao", "trevas",
] as const;

/** Tipos específicos (exclui o genérico "dano" e "perda" de PV). */
const SPECIFIC_TYPES = new Set<string>(DAMAGE_TYPE_KEYS.filter(k => k !== "dano" && k !== "perda"));

function stripAccents(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

interface RollLike { terms?: unknown[] }

/** Tipo de dano primário do roll: primeiro termo com flavor de tipo específico. */
export function extractDamageType(roll: RollLike | null | undefined): string | null {
    for (const term of roll?.terms ?? []) {
        const fl = (term as { options?: { flavor?: string | null } | null } | null)?.options?.flavor;
        if (!fl) continue;
        const n = stripAccents(fl);
        if (SPECIFIC_TYPES.has(n)) return n;
    }
    return null;
}

function mapWordToType(word: string): string | null {
    const w = stripAccents(word).trim();
    if (!w) return null;
    if ((DAMAGE_TYPE_KEYS as readonly string[]).includes(w)) return w;
    const singular = w.replace(/s$/, "");           // plural simples ("trevas" não cai aqui)
    if ((DAMAGE_TYPE_KEYS as readonly string[]).includes(singular)) return singular;
    return null;
}

function parseTypeList(s: string): string[] {
    return s.split(/,| e /i).map(mapWordToType).filter((x): x is string => x !== null);
}

export interface ParsedResist { rd: Record<string, number>; immune: Set<string> }

/** Parseia o texto de resistências de NPC em RD por tipo + imunidades. */
export function parseNpcResistText(text: string | null | undefined): ParsedResist {
    const rd: Record<string, number> = {};
    const immune = new Set<string>();
    if (!text) return { rd, immune };
    const t = stripAccents(text);

    // "reducao de <tipos> <N>"
    const rdRe = /reduc[a]o de ([a-z, ]+?)\s+(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = rdRe.exec(t)) !== null) {
        const val = parseInt(m[2], 10);
        for (const ty of parseTypeList(m[1])) rd[ty] = Math.max(rd[ty] ?? 0, val);
    }
    // "imun[idade|e] a <tipos>"
    const imRe = /imun(?:idade|e)? a ([a-z, ]+?)(?:[.;]|$| e reduc| reduc)/g;
    while ((m = imRe.exec(t)) !== null) {
        for (const ty of parseTypeList(m[1])) immune.add(ty);
    }
    return { rd, immune };
}

interface ResistEntry { value?: number | string; base?: number | string; imunidade?: boolean }
type StructResist = Record<string, ResistEntry | undefined>;

function num(v: number | string | undefined): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : 0;
}

export interface TargetRd { rd: number; immune: boolean }

/**
 * RD aplicável a um tipo de dano. Combina a estrutura `tracos.resistencias` e o
 * texto `detalhes.resistencias` (usa o MAIOR — as fontes são mutuamente
 * exclusivas na prática), somando a redução genérica "dano".
 */
export function computeTargetRd(
    struct: StructResist | undefined,
    npcText: string | null | undefined,
    damageType: string | null,
): TargetRd {
    let structRd = num(struct?.["dano"]?.value ?? struct?.["dano"]?.base);
    let immune = false;
    if (damageType && struct?.[damageType]) {
        structRd += num(struct[damageType]?.value ?? struct[damageType]?.base);
        if (struct[damageType]?.imunidade) immune = true;
    }

    const parsed = parseNpcResistText(npcText);
    let textRd = parsed.rd["dano"] ?? 0;
    if (damageType) textRd += parsed.rd[damageType] ?? 0;
    if (damageType && parsed.immune.has(damageType)) immune = true;

    return { rd: Math.max(structRd, textRd), immune };
}
