import { escHtml } from "@/_shared/html";

export interface CoinReceipt { actorId: string; to: number; tp: number; tc: number }
export interface ItemReceipt { actorId: string; name: string }
export interface DistributionReceipt { coins: CoinReceipt[]; items: ItemReceipt[] }

/** Exibe somente recursos efetivamente entregues, nunca a lista de loot pendente. */
export function renderDistributionSummary(players: Array<{ actorId: string; name: string }>, receipt: DistributionReceipt): string {
    const rows = players.map(player => {
        const coins = receipt.coins.filter(entry => entry.actorId === player.actorId);
        const amount = (key: "to" | "tp" | "tc") => coins.reduce((sum, entry) => sum + entry[key], 0);
        const money = ([['to', 'TO'], ['tp', 'T$'], ['tc', 'TC']] as const)
            .filter(([key]) => amount(key) > 0).map(([key, label]) => `${amount(key)} ${label}`).join(" + ") || "—";
        const items = receipt.items.filter(entry => entry.actorId === player.actorId).map(entry => escHtml(entry.name)).join("<br>") || "—";
        return `<tr><td>${escHtml(player.name)}</td><td>${money}</td><td>${items}</td></tr>`;
    }).join("");
    return `<div class="tre-card" style="color:#eee9df;font-family:system-ui,sans-serif;text-transform:none"><h3 style="color:#dbc28d;font:600 15px/1.3 system-ui,sans-serif;margin:0 0 12px">Resumo da distribuição de tesouro</h3><table style="width:100%;color:#eee9df;font:12px/1.4 system-ui,sans-serif;text-transform:none"><thead><tr><th>Personagem</th><th>Moedas</th><th>Itens</th></tr></thead><tbody>${rows}</tbody></table><p style="font:11px/1.4 system-ui,sans-serif;color:#c8c1b3">Valores efetivamente entregues. Este resumo é atualizado ao concluir novas entregas.</p></div>`;
}
