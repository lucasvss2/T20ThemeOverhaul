/**
 * Orbes PV/PM interativos: clique = dano/gasto, Shift+clique = cura/recupera.
 * Matemática pura (`computePoolAfterDelta`) baseada no padrão de
 * `applyDamage()` em `auto-damage/index.ts` — consome `temp` antes de
 * `value`, nunca deixa negativo; cura nunca passa do `max`. Sem socket: é
 * sempre o dono mexendo no próprio personagem.
 */
import type { Pool } from "./types";

export type PoolKey = "pv" | "pm";

/** Calcula o novo estado do pool após aplicar `delta` (negativo=dano/gasto, positivo=cura/recupera). Puro. */
export function computePoolAfterDelta(pool: Pool, delta: number): Pool {
    if (delta < 0) {
        let remaining = -delta;
        let temp = pool.temp;
        const usedFromTemp = Math.min(temp, remaining);
        temp -= usedFromTemp;
        remaining -= usedFromTemp;
        const value = Math.max(0, pool.value - remaining);
        return { value, max: pool.max, temp };
    }
    const value = Math.min(pool.max, pool.value + delta);
    return { value, max: pool.max, temp: pool.temp };
}

/** Aplica o delta no ator via `actor.update` (mesmo padrão de auto-damage/index.ts). */
export async function adjustPool(actor: FoundryActor, poolKey: PoolKey, delta: number): Promise<void> {
    const sys = actor.system?.attributes?.[poolKey] as { value?: number; max?: number; temp?: number } | undefined;
    const current: Pool = { value: sys?.value ?? 0, max: sys?.max ?? 0, temp: sys?.temp ?? 0 };
    const next = computePoolAfterDelta(current, delta);
    await actor.update({
        [`system.attributes.${poolKey}.value`]: next.value,
        [`system.attributes.${poolKey}.temp`]: next.temp,
    });
}

const FLOATER_MS = 1150;

function spawnFloater(orbEl: HTMLElement, delta: number): void {
    const el = document.createElement("span");
    el.className = `t20-hud-floater ${delta > 0 ? "pos" : "neg"}`;
    el.textContent = `${delta > 0 ? "+" : ""}${delta}`;
    orbEl.appendChild(el);
    setTimeout(() => el.remove(), FLOATER_MS);
}

/** Atualiza o fill/valor do orbe no DOM imediatamente (otimista), sem esperar o full re-render. */
function paintOrbOptimistic(orbEl: HTMLElement, next: Pool): void {
    const fill = orbEl.querySelector<HTMLElement>(".t20-hud-orb-fill");
    const valueEl = orbEl.querySelector<HTMLElement>(".t20-hud-orb-value");
    const pct = next.max ? Math.max(0, Math.min(100, Math.round(((next.value + next.temp) / next.max) * 100))) : 0;
    if (fill) fill.style.height = `${pct}%`;
    if (valueEl) valueEl.textContent = `${next.value}${next.temp ? `+${next.temp}` : ""}/${next.max}`;
}

function closePrompt(orbEl: HTMLElement): void {
    orbEl.querySelector(".t20-hud-orb-prompt")?.remove();
}

function openPrompt(orbEl: HTMLElement, heal: boolean, onConfirm: (amount: number) => void): void {
    closePrompt(orbEl);
    const wrap = document.createElement("div");
    wrap.className = "t20-hud-orb-prompt";
    wrap.innerHTML = `<input type="number" min="0" step="1" value="1" />`;
    orbEl.appendChild(wrap);
    const input = wrap.querySelector("input")!;
    input.focus();
    input.select();
    const finish = (confirm: boolean): void => {
        const amount = Number(input.value);
        wrap.remove();
        if (confirm && Number.isFinite(amount) && amount > 0) onConfirm(heal ? amount : -amount);
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
        e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(false));
}

/** Liga os listeners de clique/shift+clique nos orbes PV/PM presentes em `root`. */
export function wireOrbInteractions(root: HTMLElement, getActor: () => FoundryActor | null, onChanged: () => void): void {
    root.querySelectorAll<HTMLElement>(".t20-hud-orb").forEach((orbEl) => {
        const poolKey = orbEl.dataset["orb"] as PoolKey | undefined;
        if (!poolKey) return;
        orbEl.addEventListener("click", (e) => {
            const actor = getActor();
            if (!actor) return;
            const heal = (e as MouseEvent).shiftKey;
            openPrompt(orbEl, heal, (amount) => {
                const sys = actor.system?.attributes?.[poolKey] as { value?: number; max?: number; temp?: number } | undefined;
                const current: Pool = { value: sys?.value ?? 0, max: sys?.max ?? 0, temp: sys?.temp ?? 0 };
                const next = computePoolAfterDelta(current, amount);
                paintOrbOptimistic(orbEl, next);
                spawnFloater(orbEl, amount);
                // Full re-render (sincroniza com o estado real, inclui perícias) só
                // depois do floater terminar — senão o render mataria a animação cedo.
                void adjustPool(actor, poolKey, amount);
                setTimeout(onChanged, FLOATER_MS);
            });
        });
    });
}
