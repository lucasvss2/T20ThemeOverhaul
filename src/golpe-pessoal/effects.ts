/**
 * Golpe Pessoal — catálogo de efeitos + helpers PUROS (testáveis).
 *
 * Regra: o guerreiro constrói o golpe escolhendo efeitos; custo = soma dos
 * custos (mínimo 1 PM). Arma específica, salvo "Qualquer Arma". Reconstrução
 * ao subir de nível. Limite: PM gastos em golpes pessoais numa mesma rodada
 * ≤ limite de PM (= nível).
 */

export type GolpeEffectKey =
    | "amplo" | "atordoante" | "brutal" | "conjurador" | "destruidor"
    | "distante" | "elemental" | "impactante" | "letal" | "penetrante"
    | "preciso" | "qualquer-arma" | "ricocheteante" | "teleguiado"
    | "lento" | "perto-da-morte" | "sacrificio" | "avanco" | "brando"
    | "carregado" | "sequencial" | "sifao" | "golpe-de-abertura" | "truque-secreto";

export interface GolpeEffectDef {
    key: GolpeEffectKey;
    label: string;
    /** Custo em PM por escolha (Conjurador é dinâmico: custo da magia + 1). */
    pm: number;
    /** Quantas vezes pode ser escolhido (Elemental ilimitado na regra; teto prático). */
    maxQty: number;
    /** Descrição curta (build dialog + card). */
    desc: string;
    needsElement?: boolean;
    needsSpell?: boolean;
}

export const GOLPE_ELEMENTS = ["acido", "eletricidade", "fogo", "frio"] as const;
export type GolpeElement = (typeof GOLPE_ELEMENTS)[number];

export const GOLPE_EFFECTS: GolpeEffectDef[] = [
    { key: "amplo", label: "Amplo", pm: 3, maxQty: 1, desc: "Atinge todas as criaturas em alcance curto (marque os alvos com T): um único teste de ataque comparado à Defesa de cada uma." },
    { key: "atordoante", label: "Atordoante", pm: 2, maxQty: 1, desc: "Criatura que sofra dano fica atordoada por 1 rodada (Fortitude CD For evita; 1×/cena por criatura)." },
    { key: "brutal", label: "Brutal", pm: 1, maxQty: 1, desc: "Um dado extra de dano do mesmo tipo da arma." },
    { key: "conjurador", label: "Conjurador", pm: 1, maxQty: 1, desc: "Se acertar, lança a magia escolhida (1º/2º círculo) como ação livre no alvo atingido. Custo: custo da magia + 1 PM.", needsSpell: true },
    { key: "destruidor", label: "Destruidor", pm: 2, maxQty: 1, desc: "Multiplicador de crítico +1." },
    { key: "distante", label: "Distante", pm: 1, maxQty: 1, desc: "Alcance sobe um passo (corpo a corpo → curto → médio → longo). Demais características não mudam." },
    { key: "elemental", label: "Elemental", pm: 2, maxQty: 6, desc: "+2d6 de dano de ácido, eletricidade, fogo ou frio por escolha.", needsElement: true },
    { key: "impactante", label: "Impactante", pm: 1, maxQty: 1, desc: "Empurra o alvo 1,5m para cada 10 pontos de dano causados." },
    { key: "letal", label: "Letal", pm: 2, maxQty: 2, desc: "Margem de ameaça +2 (escolhido 2×: +5)." },
    { key: "penetrante", label: "Penetrante", pm: 1, maxQty: 1, desc: "Ignora 10 pontos de RD." },
    { key: "preciso", label: "Preciso", pm: 1, maxQty: 1, desc: "Rola dois d20 no ataque e usa o melhor." },
    { key: "qualquer-arma", label: "Qualquer Arma", pm: 1, maxQty: 1, desc: "O golpe pode ser usado com qualquer arma." },
    { key: "ricocheteante", label: "Ricocheteante", pm: 1, maxQty: 1, desc: "A arma volta para você após o ataque (apenas armas de arremesso)." },
    { key: "teleguiado", label: "Teleguiado", pm: 1, maxQty: 1, desc: "Ignora penalidades por camuflagem ou cobertura leves." },
    { key: "lento", label: "Lento", pm: -2, maxQty: 1, desc: "O ataque exige uma ação completa." },
    { key: "perto-da-morte", label: "Perto da Morte", pm: -2, maxQty: 1, desc: "Só pode ser usado com ¼ dos PV ou menos." },
    { key: "sacrificio", label: "Sacrifício", pm: -2, maxQty: 1, desc: "Você perde 10 PV sempre que usa o golpe." },
    { key: "avanco", label: "Avanço", pm: 1, maxQty: 1, desc: "Percorre até o deslocamento em linha reta antes do golpe." },
    { key: "brando", label: "Brando", pm: 0, maxQty: 1, desc: "O golpe causa dano não letal." },
    { key: "carregado", label: "Carregado", pm: 1, maxQty: 1, desc: "Gaste uma ação padrão para energizar; se atacar até a próxima rodada, +2d8 de dano." },
    { key: "sequencial", label: "Sequencial", pm: 2, maxQty: 1, desc: "+1d6 de dano; a cada acerto na mesma cena o bônus sobe um passo." },
    { key: "sifao", label: "Sifão", pm: 2, maxQty: 1, desc: "+1 PM temporário por 10 pontos da rolagem de dano (máx./cena = nível; somem no fim da cena)." },
    { key: "golpe-de-abertura", label: "Golpe de Abertura", pm: -2, maxQty: 1, desc: "Só pode ser usado no seu primeiro turno do combate." },
    { key: "truque-secreto", label: "Truque Secreto", pm: -2, maxQty: 1, desc: "Só pode ser usado uma vez contra cada alvo por cena." },
];

export const GOLPE_EFFECT_MAP: Record<string, GolpeEffectDef> = Object.fromEntries(
    GOLPE_EFFECTS.map((e) => [e.key, e]),
);

/** Uma escolha de efeito no build. */
export interface GolpeEffectPick {
    key: GolpeEffectKey;
    qty?: number;
    /** Elemental: um elemento por pick (qty do pick multiplica o MESMO elemento). */
    element?: GolpeElement;
    /** Conjurador: magia escolhida (da ficha OU de compêndio). */
    spellId?: string;
    /** uuid do doc de compêndio — importado na hora do cast se não estiver na ficha. */
    spellUuid?: string;
    spellName?: string;
    spellCost?: number;
}

/** Build salvo em flags.<MODULE_ID>.golpePessoal do ITEM do poder. */
export interface GolpeBuild {
    weaponName: string;
    effects: GolpeEffectPick[];
    builtAtLevel: number;
}

const qtyOf = (p: GolpeEffectPick): number => Math.max(1, Math.floor(Number(p.qty) || 1));

/** Custo de UMA escolha (considera qty e o custo dinâmico do Conjurador). */
export function pickCost(p: GolpeEffectPick): number {
    const def = GOLPE_EFFECT_MAP[p.key];
    if (!def) return 0;
    if (def.key === "conjurador") return (Math.max(0, Number(p.spellCost) || 0)) + 1;
    return def.pm * qtyOf(p);
}

/** Custo total do golpe: soma dos efeitos, mínimo 1 PM. */
export function computeGolpeCost(build: Pick<GolpeBuild, "effects">): number {
    const sum = (build.effects ?? []).reduce((acc, p) => acc + pickCost(p), 0);
    return Math.max(1, sum);
}

export function hasEffect(build: Pick<GolpeBuild, "effects">, key: GolpeEffectKey): boolean {
    return (build.effects ?? []).some((p) => p.key === key);
}

export function effectQty(build: Pick<GolpeBuild, "effects">, key: GolpeEffectKey): number {
    return (build.effects ?? []).filter((p) => p.key === key).reduce((a, p) => a + qtyOf(p), 0);
}

/** Bônus de margem de ameaça do Letal (1 pick: +2; 2+: +5). */
export function letalMargemBonus(build: Pick<GolpeBuild, "effects">): number {
    const q = effectQty(build, "letal");
    return q >= 2 ? 5 : q === 1 ? 2 : 0;
}

/** Picks Elementais agregados por elemento → dados (2d6 por qty). */
export function elementalDice(build: Pick<GolpeBuild, "effects">): Array<{ element: GolpeElement; dice: string }> {
    const byEl = new Map<GolpeElement, number>();
    for (const p of build.effects ?? []) {
        if (p.key !== "elemental") continue;
        const el = (p.element ?? "fogo") as GolpeElement;
        byEl.set(el, (byEl.get(el) ?? 0) + qtyOf(p));
    }
    return [...byEl.entries()].map(([element, n]) => ({ element, dice: `${2 * n}d6` }));
}

/** Dado do Sequencial após N acertos na cena (1d6 sobe um passo por acerto). */
export function sequencialDie(hits: number, passosDano: string[][]): string {
    let die = "1d6";
    const steps = Math.max(0, Math.floor(hits) || 0);
    if (!steps) return die;
    const row = passosDano.find((r) => r.includes("1d6"));
    if (!row) return die;
    const idx = row.indexOf("1d6");
    die = row[Math.min(idx + steps, row.length - 1)] ?? die;
    return die;
}

/** Empurrão do Impactante: 1,5m por 10 de dano (arredonda pra baixo). */
export function impactantePushMeters(damage: number): number {
    return Math.floor(Math.max(0, damage) / 10) * 1.5;
}

/** PM temporários do Sifão pela rolagem de dano (antes do cap). */
export function sifaoTempPm(damageRolled: number): number {
    return Math.floor(Math.max(0, damageRolled) / 10);
}

/** Quanto do Sifão ainda cabe no cap por cena (= nível). */
export function sifaoCapRemaining(nivel: number, gainedThisScene: number): number {
    return Math.max(0, Math.floor(nivel || 0) - Math.max(0, Math.floor(gainedThisScene) || 0));
}

/** CD do Atordoante: "Fortitude CD For" = 10 + ½ nível + mod For do atacante. */
export function atordoanteCD(nivel: number, forMod: number): number {
    return 10 + Math.floor((nivel || 0) / 2) + (Number(forMod) || 0);
}

/** Gate do Perto da Morte: PV atual ≤ ¼ do máximo. */
export function pertoDaMorteOk(pv: number, pvMax: number): boolean {
    return pv <= Math.floor(Math.max(0, pvMax) / 4);
}

/** Validações do build. Retorna lista de erros (vazia = ok). */
export function validateBuild(build: GolpeBuild): string[] {
    const errors: string[] = [];
    if (!build.weaponName?.trim() && !hasEffect(build, "qualquer-arma")) {
        errors.push("Escolha a arma específica do golpe (ou o efeito Qualquer Arma).");
    }
    if (!(build.effects ?? []).length) errors.push("Escolha ao menos um efeito.");
    const seen = new Map<string, number>();
    for (const p of build.effects ?? []) {
        const def = GOLPE_EFFECT_MAP[p.key];
        if (!def) { errors.push(`Efeito desconhecido: ${p.key}`); continue; }
        const total = (seen.get(p.key) ?? 0) + qtyOf(p);
        seen.set(p.key, total);
        if (total > def.maxQty) errors.push(`${def.label}: máximo ${def.maxQty}×.`);
        if (def.needsElement && !GOLPE_ELEMENTS.includes((p.element ?? "") as GolpeElement)) {
            errors.push(`${def.label}: escolha o elemento (ácido, eletricidade, fogo ou frio).`);
        }
        if (def.needsSpell && !p.spellName) errors.push(`${def.label}: escolha a magia (1º ou 2º círculo).`);
    }
    // Só efeitos redutores/neutros não formam um golpe (custo viria de reduções).
    const anyPositive = (build.effects ?? []).some((p) => pickCost(p) > 0);
    if ((build.effects ?? []).length && !anyPositive) {
        errors.push("O golpe precisa de ao menos um efeito de custo positivo.");
    }
    return errors;
}

/** Resumo curto p/ ficha/card: "Brutal, Elemental (fogo ×2), Letal ×2 — 7 PM". */
export function buildSummary(build: GolpeBuild): string {
    const parts = (build.effects ?? []).map((p) => {
        const def = GOLPE_EFFECT_MAP[p.key];
        if (!def) return p.key;
        let s = def.label;
        if (p.key === "elemental") s += ` (${p.element ?? "?"}${qtyOf(p) > 1 ? ` ×${qtyOf(p)}` : ""})`;
        else if (qtyOf(p) > 1) s += ` ×${qtyOf(p)}`;
        if (p.key === "conjurador" && p.spellName) s += ` (${p.spellName})`;
        return s;
    });
    return `${parts.join(", ")} — ${computeGolpeCost(build)} PM`;
}

/** Notas informativas p/ o card do ataque (efeitos não-mecanizados na rolagem). */
export function buildCardNotes(build: GolpeBuild): string[] {
    const notes: string[] = [];
    const add = (key: GolpeEffectKey, txt: string): void => { if (hasEffect(build, key)) notes.push(txt); };
    add("amplo", "Amplo: um único teste comparado à Defesa de cada alvo marcado.");
    add("distante", "Distante: alcance um passo acima (corpo a corpo → curto → médio → longo).");
    add("teleguiado", "Teleguiado: ignora camuflagem/cobertura leves.");
    add("ricocheteante", "Ricocheteante: a arma volta para você após o ataque.");
    add("lento", "Lento: este ataque consome uma ação completa.");
    add("avanco", "Avanço: pode percorrer o deslocamento em linha reta antes do golpe.");
    add("brando", "Brando: o dano é não letal.");
    add("penetrante", "Penetrante: ignora 10 de RD.");
    add("impactante", "Impactante: empurra 1,5m por 10 de dano causado.");
    add("atordoante", "Atordoante: quem sofrer dano faz Fortitude (CD For) ou fica atordoado 1 rodada (1×/cena).");
    add("sifao", "Sifão: +1 PM temp. por 10 de dano rolado (cap/cena = nível).");
    return notes;
}
