/**
 * Botão "Criar Pergaminho" na janela de lançar magia (AbilityUseDialog).
 *
 * O T20 nativo já injeta, NESSE MESMO dialog, um botão "Preparar Poção"
 * quando `actor.getFlag("tormenta20","createPotion")` (ou o usuário é GM) —
 * ver `AbilityUseDialog.create` no `tormenta20.mjs`. O equivalente pra
 * pergaminho (`createScroll`, MESMA convenção — checkbox própria em
 * "Configurações do Personagem", T20.ShowWriteScroll) existe nativamente,
 * mas só como botão na FICHA da magia (`_createScroll`/`_getHeaderButtons`),
 * fora do fluxo de conjuração. Pedido do usuário: trazer o equivalente pra
 * ESTE dialog, ao lado de "Preparar Poção" — mesma gate (`createScroll` OU
 * GM), sem mexer no botão nativo de poção (que já funciona e já embute os
 * aprimoramentos marcados, exatamente como pedido).
 *
 * O pergaminho criado reusa a MESMA infraestrutura dos itens do compêndio
 * `pocoes-pergaminhos` (flag `pocaoPergaminho`, kind:"pergaminho",
 * `identificado:true` — o conjurador acabou de fabricar, sabe o que é, sem
 * mascaramento) — ao usar depois, o patch existente de `Item.prototype.roll`
 * (`index.ts`) intercepta e rebusca a magia REAL via `spellUuid` a cada uso,
 * com TODOS os aprimoramentos disponíveis pro leitor escolher e pagar (nada
 * é fixado aqui — ao contrário da Poção nativa, que embute os aprimoramentos
 * selecionados no momento da fabricação).
 */
import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";
import type { PocaoPergaminhoFlag } from "./index";

const PERGAMINHO_IMG = `modules/${MODULE_ID}/assets/Items/pergaminho.png`;
const BTN_CLASS = "t20-craft-scroll-btn";

interface ActorLike {
    id?: string;
    name?: string;
    getFlag?: (scope: string, key: string) => unknown;
    system?: { attributes?: { pm?: { value?: number; temp?: number } } };
    spendMana?: (amount: number, adjust?: number, recover?: boolean) => Promise<unknown>;
    createEmbeddedDocuments?: (type: string, data: object[], ctx?: object) => Promise<Array<{ id?: string; name?: string }>>;
}
interface SpellItemLike {
    id?: string;
    uuid?: string;
    name?: string;
    type?: string;
    actor?: ActorLike | null;
    system?: { ativacao?: { custo?: number } };
}

/** Preço T$ = 30 × custo² (mín custo 1). Mesma regra do gerador do compêndio. Puro/testável. */
export function craftPrice(custoPM: number): number {
    const c = Math.max(1, custoPM);
    return 30 * c * c;
}

/** Documento do pergaminho fabricado — MESMA forma dos itens do compêndio (ver `scripts/gen-pocoes-pergaminhos.mjs`). Puro/testável. */
export function buildCraftedScrollDoc(spell: { uuid: string; name: string }, custoPM: number): Record<string, unknown> {
    const flagData: PocaoPergaminhoFlag = {
        kind: "pergaminho",
        spellUuid: spell.uuid,
        spellName: spell.name,
        custoPM,
        aprimoramentoName: null,
        identificado: true,
    };
    return {
        name: `Pergaminho de ${spell.name}`,
        type: "consumivel",
        img: PERGAMINHO_IMG,
        system: {
            description: {
                value: `<p>Contém a magia <strong>${spell.name}</strong> (custo ${custoPM} PM). `
                    + `Ao usar, a magia é conjurada automaticamente. Aprimoramentos podem ser escolhidos ao ativar (custam PM extra de quem ativa).</p>`,
                unidentified: "",
            },
            source: "", carregado: true, peso: 0.5, espacos: 0.5, qtd: 1,
            preco: craftPrice(custoPM),
            pv: { value: 0, max: 0 }, rd: 0,
            ativacao: { execucao: "action", custo: 0, qtd: "", condicao: "", special: "" },
            duracao: { value: 0, units: "inst", special: "" },
            range: { value: null, units: "" },
            consume: { type: "", target: "", amount: null, mpMultiplier: false },
            efeito: "", alcance: "touch", alvo: "", area: "",
            resistencia: { pericia: "", atributo: "", bonus: 0, txt: "" },
            rolls: [], tipo: "scroll", chatFlavor: "", origin: "",
        },
        flags: { [MODULE_ID]: { pocaoPergaminho: flagData } },
    };
}

function pmAvailable(actor: ActorLike): number {
    const pm = actor.system?.attributes?.pm;
    return (Number(pm?.value) || 0) + (Number(pm?.temp) || 0);
}

/** Elegível a ver o botão: mesma gate nativa do "Preparar Poção" (`createPotion`), espelhada pro flag `createScroll` que o T20 já expõe em Configurações do Personagem. */
function canCraftScroll(actor: ActorLike | null | undefined): boolean {
    if (!actor) return false;
    if (game.user?.isGM) return true;
    return !!actor.getFlag?.("tormenta20", "createScroll");
}

async function craftScroll(item: SpellItemLike, actor: ActorLike): Promise<void> {
    const custoPM = Number(item.system?.ativacao?.custo) || 0;
    if (custoPM > 0) {
        const cost = Math.max(custoPM, 1);
        if (pmAvailable(actor) < cost) {
            ui.notifications?.warn(`PM insuficiente para fabricar o pergaminho (custa ${cost}).`);
            return;
        }
        try { await actor.spendMana?.(cost); } catch (e) { warn("pocoes-pergaminhos/craft: falha ao debitar PM:", e); return; }
    }
    const doc = buildCraftedScrollDoc({ uuid: item.uuid ?? "", name: item.name ?? "" }, custoPM);
    try {
        const created = await actor.createEmbeddedDocuments?.("Item", [doc]);
        const name = created?.[0]?.name ?? doc["name"];
        await ChatMessage.create({
            content: `<p>${actor.name} fabrica <strong>${name}</strong>.</p>`,
            speaker: ChatMessage.getSpeaker({ actor: actor as never }),
        });
        log(`pocoes-pergaminhos: pergaminho fabricado (${item.name}) para ${actor.name}.`);
    } catch (e) {
        warn("pocoes-pergaminhos/craft: falha ao criar o pergaminho:", e);
        if (custoPM > 0) await actor.spendMana?.(Math.max(custoPM, 1), 0, true).catch(() => { /* já tentou */ });
    }
}

function escHtml(s: string): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Injeta o botão no rodapé do dialog nativo (`.dialog-buttons`, markup
 * padrão do `Dialog` clássico do Foundry). Independente do fluxo de
 * `resolve()`/`submit()` nativo — clique próprio, `app.close()` no final
 * (resolve a Promise nativa como `null`, abortando o resto do `roll()`
 * nativo, que é o correto: já fizemos tudo manualmente, igual às outras
 * features do módulo que patcheiam este mesmo dialog).
 */
function injectButton(app: { item?: SpellItemLike; element?: JQuery | HTMLElement; close?: () => void }): void {
    const item = app.item;
    if (!item || item.type !== "magia") return;
    const actor = item.actor ?? null;
    if (!canCraftScroll(actor)) return;

    const el = ((app.element as { 0?: HTMLElement })?.[0] ?? app.element) as HTMLElement | undefined;
    const footer = el?.querySelector(".dialog-buttons");
    if (!footer || footer.querySelector(`.${BTN_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.innerHTML = `<i class="fas fa-scroll"></i> Criar Pergaminho`;
    btn.title = `Fabrica um pergaminho de "${escHtml(item.name ?? "")}" (aprimoramentos ficam livres para quem ler depois).`;
    btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        void craftScroll(item, actor as ActorLike).finally(() => app.close?.());
    });
    footer.appendChild(btn);
}

export function setupCraftScrollButton(): void {
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]) => {
        try {
            injectButton(args[0] as { item?: SpellItemLike; element?: JQuery | HTMLElement; close?: () => void });
        } catch (e) { warn("pocoes-pergaminhos/craft: render hook falhou:", e); }
    });
    log("Poções e Pergaminhos: botão 'Criar Pergaminho' instalado na janela de conjuração.");
}
