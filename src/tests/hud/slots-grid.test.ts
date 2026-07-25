import { describe, expect, it } from "vitest";

import { buildSlotGridHtml, paginate, type GenericSlot } from "@/hud/slots-grid";

const mkItems = (n: number): GenericSlot[] =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `Item ${i}`, iconUrl: "x.svg" }));

describe("paginate", () => {
    it("cabe tudo numa página só → totalPages=1", () => {
        const r = paginate(mkItems(4), 6, 1, 0);
        expect(r.totalPages).toBe(1);
        expect(r.pageItems).toHaveLength(4);
    });

    it("mais itens que cabem → várias páginas", () => {
        const r = paginate(mkItems(28), 6, 1, 0);
        expect(r.totalPages).toBe(5); // ceil(28/6)
        expect(r.pageItems).toHaveLength(6);
    });

    it("última página tem o resto", () => {
        const r = paginate(mkItems(28), 6, 1, 4);
        expect(r.pageItems).toHaveLength(4); // 28 - 4*6
    });

    it("página fora do range clampa", () => {
        const over = paginate(mkItems(10), 6, 1, 99);
        expect(over.page).toBe(1); // totalPages-1 = ceil(10/6)-1 = 1
        const under = paginate(mkItems(10), 6, 1, -5);
        expect(under.page).toBe(0);
    });

    it("lista vazia → 1 página vazia, sem erro", () => {
        const r = paginate([], 6, 1, 0);
        expect(r.totalPages).toBe(1);
        expect(r.pageItems).toEqual([]);
    });
});

describe("buildSlotGridHtml", () => {
    it("sem overflow: não renderiza paginador", () => {
        const html = buildSlotGridHtml(mkItems(4), 6, 1, 0, "skill-key");
        expect(html).not.toContain("t20-hud-pager");
        expect((html.match(/t20-hud-slot"/g) ?? []).length).toBe(4);
    });

    it("com overflow: renderiza paginador com N/M", () => {
        const html = buildSlotGridHtml(mkItems(28), 6, 1, 0, "skill-key");
        expect(html).toContain("t20-hud-pager");
        expect(html).toContain("1/5");
    });

    it("escapa nome/label no HTML", () => {
        const html = buildSlotGridHtml([{ key: "k", label: '<b>"x"</b>', iconUrl: "x.svg" }], 6, 1, 0, "item-id");
        expect(html).not.toContain("<b>");
        expect(html).toContain("&lt;b&gt;");
    });

    it("usa o data-attr informado", () => {
        const html = buildSlotGridHtml(mkItems(1), 6, 1, 0, "item-id");
        expect(html).toContain('data-item-id="k0"');
    });

    it("sem dragList: não marca os slots como arrastáveis", () => {
        const html = buildSlotGridHtml(mkItems(1), 6, 1, 0, "skill-key");
        expect(html).not.toContain("draggable");
        expect(html).not.toContain("data-drag-key");
    });

    it("com dragList: marca os slots como arrastáveis com a chave da lista", () => {
        const html = buildSlotGridHtml(mkItems(1), 6, 1, 0, "skill-key", "skills");
        expect(html).toContain('data-drag-key="k0"');
        expect(html).toContain('data-drag-list="skills"');
        expect(html).toContain('draggable="true"');
    });
});
