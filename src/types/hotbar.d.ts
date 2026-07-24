/**
 * Ambient declaration for Foundry v13's native Hotbar class (source read
 * directly from `client/applications/ui/hotbar.mjs` in the installed
 * server). Minimal surface — only what T20FooterHud actually overrides or
 * calls via `super`.
 */
declare namespace foundry {
    namespace utils {
        function getDocumentClass(name: string): {
            fromDropData(data: Record<string, unknown>): Promise<unknown>;
            create(data: Record<string, unknown>): Promise<unknown>;
        } | undefined;
    }
    namespace applications {
        namespace ux {
            interface DragDropCallbacks {
                dragstart?: (event: DragEvent) => void;
                dragover?: (event: DragEvent) => void;
                drop?: (event: DragEvent) => void;
            }
            interface DragDropConfig {
                dragSelector?: string | null;
                dropSelector?: string | null;
                permissions?: Record<string, (selector: string) => boolean>;
                callbacks?: DragDropCallbacks;
            }
            namespace DragDrop {
                class implementation {
                    constructor(config: DragDropConfig);
                    bind(element: HTMLElement): void;
                }
            }
            namespace TextEditor {
                class implementation {
                    static getDragEventData(event: DragEvent): Record<string, unknown>;
                }
            }
        }
        namespace ui {
            /** One macro slot as prepared by `Hotbar#_prepareContext`. */
            interface HotbarSlotData {
                slot: number;
                macro: { id: string; name: string; img?: string } | null;
                key: number;
                tooltip: string | null;
                ariaLabel: string;
                cssClass: string;
                img: string | null;
            }

            class Hotbar extends foundry.applications.api.ApplicationV2 {
                /** Current page (1-5) — mutated by `changePage`/keyboard PageUp/PageDown. */
                get page(): number;
                /** Macro slots for the current page — read by keybindings (1-0) and drag-drop. */
                get slots(): HotbarSlotData[];
                get locked(): boolean;

                _prepareContext(options: unknown): Promise<{ slots: HotbarSlotData[]; page: number }>;
                _renderHTML(context: unknown, options: { parts: string[] }): Promise<Record<string, HTMLElement>>;
                _onFirstRender(context: unknown, options: unknown): Promise<void>;
                _onRender(context: unknown, options: unknown): Promise<void>;
                _onResize(): void;
                _updateToggles(): void;

                changePage(page: number): Promise<void>;
                cyclePage(direction: number): Promise<void>;
            }
        }
    }
}
