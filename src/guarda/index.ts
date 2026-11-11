import { warn } from "@/utils/logging";
import { canResistWithGuard, GUARD_DESCRIPTION, GUARD_KEY, guardBonus, guardConfiguration, guardTemplate, isMeleeGuardWeapon, prepareGuardDefense, type GuardActor, type GuardConfiguration, type GuardItem } from "./format";

interface OwnedItem extends GuardItem { actor?: GuardActor; toObject(): GuardItem }
function slots(): boolean { return !!game.settings.get("tormenta20", "equipmentSlots"); }
interface UpgradeConfig {
    weaponUpgrades: Record<string, string>;
    weaponUpgradesTooltips: Record<string, string>;
    upgrades: { weapon: Record<string, unknown> & { status: Record<string, string> } };
}
export function registerGuardUpgrade(config: UpgradeConfig): void {
    config.weaponUpgrades[GUARD_KEY] = "Guarda";
    config.weaponUpgradesTooltips[GUARD_KEY] = GUARD_DESCRIPTION;
    config.upgrades.weapon[GUARD_KEY] = guardTemplate();
    config.upgrades.weapon.status[GUARD_KEY] = "DONE";
}
/** Top-level: o passivo deve valer já na primeira preparação dos atores. */
export function setupGuardUpgrade(): void {
    Hooks.once("init", () => {
        const proto = (CONFIG as unknown as { Actor: { documentClass: { prototype: { applyActiveEffects(this: GuardActor): unknown } } } }).Actor.documentClass.prototype;
        const original = proto.applyActiveEffects;
        proto.applyActiveEffects = function() {
            const result = original.call(this);
            prepareGuardDefense(this, slots());
            return result;
        };
    });
    Hooks.once("setup", () => registerGuardUpgrade((CONFIG as unknown as { T20: UpgradeConfig }).T20));
    Hooks.on("renderItemSheet", (...args: unknown[]) => {
        const item = (args[0] as { item?: GuardItem }).item;
        if (!item || isMeleeGuardWeapon(item)) return;
        const html = args[1];
        const root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })?.[0];
        root?.querySelectorAll<HTMLOptionElement>(`select.updateUpgrades[data-name^="system.upgrades.melhoria"] option[value="${GUARD_KEY}"]`).forEach(option => {
            option.disabled = true;
            option.title = "Guarda só pode ser aplicada em armas corpo a corpo.";
        });
    });
    Hooks.on("preUpdateItem", (...args: unknown[]) => {
        const item = args[0] as OwnedItem, changes = args[1] as Record<string, unknown>;
        const utils = (foundry as unknown as { utils: { mergeObject(a: object, b: object, options: object): GuardItem; expandObject(a: object): object } }).utils;
        const expanded = utils.expandObject(changes) as { system?: { upgrades?: Record<string, unknown> } };
        if (!Object.values(expanded.system?.upgrades ?? {}).includes(GUARD_KEY)) return;
        if (!isMeleeGuardWeapon(utils.mergeObject(item.toObject(), expanded, { inplace: false }))) {
            ui.notifications.warn("Guarda só pode ser aplicada em armas corpo a corpo.");
            return false;
        }
    });
    Hooks.on("renderAbilityUseDialog", (...args: unknown[]) => {
        const item = (args[0] as { item?: OwnedItem }).item;
        if (!item || !canResistWithGuard(item) || !guardBonus(item.actor, slots())) return;
        const html = args[1];
        const root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })?.[0];
        const form = root?.querySelector("form");
        if (!form || form.querySelector("[name=t20GuardResistance]")) return;
        const row = document.createElement("div");
        row.className = "form-group t20-guard-option";
        row.innerHTML = '<label style="flex:1;display:flex;align-items:center;gap:8px"><input type="checkbox" name="t20GuardResistance"> Resistir a manobra (Guarda: +1)</label>';
        const bonusRow = form.querySelector('[name="bonus"]')?.closest(".form-group");
        if (bonusRow) bonusRow.after(row); else form.append(row);
    });
    Hooks.once("ready", () => {
        type UseDialog = { create(item: OwnedItem, ...args: unknown[]): Promise<GuardConfiguration | null> };
        const dialog = (game as unknown as { tormenta20?: { applications?: { AbilityUseDialog?: UseDialog } } }).tormenta20?.applications?.AbilityUseDialog;
        if (!dialog) { warn("Guarda: diálogo de uso não encontrado."); return; }
        const original = dialog.create.bind(dialog);
        dialog.create = async (item, ...args) => guardConfiguration(item, await original(item, ...args), guardBonus(item.actor, slots()));
    });
}
