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

function resolveRealItem(actor: ActorLike, cloneId: string | undefined): ItemLike | undefined {
    if (!cloneId) return undefined;
    const items = actor.items;
    if (Array.isArray(items)) return items.find((i) => i.id === cloneId);
    return items?.get?.(cloneId);
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

function setupMaskingHook(): void {
    Hooks.on("createItem", (...args: unknown[]) => {
        const item = args[0] as ItemLike & { parent?: unknown };
        const userId = hookUserId(args);
        if (!userId || userId !== game.user?.id) return;
        const actor = item.parent as ActorLike | undefined;
        if (!actor || !isPlayerCharacter(actor)) return;
        if (!isPocaoPergaminhoItem(item)) return;
        void maskAsUnidentified(item);
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

// ── Patch AbilityUseDialog.create (cancela o fluxo nativo do NOSSO item) ────

function patchAbilityUseDialog(): void {
    type DlgLike = { create: (item: unknown, ...a: unknown[]) => Promise<unknown>; _t20PatchedPocoesPergaminhos?: boolean };
    type T20Global = { applications?: { AbilityUseDialog?: DlgLike } };
    const Dlg = (game as unknown as { tormenta20?: T20Global }).tormenta20?.applications?.AbilityUseDialog;
    if (!Dlg) { warn("pocoes-pergaminhos: AbilityUseDialog não encontrado — patch não aplicado."); return; }
    if (Dlg._t20PatchedPocoesPergaminhos) return;
    const orig = Dlg.create.bind(Dlg);
    Dlg.create = async function (item: unknown, ...args: unknown[]): Promise<unknown> {
        const clone = item as ItemLike & { actor?: ActorLike | null; id?: string };
        const flag = getPocaoPergaminhoFlag(clone);
        if (flag) {
            const actor = clone.actor;
            const real = actor ? resolveRealItem(actor, clone.id) : undefined;
            if (actor && real) {
                setTimeout(() => {
                    void (flag.identificado ? handleCast(actor, real) : handleIdentify(actor, real));
                }, 0);
            }
            return null;
        }
        return orig(item, ...args);
    };
    Dlg._t20PatchedPocoesPergaminhos = true;
    log("Poções e Pergaminhos: AbilityUseDialog.create patcheado.");
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
    Hooks.once("ready", () => { patchAbilityUseDialog(); });
    log("Poções e Pergaminhos configurado (usar importa e conjura a magia real).");
}
