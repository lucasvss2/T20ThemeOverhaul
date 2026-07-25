/**
 * Orbes PV/PM interativos: clique abre um campo pra digitar um valor com
 * sinal explícito (`+5` cura/recupera, `-3` ou `3` sem sinal causa dano/gasta
 * — mantém compatível com o hábito de digitar só o número pra dano).
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

/**
 * Interpreta o texto digitado no prompt como um delta com sinal. `"+5"` →
 * +5 (cura/recupera); `"-3"` → -3 (dano/gasto); sem sinal (`"5"`) → -5
 * (dano/gasto — mantém o comportamento antigo de "clicar e digitar" como
 * dano por padrão). `null` se não for um número válido/diferente de zero.
 */
export function parseSignedDelta(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n === 0) return null;
    if (trimmed.startsWith("+")) return Math.abs(n);
    return -Math.abs(n);
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
const FLASH_MS = 700;

function spawnFloater(orbEl: HTMLElement, delta: number): void {
    const el = document.createElement("span");
    el.className = `t20-hud-floater ${delta > 0 ? "pos" : "neg"}`;
    el.textContent = `${delta > 0 ? "+" : ""}${delta}`;
    orbEl.appendChild(el);
    setTimeout(() => el.remove(), FLOATER_MS);
}

/**
 * Classe de brilho ao redor do orbe pra esse delta (`null` = sem brilho —
 * decisão do usuário: só PV-dano(vermelho)/PM-dano(azul)/PV-cura(verde);
 * PM-recupera fica sem brilho de propósito).
 */
export function flashClassFor(poolKey: PoolKey, delta: number): string | null {
    if (delta < 0) return poolKey === "pv" ? "t20-flash-danger" : "t20-flash-info";
    if (delta > 0 && poolKey === "pv") return "t20-flash-success";
    return null;
}

function playChangeAnimation(orbEl: HTMLElement, poolKey: PoolKey, delta: number): void {
    const fill = orbEl.querySelector<HTMLElement>(".t20-hud-orb-fill");
    fill?.classList.remove("t20-liquid-pulse");
    // força reflow pra permitir reiniciar a animação em cliques seguidos
    void fill?.offsetWidth;
    fill?.classList.add("t20-liquid-pulse");
    setTimeout(() => fill?.classList.remove("t20-liquid-pulse"), FLASH_MS);

    const cls = flashClassFor(poolKey, delta);
    if (cls) {
        orbEl.classList.add(cls);
        setTimeout(() => orbEl.classList.remove(cls), FLASH_MS);
    }
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

function openPrompt(orbEl: HTMLElement, onConfirm: (delta: number) => void): void {
    closePrompt(orbEl);
    const wrap = document.createElement("div");
    wrap.className = "t20-hud-orb-prompt";
    wrap.innerHTML = `<input type="text" inputmode="numeric" placeholder="+5 ou -3" />`;
    orbEl.appendChild(wrap);
    const input = wrap.querySelector("input")!;
    input.focus();
    const finish = (confirm: boolean): void => {
        const delta = parseSignedDelta(input.value);
        wrap.remove();
        if (confirm && delta !== null) onConfirm(delta);
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
        e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(false));
}

/** Liga os listeners de clique nos orbes PV/PM presentes em `root`. */
export function wireOrbInteractions(root: HTMLElement, getActor: () => FoundryActor | null, onChanged: () => void): void {
    root.querySelectorAll<HTMLElement>(".t20-hud-orb").forEach((orbEl) => {
        const poolKey = orbEl.dataset["orb"] as PoolKey | undefined;
        if (!poolKey) return;
        orbEl.addEventListener("click", () => {
            const actor = getActor();
            if (!actor) return;
            openPrompt(orbEl, (delta) => {
                const sys = actor.system?.attributes?.[poolKey] as { value?: number; max?: number; temp?: number } | undefined;
                const current: Pool = { value: sys?.value ?? 0, max: sys?.max ?? 0, temp: sys?.temp ?? 0 };
                const next = computePoolAfterDelta(current, delta);
                paintOrbOptimistic(orbEl, next);
                spawnFloater(orbEl, delta);
                playChangeAnimation(orbEl, poolKey, delta);
                // Full re-render (sincroniza com o estado real, inclui perícias) só
                // depois do floater terminar — senão o render mataria a animação cedo.
                void adjustPool(actor, poolKey, delta);
                setTimeout(onChanged, FLOATER_MS);
            });
        });
    });
}
