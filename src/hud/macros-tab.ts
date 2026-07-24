/**
 * Aba Macros do painel direito. Ao contrário de Inventário/Poderes/Magias
 * (que paginam `actor.items` de forma independente), esta aba reflete a
 * PÁGINA REAL da hotbar nativa (`hud.page`, mutada por `changePage()` e
 * pelas teclas PageUp/PageDown) — não uma paginação própria, para não
 * quebrar a correspondência com as teclas numéricas 1-0.
 *
 * O bind de drag-and-drop não vem de `super._onRender()` (que a HUD não
 * chama — ver `T20FooterHud`); é reimplementado aqui replicando fielmente
 * `Hotbar#_onRender`/`#onDragStart`/`#onDragOver`/`#onDragDrop` (lidos do
 * código-fonte real do Foundry v13.351), usando as mesmas APIs públicas
 * (`foundry.applications.ux.DragDrop`, `TextEditor.getDragEventData`,
 * `foundry.utils.getDocumentClass`, `game.user.assignHotbarMacro`) e
 * disparando o mesmo hook `hotbarDrop`.
 */
import { warn } from "@/utils/logging";

function esc(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Monta o grid de slots de macro da página atual da hotbar nativa. */
export function buildMacroSlotsHtml(slots: foundry.applications.ui.HotbarSlotData[]): string {
    const cells = slots.map((s) => `
        <div class="t20-hud-slot t20-hud-macro-slot${s.macro ? " full" : " open"}" data-slot="${s.slot}" title="${esc(s.tooltip ?? s.ariaLabel)}">
            <span class="t20-hud-slot-num">${s.key}</span>
            ${s.img ? `<div class="t20-hud-slot-icon" style="background-image:url('${esc(s.img)}')"></div>` : ""}
            ${s.macro ? `<span class="t20-hud-slot-name">${esc(s.macro.name)}</span>` : ""}
        </div>`).join("");
    return `<div class="t20-hud-grid-wrap"><div class="t20-hud-grid-row t20-hud-macro-row">${cells}</div></div>`;
}

interface MacroLike { id: string; execute: () => Promise<unknown> }
interface GameMacros { get(id: string): MacroLike | null; has(id: string): boolean }
interface UserWithHotbar {
    hotbar: Record<string, string>;
    assignHotbarMacro(macro: unknown, slot: string | number, opts?: { fromSlot?: unknown }): Promise<unknown>;
}

function getMacroForSlotEl(el: HTMLElement): MacroLike | null {
    const slot = el.dataset["slot"];
    const macros = (game as unknown as { macros?: GameMacros }).macros;
    const user = game.user as unknown as UserWithHotbar | null;
    if (!slot || !user || !macros) return null;
    const macroId = user.hotbar[slot];
    return macroId ? macros.get(macroId) : null;
}

/** Clique executa a macro (mesmo comportamento de `Hotbar##onExecute`, sem o fallback de criar macro vazia). */
function wireMacroClicks(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>(".t20-hud-macro-slot").forEach((el) => {
        el.addEventListener("click", () => {
            const macro = getMacroForSlotEl(el);
            if (macro) void macro.execute().catch((err) => warn("hud: falha ao executar macro:", err));
        });
    });
}

/** Liga drag-and-drop real nos slots de macro — replica `Hotbar#_onRender`. */
export function wireMacroDragDrop(root: HTMLElement): void {
    wireMacroClicks(root);

    let dragSlot: string | undefined;
    let dropTarget: HTMLElement | undefined;

    const onDragStart = (event: DragEvent): void => {
        const li = (event.target as HTMLElement)?.closest<HTMLElement>(".t20-hud-macro-slot");
        const macro = li ? getMacroForSlotEl(li) : null;
        if (!macro || !li) { event.preventDefault(); return; }
        dragSlot = li.dataset["slot"];
        const dragData = { type: "Macro", uuid: `Macro.${macro.id}`, slot: dragSlot };
        event.dataTransfer?.setData("text/plain", JSON.stringify(dragData));
    };

    const onDragOver = (event: DragEvent): void => {
        const target = (event.target as HTMLElement)?.closest<HTMLElement>(".t20-hud-macro-slot") ?? undefined;
        if (target === dropTarget) return;
        dropTarget?.classList.remove("drop-target");
        dropTarget = target;
        if (!target || target.dataset["slot"] === dragSlot) return;
        target.classList.add("drop-target");
    };

    const onDrop = async (event: DragEvent): Promise<void> => {
      try {
        dropTarget?.classList.remove("drop-target");
        dropTarget = undefined;
        const li = (event.target as HTMLElement)?.closest<HTMLElement>(".t20-hud-macro-slot");
        const dropSlot = li?.dataset["slot"];
        if (!dropSlot || dragSlot === dropSlot) { dragSlot = undefined; return; }
        dragSlot = undefined;

        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        // Chamar via `HooksStatic.call(...)` diretamente (não desreferenciar `.call` numa
        // variável) — desreferenciado perde o `this` interno do Foundry e lança
        // "Cannot read properties of undefined (reading '#events')".
        const HooksStatic = Hooks as unknown as { call: (event: string, ...args: unknown[]) => boolean };
        if (HooksStatic.call("hotbarDrop", null, data, dropSlot) === false) return;

        const cls = foundry.utils.getDocumentClass(data["type"] as string);
        const doc = await cls?.fromDropData(data);
        if (!doc) return;

        const user = game.user as unknown as UserWithHotbar | null;
        const macros = (game as unknown as { macros?: GameMacros }).macros;
        if (!user || !macros) return;

        let macro: MacroLike | null = null;
        const d = doc as { id?: string; toObject?: () => Record<string, unknown> };
        if (data["type"] === "Macro" && d.id) {
            macro = macros.has(d.id) ? (doc as MacroLike) : (await cls?.create(d.toObject?.() ?? {}) as MacroLike);
        }
        // RollTable / outros tipos de drop: fora do escopo v1 (só Macro é suportado).
        if (!macro) return;
        await user.assignHotbarMacro(macro, dropSlot, { fromSlot: data["slot"] });
      } catch (err) {
        warn("hud: falha ao processar drop na hotbar:", err);
      }
    };

    new foundry.applications.ux.DragDrop.implementation({
        dragSelector: ".t20-hud-macro-slot.full",
        dropSelector: ".t20-hud-macro-slot",
        callbacks: { dragstart: onDragStart, dragover: onDragOver, drop: (e) => void onDrop(e) },
    }).bind(root);
}
