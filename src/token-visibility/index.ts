/**
 * Visibilidade por jogador — o GM escolhe, por uma checklist, QUAIS jogadores
 * podem ver um token. Complementa o "Alternar Visibilidade" nativo (que esconde
 * de TODOS os jogadores): aqui o GM define uma lista branca de jogadores que
 * enxergam o token; os demais não o veem.
 *
 * ── Modelo ──────────────────────────────────────────────────────────────────
 * Flag no token: `flags.t20-theme-overhaul.visibleTo`.
 *   • ausente            → sem restrição do módulo (comportamento nativo).
 *   • array de userIds   → lista branca. GM sempre vê; um jogador não-GM só vê
 *                          se seu id estiver na lista (e a visão normal permitir).
 *   • array vazio []     → nenhum jogador vê (equivale a esconder de todos).
 *
 * A regra é SUBTRATIVA: nunca concede visão além da normal, apenas remove de
 * quem não está na lista. Assim compõe com o `hidden` nativo sem conflito
 * (se o token estiver oculto pelo toggle nativo, ninguém além do GM vê de
 * qualquer forma).
 *
 * ── Implementação ───────────────────────────────────────────────────────────
 * • Override do getter `Token.prototype.isVisible`: aplica a lista branca.
 * • Hook `renderTokenHUD` (só GM): injeta um botão ao lado do toggle nativo que
 *   abre um diálogo com checkboxes dos jogadores.
 * • Hook `updateToken`: ao mudar a flag, força refresh de percepção em todos os
 *   clientes para reavaliar a visibilidade na hora.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";

const FLAG = "visibleTo";
const STYLE_ID = "t20-token-visibility-styles";

/* -------------------------------------------------------------------------- */
/*  Núcleo (puro / testável)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Dado o estado base de visibilidade (visão/luz normal já resolvida), decide se
 * o usuário pode ver o token considerando a lista branca por jogador.
 * GM sempre vê. Sem lista → mantém o base. Com lista → base E (na lista).
 */
export function canUserSee(
    baseVisible: boolean,
    whitelist: string[] | null | undefined,
    userId: string,
    isGM: boolean,
): boolean {
    if (isGM) return baseVisible;
    if (!Array.isArray(whitelist)) return baseVisible;
    if (!whitelist.includes(userId)) return false;
    return baseVisible;
}

/** Lê a lista branca da flag do documento do token (ou null se ausente/ inválida). */
export function readWhitelist(doc: { getFlag?: (s: string, k: string) => unknown } | null | undefined): string[] | null {
    const v = doc?.getFlag?.(MODULE_ID, FLAG);
    return Array.isArray(v) ? (v as string[]) : null;
}

/**
 * Calcula o que gravar a partir das seleções do diálogo.
 * Retorna `{ clear: true }` quando todos os jogadores estão marcados (sem
 * restrição → remover a flag) ou `{ list }` com os ids marcados.
 */
export function resolveSelection(checkedIds: string[], allPlayerIds: string[]): { clear: boolean; list: string[] } {
    const set = new Set(checkedIds);
    const allChecked = allPlayerIds.length > 0 && allPlayerIds.every((id) => set.has(id));
    return allChecked ? { clear: true, list: [] } : { clear: false, list: allPlayerIds.filter((id) => set.has(id)) };
}

/* -------------------------------------------------------------------------- */
/*  Globais Foundry (tipagem mínima)                                          */
/* -------------------------------------------------------------------------- */

type AnyObj = Record<string, unknown>;
const G = (): AnyObj => game as unknown as AnyObj;
function isGM(): boolean {
    return !!((G().user as AnyObj | undefined)?.["isGM"]);
}
function currentUserId(): string {
    return String((G().user as AnyObj | undefined)?.["id"] ?? "");
}
function players(): Array<{ id: string; name: string }> {
    const users = (G().users as { contents?: Array<AnyObj> } | undefined)?.contents ?? [];
    return users
        .filter((u) => !u["isGM"])
        .map((u) => ({ id: String(u["id"]), name: String(u["name"] ?? u["id"]) }));
}

/* -------------------------------------------------------------------------- */
/*  Enforcement — override de Token.prototype.isVisible                        */
/* -------------------------------------------------------------------------- */

function patchIsVisible(): void {
    const objectClass = (CONFIG as unknown as { Token?: { objectClass?: { prototype: AnyObj } } }).Token?.objectClass;
    const start = objectClass?.prototype;
    if (!start) {
        warn(`token-visibility: CONFIG.Token.objectClass não encontrado.`);
        return;
    }
    if ((start as AnyObj)["_t20TokenVisPatched"]) return;

    // Acha o protótipo dono do getter isVisible.
    let proto: object | null = start;
    let desc: PropertyDescriptor | undefined;
    while (proto) {
        desc = Object.getOwnPropertyDescriptor(proto, "isVisible");
        if (desc?.get) break;
        proto = Object.getPrototypeOf(proto);
    }
    if (!proto || !desc?.get) {
        warn(`token-visibility: getter isVisible não encontrado.`);
        return;
    }
    const origGet = desc.get;
    Object.defineProperty(proto, "isVisible", {
        configurable: true,
        get(this: { document?: { getFlag?: (s: string, k: string) => unknown } }) {
            const base = origGet.call(this) as boolean;
            try {
                const wl = readWhitelist(this.document);
                return canUserSee(base, wl, currentUserId(), isGM());
            } catch (err) {
                warn(`token-visibility: avaliação abortada (base intacto):`, err);
                return base;
            }
        },
    });
    (start as AnyObj)["_t20TokenVisPatched"] = true;
    log(`Token.isVisible patched — visibilidade por jogador (lista branca).`);
}

/** Força reavaliação de visibilidade em todos os clientes ao mudar a flag. */
function refreshPerception(tokenObject?: AnyObj): void {
    try {
        const rf = (tokenObject?.["renderFlags"] as { set?: (o: AnyObj) => void } | undefined);
        rf?.set?.({ refreshVisibility: true });
    } catch { /* ignore */ }
    try {
        const perception = (canvas as unknown as { perception?: { update?: (o: AnyObj) => void } }).perception;
        perception?.update?.({ refreshVision: true, refreshLighting: true });
    } catch { /* ignore */ }
}

/* -------------------------------------------------------------------------- */
/*  UI — botão no Token HUD + diálogo                                          */
/* -------------------------------------------------------------------------- */

function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
/* HUD: botão destacado quando há restrição ativa no token */
.control-icon.t20-token-visibility.active { color: var(--t20-accent, #c8a96e) !important; box-shadow: 0 0 10px rgba(200,169,110,0.55) inset !important; }
.control-icon.t20-token-visibility i { pointer-events: none; }

/* Modal (dentro de .t20-dialog) */
.t20-token-vis-dialog .window-content { padding: 0 !important; }
.t20-token-vis-dialog .t20-tv-intro {
  margin: 0; padding: 16px 18px 12px; text-align: center;
  color: var(--t20-text-secondary, #e8e0d0); font-size: 0.98rem; letter-spacing: 0.02em;
}
.t20-token-vis-dialog .t20-tv-intro b { color: var(--t20-accent, #c8a96e); font-weight: 700; }

.t20-token-vis-dialog .t20-tv-quick { display: flex; gap: 8px; padding: 0 18px 12px; }
.t20-token-vis-dialog .t20-tv-quick button {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: linear-gradient(to bottom, var(--t20-btn-bg-top, #5a3c10), var(--t20-btn-bg-bottom, #3a2408));
  border: 1px solid var(--t20-btn-border, #8b6914); border-radius: 4px;
  color: var(--t20-btn-text, #f0e0b0); cursor: pointer;
  font-family: "Modesto Condensed", "Palatino Linotype", serif;
  font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 6px 10px; transition: all 0.15s;
}
.t20-token-vis-dialog .t20-tv-quick button:hover {
  background: linear-gradient(to bottom, #7c5218, #5a3210);
  border-color: var(--t20-accent, #c8a96e); color: var(--t20-btn-text-hover, #fff3d6);
  box-shadow: 0 0 12px rgba(200,169,110,0.4);
}

.t20-token-vis-dialog .t20-tv-players {
  display: flex; flex-direction: column; gap: 6px;
  padding: 0 18px 16px; max-height: 340px; overflow-y: auto;
}
.t20-token-vis-dialog .t20-tv-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border: 1px solid var(--t20-divider-soft, #2a2012); border-radius: 5px;
  color: var(--t20-text-primary, #f0ebe0); cursor: pointer; transition: all 0.15s;
}
.t20-token-vis-dialog .t20-tv-row:hover {
  border-color: var(--t20-btn-border, #8b6914);
  background: rgba(200,169,110,0.06);
}
.t20-token-vis-dialog .t20-tv-row:has(input:checked) {
  border-color: rgba(200,169,110,0.55);
  background: rgba(200,169,110,0.10);
}
.t20-token-vis-dialog .t20-tv-name {
  font-size: 0.96rem; letter-spacing: 0.02em; flex: 1 1 auto;
}
/* checkbox herda o estilo dourado de .t20-dialog input[type=checkbox]; só ajusta tamanho */
.t20-token-vis-dialog .t20-tv-row input[type="checkbox"] { width: 16px !important; height: 16px !important; }
`;
    document.head.appendChild(style);
}

/** Tokens-alvo: os controlados, ou o token do HUD se nenhum controlado. */
function targetTokens(hudObject: AnyObj | undefined): AnyObj[] {
    const controlled = (canvas as unknown as { tokens?: { controlled?: AnyObj[] } }).tokens?.controlled ?? [];
    if (controlled.length) return controlled;
    return hudObject ? [hudObject] : [];
}

function openDialog(hudObject: AnyObj | undefined): void {
    const tokens = targetTokens(hudObject);
    if (!tokens.length) return;
    const ps = players();
    if (!ps.length) {
        const ui = (G().ui as { notifications?: { warn?: (s: string) => void } } | undefined);
        ui?.notifications?.warn?.("Não há jogadores (não-GM) para selecionar.");
        return;
    }

    // Pré-marcação baseada no token de referência (o do HUD, ou o primeiro alvo).
    const refDoc = (hudObject ?? tokens[0])?.["document"] as { getFlag?: (s: string, k: string) => unknown } | undefined;
    const wl = readWhitelist(refDoc);
    const isChecked = (id: string): boolean => (wl ? wl.includes(id) : true);

    const rows = ps
        .map(
            (u) =>
                `<label class="t20-tv-row"><input type="checkbox" name="${u.id}" ${isChecked(u.id) ? "checked" : ""}/><span class="t20-tv-name">${escapeHtml(u.name)}</span></label>`,
        )
        .join("");
    const tokenName = escapeHtml(String((hudObject ?? tokens[0])?.["name"] ?? "este token"));
    const content = `
<p class="t20-tv-intro">Quais jogadores podem ver <b>${tokenName}</b>?</p>
<div class="t20-tv-quick">
  <button type="button" data-all="1"><i class="fa-solid fa-check-double"></i> Marcar todos</button>
  <button type="button" data-all="0"><i class="fa-solid fa-eye-slash"></i> Desmarcar todos</button>
</div>
<div class="t20-tv-players">${rows}</div>`;

    const Dialog = (globalThis as unknown as { Dialog?: new (cfg: AnyObj, opts?: AnyObj) => { render: (b?: boolean) => void } })
        .Dialog;
    if (!Dialog) {
        warn(`token-visibility: Dialog indisponível.`);
        return;
    }

    const dlg = new Dialog(
        {
            title: "Visível para… (por jogador)",
            content,
            buttons: {
                save: {
                    icon: '<i class="fa-solid fa-check"></i>',
                    label: "Salvar",
                    callback: (html: unknown) => {
                        const root = htmlRoot(html);
                        if (!root) return;
                        const checked = ps.map((u) => u.id).filter((id) => {
                            const cb = root.querySelector<HTMLInputElement>(`input[name="${id}"]`);
                            return !!cb?.checked;
                        });
                        const sel = resolveSelection(checked, ps.map((u) => u.id));
                        void applySelection(tokens, sel);
                    },
                },
                cancel: { icon: '<i class="fa-solid fa-xmark"></i>', label: "Cancelar" },
            },
            default: "save",
            render: (html: unknown) => {
                const root = htmlRoot(html);
                if (!root) return;
                root.querySelectorAll<HTMLButtonElement>("button[data-all]").forEach((b) => {
                    b.addEventListener("click", (ev) => {
                        ev.preventDefault();
                        const val = b.dataset["all"] === "1";
                        root.querySelectorAll<HTMLInputElement>('.t20-tv-players input[type="checkbox"]').forEach(
                            (cb) => (cb.checked = val),
                        );
                    });
                });
            },
        } as unknown as AnyObj,
        { classes: ["t20-dialog", "t20-token-vis-dialog"], width: 460 } as unknown as AnyObj,
    );
    dlg.render(true);
}

async function applySelection(tokens: AnyObj[], sel: { clear: boolean; list: string[] }): Promise<void> {
    for (const t of tokens) {
        const doc = t["document"] as
            | { setFlag?: (s: string, k: string, v: unknown) => Promise<unknown>; unsetFlag?: (s: string, k: string) => Promise<unknown> }
            | undefined;
        if (!doc) continue;
        try {
            if (sel.clear) await doc.unsetFlag?.(MODULE_ID, FLAG);
            else await doc.setFlag?.(MODULE_ID, FLAG, sel.list);
        } catch (err) {
            warn(`token-visibility: falha ao gravar flag:`, err);
        }
    }
    const ui = (G().ui as { notifications?: { info?: (s: string) => void } } | undefined);
    if (sel.clear) ui?.notifications?.info?.("Visibilidade restaurada (todos os jogadores veem).");
    else ui?.notifications?.info?.(`Visível para ${sel.list.length} jogador(es).`);
}

function htmlRoot(html: unknown): HTMLElement | null {
    if (html instanceof HTMLElement) return html;
    const jq = html as { 0?: HTMLElement } | undefined;
    return jq?.[0] ?? null;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

function onRenderTokenHUD(hud: AnyObj, html: unknown): void {
    if (!isGM()) return;
    const root = htmlRoot(html);
    if (!root) return;
    const hudObject = hud["object"] as AnyObj | undefined;
    const visBtn = root.querySelector('[data-action="visibility"]') as HTMLElement | null;
    const col = (visBtn?.parentElement ?? root.querySelector(".col.left") ?? root.querySelector(".col.right")) as
        | HTMLElement
        | null;
    if (!col) return;

    const restricted = Array.isArray(
        (hudObject?.["document"] as { getFlag?: (s: string, k: string) => unknown } | undefined)?.getFlag?.(MODULE_ID, FLAG),
    );

    const tag = (visBtn?.tagName ?? "DIV").toLowerCase();
    const btn = document.createElement(tag);
    btn.classList.add("control-icon", "t20-token-visibility");
    if (restricted) btn.classList.add("active");
    (btn as HTMLElement).dataset["tooltip"] = "Visível para… (por jogador)";
    btn.setAttribute("aria-label", "Visível para (por jogador)");
    btn.innerHTML = '<i class="fa-solid fa-user-group"></i>';
    btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openDialog(hudObject);
    });

    if (visBtn && visBtn.nextSibling) col.insertBefore(btn, visBtn.nextSibling);
    else col.appendChild(btn);
}

/* -------------------------------------------------------------------------- */

export function setupTokenVisibility(): void {
    patchIsVisible();
    injectStyles();

    (Hooks as unknown as { on: (h: string, cb: (...a: unknown[]) => void) => void }).on(
        "renderTokenHUD",
        (hud: unknown, html: unknown) => onRenderTokenHUD(hud as AnyObj, html),
    );

    (Hooks as unknown as { on: (h: string, cb: (...a: unknown[]) => void) => void }).on(
        "updateToken",
        (doc: unknown, change: unknown) => {
            const hasFlag = (obj: unknown, path: string): boolean => {
                try {
                    return !!(foundry as unknown as { utils: { hasProperty: (o: unknown, p: string) => boolean } }).utils.hasProperty(
                        obj,
                        path,
                    );
                } catch {
                    return false;
                }
            };
            if (
                hasFlag(change, `flags.${MODULE_ID}.${FLAG}`) ||
                hasFlag(change, `flags.${MODULE_ID}.-=${FLAG}`)
            ) {
                refreshPerception((doc as AnyObj)?.["object"] as AnyObj | undefined);
            }
        },
    );
}
