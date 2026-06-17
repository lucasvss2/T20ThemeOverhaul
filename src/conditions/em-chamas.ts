/**
 * Condição "Em Chamas" — tick de queima por turno.
 *
 * O T20 NÃO automatiza o dano da condição (o status `emchamas` só carrega um
 * modificador on-use vestigial `{key:"dano", value:"1d6[fogo]"}` — não há hook
 * de combate que aplique dano por turno). Este módulo implementa a regra: no
 * INÍCIO do turno de cada criatura Em Chamas, ela sofre 1d6 de fogo.
 *
 * É genérico — vale para qualquer fonte da condição (Explosão de Chamas com o
 * aprimoramento, futuras magias, aplicação manual pela paleta do token, etc.).
 *
 * Apenas o GM eleito (`isActiveGM`) processa, para não duplicar em multi-GM.
 * Dano aplicado via `actor.applyDamage(total, 1, false)` (sem RD automática —
 * RD/imunidade a fogo é ajuste manual do mestre, consistente com Aura Ardente).
 */

import { MODULE_ID } from "@/constants";
import { isActiveGM, escHtml } from "@/_shared";
import { warn } from "@/utils/logging";

const EMCHAMAS_STATUS = "emchamas";

/** True se o ator está com a condição Em Chamas ativa. */
function actorHasEmChamas(actor: FoundryActor): boolean {
    const statuses = (actor as unknown as { statuses?: Set<string> }).statuses;
    if (statuses?.has?.(EMCHAMAS_STATUS)) return true;
    // Fallback: varre os effects por statuses (caso `actor.statuses` indisponível).
    const effects = (actor.effects as unknown as { contents?: Array<{ statuses?: Set<string> | string[]; disabled?: boolean }> })?.contents ?? [];
    for (const ef of effects) {
        if (ef.disabled) continue;
        const st = ef.statuses;
        if (st instanceof Set ? st.has(EMCHAMAS_STATUS) : Array.isArray(st) && st.includes(EMCHAMAS_STATUS)) return true;
    }
    return false;
}

async function burnActor(actor: FoundryActor): Promise<void> {
    type ActorWithApply = FoundryActor & {
        applyDamage?(amount: number, multiplier?: number, applyRD?: boolean): Promise<unknown>;
    };
    const a = actor as ActorWithApply;

    type RollCtor = new (formula: string) => Roll & { evaluate(opts?: object): Promise<Roll>; render(): Promise<string> };
    const RollCls = (globalThis as unknown as { Roll: RollCtor }).Roll;
    const roll = new RollCls("1d6");
    await roll.evaluate({ async: true } as never);
    const total = roll.total ?? 0;
    if (total <= 0) return;

    const pvBefore = Number((actor.system as { attributes?: { pv?: { value?: number } } })?.attributes?.pv?.value ?? NaN);

    try {
        await a.applyDamage?.(total, 1, false);
    } catch (err) {
        warn(`Em Chamas: falha ao aplicar dano em ${actor.name}:`, err);
        return;
    }

    const pvAfter = Number((actor.system as { attributes?: { pv?: { value?: number } } })?.attributes?.pv?.value ?? NaN);
    const dealt = Number.isFinite(pvBefore) && Number.isFinite(pvAfter) ? Math.max(0, pvBefore - pvAfter) : total;

    const rollRendered = await roll.render();
    const content = `
        <div class="tormenta20 chat-card item-card" style="border-color:#ff6a2a;">
            <header class="card-header flexrow">
                <h3 class="item-name"><div><i class="fas fa-fire" style="color:#ff6a2a;"></i> Em Chamas — ${escHtml(actor.name ?? "Criatura")}</div></h3>
            </header>
            <div class="card-content" style="padding:6px 10px;">
                <p style="margin:0 0 6px;color:var(--bg3-text-muted);font-size:0.82rem;">
                    Dano de queima no início do turno:
                    <b style="color:#ff6a2a;">-${dealt}</b>
                </p>
                ${rollRendered}
            </div>
        </div>`;
    try {
        await ChatMessage.create({
            content,
            rolls:   [roll.toJSON()],
            type:    5,
            speaker: { alias: actor.name ?? "Em Chamas" },
            flags:   { [MODULE_ID]: { emChamasTick: true } },
        });
    } catch { /* ignore — dano já aplicado */ }
}

export function setupEmChamas(): void {
    type CombatLike = { combatant?: { actor?: FoundryActor | null } | null };
    Hooks.on("combatTurnChange", (...args: unknown[]) => {
        if (!isActiveGM()) return;
        const combat = args[0] as CombatLike | undefined;
        const actor = combat?.combatant?.actor ?? null;
        if (!actor || !actorHasEmChamas(actor)) return;
        void burnActor(actor);
    });
}
