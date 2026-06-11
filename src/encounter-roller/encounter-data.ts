/**
 * Tabela de encontros aleatórios (Tormenta20) — dados + lookup.
 *
 * Seis ambientes, cada um com 7 faixas de 1d100 (01-15, 16-30, 31-45, 46-60,
 * 61-75, 76-90, 91-100). Cada faixa tem um título, um texto de ambientação e
 * quatro entradas por bracket de nível: 1-2, 3-4, 5-6, 7-8.
 *
 * O GM informa um nível de 1 a 8 → mapeado ao bracket; o 1d100 escolhe a faixa.
 *
 * Fonte: documento de tabela fornecido pelo mestre do mundo.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * COMO ADICIONAR/EXPANDIR UM AMBIENTE (basta editar ESTE arquivo):
 *
 * 1. Acrescente um objeto ao array `ENVIRONMENTS` seguindo o template abaixo.
 *    Nada mais precisa mudar — o dropdown do modal e o lookup são gerados a
 *    partir deste array automaticamente.
 *
 *    {
 *        id: "pantano",            // minúsculas, sem espaços, único
 *        label: "Pântano",          // texto exibido no dropdown
 *        rows: [
 *            { min: 1,  max: 15,  title: "...", flavor: "...",
 *                levels: ["<Nv 1-2>", "<Nv 3-4>", "<Nv 5-6>", "<Nv 7-8>"] },
 *            // ... faixas seguintes ...
 *            { min: 91, max: 100, title: "...", flavor: "",
 *                levels: ["...", "...", "...", "..."] },
 *        ],
 *    }
 *
 * 2. Regras do formato (validadas por `validateEnvironments()` no setup e nos
 *    testes): as faixas (`min`..`max`) devem cobrir 1–100 sem buracos nem
 *    sobreposições; cada faixa tem EXATAMENTE 4 brackets de nível não vazios
 *    (1-2, 3-4, 5-6, 7-8); `flavor` pode ser "" se a tabela não tiver.
 *
 * 3. As faixas não precisam ser sempre 7 nem do mesmo tamanho — qualquer
 *    partição contígua de 1 a 100 funciona (ex.: 01-20, 21-50, 51-100).
 * ──────────────────────────────────────────────────────────────────────────────
 */

/** Id de ambiente (string livre, ex.: "esgoto"). String — não union — para que
 *  adicionar um ambiente exija editar APENAS o array `ENVIRONMENTS`. */
export type EnvironmentId = string;

export interface EncounterRow {
    min: number;
    max: number;
    title: string;
    flavor: string;
    /** Encontro por bracket de nível: [1-2, 3-4, 5-6, 7-8]. */
    levels: [string, string, string, string];
}

export interface EnvironmentDef {
    id: EnvironmentId;
    label: string;
    /**
     * Teto de nível de cada bracket (ascendente). Default [2, 4, 6, 8]
     * (níveis 1-8). O deserto usa [2, 5, 8, 10] → níveis 1-10 com cortes
     * 1-2 / 3-5 / 6-8 / 9-10. O último valor define o nível máximo aceito
     * pelo modal para este ambiente.
     */
    bracketMax?: number[];
    rows: EncounterRow[];
}

/** Brackets padrão (níveis 1-8: 1-2 / 3-4 / 5-6 / 7-8). */
export const DEFAULT_BRACKET_MAX = [2, 4, 6, 8];

export const ENVIRONMENTS: EnvironmentDef[] = [
    {
        id: "esgoto",
        label: "Esgotos",
        rows: [
            { min: 1, max: 15, title: "Pragas Rastejantes", flavor: "O cheiro atrai os famintos.",
                levels: ["1 Enxame de Ratos", "2 Ratos Atrozes + Enxame", "3 Homens-Rato (Licantropos)", "1 Rei Rato (Monstro) + 3 Enxames"] },
            { min: 16, max: 30, title: "Contrabandistas", flavor: "A Guilda movendo cargas ilegais.",
                levels: ["2 Capangas da Guilda", "4 Capangas + 1 Atirador", "1 Assassino + 4 Capangas Veteranos", "3 Assassinos de Elite da Guilda"] },
            { min: 31, max: 45, title: "Ameaça Amorfa", flavor: "Lixo mágico descartado ganhou vida.",
                levels: ["1 Gosma Verde", "1 Cubo Gelatinoso", "1 Limo Ocre", "1 Pudim Negro"] },
            { min: 46, max: 60, title: "Corrupção Rubra", flavor: "Áreas tocadas pela Tormenta.",
                levels: ["2 Lefou Recém-transformados", "1 Uktril (Demônio da Tormenta)", "2 Uktril", "1 Tarelaf (Demônio) + 2 Lefou"] },
            { min: 61, max: 75, title: "Interação", flavor: "Roleplay/Não-combativo.",
                levels: ["Mendigo cego oferecendo segredos por comida", "Cadáver de um nobre com um mapa do esgoto e ouro", "Encontro com O Rato (Hynne) vendendo poções roubadas", "Acampamento secreto de rebeldes/estivadores"] },
            { min: 76, max: 90, title: "Culto Secreto", flavor: "Adoradores de Sszzaas (Deus da Traição).",
                levels: ["3 Cultistas Menores", "1 Sacerdote + 3 Cultistas", "1 Sacerdote + 2 Cobras Gigantes", "1 Sumo-sacerdote Sszzaazita + 1 Naga"] },
            { min: 91, max: 100, title: "Predador do Fosso", flavor: "O ápice alimentar do esgoto.",
                levels: ["1 Crocodilo faminto", "1 Otyugh (Devorador de lixo)", "1 Hidra Jovem (3 cabeças)", "1 Hidra Adulta (5 cabeças)"] },
        ],
    },
    {
        id: "caverna",
        label: "Cavernas",
        rows: [
            { min: 1, max: 15, title: "Ataque Aéreo", flavor: "Criaturas de teto.",
                levels: ["1 Enxame de Morcegos", "3 Morcegos Gigantes", "2 Feras Aladas das Cavernas", "4 Feras Aladas + Enxames"] },
            { min: 16, max: 30, title: "Habitantes das Sombras", flavor: "Povo lagarto territorial.",
                levels: ["3 Trogloditas", "5 Trogloditas + 1 Líder", "1 Xamã Trog + 5 Trogloditas", "Tribo: 1 Xamã, 2 Brutos, 6 Trogloditas"] },
            { min: 31, max: 45, title: "Perigo Natural", flavor: "Armadilha do ambiente (Teste de Ref/Fort).",
                levels: ["Teto falso cede (Dano leve)", "Gás tóxico natural (Fadiga/Dano)", "Desmoronamento grave (Soterrados)", "Fissura de magma (Dano maciço/Fogo)"] },
            { min: 46, max: 60, title: "Teias Negras", flavor: "Aracnídeos caçando.",
                levels: ["2 Aranhas Gigantes", "4 Aranhas Gigantes", "2 Aranhas-Fase (Mágicas)", "1 Aranha-Rainha Atroz + Filhotes"] },
            { min: 61, max: 75, title: "Interação", flavor: "Roleplay/Não-combativo.",
                levels: ["Minerador com a perna quebrada pedindo resgate", "Veio de minério exposto (teste de Ofício para extrair T$)", "Eremita anão louco que esculpe o futuro nas pedras", "Ruína soterrada contendo um altar profanado de Khalmyr"] },
            { min: 76, max: 90, title: "Fúria da Terra", flavor: "A própria pedra ataca.",
                levels: ["1 Elemental da Terra Pequeno", "2 Elementais da Terra Pequenos", "1 Elemental da Terra Médio", "1 Elemental da Terra Grande"] },
            { min: 91, max: 100, title: "O Olho Petrificante", flavor: "Covil do monstro letal.",
                levels: ["1 Fera das Rochas Menor", "1 Basilisco (Cuidado com ND!)", "2 Basiliscos", "1 Gorgon (Touro de metal/pedra)"] },
        ],
    },
    {
        id: "estrada",
        label: "Estradas",
        rows: [
            { min: 1, max: 15, title: "Emboscada Clássica", flavor: "",
                levels: ["3 Salteadores", "5 Salteadores", "4 Cavaleiros Mercenários", "6 Cavaleiros Mercenários + 1 Mago"] },
            { min: 16, max: 30, title: "Goblins da Estrada", flavor: "",
                levels: ["4 Goblins saqueadores", "1 Chefe Goblin + 6 Goblins", "Bando montado em Wargs", "Engenho de Guerra Goblin + Tropa"] },
            { min: 31, max: 45, title: "Milícia Corrupta", flavor: "",
                levels: ["2 Guardas cobrando T$ 10", "4 Guardas Veteranos", "1 Capitão + 4 Guardas Montados", "Inquisidor/Magistrado de Elite + Escolta"] },
            { min: 46, max: 60, title: "Fúria Selvagem", flavor: "",
                levels: ["1 Javali Furioso", "2 Javalis Atrozes", "1 Urso-Coruja", "2 Ursos-Coruja"] },
            { min: 61, max: 75, title: "Interação", flavor: "Roleplay/Não-combativo.",
                levels: ["Carroça com roda quebrada", "Bardo viajante contando histórias", "Procissão de devotos de Marah", "Caravana diplomática"] },
            { min: 76, max: 90, title: "Batedores Puristas", flavor: "",
                levels: ["2 Recrutas Puristas", "4 Soldados Puristas", "1 Oficial Purista + 4 Soldados", "1 Mecha/Golem de Batalha Purista"] },
            { min: 91, max: 100, title: "A Sombra no Céu", flavor: "",
                levels: ["1 Grifo Caçando", "2 Grifos", "1 Serpe (Wyvern)", "1 Dragão Jovem"] },
        ],
    },
    {
        id: "floresta",
        label: "Florestas",
        rows: [
            { min: 1, max: 15, title: "Predadores Selvagens", flavor: "Lobos e feras famintas.",
                levels: ["3 Lobos", "1 Lobo Atroz + 3 Lobos", "3 Lobos Atrozes", "1 Quimera ou Fera Mágica"] },
            { min: 16, max: 30, title: "Bandoleiros da Mata", flavor: "Escondidos nas folhagens.",
                levels: ["3 Bandidos com arcos", "1 Tenente + 4 Bandidos", "1 Mago Bandoleiro + 4 Arqueiros", "Grupo Mercenário de Elite (5 membros)"] },
            { min: 31, max: 45, title: "Flora Assassina", flavor: "A natureza revida.",
                levels: ["1 Arbusto Assassino", "2 Arbustos Assassinos", "1 Ente Jovem corrompido", "1 Ente Ancião Furioso"] },
            { min: 46, max: 60, title: "Peças Feéricas", flavor: "Fadas e ilusões.",
                levels: ["2 Duendes pregando peças mortais (Armadilhas)", "3 Sílfides irritadas (Magias)", "1 Dríade territorial + feras", "1 Fado Sombrio (Eiradaan)"] },
            { min: 61, max: 75, title: "Interação", flavor: "Roleplay/Não-combativo.",
                levels: ["Fonte de água mágica (Cura 1d8 PV, 1 vez)", "Druida curando um urso; oferece abrigo se forem pacíficos", "Círculo de fadas oferecendo um pacto perigoso", "Ruína élfica coberta de musgo com um item mágico consumível"] },
            { min: 76, max: 90, title: "Sombras Noturnas", flavor: "Mortos-vivos do pântano.",
                levels: ["3 Zumbis de pântano", "1 Fogo-Fátuo", "2 Fogos-Fátuos + Zumbis", "1 Aparição da Floresta + Fátuos"] },
            { min: 91, max: 100, title: "A Maldição da Lua", flavor: "Caçador implacável.",
                levels: ["1 Bárbaro Enlouquecido", "1 Lobisomem (Licantropo)", "2 Lobisomens", "1 Senhor dos Lobisomens + Alcateia"] },
        ],
    },
    {
        id: "becos",
        label: "Becos",
        rows: [
            { min: 1, max: 15, title: "Mãos Leves", flavor: "Crianças ou batedores de carteira (Teste de Percepção).",
                levels: ["2 Pivetes armados com adagas", "1 Batedor Veterano + 2 Pivetes", "1 Mestre Ladrão (Ladino de nível alto)", "Guilda Inteira cercando o beco (8+ NPCs)"] },
            { min: 16, max: 30, title: "Cobrança de Dívida", flavor: "Agiotas extorquindo alguém.",
                levels: ["2 Capangas Brutamontes", "4 Brutamontes", "1 Minotauro Gladiador + 2 Capangas", "2 Minotauros + 1 Mago Ilusionista"] },
            { min: 31, max: 45, title: "Morte Silenciosa", flavor: "Emboscada de telhado.",
                levels: ["1 Assassino Solitário", "2 Assassinos + Fio de tropeço", "1 Franco-atirador + 2 Assassinos", "1 Assassino de Elite da Guilda das Sombras"] },
            { min: 46, max: 60, title: "Luta Ilegal de Animais", flavor: "Rua bloqueada por um ringue de apostas.",
                levels: ["3 Cães de Rua Raivosos", "1 Fera Exótica Escapando", "1 Mantícora enjaulada que se solta", "Fera Mágica Implacável + Donos armados"] },
            { min: 61, max: 75, title: "Interação", flavor: "Roleplay/Não-combativo.",
                levels: ["Nobre bêbado e perdido (se ajudado, deve um favor; se roubado, dá ouro)", "Vendedor de poções ilegais (50% de chance da poção ter efeito colateral)", "Contrabandista trocando a carga sob efeito de invisibilidade (apenas barulhos)", "Oficial da guarda comprando achbuld (droga); ótima chantagem"] },
            { min: 76, max: 90, title: "A Lei Injusta", flavor: "Patrulha procurando bodes expiatórios.",
                levels: ["3 Guardas da Cidade", "1 Sargento + 4 Guardas", "Patrulha Antimagia (Guardas com itens que anulam magia)", "Guarda Pessoal do Rei / Inquisidores"] },
            { min: 91, max: 100, title: "Oculto nas Pedras", flavor: "Algo que não deveria estar na cidade.",
                levels: ["1 Gárgula Jovem", "2 Gárgulas", "1 Demônio Invocado em ritual de beco", "1 Vampiro (Morto-vivo de alto nível)"] },
        ],
    },
    {
        id: "ruinas",
        label: "Ruínas",
        rows: [
            { min: 1, max: 15, title: "Patrulha Tola", flavor: "",
                levels: ["4 Goblins Saqueadores", "6 Goblins + 1 Chefe", "Bando Goblin + 1 Golem de Sucata", "Esquadrão Goblin de Demolição (Explosivos)"] },
            { min: 16, max: 30, title: "Vigias Ossudos", flavor: "",
                levels: ["3 Esqueletos", "6 Esqueletos", "1 Cavaleiro Esqueleto + 4 Esqueletos", "3 Cavaleiros Esqueletos + Mago Morto-vivo"] },
            { min: 31, max: 45, title: "Defesa Mecânica", flavor: "",
                levels: ["Dardos Envenenados (Reflexo ou Dano+Veneno)", "Fosso com Espinhos (Profundo, Reflexo/Acrobacia)", "Sala que se enche de água ou areia (Desafio de Perícias)", "Estátuas que cospem fogo contínuo (Dano mágico)"] },
            { min: 46, max: 60, title: "Almas Inquietas", flavor: "",
                levels: ["1 Sombra", "2 Sombras", "1 Aparição (Drenar Carisma/Força)", "2 Aparições"] },
            { min: 61, max: 75, title: "Interação", flavor: "Roleplay/Não-combativo.",
                levels: ["Diário rasgado com senhas de portas", "Estátua mágica oferecendo charada/bênção", "Acampamento abandonado (suprimentos grátis)", "Espelho mágico aprisionando alma"] },
            { min: 76, max: 90, title: "Vigilantes Eternos", flavor: "",
                levels: ["1 Golem de Barro (Fraco)", "1 Golem de Barro (Normal)", "1 Golem de Pedra", "2 Golens de Pedra"] },
            { min: 91, max: 100, title: "O Mestre do Túmulo", flavor: "",
                levels: ["1 Necromante Jovem", "1 Necromante + 2 Zumbis", "1 Múmia + Servos", "1 Lich (Enfraquecido) ou Alto-Sacerdote das Trevas"] },
        ],
    },
    {
        id: "deserto",
        label: "Deserto",
        // Níveis 1-10 (cortes da planilha: 1-2 / 3-5 / 6-8 / 9-10).
        bracketMax: [2, 5, 8, 10],
        rows: [
            { min: 1, max: 15, title: "Feras das Areias", flavor: "A fauna local tentando sobreviver.",
                levels: ["3 Coiotes/Hienas (use a ficha de Lobo, p. 283)", "1 Escorpião Gigante (use a ficha de Aranha Gigante, p. 284) + 2 Coiotes", "2 Basiliscos (Livro Básico, p. 285)", "1 Quimera do Deserto (Livro Básico, p. 289)"] },
            { min: 16, max: 30, title: "Saqueadores Desesperados", flavor: "Nômades sedentos ou bandoleiros.",
                levels: ["3 Bandidos (Livro Básico, p. 301)", "1 Capanga (como Líder) (p. 302) + 4 Bandidos (p. 301)", "1 Mago (p. 304) + 4 Bandidos (p. 301)", "2 Cavaleiros (p. 302) + 1 Mago (p. 304) + 6 Bandidos"] },
            { min: 31, max: 45, title: "A Fúria do Deserto", flavor: "A letalidade do clima árido.",
                levels: ["Tempestade de Areia: Teste de Fortitude. Falha causa condição Fatigado.", "Areia Movediça: Teste de Acrobacia/Atletismo ou soterramento.", "Fissura de Fogo: Teste de Reflexos contra 6d6 de dano de Fogo.", "Tornado Infernal: Perigo Complexo. 10d6 de dano de Fogo e Esmagamento."] },
            { min: 46, max: 60, title: "O Clima Rubro", flavor: "A tempestade aberrante da Tormenta.",
                levels: ["Chuva Ácida: Dano leve (1d6 ácido) por rodada sem abrigo.", "Tempestade de Matéria: Teste de Vontade. Falha perde 1d4 PM.", "Névoa Enlouquecedora: Teste de Vontade ou fica Apavorado (p. 393).", "Anomalia Gravitacional: Quedas para cima (dano de queda massivo de impacto)."] },
            { min: 61, max: 75, title: "Interação", flavor: "Oásis, miragens e viajantes insólitos.",
                levels: ["Oásis Puro: Água fresca (Cura PV/PM). Atrai NPCs suspeitos.", "Ruína Aberrante: Estátua coberta de Tormenta. Tocar exige Vontade (Insanidade).", "Mercador Qareen: Voando em um tapete. Vende poções caras (dobro do preço).", "Refugiados Lefou: Acampamento pedindo ajuda e curas (bons informantes)."] },
            { min: 76, max: 90, title: "Os Cultistas do Devorador", flavor: "Adoradores de Aharadak.",
                levels: ["2 Cultistas (Livro Básico, p. 302)", "1 Sacerdote (p. 304) + 4 Cultistas (p. 302)", "2 Sacerdotes (p. 304) + 2 Capangas Lefou (p. 302)", "1 Sumo-Sacerdote (Sacerdote ND alto) + 1 Assassino (p. 301)"] },
            { min: 91, max: 100, title: "A Verdadeira Tormenta", flavor: "Demônios Lefeu cruzando as areias.",
                levels: ["2 Cultistas Lefou (Livro Básico, p. 302)", "1 Uktril (Demônio da Tormenta, p. 293)", "2 Uktril (Livro Básico, p. 293)", "1 Tarelaf (p. 293) + 1 Uktril (p. 293)"] },
        ],
    },
];

// ── Lookup (puro, testável) ───────────────────────────────────────────────────

/**
 * Bracket (0..3) para um nível, segundo os tetos `bracketMax` do ambiente.
 * Default [2,4,6,8]: 1-2→0, 3-4→1, 5-6→2, 7-8→3.
 * Deserto [2,5,8,10]: 1-2→0, 3-5→1, 6-8→2, 9-10→3.
 */
export function bracketIndexForLevel(level: number, bracketMax: number[] = DEFAULT_BRACKET_MAX): number {
    const maxLv = bracketMax[bracketMax.length - 1] ?? 8;
    const lv = Math.max(1, Math.min(maxLv, Math.floor(level)));
    for (let i = 0; i < bracketMax.length; i++) {
        if (lv <= bracketMax[i]) return i;
    }
    return bracketMax.length - 1;
}

/** Nível máximo aceito para um ambiente (último teto de bracket). */
export function maxLevelFor(env: EnvironmentDef): number {
    const bm = env.bracketMax ?? DEFAULT_BRACKET_MAX;
    return bm[bm.length - 1] ?? 8;
}

export function getEnvironment(id: string): EnvironmentDef | null {
    return ENVIRONMENTS.find(e => e.id === id) ?? null;
}

/** Faixa de d100 (1-100) correspondente ao rolamento, ou null. */
export function findRow(env: EnvironmentDef, roll: number): EncounterRow | null {
    return env.rows.find(r => roll >= r.min && roll <= r.max) ?? null;
}

/** Formata um número de faixa com 2 dígitos (1→"01", 100→"100"). */
export function padRange(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

export interface EncounterResult {
    envLabel: string;
    roll: number;
    level: number;
    rangeLabel: string;
    title: string;
    flavor: string;
    encounter: string;
}

/** Resolve o encontro para (ambiente, nível 1..maxLevelFor(env), rolamento 1-100). */
export function lookupEncounter(envId: string, level: number, roll: number): EncounterResult | null {
    const env = getEnvironment(envId);
    if (!env) return null;
    const row = findRow(env, roll);
    if (!row) return null;
    return {
        envLabel: env.label,
        roll,
        level,
        rangeLabel: `${padRange(row.min)}-${padRange(row.max)}`,
        title: row.title,
        flavor: row.flavor,
        encounter: row.levels[bracketIndexForLevel(level, env.bracketMax ?? DEFAULT_BRACKET_MAX)],
    };
}

// ── Validação (segurança ao expandir a tabela) ────────────────────────────────

/**
 * Valida a estrutura de uma lista de ambientes e retorna a lista de problemas
 * encontrados (vazia = tudo certo). Checa: ids únicos/não-vazios, faixas
 * cobrindo 1–100 sem buracos/sobreposições, e 4 brackets de nível não vazios
 * por faixa. Chamada no setup (avisa no console) e exercida nos testes — assim,
 * ao colar uma nova tabela, erros de formato são apontados na hora.
 */
export function validateEnvironments(envs: EnvironmentDef[] = ENVIRONMENTS): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const env of envs) {
        const tag = env.id || `(label: ${env.label})`;
        if (!env.id) problems.push(`Ambiente sem id (label: "${env.label}").`);
        else if (seen.has(env.id)) problems.push(`Id duplicado: "${env.id}".`);
        if (env.id) seen.add(env.id);

        const bm = env.bracketMax;
        if (bm !== undefined) {
            if (!Array.isArray(bm) || bm.length !== 4) {
                problems.push(`"${tag}": bracketMax precisa de exatamente 4 tetos.`);
            } else if (bm.some((n, i) => !Number.isInteger(n) || n < 1 || (i > 0 && n <= bm[i - 1]))) {
                problems.push(`"${tag}": bracketMax deve ser inteiros positivos ascendentes.`);
            }
        }

        const rows = env.rows ?? [];
        if (!rows.length) { problems.push(`"${tag}": nenhuma faixa definida.`); continue; }

        const sorted = [...rows].sort((a, b) => a.min - b.min);
        if (sorted[0].min !== 1) problems.push(`"${tag}": a primeira faixa deve começar em 1 (está em ${sorted[0].min}).`);
        if (sorted[sorted.length - 1].max !== 100) problems.push(`"${tag}": a última faixa deve terminar em 100 (está em ${sorted[sorted.length - 1].max}).`);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].min !== sorted[i - 1].max + 1) {
                problems.push(`"${tag}": buraco/sobreposição entre ${sorted[i - 1].max} e ${sorted[i].min}.`);
            }
        }
        for (const row of rows) {
            if (!Array.isArray(row.levels) || row.levels.length !== 4) {
                problems.push(`"${tag}" faixa ${row.min}-${row.max}: precisa de exatamente 4 brackets de nível.`);
            } else if (row.levels.some(l => !l || !l.trim())) {
                problems.push(`"${tag}" faixa ${row.min}-${row.max}: há bracket de nível vazio.`);
            }
        }
    }
    return problems;
}
