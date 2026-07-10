/**
 * Iniciativa com Efeitos de Uso (Audácia, Engenhosidade, ...).
 *
 * A rolagem de iniciativa disparada pelo TRACKER de combate (dado do
 * combatente, "Rolar Todos", "Rolar NPCs") usa `Combat.rollInitiative` →
 * `_getInitiativeFormula` — um roll seco de `1d20 + inic`, SEM o dialog de uso
 * de perícia. Resultado: poderes que buffam testes de perícia pagando PM
 * (Efeitos de Uso com flag `tormenta20.pericia`, ex.: Audácia, Engenhosidade)
 * nunca eram oferecidos nessa rolagem.
 *
 * Fix: wrapper em `Combat.prototype.rollInitiative`. Combatente cujo ator tem
 * Efeito de Uso de perícia ATIVO e PM suficiente pro mais barato deles é
 * REDIRECIONADO para `actor.rollPericia("inic")` — o fluxo nativo da ficha:
 * abre o AbilityUseDialog (checkboxes dos efeitos com custo em PM), debita o
 * PM (automaticManaSpend), posta o card e o próprio T20 já grava a iniciativa
 * no combate (`toInitiative`, quando `initiative === null`). Os demais
 * combatentes seguem o caminho nativo intocado.
 *
 * Fallback pós-roll: `toInitiative` localiza o combatente por `actor.id` — com
 * tokens UNLINKED gêmeos (mesmo actor.id) ou combate não-ativo ele pode gravar
 * no combatente errado/nenhum. Depois do rollPericia, se ESTE combatente ainda
 * está sem iniciativa, extraímos o total do ChatMessage retornado
 * (`msg.rolls[0].total`) e chamamos `combat.setInitiative` direto.
 *
 * Cancelar o dialog aborta a rolagem (paridade com a ficha) — o dado do
 * tracker continua disponível para rolar de novo.
 */

import { MODULE_ID } from "@/constants";
import { log, warn } from "@/utils/logging";

const SETTING_ENABLED = "iniciativaBuffEnabled";

interface EffectFlagsT20 {
    onuse?: boolean;
    skill?: unknown;
    custo?: unknown;
    items?: unknown;
}

export interface EffectLike {
    disabled?: boolean;
    flags?: { tormenta20?: EffectFlagsT20 };
}

/** Custo em PM de um Efeito de Uso (flags.tormenta20.custo; ""/null/NaN → 0). */
export function effectCusto(ef: EffectLike): number {
    const raw = ef.flags?.tormenta20?.custo;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Efeitos de Uso de perícia elegíveis para a rolagem de iniciativa — o MESMO
 * filtro do AbilityUseDialog nativo p/ `type:"pericia"` (tormenta20.mjs
 * ~L6180): cópias em `actor.effects` com flags `onuse` E **`skill`** truthy
 * (⚠️ a flag é `skill`, não `pericia`; e `disabled:true` NÃO exclui — onuse
 * ficam disabled por padrão, é só o estado do checkbox). Restrição opcional
 * `items` ("Nome1; Nome2") precisa incluir a perícia rolada. Por fim, corte
 * nosso: só conta se o custo em PM é pagável.
 */
export function eligibleInitiativeBuffEffects(
    effects: EffectLike[],
    pmAvailable: number,
    skillLabel = "Iniciativa",
): EffectLike[] {
    return effects.filter((ef) => {
        const t20 = ef.flags?.tormenta20;
        if (!t20?.onuse || !t20.skill) return false;
        const itemsRaw = t20.items;
        if (typeof itemsRaw === "string" && itemsRaw.trim()) {
            const names = itemsRaw.split(";").map((s) => s.trim());
            if (!names.includes(skillLabel)) return false;
        }
        return effectCusto(ef) <= pmAvailable;
    });
}

interface ActorLike {
    name?: string;
    effects?: { contents?: EffectLike[] } | EffectLike[];
    system?: {
        attributes?: { pm?: { value?: number; temp?: number } };
        pericias?: { inic?: { label?: string } };
    };
    rollPericia?: (key: string, options?: Record<string, unknown>) => Promise<unknown>;
}

function actorEffectsList(actor: ActorLike): EffectLike[] {
    const eff = actor.effects;
    if (Array.isArray(eff)) return eff;
    return eff?.contents ?? [];
}

function pmAvailable(actor: ActorLike): number {
    const pm = actor.system?.attributes?.pm;
    return (Number(pm?.value) || 0) + (Number(pm?.temp) || 0);
}

/** O ator tem algum buff de perícia utilizável agora? */
export function hasUsableInitiativeBuff(actor: ActorLike): boolean {
    if (typeof actor.rollPericia !== "function") return false;
    const label = actor.system?.pericias?.inic?.label || "Iniciativa";
    return eligibleInitiativeBuffEffects(actorEffectsList(actor), pmAvailable(actor), label).length > 0;
}

function isEnabled(): boolean {
    try {
        return !!game.settings.get(MODULE_ID, SETTING_ENABLED);
    } catch {
        return false;
    }
}

interface CombatantLike {
    id: string;
    initiative: number | null;
    actor?: ActorLike | null;
}

interface CombatLike {
    combatants: { get(id: string): CombatantLike | undefined };
    setInitiative(id: string, value: number): Promise<void>;
}

type RollInitiativeFn = (this: CombatLike, ids: string | string[], options?: Record<string, unknown>) => Promise<unknown>;

/** Roda o fluxo nativo de perícia p/ 1 combatente e garante a iniciativa dele. */
async function rollViaPericiaDialog(combat: CombatLike, combatant: CombatantLike): Promise<void> {
    const actor = combatant.actor;
    if (!actor?.rollPericia) return;
    let msg: unknown;
    try {
        msg = await actor.rollPericia("inic", { message: true });
    } catch (err) {
        warn("iniciativa-buff: rollPericia falhou — combatente fica sem iniciativa:", err);
        return;
    }
    if (!msg) return; // dialog cancelado → aborta (paridade com a ficha)
    // toInitiative nativo já deve ter gravado; fallback p/ gêmeos unlinked /
    // combate não-ativo: extrai o total do card e grava neste combatente.
    if (combatant.initiative !== null && combatant.initiative !== undefined) return;
    const total = (msg as { rolls?: Array<{ total?: number }> }).rolls?.[0]?.total;
    if (typeof total !== "number") return;
    try {
        await combat.setInitiative(combatant.id, total);
    } catch (err) {
        warn("iniciativa-buff: setInitiative do fallback falhou:", err);
    }
}

type CombatCtor = { prototype: { rollInitiative?: RollInitiativeFn; _t20IniBuffPatched?: boolean } };

function patchRollInitiative(): void {
    const ctor = ((CONFIG as unknown as { Combat?: { documentClass?: CombatCtor } }).Combat?.documentClass
        ?? (globalThis as unknown as { Combat?: CombatCtor }).Combat) as CombatCtor | undefined;
    const proto = ctor?.prototype;
    if (!proto || typeof proto.rollInitiative !== "function") {
        warn("iniciativa-buff: Combat.prototype.rollInitiative não encontrado — patch não aplicado.");
        return;
    }
    if (proto._t20IniBuffPatched) return;
    const orig = proto.rollInitiative;
    proto.rollInitiative = async function (this: CombatLike, ids: string | string[], options?: Record<string, unknown>) {
        const idList = typeof ids === "string" ? [ids] : Array.isArray(ids) ? ids : [];
        if (!idList.length || !isEnabled()) return orig.call(this, ids, options);

        const redirected: CombatantLike[] = [];
        const passthrough: string[] = [];
        for (const id of idList) {
            const c = this.combatants.get(id);
            const actor = c?.actor;
            // Só intercepta rolagem "nova" (initiative null) de ator com buff usável.
            if (c && actor && (c.initiative === null || c.initiative === undefined) && hasUsableInitiativeBuff(actor)) {
                redirected.push(c);
            } else {
                passthrough.push(id);
            }
        }
        if (!redirected.length) return orig.call(this, ids, options);

        log(`iniciativa-buff: ${redirected.length} combatente(s) com Efeito de Uso de perícia → dialog nativo.`);
        let result: unknown = this;
        if (passthrough.length) result = await orig.call(this, passthrough, options);
        // Dialogs em sequência (evita pilha de modais no "Rolar Todos").
        for (const c of redirected) await rollViaPericiaDialog(this, c);
        return result;
    } as RollInitiativeFn;
    proto._t20IniBuffPatched = true;
    log("Combat.rollInitiative patched — iniciativa oferece Efeitos de Uso de perícia (Audácia etc.).");
}

export function setupIniciativaBuff(): void {
    try {
        game.settings.register(MODULE_ID, SETTING_ENABLED, {
            name: "Iniciativa: oferecer Efeitos de Uso de perícia",
            hint: "Ao rolar iniciativa pelo tracker de combate, atores com poderes de buff de perícia (Audácia, Engenhosidade, ...) abrem o dialog nativo de uso de perícia, permitindo gastar PM na rolagem.",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });
    } catch (err) {
        warn("iniciativa-buff: falha ao registrar setting:", err);
    }
    patchRollInitiative();
    log("Iniciativa com Efeitos de Uso configurada.");
}
