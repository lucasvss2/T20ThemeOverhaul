/**
 * Divindades — escolha de patrono arrastando o item de divindade pra ficha.
 *
 * O compêndio bundled "T20 Overhaul — Divindades" (packs-src/divindades/) tem
 * 20 itens (type poder, subtipo "Divindade") com o símbolo heráldico bundled e
 * a flag `divindade { nome, poderes[], automacao }`.
 *
 * Fluxo: arrastar a divindade pra ficha (character) → MODAL com o símbolo +
 * nome no título, o texto de Obrigações & Restrições e a lista de PODERES
 * CONCEDIDOS em 2 colunas (ícone + nome; click expande a descrição; checkbox).
 * Limite: 1 poder (2 se o personagem tem "Devoto Fiel"). Finalizar → importa
 * os poderes escolhidos dos compêndios + cria a complicação "Obrigações e
 * Restrições — <Deus>" + seta `system.detalhes.divindade`. Cancelar → remove
 * o item de divindade (escolha abortada).
 *
 * Campo divindade da ficha: quando o ator tem o item, o <input> de texto é
 * substituído por símbolo + nome (click abre o item) — comporta como raça.
 *
 * Automações de O&R:
 *  - Aharadak: início de combate → 1d6; ÍMPAR → Fascinado (cena) no devoto.
 *  - Nimb: AE persistente −5 em perícias de Carisma + início de combate →
 *    1d6; em 1 → Confuso (cena).
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import { norm } from "@/inspiracao/format";
import { registerExpectedCondition } from "@/duration-manager/index";

const FLAG_DIV = "divindade";
const FLAG_COMP = "divindadeComplicacao";
const FLAG_NIMB_AE = "divindadeNimbAE";
const FLAG_COMBAT_ROLL = "divindadeCombatRoll";
const STYLES_ID = "t20-divindades-styles";

// ── Helpers puros ─────────────────────────────────────────────────────────────

/** Máximo de poderes concedidos: 1; 2 com Devoto Fiel. */
export function maxPoderesConcedidos(hasDevotoFiel: boolean): number {
    return hasDevotoFiel ? 2 : 1;
}

export interface DivindadeFlag { nome: string; poderes: string[]; automacao?: string | null }

export function getDivindadeFlag(item: { getFlag?: (s: string, k: string) => unknown; flags?: Record<string, Record<string, unknown> | undefined> } | null | undefined): DivindadeFlag | null {
    if (!item) return null;
    const f = (item.getFlag?.(MODULE_ID, FLAG_DIV)
        ?? (item.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_DIV]) as DivindadeFlag | undefined;
    return f && typeof f.nome === "string" && Array.isArray(f.poderes) ? f : null;
}

// ── Tipos mínimos ─────────────────────────────────────────────────────────────

interface ItemLike {
    id?: string | null;
    uuid?: string;
    name?: string;
    type?: string;
    img?: string;
    system?: {
        description?: { value?: string };
        detalhes?: unknown;
    } & Record<string, unknown>;
    getFlag?: (s: string, k: string) => unknown;
    flags?: Record<string, Record<string, unknown> | undefined>;
    sheet?: { render: (f: boolean) => void };
    delete?: () => Promise<unknown>;
    toObject?: () => Record<string, unknown>;
}

interface ActorLike {
    id?: string;
    name?: string;
    type?: string;
    isOwner?: boolean;
    items?: { get?: (id: string) => ItemLike | undefined; contents: ItemLike[] };
    effects?: { contents: Array<{ id?: string | null; flags?: Record<string, Record<string, unknown> | undefined>; origin?: string | null }> };
    system?: { detalhes?: { divindade?: string }; attributes?: unknown };
    getFlag?: (s: string, k: string) => unknown;
    setFlag?: (s: string, k: string, v: unknown) => Promise<unknown>;
    unsetFlag?: (s: string, k: string) => Promise<unknown>;
    update?: (d: Record<string, unknown>) => Promise<unknown>;
    createEmbeddedDocuments?: (t: string, d: unknown[], o?: Record<string, unknown>) => Promise<Array<{ id?: string }>>;
    deleteEmbeddedDocuments?: (t: string, ids: string[], o?: Record<string, unknown>) => Promise<unknown>;
    toggleStatusEffect?: (id: string, o?: Record<string, unknown>) => Promise<unknown>;
}

function actorDivindadeItem(actor: ActorLike): ItemLike | null {
    return (actor.items?.contents ?? []).find((i) => !!getDivindadeFlag(i)) ?? null;
}

function actorHasDevotoFiel(actor: ActorLike): boolean {
    return (actor.items?.contents ?? []).some((i) => i.type === "poder" && norm(i.name).includes("devoto fiel"));
}

function esc(s: string): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
.window-app.t20-dialog:has(.t20-div-modal), .application.t20-dialog:has(.t20-div-modal) { width: 720px !important; max-width: 96vw !important; }
.t20-div-modal { display:flex; flex-direction:column; max-height: 74vh; }
.t20-div-modal .dv-header { display:flex; align-items:center; gap:12px; padding-bottom:6px; border-bottom:1px solid #c8a96e; }
.t20-div-modal .dv-header img { width:64px; height:64px; object-fit:contain; border:none; flex:0 0 auto; }
.t20-div-modal .dv-header h1 { font-size:1.6em; color:#c8a96e; margin:0; border:none; }
.t20-div-modal .dv-oer { flex:0 0 auto; font-size:12px; color:#e8e0d0; padding:8px 2px; max-height:150px; overflow-y:auto; border-bottom:1px solid rgba(200,169,110,.3); }
.t20-div-modal .dv-oer p { margin:0 0 6px 0; }
.t20-div-modal .dv-limit { flex:0 0 auto; font-size:11px; color:#9a8e7a; padding:4px 2px; }
.t20-div-modal .dv-powers { flex:1 1 auto; overflow-y:auto; max-height:40vh; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4px 12px; align-content:start; padding:4px 2px; }
.t20-div-modal .dv-power { border:1px solid rgba(200,169,110,.25); border-radius:4px; padding:4px 6px; }
.t20-div-modal .dv-power-head { display:flex; align-items:center; gap:6px; cursor:pointer; }
.t20-div-modal .dv-power-head img { width:24px; height:24px; object-fit:contain; border:none; flex:0 0 auto; }
.t20-div-modal .dv-power-head .dv-pname { flex:1; font-weight:bold; color:#c8a96e; font-size:13px; }
.t20-div-modal .dv-power-head input[type=checkbox] { flex:0 0 auto; }
.t20-div-modal .dv-desc { display:none; font-size:11px; color:#9a8e7a; margin-top:4px; border-top:1px dashed rgba(200,169,110,.2); padding-top:4px; max-height:140px; overflow-y:auto; }
.t20-div-modal .dv-power.open .dv-desc { display:block; }
.t20-div-modal .dv-missing { color:#cc4444; font-size:11px; }
`;

function ensureStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const st = document.createElement("style");
    st.id = STYLES_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
}

// ── Busca dos poderes concedidos nos compêndios ───────────────────────────────

interface PowerDoc { name: string; img?: string; desc: string; doc: { toObject: () => Record<string, unknown> } }

async function loadPowerDocs(names: string[]): Promise<Map<string, PowerDoc | null>> {
    const wanted = new Map(names.map((n) => [norm(n), n]));
    const out = new Map<string, PowerDoc | null>();
    for (const n of names) out.set(n, null);
    const packs = (game as unknown as { packs?: { contents: Array<{
        collection: string;
        metadata?: { type?: string };
        getIndex: (o?: { fields?: string[] }) => Promise<Iterable<Record<string, unknown>>>;
        getDocument: (id: string) => Promise<unknown>;
    }> } }).packs?.contents ?? [];
    // Ordena: sistema primeiro (tormenta20.*), depois o resto — nomes duplicados
    // resolvem pro compêndio oficial.
    const ordered = [...packs].sort((a, b) =>
        (a.collection.startsWith("tormenta20.") ? 0 : 1) - (b.collection.startsWith("tormenta20.") ? 0 : 1));
    for (const pack of ordered) {
        if ((pack.metadata?.type ?? "") !== "Item") continue;
        let idx: Iterable<Record<string, unknown>>;
        try { idx = await pack.getIndex({ fields: ["type"] }); } catch { continue; }
        for (const e of idx) {
            if ((e["type"] as string) !== "poder") continue;
            const key = norm(String(e["name"] ?? ""));
            const original = wanted.get(key);
            if (!original || out.get(original)) continue;
            try {
                const doc = await pack.getDocument(String(e["_id"])) as {
                    name?: string; img?: string;
                    system?: { description?: { value?: string } };
                    toObject: () => Record<string, unknown>;
                };
                out.set(original, {
                    name: doc.name ?? original,
                    img: doc.img,
                    desc: doc.system?.description?.value ?? "",
                    doc: doc as PowerDoc["doc"],
                });
            } catch { /* segue */ }
        }
    }
    return out;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/** O&R = descrição do item de divindade sem a linha final "Poderes concedidos". */
function extractOerHtml(item: ItemLike): string {
    const raw = item.system?.description?.value ?? "";
    return raw.replace(/<p><em>Poderes concedidos:[\s\S]*?<\/p>/i, "");
}

async function openDivindadeModal(actor: ActorLike, item: ItemLike): Promise<void> {
    ensureStyles();
    const flag = getDivindadeFlag(item)!;
    const limit = maxPoderesConcedidos(actorHasDevotoFiel(actor));
    const powers = await loadPowerDocs(flag.poderes);

    const rows = flag.poderes.map((n, i) => {
        const p = powers.get(n);
        if (!p) {
            return `<div class="dv-power"><div class="dv-power-head"><span class="dv-missing">✖ ${esc(n)} (não encontrado nos compêndios)</span></div></div>`;
        }
        return `<div class="dv-power" data-i="${i}">
            <div class="dv-power-head">
                <input type="checkbox" data-power="${esc(n)}">
                <img src="${esc(p.img ?? "")}" alt="">
                <span class="dv-pname">${esc(p.name)}</span>
                <i class="fas fa-chevron-down" style="color:#9a8e7a;font-size:10px;"></i>
            </div>
            <div class="dv-desc">${p.desc || "<em>Sem descrição.</em>"}</div>
        </div>`;
    }).join("");

    const content = `<div class="t20-div-modal">
        <div class="dv-header">
            <img src="${esc(item.img ?? "")}" alt="">
            <h1>${esc(flag.nome)}</h1>
        </div>
        <div class="dv-oer">${extractOerHtml(item)}</div>
        <div class="dv-limit"><i class="fas fa-hand-holding-medical"></i> Escolha até <b>${limit}</b> poder(es) concedido(s)${limit > 1 ? " (Devoto Fiel)" : ""}. Clique no nome para ver a descrição.</div>
        <div class="dv-powers">${rows}</div>
    </div>`;

    let done = false;
    const dlg = new Dialog({
        title: `Devoto de ${flag.nome}`,
        content,
        buttons: {
            ok: {
                icon: '<i class="fas fa-check-circle"></i>',
                label: "Finalizar",
                callback: async (html: JQuery | HTMLElement) => {
                    const root = ((html as JQuery)[0] ?? html) as HTMLElement;
                    const chosen = [...root.querySelectorAll<HTMLInputElement>("input[data-power]:checked")]
                        .map((cb) => cb.dataset.power ?? "").filter(Boolean);
                    if (chosen.length > limit) {
                        ui.notifications?.warn(`Você só pode escolher ${limit} poder(es) concedido(s).`);
                        done = true; // não deletar; reabre
                        await openDivindadeModal(actor, item);
                        return;
                    }
                    done = true;
                    await finalizeDivindade(actor, item, flag, chosen, powers);
                },
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancelar",
                callback: async () => {
                    done = true;
                    await item.delete?.(); // escolha abortada → remove a divindade
                },
            },
        },
        default: "ok",
        render: (html: JQuery | HTMLElement) => {
            const root = (((html as JQuery)[0] ?? html) as HTMLElement).closest(".window-content") as HTMLElement
                ?? (((html as JQuery)[0] ?? html) as HTMLElement);
            // expandir/colapsar descrição
            root.querySelectorAll<HTMLElement>(".dv-power-head").forEach((head) => {
                head.addEventListener("click", (ev) => {
                    if ((ev.target as HTMLElement).tagName === "INPUT") return;
                    head.closest(".dv-power")?.classList.toggle("open");
                });
            });
            // limite de seleção
            root.querySelectorAll<HTMLInputElement>("input[data-power]").forEach((cb) => {
                cb.addEventListener("change", () => {
                    const checked = root.querySelectorAll("input[data-power]:checked").length;
                    if (checked > limit) {
                        cb.checked = false;
                        ui.notifications?.warn(`Limite de ${limit} poder(es) concedido(s)${limit === 1 ? " — adquira Devoto Fiel para escolher 2" : ""}.`);
                    }
                });
            });
        },
        close: () => {
            // fechar sem finalizar = cancelar
            if (!done) void item.delete?.();
        },
    }, { classes: ["dialog", "t20-dialog"], width: 720 });
    dlg.render(true);
}

// ── Finalizar: poderes + campo da ficha + AE do Nimb ─────────────────────────
// O PRÓPRIO item da divindade é o portador único das Obrigações & Restrições
// (descrição + flag automacao) — NÃO criamos uma complicação separada
// (v1.89.1: gerava dois itens quase idênticos na ficha).

async function finalizeDivindade(
    actor: ActorLike, item: ItemLike, flag: DivindadeFlag,
    chosen: string[], powers: Map<string, PowerDoc | null>,
): Promise<void> {
    try {
        // 1) importa os poderes escolhidos
        const toCreate: Record<string, unknown>[] = [];
        for (const n of chosen) {
            const p = powers.get(n);
            if (p) toCreate.push(p.doc.toObject());
        }
        if (toCreate.length) await actor.createEmbeddedDocuments?.("Item", toCreate);
        const comp = item; // origem/ícone dos efeitos derivados = o item da divindade

        // 3) campo da ficha
        await actor.update?.({ "system.detalhes.divindade": flag.nome });

        // 4) Nimb: AE persistente −5 em perícias de Carisma
        if (flag.automacao === "nimb") {
            await actor.createEmbeddedDocuments?.("ActiveEffect", [{
                name: "Devoto de Nimb (−5 perícias de Carisma)",
                icon: item.img, img: item.img,
                origin: comp && (comp as { uuid?: string }).uuid,
                changes: [{ key: "system.modificadores.pericias.atr.car", mode: 2, value: "-5", priority: 0 }],
                transfer: false,
                flags: { [MODULE_ID]: { [FLAG_NIMB_AE]: true }, tormenta20: { durationScene: false } },
            }], { render: false });
        }

        const names = chosen.length ? chosen.join(", ") : "nenhum poder concedido (escolha depois via GM)";
        await ChatMessage.create({
            content:
                `<div style="border-left:3px solid #c8a96e;padding:5px 10px;">` +
                `<div style="display:flex;align-items:center;gap:8px;">` +
                `<img src="${esc(item.img ?? "")}" style="width:32px;height:32px;border:none;">` +
                `<b style="color:#c8a96e;">${esc(actor.name ?? "")} torna-se devoto de ${esc(flag.nome)}</b></div>` +
                `<div style="font-size:12px;color:#9a8e7a;">Poderes concedidos: ${esc(names)}. As Obrigações e Restrições de ${esc(flag.nome)} constam no item da divindade na ficha.</div>` +
                `</div>`,
            speaker: { alias: actor.name ?? "" } as never,
        });
        log(`Divindades: ${actor.name} → ${flag.nome} (${chosen.length} poder(es)).`);
    } catch (err) {
        warn("divindades: finalização falhou:", err);
        ui.notifications?.error("Falha ao aplicar a divindade — veja o console.");
    }
}

// ── Remoção: limpar complicação/AE/campo ──────────────────────────────────────

async function onDivindadeDeleted(actor: ActorLike, item: ItemLike): Promise<void> {
    const flag = getDivindadeFlag(item);
    if (!flag) return;
    try {
        const comps = (actor.items?.contents ?? []).filter((i) => {
            const c = (i.getFlag?.(MODULE_ID, FLAG_COMP)
                ?? (i.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_COMP]) as { deus?: string } | undefined;
            return c?.deus === flag.nome;
        });
        const ids = comps.map((c) => c.id ?? "").filter(Boolean) as string[];
        if (ids.length) await actor.deleteEmbeddedDocuments?.("Item", ids);
        await removeNimbAE(actor);
        if (actor.system?.detalhes?.divindade === flag.nome) {
            await actor.update?.({ "system.detalhes.divindade": "" });
        }
    } catch (err) { warn("divindades: limpeza pós-remoção falhou:", err); }
}

async function removeNimbAE(actor: ActorLike): Promise<void> {
    const ids = (actor.effects?.contents ?? [])
        .filter((e) => (e.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_NIMB_AE])
        .map((e) => e.id ?? "").filter(Boolean) as string[];
    if (ids.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", ids);
}

// ── Automação de combate (Aharadak/Nimb) ──────────────────────────────────────

function isActiveGM(): boolean {
    const myId = game.user?.id;
    if (!myId || !game.user?.isGM) return false;
    const gms = (game.users?.contents ?? []).filter((u) => u.isGM && u.active).map((u) => u.id).sort();
    return gms[0] === myId;
}

function complicacaoAutomacao(actor: ActorLike): { deus: string; automacao: string } | null {
    for (const i of actor.items?.contents ?? []) {
        // Fonte primária: o próprio item da divindade (v1.89.1).
        const d = getDivindadeFlag(i);
        if (d?.automacao) return { deus: d.nome, automacao: d.automacao };
        // Legado: complicação separada criada pela v1.89.0.
        const c = (i.getFlag?.(MODULE_ID, FLAG_COMP)
            ?? (i.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_COMP]) as { deus?: string; automacao?: string | null } | undefined;
        if (c?.automacao) return { deus: c.deus ?? "", automacao: c.automacao };
    }
    return null;
}

async function rollDivindadeCombat(actor: ActorLike, combatId: string): Promise<void> {
    const auto = complicacaoAutomacao(actor);
    if (!auto) return;
    const prev = (actor.getFlag?.(MODULE_ID, FLAG_COMBAT_ROLL) ?? null) as { combatId?: string } | null;
    if (prev?.combatId === combatId) return; // já rolado neste combate
    await actor.setFlag?.(MODULE_ID, FLAG_COMBAT_ROLL, { combatId });

    const roll = new Roll("1d6");
    await roll.evaluate();
    const r = roll.total ?? 0;
    let applied: string | null = null;
    if (auto.automacao === "aharadak" && r % 2 === 1) applied = "fascinado";
    if (auto.automacao === "nimb" && r === 1) applied = "confuso";

    // Aharadak: "fica fascinado NA PRIMEIRA RODADA" → 1 rodada, não cena.
    // Nimb: "fica confuso" (sem duração explícita) → cena.
    const durLabel = applied === "fascinado" ? "1 rodada" : "cena";
    if (applied) {
        try {
            registerExpectedCondition(actor.id ?? "", applied, (applied === "fascinado"
                ? { managed: true, kind: "rounds", rounds: 1, source: "power", label: "Fascinado" }
                : { managed: true, kind: "scene", source: "power", label: "Confuso" }) as never);
            await actor.toggleStatusEffect?.(applied, { active: true });
        } catch (err) { warn("divindades: aplicar condição da O&R falhou:", err); }
    }
    await ChatMessage.create({
        content:
            `<div style="border-left:3px solid ${applied ? "#cc4444" : "#6ecf7a"};padding:5px 10px;">` +
            `<div style="font-weight:bold;color:#c8a96e;">Obrigações e Restrições — ${esc(auto.deus)}</div>` +
            `<div style="font-size:12px;color:#e8e0d0;">${esc(actor.name ?? "")} rola 1d6: <b>${r}</b> — ` +
            (applied
                ? `fica <b style="color:#cc4444;">${applied === "fascinado" ? "Fascinado" : "Confuso"}</b> (${durLabel}).`
                : "sem efeito nesta cena.") +
            `</div></div>`,
        rolls: [roll] as never,
        speaker: { alias: actor.name ?? "" } as never,
    });
}

// ── Ficha: campo divindade vira o item ────────────────────────────────────────

function patchSheetDivindade(app: { actor?: ActorLike }, root: HTMLElement): void {
    const actor = app.actor;
    if (!actor || actor.type !== "character") return;
    const input = root.querySelector<HTMLInputElement>('input[name="system.detalhes.divindade"]');
    if (!input) return;
    const item = actorDivindadeItem(actor);
    if (!item) return; // sem item → mantém o input de texto
    const li = input.closest("li") ?? input.parentElement;
    if (!li || li.querySelector(".t20-div-field")) return;
    const wrap = document.createElement("div");
    wrap.className = "t20-div-field";
    // inline-flex + flex:0 nos filhos: ícone imediatamente ao lado do nome
    // (o <li> do header estica os filhos — v1.89.1 corrige o espaçamento).
    wrap.style.cssText = "display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;cursor:pointer;width:100%;";
    wrap.innerHTML = `<img src="${esc(item.img ?? "")}" style="width:22px;height:22px;border:none;object-fit:contain;flex:0 0 auto;margin:0;">`
        + `<span style="color:#c8a96e;font-weight:bold;flex:0 0 auto;">${esc(item.name ?? "")}</span>`;
    wrap.title = "Divindade — clique para abrir";
    wrap.addEventListener("click", () => item.sheet?.render(true));
    input.replaceWith(wrap);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Migração v1.89.1: atores que ganharam a complicação separada na v1.89.0
 * (item duplicado — a divindade JÁ carrega as O&R) têm a complicação removida.
 * Idempotente; roda no ready (GM).
 */
async function migrateComplicacoesDuplicadas(): Promise<void> {
    if (!game.user?.isGM) return;
    let removed = 0;
    for (const a of (game.actors?.contents ?? []) as unknown as ActorLike[]) {
        if (a.type !== "character") continue;
        const hasDiv = !!actorDivindadeItem(a);
        if (!hasDiv) continue;
        const comps = (a.items?.contents ?? []).filter((i) =>
            !!((i.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_COMP]));
        const ids = comps.map((c) => c.id ?? "").filter(Boolean) as string[];
        if (ids.length) {
            try { await a.deleteEmbeddedDocuments?.("Item", ids); removed += ids.length; }
            catch (err) { warn(`divindades: migração falhou em ${a.name}:`, err); }
        }
    }
    if (removed) log(`Divindades: migração removeu ${removed} complicação(ões) duplicada(s).`);
}

export function setupDivindades(): void {
    Hooks.once("ready", () => { void migrateComplicacoesDuplicadas(); });

    Hooks.on("createItem", (...args: unknown[]) => {
        try {
            const item = args[0] as ItemLike & { parent?: ActorLike | null };
            const userId = args[2] as string;
            if (userId !== game.user?.id) return;
            const actor = item.parent;
            if (!actor || actor.type !== "character") return;
            const flag = getDivindadeFlag(item);
            if (!flag) return;
            // já devoto de outra divindade?
            const existing = (actor.items?.contents ?? []).find((i) => i.id !== item.id && !!getDivindadeFlag(i));
            if (existing) {
                ui.notifications?.warn(`${actor.name} já é devoto de ${getDivindadeFlag(existing)?.nome}. Remova a divindade atual antes de escolher outra.`);
                void item.delete?.();
                return;
            }
            setTimeout(() => { void openDivindadeModal(actor, item); }, 250);
        } catch (err) { warn("divindades: createItem falhou:", err); }
    });

    Hooks.on("deleteItem", (...args: unknown[]) => {
        try {
            const item = args[0] as ItemLike & { parent?: ActorLike | null };
            const userId = args[2] as string;
            if (userId !== game.user?.id) return;
            const actor = item.parent;
            if (!actor || actor.type !== "character") return;
            if (getDivindadeFlag(item)) { void onDivindadeDeleted(actor, item); return; }
            const comp = (item.flags?.[MODULE_ID] as Record<string, unknown> | undefined)?.[FLAG_COMP];
            if (comp) void removeNimbAE(actor);
        } catch (err) { warn("divindades: deleteItem falhou:", err); }
    });

    // Automação Aharadak/Nimb no início do combate (GM eleito).
    const combatHandler = (combat: { id?: string; started?: boolean; combatants?: Iterable<{ actor?: ActorLike | null }> }): void => {
        if (!isActiveGM()) return;
        for (const c of combat.combatants ?? []) {
            const a = c.actor;
            if (a && a.type === "character") void rollDivindadeCombat(a, combat.id ?? "");
        }
    };
    Hooks.on("combatStart", (...args: unknown[]) => combatHandler(args[0] as Parameters<typeof combatHandler>[0]));
    Hooks.on("createCombatant", (...args: unknown[]) => {
        const combatant = args[0] as { parent?: { id?: string; started?: boolean } | null; actor?: ActorLike | null };
        const combat = combatant.parent;
        if (!combat?.started || !isActiveGM()) return;
        if (combatant.actor && combatant.actor.type === "character") void rollDivindadeCombat(combatant.actor, combat.id ?? "");
    });

    // Campo divindade da ficha.
    Hooks.on("renderActorSheet", (...args: unknown[]) => {
        try {
            const app = args[0] as { actor?: ActorLike };
            const html = args[1] as HTMLElement | JQuery | { 0?: HTMLElement };
            const root = ((html as { 0?: HTMLElement })?.[0] ?? html) as HTMLElement;
            if (typeof root?.querySelector === "function") patchSheetDivindade(app, root);
        } catch { /* render nunca quebra */ }
    });

    log("Divindades configuradas (20 deuses, modal de poderes concedidos, automações Aharadak/Nimb).");
}
