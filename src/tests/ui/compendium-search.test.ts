import { afterEach, describe, expect, it, vi } from "vitest";
import { matchesCompendiumSearch, searchCompendiumContents } from "@/ui/compendium-search";
import { startCompendiumDrag } from "@/ui/compendium-drag";

afterEach(() => vi.unstubAllGlobals());
function pack(id: string, names: string[], options: { visible?: boolean; external?: boolean; fail?: boolean; type?: string } = {}) {
    return { collection: id, documentName: options.type ?? "Item", metadata: { packageName: options.external ? "other" : "t20-theme-overhaul", label: "T20 Overhaul — " + id },
        visible: options.visible ?? true,
        getIndex: vi.fn(async () => { if (options.fail) throw new Error("offline"); return { contents: names.map((name, i) => ({ _id: String(i), name })) }; }) };
}
function usePacks(packs: ReturnType<typeof pack>[]) {
    vi.stubGlobal("game", { packs: { contents: packs, get: (id: string) => packs.find(p => p.collection === id) } });
}
describe("Busca nos conteúdos dos compêndios", () => {
    it.each(["Item", "Actor", "JournalEntry"])("arrasta %s usando o tipo e UUID nativos, sem carregar o documento", async type => {
        usePacks([pack("ours", ["Presente dos Deuses"], { type })]);
        const [result] = (await searchCompendiumContents("presente")).results;
        const event = { dataTransfer: { setData: vi.fn(), effectAllowed: "none" }, stopPropagation: vi.fn() };
        expect(startCompendiumDrag(event, result!)).toBe(true);
        expect(event.dataTransfer.setData).toHaveBeenCalledExactlyOnceWith("text/plain", JSON.stringify({ type, uuid: "Compendium.ours.0" }));
        expect(event.dataTransfer.effectAllowed).toBe("copy");
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });
    it("não inicia um arraste sem tipo, UUID de compêndio ou DataTransfer", () => {
        const event = { dataTransfer: { setData: vi.fn(), effectAllowed: "none" }, stopPropagation: vi.fn() };
        expect(startCompendiumDrag(event, { uuid: "Compendium.ours.0", documentName: "" })).toBe(false);
        expect(startCompendiumDrag(event, { uuid: "Actor.world", documentName: "Item" })).toBe(false);
        expect(startCompendiumDrag({ ...event, dataTransfer: null }, { uuid: "Compendium.ours.0", documentName: "Item" })).toBe(false);
        expect(event.dataTransfer.setData).not.toHaveBeenCalled();
    });
    it("aceita acentos, caixa e palavras fora de ordem", () => {
        expect(matchesCompendiumSearch("Elfo-do-Gelo", "GELO elfo")).toBe(true);
        expect(matchesCompendiumSearch("Poções e Pergaminhos", "pocoes")).toBe(true);
    });
    it("não consulta compêndios ocultos ou de outros módulos", async () => {
        const visible = pack("ours", ["Necromante Iniciado"]), hidden = pack("hidden", ["Necromante"], { visible: false }), other = pack("other", ["Necromante"], { external: true });
        usePacks([visible, hidden, other]);
        expect((await searchCompendiumContents("necromante")).results.map(r => r.uuid)).toEqual(["Compendium.ours.0"]);
        expect(hidden.getIndex).not.toHaveBeenCalled(); expect(other.getIndex).not.toHaveBeenCalled();
    });
    it("preserva resultados de outros packs se um índice falhar", async () => {
        usePacks([pack("ok", ["Veneno Aprimorado"]), pack("offline", [], { fail: true })]);
        const result = await searchCompendiumContents("veneno");
        expect(result.total).toBe(1); expect(result.failed).toBe(1);
    });
    it("revalida permissão após leitura assíncrona", async () => {
        const changed = pack("changed", ["Necromante"]);
        changed.getIndex.mockImplementationOnce(async () => { changed.visible = false; return { contents: [{ _id: "a", name: "Necromante" }] }; });
        usePacks([changed]); expect((await searchCompendiumContents("necromante")).total).toBe(0);
    });
    it("prioriza nomes exatos e limita a lista mantendo a contagem", async () => {
        usePacks([pack("ours", [...Array.from({ length: 65 }, (_, i) => "Necromante " + i), "Necromante"])]);
        const result = await searchCompendiumContents("necromante");
        expect(result.results[0]?.name).toBe("Necromante"); expect(result.total).toBe(66); expect(result.results).toHaveLength(60);
    });
});
