import { warn } from "@/utils/logging";

interface AttackItem {
    system?: { rolls?: Array<{ type?: string }> };
}
interface UseConfiguration {
    bonus?: string | number;
    t20Flanking?: boolean;
    [key: string]: unknown;
}
export function hasAttackRoll(item?: AttackItem): boolean {
    return Boolean(item?.system?.rolls?.some(r => r.type === "ataque"));
}

/** Soma ao modificador do uso, sem gravar bônus na arma ou no ator. */
export function flankingConfiguration(item: AttackItem, config: UseConfiguration | null): UseConfiguration | null {
    if (!config?.t20Flanking || !hasAttackRoll(item)) return config;
    const bonus = String(config.bonus ?? "").trim();
    return { ...config, bonus: !bonus || bonus === "0" ? "2" : `(${bonus}) + 2` };
}

export function setupFlanking(): void {
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]) => {
        const app = args[0] as { item?: AttackItem };
        if (!hasAttackRoll(app.item)) return;
        const html = args[1];
        const root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })?.[0];
        const form = root?.querySelector("form");
        if (!form || form.querySelector("[name=t20Flanking]")) return;
        const row = document.createElement("div");
        row.className = "form-group t20-flanking-option";
        row.innerHTML = '<label style="flex:1;display:flex;align-items:center;gap:8px"><input type="checkbox" name="t20Flanking"> Flanquear (+2 no ataque)</label>';
        const bonusRow = form.querySelector('[name="bonus"]')?.closest(".form-group");
        if (bonusRow) bonusRow.after(row);
        else form.append(row);
    });
    Hooks.once("ready", () => {
        type DialogClass = { create: (item: AttackItem, ...args: unknown[]) => Promise<UseConfiguration | null>; _t20Flanking?: boolean };
        const dialog = (game as unknown as { tormenta20?: { applications?: { AbilityUseDialog?: DialogClass } } }).tormenta20?.applications?.AbilityUseDialog;
        if (!dialog) { warn("Flanquear: diálogo de uso não encontrado."); return; }
        if (dialog._t20Flanking) return;
        const original = dialog.create.bind(dialog);
        dialog.create = async (item, ...args) => flankingConfiguration(item, await original(item, ...args));
        dialog._t20Flanking = true;
    });
}
