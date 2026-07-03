/**
 * Armamento Aberrante — poder da Tormenta (v1.74.0)
 *
 * "Você pode gastar uma ação de movimento e 1 PM para produzir uma versão
 * orgânica de qualquer arma corpo a corpo ou de arremesso com a qual seja
 * proficiente — ela brota do seu braço/ombro/costas e se desprende. O dano da
 * arma aumenta em um passo para cada DOIS OUTROS poderes da Tormenta que você
 * possui. A arma dura pela cena, então se desfaz numa poça de gosma."
 *
 * Fluxo:
 *   1. O jogador usa o poder (T20 debita 1 PM nativo — `ativacao.custo:1`).
 *   2. Detectamos o uso via `createChatMessage` (data-item-id → nome do poder) e
 *      abrimos um seletor de armas (busca + favoritos, agrupado por categoria),
 *      mostrando o dado já com os passos de dano aplicados.
 *   3. Ao escolher, criamos a arma no inventário (dano já stepado), marcada com
 *      `flags.<MODULE_ID>.armamentoAberrante` + a cena atual.
 *   4. A arma se desfaz: manualmente (skills-menu) ou automaticamente no fim do
 *      encontro (`deleteCombat` = fim da cena).
 *
 * ⚠️ Segurança (pedido do usuário): a arma é um ITEM SEM Active Effects — os
 * passos de dano são cravados direto no roll de dano (nada de AE). Assim a
 * criação/remoção NUNCA mexe em passivos/atributos de outros poderes. A remoção
 * deleta APENAS itens marcados com nossa flag.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { isActiveGM, escHtml } from "@/_shared";
import { normalizeCondName } from "@/spell-resistance/index";
import { stepDie } from "@/adamante/index";
import { registerSkillAction, refreshSkillsMenu } from "@/ui/skills-menu";
import {
    ABERRANT_WEAPONS, PROF_ORDER, PROF_LABEL,
    type AberrantWeapon, type WeaponProf,
} from "./weapons";

const AA_FLAG = "armamentoAberrante";
const POWER_NAME = "armamento aberrante"; // normalizado
const SETTING_FAV = "armamentoAberranteFavorites"; // client (Array<string> — nomes normalizados)
const STYLE_ID = "t20-aa-styles";
const WEAPON_IMG = "icons/magic/nature/root-vine-fire-entangled-hand.webp";

// ── Regra de passos (pura, testável) ──────────────────────────────────────────

interface PoderItem { type?: string; name?: string; system?: { subtipo?: string; description?: { value?: string } } }

/**
 * Cláusula que faz um poder "contar como um poder da Tormenta" mesmo sem ter
 * `subtipo:"Tormenta"`. Ex.: Couraça Rubra/Disforme (Kaijin), Deformidade
 * (Lefou), Linhagem Rubra (+ Aprimorada/Superior), Apoteose Rubra — todos dizem
 * "…conta como um poder da Tormenta…" na descrição. Genérico p/ pegar futuros.
 */
const TORMENTA_CLAUSE = /cont(a|am|ando)?\s+como\s+(um\s+|dois\s+)?poder(es)?\s+da\s+tormenta/;

/** Descrição do poder sem HTML, normalizada (lower + sem acentos). */
function powerDescNorm(it: PoderItem): string {
    const raw = String(it.system?.description?.value ?? "").replace(/<[^>]+>/g, " ");
    return normalizeCondName(raw);
}

/** O poder conta como "da Tormenta"? (subtipo OU cláusula na descrição). */
export function isTormentaPower(it: PoderItem | null | undefined): boolean {
    if (!it || it.type !== "poder") return false;
    if (it.system?.subtipo === "Tormenta") return true;
    return TORMENTA_CLAUSE.test(powerDescNorm(it));
}

/**
 * Peso de um poder na contagem de "outros poderes da Tormenta":
 *  - 0 se não conta (ou se for o próprio Armamento Aberrante).
 *  - 2 para a Deformidade do Lefou ("cada um desses bônus [em DUAS perícias]
 *    conta como um poder da Tormenta").
 *  - 1 nos demais casos.
 */
export function tormentaPowerWeight(it: PoderItem): number {
    if (!isTormentaPower(it)) return 0;
    const name = normalizeCondName(it.name ?? "");
    if (name.includes(POWER_NAME)) return 0;   // não conta a si mesmo
    if (name.includes("deformidade")) return 2; // Lefou: dois bônus = dois poderes
    return 1;
}

/** Conta OUTROS poderes da Tormenta (subtipo OU cláusula) — exclui o próprio AA. */
export function countOtherTormentaPowers(items: PoderItem[]): number {
    let n = 0;
    for (const it of items) n += tormentaPowerWeight(it);
    return n;
}

/** Passos de dano = 1 para cada DOIS outros poderes da Tormenta. */
export function computeDamageSteps(otherTormentaCount: number): number {
    return Math.floor(Math.max(0, otherTormentaCount) / 2);
}

/** Aplica os passos ao dado-base via a tabela passosDano do T20. */
export function steppedWeaponDie(die: string, steps: number): string {
    if (!die || steps <= 0) return die;
    const table = (CONFIG as unknown as { T20?: { passosDano?: string[][] } }).T20?.passosDano;
    if (!table) return die;
    return stepDie(die, table, steps);
}

// ── Proficiência (pura, testável) ─────────────────────────────────────────────

export interface WeaponProficiency {
    categories: Set<string>; // simples/marcial/exotica/fogo (system.tracos.profArmas.value)
    custom: string[];        // nomes normalizados de armas específicas (profArmas.custom)
    known: boolean;          // o personagem tem ALGUMA proficiência registrada?
}

interface ActorProfShape { system?: { tracos?: { profArmas?: { value?: unknown; custom?: unknown } } } }

/** Lê as proficiências de arma do personagem (categorias + nomes específicos). */
export function getActorWeaponProficiencies(actor: ActorProfShape | null | undefined): WeaponProficiency {
    const p = actor?.system?.tracos?.profArmas;
    const categories = new Set<string>(Array.isArray(p?.value) ? (p!.value as unknown[]).map(String) : []);
    const custom = String(p?.custom ?? "")
        .split(/[;,/\n]+/)
        .map(s => normalizeCondName(s))
        .filter(Boolean);
    return { categories, custom, known: categories.size > 0 || custom.length > 0 };
}

/**
 * O personagem é proficiente com esta arma? Por CATEGORIA (simples/marcial/…) ou
 * por NOME específico (campo custom). Se o personagem NÃO tem nenhuma
 * proficiência registrada (`known === false`), não escondemos nada (fallback:
 * ficha incompleta não deve zerar a lista).
 */
export function isProficientWith(w: AberrantWeapon, prof: WeaponProficiency): boolean {
    if (!prof.known) return true;
    if (prof.categories.has(w.prof)) return true;
    const wn = normalizeCondName(w.name);
    return prof.custom.some(tok => wn === tok || (tok.length >= 4 && wn.includes(tok)));
}

// ── Construção do item de arma ────────────────────────────────────────────────

function part(a: string, b = "", c = ""): string[] { return [a, b, c]; }

/** Monta o item de arma orgânica (dano já com os passos aplicados). */
export function buildAberrantWeaponData(
    w: AberrantWeapon, steps: number, sceneId: string | null, worldTime: number,
): Record<string, unknown> {
    const die = steppedWeaponDie(w.die, steps);
    const danoParts: string[][] = [];
    danoParts.push(part(die, w.tipoDano, ""));
    if (w.danoAttr) danoParts.push(part(w.danoAttr, "", ""));

    const rolls = [
        { name: "Ataque", key: "ataque0", type: "ataque", parts: [part("1d20"), part(w.ataqueAttr || "luta"), part("0")], adaptavel: "", versatil: "" },
        { name: "Dano", key: "dano1", type: "dano", parts: danoParts, versatil: "", adaptavel: "" },
    ];

    const stepNote = steps > 0 && die !== w.die ? ` (dano ${w.die}→${die}, +${steps} passo${steps > 1 ? "s" : ""})` : "";

    return {
        name: `${w.name} (Aberrante)`,
        type: "arma",
        img: WEAPON_IMG,
        system: {
            proficiencia: w.prof,
            proposito: w.proposito,
            empunhadura: w.empunhadura,
            criticoM: w.criticoM,
            criticoX: w.criticoX,
            alcance: w.alcance,
            equipado: false,
            equipado2: { slot: 0, type: "hand" },
            espacos: 0,
            peso: 0,
            preco: 0,
            qtd: 1,
            description: {
                value: `<p>Versão orgânica criada pelo poder <strong>Armamento Aberrante</strong>${stepNote}. Dura até o fim da cena, então se desfaz numa poça de gosma.</p>`,
                unidentified: "",
            },
            source: "Armamento Aberrante",
            rolls,
        },
        flags: {
            [MODULE_ID]: {
                [AA_FLAG]: { sceneId, createdWorldTime: worldTime, baseDie: w.die, steps },
            },
        },
    };
}

// ── Favoritos (client setting) ────────────────────────────────────────────────

function getFavorites(): Set<string> {
    const arr = (game.settings?.get(MODULE_ID, SETTING_FAV) as string[] | undefined) ?? [];
    return new Set(arr);
}
async function toggleFavorite(norm: string): Promise<void> {
    const favs = getFavorites();
    if (favs.has(norm)) favs.delete(norm); else favs.add(norm);
    await game.settings?.set(MODULE_ID, SETTING_FAV, Array.from(favs));
}

// ── Runtime shapes ─────────────────────────────────────────────────────────────

interface ActorLike {
    id?: string;
    name?: string;
    isOwner?: boolean;
    items?: { contents?: PoderItem[] } | PoderItem[];
    createEmbeddedDocuments?: (t: string, d: object[], c?: object) => Promise<unknown>;
    deleteEmbeddedDocuments?: (t: string, ids: string[], c?: object) => Promise<unknown>;
    effects?: unknown;
}

function actorItems(actor: ActorLike): PoderItem[] {
    return Array.isArray(actor.items) ? actor.items : (actor.items?.contents ?? []);
}

// ── Estilos ────────────────────────────────────────────────────────────────────

const STYLES = `
.t20-aa-picker { display:flex; flex-direction:column; gap:.5em; max-height:70vh; }
.t20-aa-picker .aa-search { width:100%; box-sizing:border-box; padding:.4em .6em; background:#1c1209; color:#f0ebe0; border:1px solid #6a4e18; border-radius:4px; }
.t20-aa-picker .aa-info { color:#c8a96e; font-size:.85em; letter-spacing:.03em; }
.t20-aa-picker .aa-prof { color:#9a8e7a; font-size:.8em; margin-top:-.2em; }
.t20-aa-picker .aa-list { overflow-y:auto; max-height:56vh; padding-right:.3em; }
.t20-aa-picker .aa-group { color:#9a8e7a; text-transform:uppercase; font-size:.72em; letter-spacing:.08em; margin:.6em 0 .2em; border-bottom:1px solid #6a4e18; padding-bottom:.15em; }
.t20-aa-weapon { display:grid; grid-template-columns:1.4em 1fr auto; align-items:center; gap:.5em; padding:.25em .4em; border-radius:4px; cursor:pointer; }
.t20-aa-weapon:hover { background:#2a1c0c; }
.t20-aa-weapon .aa-star { cursor:pointer; color:#6a4e18; text-align:center; }
.t20-aa-weapon .aa-star.on { color:#c8a96e; }
.t20-aa-weapon .aa-name { color:#f0ebe0; font-weight:600; }
.t20-aa-weapon .aa-meta { color:#9a8e7a; font-size:.78em; }
.t20-aa-weapon .aa-dmg { color:#6ecf7a; font-size:.82em; white-space:nowrap; }
.t20-aa-weapon .aa-dmg .aa-boost { color:#c8a96e; }
`;

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

// ── Seletor de armas ──────────────────────────────────────────────────────────

function weaponRowHtml(w: AberrantWeapon, steps: number, fav: boolean): string {
    const norm = normalizeCondName(w.name);
    const die = steppedWeaponDie(w.die, steps);
    const dmg = w.die
        ? (die !== w.die ? `${w.die}→<span class="aa-boost">${die}</span>` : die)
        : "—";
    const meta = `${w.proposito.replace(/-/g, " ")} · ${w.empunhadura} · crít ${w.criticoM}${w.criticoX > 2 ? `/x${w.criticoX}` : ""}`;
    return `<div class="t20-aa-weapon" data-key="${escHtml(norm)}">
        <span class="aa-star ${fav ? "on" : ""}" data-star="${escHtml(norm)}" title="Favoritar">${fav ? "★" : "☆"}</span>
        <span><span class="aa-name">${escHtml(w.name)}</span><br><span class="aa-meta">${escHtml(meta)}</span></span>
        <span class="aa-dmg">${dmg} ${escHtml(w.tipoDano || "")}</span>
    </div>`;
}

function renderList(root: HTMLElement, steps: number, filter: string, weapons: AberrantWeapon[]): void {
    const favs = getFavorites();
    const q = normalizeCondName(filter);
    const match = (w: AberrantWeapon): boolean => !q || normalizeCondName(w.name).includes(q);
    const listed = weapons.filter(match);

    let html = "";
    const favWeapons = listed.filter(w => favs.has(normalizeCondName(w.name)));
    if (favWeapons.length) {
        html += `<div class="aa-group">★ Favoritas</div>`;
        html += favWeapons.map(w => weaponRowHtml(w, steps, true)).join("");
    }
    for (const prof of PROF_ORDER) {
        const group = listed.filter(w => w.prof === prof);
        if (!group.length) continue;
        html += `<div class="aa-group">${escHtml(PROF_LABEL[prof as WeaponProf])}</div>`;
        html += group.map(w => weaponRowHtml(w, steps, favs.has(normalizeCondName(w.name)))).join("");
    }
    if (!html) html = `<div class="aa-meta" style="padding:.5em">Nenhuma arma encontrada.</div>`;
    const listEl = root.querySelector<HTMLElement>(".aa-list");
    if (listEl) listEl.innerHTML = html;
}

async function openWeaponPicker(actor: ActorLike, steps: number): Promise<void> {
    ensureStyles();
    const otherCount = countOtherTormentaPowers(actorItems(actor));
    const prof = getActorWeaponProficiencies(actor as ActorProfShape);
    const allowed = ABERRANT_WEAPONS.filter(w => isProficientWith(w, prof));

    const stepInfo = steps > 0
        ? `+${steps} passo${steps > 1 ? "s" : ""} de dano (${otherCount} outros poderes da Tormenta)`
        : `Sem passo extra (${otherCount} outro${otherCount === 1 ? "" : "s"} poder${otherCount === 1 ? "" : "es"} da Tormenta — precisa de 2 por passo)`;
    const CAT_LABEL: Record<string, string> = { simples: "simples", marcial: "marciais", exotica: "exóticas", fogo: "de fogo" };
    const profInfo = prof.known
        ? `Proficiente em: ${[...prof.categories].map(c => CAT_LABEL[c] ?? c).join(", ")}${prof.custom.length ? ` (+específicas)` : ""}`
        : `⚠️ Nenhuma proficiência de arma registrada na ficha — exibindo todas`;

    const content = `<div class="t20-aa-picker">
        <input type="text" class="aa-search" placeholder="Buscar arma..." autofocus />
        <div class="aa-info">${escHtml(stepInfo)}</div>
        <div class="aa-info aa-prof">${escHtml(profInfo)}</div>
        <div class="aa-list"></div>
    </div>`;

    const DialogCls = (globalThis as { Dialog?: unknown }).Dialog as {
        new (cfg: unknown, opts?: unknown): { render(force: boolean): void; close(): void };
    };
    let dlg: { render(force: boolean): void; close(): void };

    const wire = (html: unknown): void => {
        const root = ((html as { 0?: HTMLElement })[0] ?? html) as HTMLElement;
        const el = root.querySelector<HTMLElement>(".t20-aa-picker") ?? root;
        renderList(el, steps, "", allowed);
        const search = el.querySelector<HTMLInputElement>(".aa-search");
        search?.addEventListener("input", () => renderList(el, steps, search.value, allowed));
        el.addEventListener("click", (ev) => {
            const t = ev.target as HTMLElement;
            const star = t.closest<HTMLElement>("[data-star]");
            if (star) {
                ev.stopPropagation();
                void toggleFavorite(star.dataset["star"] ?? "").then(() => renderList(el, steps, search?.value ?? "", allowed));
                return;
            }
            const row = t.closest<HTMLElement>(".t20-aa-weapon");
            if (row) {
                const key = row.dataset["key"];
                const w = allowed.find(x => normalizeCondName(x.name) === key);
                if (w) { void createAberrantWeapon(actor, w, steps); dlg.close(); }
            }
        });
        setTimeout(() => search?.focus(), 50);
    };

    dlg = new DialogCls({
        title: `Armamento Aberrante — ${actor.name ?? "?"}`,
        content,
        buttons: { close: { label: "Cancelar" } },
        default: "close",
        render: wire,
    }, { classes: ["t20-dialog", "t20-aa-dialog"], width: 460 });
    dlg.render(true);
}

// ── Criação / dissolução ──────────────────────────────────────────────────────

function currentSceneId(): string | null {
    return (canvas as unknown as { scene?: { id?: string } })?.scene?.id
        ?? (game as unknown as { scenes?: { current?: { id?: string } } })?.scenes?.current?.id
        ?? null;
}
function worldTime(): number {
    return Number(game.time?.worldTime ?? 0);
}

async function createAberrantWeapon(actor: ActorLike, w: AberrantWeapon, steps: number): Promise<void> {
    const data = buildAberrantWeaponData(w, steps, currentSceneId(), worldTime());
    try {
        await actor.createEmbeddedDocuments?.("Item", [data]);
        const die = steppedWeaponDie(w.die, steps);
        await postCard(
            `🌿 Armamento Aberrante — ${escHtml(actor.name ?? "")}`,
            `<b>${escHtml(w.name)}</b> brota e se desprende${w.die && die !== w.die ? ` (dano <b>${escHtml(die)}</b>)` : ""}. Dura até o fim da cena.`,
            "#6ecf7a",
        );
        refreshSkillsMenu();
        log(`Armamento Aberrante: criada "${w.name}" (+${steps} passos) em ${actor.name}.`);
    } catch (e) {
        warn("Armamento Aberrante: falha ao criar arma", e);
        ui.notifications?.error("Falha ao criar a arma aberrante.");
    }
}

/** Itens de arma aberrante do ator. */
function aberrantWeaponsOf(actor: ActorLike): PoderItem[] {
    return actorItems(actor).filter(it =>
        !!(it as { flags?: Record<string, Record<string, unknown> | undefined> }).flags?.[MODULE_ID]?.[AA_FLAG],
    );
}

async function dissolveAberrant(actor: ActorLike, reason: string): Promise<number> {
    const weapons = aberrantWeaponsOf(actor) as Array<{ id?: string; name?: string }>;
    if (!weapons.length) return 0;
    const ids = weapons.map(w => w.id ?? "").filter(Boolean);
    try {
        await actor.deleteEmbeddedDocuments?.("Item", ids, { render: false });
        await postCard(
            `🫧 Armamento Aberrante — ${escHtml(actor.name ?? "")}`,
            `${weapons.map(w => `<b>${escHtml(w.name ?? "")}</b>`).join(", ")} se desfaz numa poça de gosma (${escHtml(reason)}).`,
            "#9a8e7a",
        );
        refreshSkillsMenu();
        log(`Armamento Aberrante: dissolvidas ${ids.length} arma(s) de ${actor.name} (${reason}).`);
    } catch (e) {
        warn("Armamento Aberrante: falha ao dissolver", e);
    }
    return ids.length;
}

async function postCard(title: string, body: string, color: string): Promise<void> {
    await ChatMessage.create({
        content:
            `<div style="border-left:3px solid ${color};padding:5px 10px;">` +
            `<div style="color:${color};font-weight:700;letter-spacing:.03em;">${title}</div>` +
            `<div style="color:#e8e0d0;font-size:.9em;margin-top:.2em;">${body}</div>` +
            `</div>`,
    });
}

// ── Detecção do uso do poder ──────────────────────────────────────────────────

const castDebounce = new Map<string, number>();

interface MessageLike {
    content?: string;
    author?: { id?: string };
    user?: { id?: string } | string;
    speaker?: { actor?: string; token?: string; scene?: string };
}

function resolveActorFromMessage(m: MessageLike): ActorLike | null {
    const sp = m.speaker ?? {};
    if (sp.token) {
        const tok = (canvas as unknown as { tokens?: { get(id: string): { actor?: ActorLike } | undefined } })?.tokens?.get(sp.token);
        if (tok?.actor) return tok.actor;
    }
    if (sp.actor) return (game.actors?.get(sp.actor) as ActorLike) ?? null;
    return null;
}

function messageItemIsPower(m: MessageLike, actor: ActorLike): boolean {
    const html = m.content ?? "";
    const match = html.match(/data-item-id="([^"]+)"/);
    const itemId = match?.[1];
    if (!itemId) return false;
    const item = actorItems(actor).find(i => (i as { id?: string }).id === itemId) as { name?: string } | undefined;
    if (!item) return false;
    return normalizeCondName(item.name ?? "").includes(POWER_NAME);
}

function onPowerCast(m: MessageLike): void {
    const authorId = m.author?.id ?? (typeof m.user === "object" ? m.user?.id : m.user);
    if (authorId !== game.user?.id) return; // só o autor abre o seletor
    const actor = resolveActorFromMessage(m);
    if (!actor) return;
    if (!messageItemIsPower(m, actor)) return;

    // Debounce: o T20 pode postar mais de uma mensagem por uso.
    const now = Date.now();
    const key = actor.id ?? "?";
    if (now - (castDebounce.get(key) ?? 0) < 2000) return;
    castDebounce.set(key, now);

    const steps = computeDamageSteps(countOtherTormentaPowers(actorItems(actor)));
    void openWeaponPicker(actor, steps);
}

// ── Skills-menu + fim de cena ──────────────────────────────────────────────────

function resolveOwnedActorForMenu(): ActorLike | null {
    const controlled = ((canvas as unknown as { tokens?: { controlled?: Array<{ actor?: ActorLike }> } })?.tokens?.controlled) ?? [];
    if (controlled[0]?.actor) return controlled[0].actor;
    const ch = (game.user as { character?: ActorLike } | undefined)?.character;
    return ch ?? null;
}

function combatActorsWithAberrant(combat: unknown): ActorLike[] {
    const c = combat as { combatants?: { contents?: Array<{ actor?: ActorLike; token?: { id?: string } }> } };
    const seen = new Set<string>();
    const out: ActorLike[] = [];
    for (const cb of c.combatants?.contents ?? []) {
        const actor = cb.actor;
        const key = cb.token?.id ?? actor?.id;
        if (!actor || !key || seen.has(key)) continue;
        seen.add(key);
        if (aberrantWeaponsOf(actor).length) out.push(actor);
    }
    return out;
}

export function setupArmamentoAberrante(): void {
    game.settings?.register(MODULE_ID, SETTING_FAV, {
        scope: "client", config: false, type: Array, default: [],
    });

    Hooks.on("createChatMessage", (...args: unknown[]) => {
        onPowerCast(args[0] as MessageLike);
    });

    // Fim do encontro (= fim da cena): GM eleito dissolve as armas de todos.
    Hooks.on("deleteCombat", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const actors = combatActorsWithAberrant(args[0]);
        for (const a of actors) void dissolveAberrant(a, "fim da cena");
    });

    registerSkillAction({
        id: "armamento-aberrante-dissolver",
        label: "Dissolver Armamento Aberrante",
        icon: "fa-hand-sparkles",
        color: "#6ecf7a",
        isVisible: () => {
            const a = resolveOwnedActorForMenu();
            return !!a && aberrantWeaponsOf(a).length > 0;
        },
        onClick: () => {
            const a = resolveOwnedActorForMenu();
            if (a) void dissolveAberrant(a, "desfeita manualmente");
        },
    });

    Hooks.once("ready", () => refreshSkillsMenu());
    log("Armamento Aberrante: seletor de armas orgânicas ativo.");
}
