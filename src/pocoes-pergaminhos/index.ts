/**
 * Poções e Pergaminhos — uso (importa e conjura a magia real) + estado
 * "não identificado" pra cópias entregues a jogadores.
 *
 * Arquitetura (decisão do usuário): o item físico (`type:"consumivel"`, 0,5
 * espaço) NÃO carrega os rolls da magia — ao usar, clona a magia REAL via
 * `spellUuid` (mesmo padrão de `castGolpeSpell` em `golpe-pessoal/index.ts`),
 * zera o custo em PM do clone, importa temporariamente na ficha e dispara o
 * `.roll()` nativo dela — reaproveita 100% da automação já existente
 * (spell-resistance, conditions-map, area-engine etc.), sem reimplementar
 * nada disso aqui.
 *
 * - Pergaminho: mantém TODAS as Active Effects de aprimoramento da magia no
 *   clone — o dialog nativo mostra o picker completo (quem ativa escolhe e
 *   paga PM extra pelos aprimoramentos, como o resto do módulo já faz).
 * - Poção variante base: remove TODAS as AEs de aprimoramento do clone (nada
 *   pra escolher).
 * - Poção variante com aprimoramento: mantém só a ÚNICA AE daquele
 *   aprimoramento no clone, pré-marcada (`disabled:false`) — e um hook
 *   `renderAbilityUseDialog` desabilita o checkbox pra não deixar desmarcar.
 *
 * Identificação: itens entregues a um ator de JOGADOR nascem mascarados
 * (nome/descrição genéricos — ver `maskAsUnidentified`); usar um item
 * mascarado abre o modal de identificação (`identify.ts`) em vez de conjurar.
 */

import { openIdentifyDialog, playIdentifyAnimation } from "./identify";
import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";

const FLAG_KEY = "pocaoPergaminho";
const TEMP_FLAG_KEY = "pocaoPergaminhoTemp";
const CLEANUP_DELAY_MS = 120_000; // 2 min — dá tempo do card/automação processarem antes de apagar o clone

/**
 * Marcador de contexto (2º arg de `createEmbeddedDocuments`) que o entregador
 * de loot (`treasure/item-resolver.ts`) usa pra sinalizar "este item veio do
 * gerador de loot" — sempre nasce não identificado, sem perguntar nada ao GM.
 * Sem o marcador (ex.: GM arrastando do compêndio pra ficha manualmente), o
 * hook de criação ABRE um diálogo perguntando identificado/não.
 */
export const LOOT_DELIVERY_CONTEXT_KEY = "t20LootDelivery";

export const UNIDENTIFIED_NAME: Record<"pocao" | "pergaminho", string> = {
    pocao: "Poção desconhecida",
    pergaminho: "Pergaminho desconhecido",
};
const UNIDENTIFIED_DESC: Record<"pocao" | "pergaminho", string> = {
    pocao: "<p>Uma poção de conteúdo mágico desconhecido. Identifique-a pra revelar seu efeito.</p>",
    pergaminho: "<p>Um pergaminho com inscrições mágicas ilegíveis. Identifique-o pra revelar seu efeito.</p>",
};

// ── Tipos / flag ─────────────────────────────────────────────────────────────

export interface PocaoPergaminhoFlag {
    kind: "pocao" | "pergaminho";
    spellUuid: string;
    spellName: string;
    custoPM: number;
    aprimoramentoName: string | null;
    identificado: boolean;
    realName?: string;
    realDescription?: string;
}

interface ItemLike {
    id?: string;
    name?: string;
    type?: string;
    flags?: Record<string, Record<string, unknown> | undefined>;
    system?: { description?: { value?: string } };
    roll?: (options?: Record<string, unknown>) => Promise<unknown>;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}
interface ActorLike {
    id?: string;
    name?: string;
    type?: string;
    hasPlayerOwner?: boolean;
    items?: { get?: (id: string) => ItemLike | undefined; contents?: ItemLike[] } | ItemLike[];
    createEmbeddedDocuments?: (type: string, data: object[], ctx?: object) => Promise<Array<{ id?: string }>>;
    deleteEmbeddedDocuments?: (type: string, ids: string[], ctx?: object) => Promise<unknown>;
}

export function getPocaoPergaminhoFlag(item: ItemLike | null | undefined): PocaoPergaminhoFlag | null {
    const f = item?.flags?.[MODULE_ID]?.[FLAG_KEY] as PocaoPergaminhoFlag | undefined;
    return f ?? null;
}

export function isPocaoPergaminhoItem(item: ItemLike | null | undefined): boolean {
    return !!getPocaoPergaminhoFlag(item);
}

function resolveRealItem(actor: ActorLike, itemId: string | undefined): ItemLike | undefined {
    if (!itemId) return undefined;
    const items = actor.items;
    if (Array.isArray(items)) return items.find((i) => i.id === itemId);
    return items?.get?.(itemId);
}

// ── Mascaramento (entrega a um ator de jogador) ─────────────────────────────

function isPlayerCharacter(actor: ActorLike | null | undefined): boolean {
    return !!actor && actor.type === "character" && !!actor.hasPlayerOwner;
}

async function maskAsUnidentified(item: ItemLike): Promise<void> {
    const flag = getPocaoPergaminhoFlag(item);
    if (!flag || flag.identificado || flag.realName) return; // já mascarado ou já identificado
    const realName = item.name ?? flag.spellName;
    const realDescription = item.system?.description?.value ?? "";
    try {
        await item.update?.({
            name: UNIDENTIFIED_NAME[flag.kind],
            "system.description.value": UNIDENTIFIED_DESC[flag.kind],
            [`flags.${MODULE_ID}.${FLAG_KEY}.realName`]: realName,
            [`flags.${MODULE_ID}.${FLAG_KEY}.realDescription`]: realDescription,
        });
    } catch (e) { warn("pocoes-pergaminhos: falha ao mascarar item entregue:", e); }
}

function hookUserId(args: unknown[]): string | undefined {
    for (let i = args.length - 1; i >= 0; i--) if (typeof args[i] === "string") return args[i] as string;
    return undefined;
}

/**
 * Diálogo "entregar identificado ou não" — só quando o item chega por uma via
 * QUE NÃO o gerador de loot (esse sempre mascara direto, sem perguntar). Ex.:
 * GM arrastando o item do compêndio pra ficha de um jogador manualmente.
 */
function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function promptIdentifiedChoice(item: ItemLike): Promise<void> {
    const flag = getPocaoPergaminhoFlag(item);
    if (!flag || flag.identificado || flag.realName) return; // já identificado ou já mascarado
    const DialogCls = (globalThis as unknown as { Dialog?: new (data: Record<string, unknown>, opts?: Record<string, unknown>) => { render: (force: boolean) => void } }).Dialog;
    if (!DialogCls) { void maskAsUnidentified(item); return; }
    const label = item.name ?? flag.spellName;
    await new Promise<void>((resolve) => {
        // ⚠️ Dialog#submit (dialog-v1.mjs) chama `button.callback.call(...)` SEM
        // aguardar o retorno e encadeia `this.close()` LOGO EM SEGUIDA, síncrono —
        // um callback async que só marca `resolved=true` DEPOIS do `await`
        // chega tarde: `close()` já rodou e viu `resolved:false`, então o guard
        // falhava e o `close` mascarava o item por cima da escolha "Identificado"
        // (bug real reportado pelo usuário). Fix: marcar `resolved=true`
        // SÍNCRONO, antes de qualquer await, dentro do próprio callback do botão.
        let resolved = false;
        new DialogCls({
            title: "Entregar item mágico",
            content: `<p>Entregar <strong>${escHtml(label)}</strong> já identificado, ou como item desconhecido?</p>`,
            buttons: {
                identified: {
                    icon: '<i class="fas fa-eye"></i>',
                    label: "Identificado",
                    callback: () => {
                        resolved = true;
                        void item.update?.({ [`flags.${MODULE_ID}.${FLAG_KEY}.identificado`]: true })
                            .catch((e: unknown) => warn("pocoes-pergaminhos: falha ao marcar como identificado:", e))
                            .finally(() => resolve());
                    },
                },
                unidentified: {
                    icon: '<i class="fas fa-question"></i>',
                    label: "Não identificado",
                    callback: () => {
                        resolved = true;
                        void maskAsUnidentified(item).finally(() => resolve());
                    },
                },
            },
            default: "unidentified",
            close: () => {
                if (resolved) return; // já resolvido por um botão — não sobrescrever a escolha
                void maskAsUnidentified(item).finally(() => resolve());
            },
        }, { classes: ["dialog", "t20-dialog"] }).render(true);
    });
}

function setupMaskingHook(): void {
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        const options = args[1] as Record<string, unknown> | undefined;
        const userId = hookUserId(args);
        if (!userId || userId !== game.user?.id) return;
        const actor = item.parent as ActorLike | undefined;
        if (!actor || !isPlayerCharacter(actor)) return;
        if (!isPocaoPergaminhoItem(item)) return;
        if (options?.[LOOT_DELIVERY_CONTEXT_KEY]) {
            void maskAsUnidentified(item);
        } else {
            void promptIdentifiedChoice(item);
        }
    });
}

// ── Identificação ────────────────────────────────────────────────────────────

async function handleIdentify(actor: ActorLike, item: ItemLike): Promise<void> {
    const flag = getPocaoPergaminhoFlag(item);
    if (!flag) return;
    const outcome = await openIdentifyDialog(item.name ?? UNIDENTIFIED_NAME[flag.kind], actor as never, flag.custoPM);
    if (!outcome.identified) {
        if (outcome.total !== undefined) {
            ui.notifications?.warn(`Identificação falhou (${outcome.total} vs CD ${outcome.cd}).`);
        }
        return;
    }
    try {
        await item.update?.({
            name: flag.realName ?? flag.spellName,
            "system.description.value": flag.realDescription ?? "",
            [`flags.${MODULE_ID}.${FLAG_KEY}.identificado`]: true,
        });
        ui.notifications?.info(outcome.auto
            ? `Identificado automaticamente (Visão Mística): ${flag.realName ?? flag.spellName}.`
            : `Identificado! (${outcome.total} vs CD ${outcome.cd}): ${flag.realName ?? flag.spellName}.`);
        type CanvasTok = { placeables?: Array<{ actor?: { id?: string }; document?: unknown }> };
        const tokenPlaceables = (canvas as unknown as { tokens?: CanvasTok }).tokens?.placeables ?? [];
        const token = tokenPlaceables.find((t) => t.actor?.id === actor.id);
        void playIdentifyAnimation(token as never);
    } catch (e) { warn("pocoes-pergaminhos: falha ao aplicar identificação:", e); }
}

// ── Uso — clona e conjura a magia real ──────────────────────────────────────

async function consumeOne(actor: ActorLike, item: ItemLike): Promise<void> {
    const qtd = Number((item as unknown as { system?: { qtd?: number } }).system?.qtd ?? 1);
    try {
        if (qtd > 1) await item.update?.({ "system.qtd": qtd - 1 });
        else await actor.deleteEmbeddedDocuments?.("Item", [item.id ?? ""]);
    } catch (e) { warn("pocoes-pergaminhos: falha ao consumir o item:", e); }
}

async function handleCast(actor: ActorLike, item: ItemLike): Promise<void> {
    const flag = getPocaoPergaminhoFlag(item);
    if (!flag) return;
    const fromUuidFn = (globalThis as unknown as { fromUuid?: (u: string) => Promise<unknown> }).fromUuid;
    const src = await fromUuidFn?.(flag.spellUuid) as { toObject?: () => Record<string, unknown> } | null;
    const data = src?.toObject?.();
    if (!data) {
        ui.notifications?.warn(`Magia de origem não encontrada nos compêndios (${flag.spellName}).`);
        return;
    }

    // Custo zerado — já foi pago na fabricação (o piso nativo max(custo,1) não
    // entra em jogo porque hasManaCost é lido do custo ORIGINAL, que aqui já
    // nasce 0 no clone importado).
    const system = (data["system"] as Record<string, unknown> | undefined) ?? {};
    const ativacao = (system["ativacao"] as Record<string, unknown> | undefined) ?? {};
    ativacao["custo"] = 0;
    system["ativacao"] = ativacao;
    data["system"] = system;

    // Aprimoramentos: pergaminho mantém todos; poção base remove todos; poção
    // com aprimoramento fixo mantém só a AE correspondente, pré-marcada.
    const allEffects = Array.isArray(data["effects"]) ? data["effects"] as Array<Record<string, unknown>> : [];
    if (flag.kind === "pocao") {
        if (flag.aprimoramentoName) {
            const match = allEffects.filter((e) => e["name"] === flag.aprimoramentoName);
            match.forEach((e) => { e["disabled"] = false; });
            data["effects"] = match;
        } else {
            data["effects"] = [];
        }
    } // pergaminho: mantém data["effects"] como veio da magia real

    const flags = (data["flags"] ?? {}) as Record<string, Record<string, unknown>>;
    flags[MODULE_ID] = { ...(flags[MODULE_ID] ?? {}), [TEMP_FLAG_KEY]: true };
    data["flags"] = flags;

    let importedId: string | null = null;
    try {
        const created = await actor.createEmbeddedDocuments?.("Item", [data]);
        importedId = created?.[0]?.id ?? null;
    } catch (e) { warn("pocoes-pergaminhos: falha ao importar a magia temporária:", e); return; }
    if (!importedId) return;

    const spell = resolveRealItem(actor, importedId);
    try {
        await spell?.roll?.({});
    } catch (e) {
        warn("pocoes-pergaminhos: falha ao conjurar a magia importada:", e);
    } finally {
        const idToDelete = importedId;
        setTimeout(() => {
            void actor.deleteEmbeddedDocuments?.("Item", [idToDelete])?.catch(() => { /* já removida */ });
        }, CLEANUP_DELAY_MS);
    }

    await consumeOne(actor, item);
}

// ── Patch Item.prototype.roll (cancela o fluxo nativo do NOSSO item) ───────
//
// ⚠️ Descoberta ao vivo: `AbilityUseDialog.create(item)` recebe um CLONE
// (`this.clone({keepId:true})` dentro de `Item#roll` nativo) cujo `.id`/`._id`
// vêm `null` nesta versão do Foundry/T20 — `keepId` não se comporta como o
// nome sugere aqui. Um wrapper em `AbilityUseDialog.create` (como as outras
// features do módulo usam) não consegue resolver o item REAL a partir do
// clone por id. Patchar `Item.prototype.roll` direto evita o problema由
// inteiro: `this` dentro do método É o item real (id/actor válidos), e a
// interceptação acontece ANTES do clone/AbilityUseDialog nativos rodarem.
// (achado ao vivo com Al Simmons — clone.id/clone._id vinham null, o modal
// de identificação nunca abria; trocar pra este ponto de interceptação
// corrigiu sem precisar entender POR QUE keepId falha aqui.)

function patchItemRoll(): void {
    type RollableProto = { roll: (...a: unknown[]) => Promise<unknown>; _t20PatchedPocoesPergaminhos?: boolean };
    const cls = (CONFIG as unknown as { Item?: { documentClass?: { prototype?: RollableProto } } }).Item?.documentClass;
    const proto = cls?.prototype;
    if (!proto || typeof proto.roll !== "function") { warn("pocoes-pergaminhos: Item.prototype.roll não encontrado — patch não aplicado."); return; }
    if (proto._t20PatchedPocoesPergaminhos) return;
    const orig = proto.roll;
    proto.roll = async function (this: ItemLike & { actor?: ActorLike | null }, ...args: unknown[]): Promise<unknown> {
        const flag = getPocaoPergaminhoFlag(this);
        if (flag && this.actor) {
            const actor = this.actor;
            const item = this;
            setTimeout(() => {
                void (flag.identificado ? handleCast(actor, item) : handleIdentify(actor, item));
            }, 0);
            return null;
        }
        return orig.apply(this, args);
    };
    proto._t20PatchedPocoesPergaminhos = true;
    log("Poções e Pergaminhos: Item.prototype.roll patcheado.");
}

// ── Trava o checkbox único da variante com aprimoramento fixo ──────────────

function setupRenderHook(): void {
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]) => {
        try {
            const app = args[0] as { item?: ItemLike & { flags?: Record<string, Record<string, unknown> | undefined> }; element?: JQuery | HTMLElement };
            const item = app.item;
            const isTemp = !!item?.flags?.[MODULE_ID]?.[TEMP_FLAG_KEY];
            if (!isTemp) return;
            const el = ((app.element as { 0?: HTMLElement })?.[0] ?? app.element) as HTMLElement | undefined;
            const checkboxes = el?.querySelectorAll<HTMLInputElement>(".aprimoramentos-list li input[type=checkbox]");
            if (!checkboxes?.length) return;
            checkboxes.forEach((cb) => { cb.checked = true; cb.disabled = true; });
        } catch (e) { warn("pocoes-pergaminhos: render hook falhou:", e); }
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupPocoesPergaminhos(): void {
    setupMaskingHook();
    setupRenderHook();
    Hooks.once("ready", () => { patchItemRoll(); });
    log("Poções e Pergaminhos configurado (usar importa e conjura a magia real).");
}
