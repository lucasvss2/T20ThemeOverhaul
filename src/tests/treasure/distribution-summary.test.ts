import { describe, expect, it } from "vitest";
import { renderDistributionSummary } from "@/treasure/distribution-summary";

describe("Resumo público da distribuição", () => {
    const players = [{ actorId: "a", name: "Alice" }, { actorId: "b", name: "Bruno" }];
    it("agrupa moedas e itens pelo personagem que recebeu", () => {
        const html = renderDistributionSummary(players, { coins: [{ actorId: "a", to: 2, tp: 5, tc: 3 }, { actorId: "b", to: 0, tp: 25, tc: 0 }],
            items: [{ actorId: "a", name: "Broquel" }, { actorId: "b", name: "Adaga" }] });
        expect(html).toContain("<td>Alice</td><td>2 TO + 5 T$ + 3 TC</td><td>Broquel</td>");
        expect(html).toContain("<td>Bruno</td><td>25 T$</td><td>Adaga</td>");
    });
    it("mantém vazio quem ainda não recebeu nada e escapa nomes", () => {
        const html = renderDistributionSummary([{ actorId: "a", name: "<Z>" }, players[1]], {
            coins: [], items: [{ actorId: "a", name: "Espada <especial>" }],
        });
        expect(html).toContain("&lt;Z&gt;");
        expect(html).toContain("Espada &lt;especial&gt;");
        expect(html).toContain("<td>Bruno</td><td>—</td><td>—</td>");
    });
});
