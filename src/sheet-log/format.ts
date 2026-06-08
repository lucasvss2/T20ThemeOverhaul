/**
 * Pure helpers for the sheet-change log feature.
 *
 * These functions take plain data (the `changes` diff from a Foundry update
 * hook plus a snapshot of the previous values) and turn it into human-readable
 * log entries. No Foundry globals here → fully unit-testable.
 */

// ── Leaf flattening ────────────────────────────────────────────────────────────

/**
 * Flatten a nested object into dot-path → leaf-value pairs.
 * Arrays are treated as leaves (not descended into) — ArrayField bonuses and
 * similar are logged as a whole, not per index.
 */
export function flattenLeaves(
    obj: unknown,
    prefix = "",
    out: Record<string, unknown> = {},
): Record<string, unknown> {
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
        if (prefix) out[prefix] = obj;
        return out;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v != null && typeof v === "object" && !Array.isArray(v)) {
            flattenLeaves(v, path, out);
        } else {
            out[path] = v;
        }
    }
    return out;
}

/** Read a dot-path value out of a plain object (undefined if any hop is missing). */
export function getByPath(obj: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>(
        (o, k) => (o == null || typeof o !== "object" ? undefined : (o as Record<string, unknown>)[k]),
        obj,
    );
}

// ── Path → human label ──────────────────────────────────────────────────────────

const ATTR_NAMES: Record<string, string> = {
    for: "Força", des: "Destreza", con: "Constituição",
    int: "Inteligência", sab: "Sabedoria", car: "Carisma",
};

const COIN_NAMES: Record<string, string> = {
    tc: "T$ (Cobre)", tp: "T$ (Prata)", to: "T$ (Ouro)", tl: "T$ (Platina)",
};

/**
 * Exact-path labels (path is given WITHOUT the leading "system."). Checked first.
 */
const EXACT_LABELS: Record<string, string> = {
    "attributes.pv.value": "PV",
    "attributes.pv.max": "PV máximo",
    "attributes.pv.temp": "PV temporário",
    "attributes.pm.value": "PM",
    "attributes.pm.max": "PM máximo",
    "attributes.pm.temp": "PM temporário",
    "attributes.defesa.value": "Defesa",
    "attributes.defesa.base": "Defesa (base)",
    "attributes.desloc.value": "Deslocamento",
    "nivel.value": "Nível",
    "detalhes.xp": "XP",
};

/** Humanize an arbitrary dot-path into a readable Title-ish label. */
export function humanizePath(path: string): string {
    return path
        .replace(/^system\./, "")
        .split(".")
        .map((seg) => seg.replace(/([a-z])([A-Z])/g, "$1 $2"))
        .join(" › ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve a friendly label for a changed actor field path.
 * `path` may or may not include the leading "system.".
 */
export function labelForPath(path: string): string {
    const p = path.replace(/^system\./, "");

    if (p === "name") return "Nome";

    const exact = Object.prototype.hasOwnProperty.call(EXACT_LABELS, p) ? EXACT_LABELS[p] : undefined;
    if (exact) return exact;

    // atributos.<key>.value → "Força" etc.
    const attr = p.match(/^atributos\.([a-z]{3})\.value$/);
    if (attr && ATTR_NAMES[attr[1]]) return ATTR_NAMES[attr[1]];

    // dinheiro.<coin>
    const coin = p.match(/^dinheiro\.([a-z]{2})$/);
    if (coin && COIN_NAMES[coin[1]]) return COIN_NAMES[coin[1]];

    // pericias.<key>.value → "Perícia <KEY>"
    const per = p.match(/^pericias\.([a-z0-9_]+)\.value$/i);
    if (per) return `Perícia (${per[1]})`;

    return humanizePath(p);
}

// ── Noise filter ─────────────────────────────────────────────────────────────

/**
 * Paths that are derived/automation noise and should NOT be logged.
 * Mostly T20 ArrayField accumulators and recomputed totals.
 */
const SKIP_PATH_RE =
    /(?:^|\.)(?:bonus|total|_stats|sort|sheet|prepared|flags)\b|\.bonus\b|\.total\b/i;

export function shouldSkipPath(path: string): boolean {
    const p = path.replace(/^system\./, "");
    return SKIP_PATH_RE.test(p);
}

// ── Value formatting & diffing ─────────────────────────────────────────────────

function isNum(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function fmtVal(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? "sim" : "não";
    if (typeof v === "object") {
        try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
}

export interface ChangeEntry {
    /** Field path (without "system.") — for tests/debugging. */
    path: string;
    /** Human label, e.g. "PV". */
    label: string;
    /** Old → new rendered text, e.g. "25 → 20". */
    detail: string;
    /** Signed numeric delta if both values numeric (e.g. -5), else null. */
    delta: number | null;
}

/**
 * Build a single change entry from a path + old/new values.
 * Returns null when the change is noise or a no-op.
 */
export function describeChange(path: string, oldVal: unknown, newVal: unknown): ChangeEntry | null {
    if (shouldSkipPath(path)) return null;
    // No-op (deep-ish): primitives compared directly; objects via JSON.
    if (oldVal === newVal) return null;
    if (typeof oldVal !== "object" && typeof newVal !== "object" && fmtVal(oldVal) === fmtVal(newVal)) {
        return null;
    }

    const label = labelForPath(path);
    let delta: number | null = null;
    let detail: string;

    if (isNum(oldVal) && isNum(newVal)) {
        delta = newVal - oldVal;
        const sign = delta > 0 ? `+${delta}` : `${delta}`;
        detail = `${oldVal} → ${newVal} (${sign})`;
    } else {
        detail = `${fmtVal(oldVal)} → ${fmtVal(newVal)}`;
    }

    return { path: path.replace(/^system\./, ""), label, detail, delta };
}

/**
 * Diff a `changes` object against a snapshot of previous values, producing
 * the list of loggable entries. `snapshot` maps full paths (as flattened from
 * `changes`) to their pre-update values.
 */
export function diffChanges(
    changes: Record<string, unknown>,
    snapshot: Record<string, unknown>,
): ChangeEntry[] {
    const flat = flattenLeaves(changes);
    const out: ChangeEntry[] = [];
    for (const [path, newVal] of Object.entries(flat)) {
        const entry = describeChange(path, snapshot[path], newVal);
        if (entry) out.push(entry);
    }
    return out;
}

// ── Origin → phrase ──────────────────────────────────────────────────────────

const DAMAGE_TYPE_PT: Record<string, string> = {
    perfuracao: "perfuração", corte: "corte", impacto: "impacto",
    fogo: "fogo", frio: "frio", eletricidade: "eletricidade", acido: "ácido",
    luz: "luz", trevas: "trevas", psiquico: "psíquico", essencia: "essência",
    sonico: "sônico", veneno: "veneno", mental: "mental",
};

export interface OriginHint {
    kind: "damage" | "heal" | "pm-cost" | "spell" | string;
    /** Display name of the cause, e.g. attacker / caster name. */
    source?: string;
    /** Damage type key (perfuracao, fogo, …). */
    type?: string;
}

/**
 * Build the origin phrase describing the CAUSE of a change (the triggering
 * user is rendered separately by the caller).
 */
export function originPhrase(origin?: OriginHint): string {
    if (origin) {
        const typePart = origin.type
            ? ` (${DAMAGE_TYPE_PT[origin.type] ?? origin.type})`
            : "";
        switch (origin.kind) {
            case "damage":
                return origin.source ? `dano de ${origin.source}${typePart}` : `dano${typePart}`;
            case "heal":
                return origin.source ? `cura de ${origin.source}` : "cura";
            case "pm-cost":
                return origin.source ? `custo de PM — ${origin.source}` : "custo de PM";
            case "spell":
                return origin.source ? `magia de ${origin.source}` : "magia";
            default:
                return origin.source ?? origin.kind;
        }
    }
    return "alteração manual";
}
