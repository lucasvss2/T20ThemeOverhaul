/**
 * Ambient declarations for Foundry v13's native Sidebar-tab machinery
 * (source read directly from `client/applications/sidebar/sidebar.mjs` and
 * `sidebar-tab.mjs` in the installed server). Minimal surface — only what
 * `T20OverhaulTab` actually overrides/calls, mirrors `hotbar.d.ts`.
 */
declare namespace foundry {
    namespace applications {
        namespace api {
            /**
             * Mixes template-based (Handlebars) rendering into an
             * ApplicationV2 subclass — the SAME mixin core uses for every
             * sidebar tab (Chat, Settings, ...). Needed because plain
             * `ApplicationV2._renderHTML`/`_replaceHTML` are abstract no-ops;
             * the mixin provides a working `_replaceHTML` we inherit (our own
             * class only overrides `_renderHTML`, same trick as `Hotbar` →
             * `T20FooterHud`).
             */
            function HandlebarsApplicationMixin(
                Base: typeof foundry.applications.sidebar.AbstractSidebarTab,
            ): typeof foundry.applications.sidebar.AbstractSidebarTab;
        }
        namespace sidebar {
            /** Entry shape for `Sidebar.TABS[id]` — registers an icon in the sidebar's tab nav (`#sidebar-tabs`). */
            interface SidebarTabDescriptor {
                tooltip?: string;
                icon?: string;
                documentName?: string;
                gmOnly?: boolean;
            }

            /** The native Sidebar application (`ui.sidebar`) — `TABS` is a plain static registry modules can extend before `Game#initializeUI()` runs (hook `init`, same timing requirement as `CONFIG.ui.hotbar`). */
            class Sidebar extends foundry.applications.api.ApplicationV2 {
                static TABS: Record<string, SidebarTabDescriptor>;
                readonly expanded: boolean;
                changeTab(tab: string, group: string, options?: Record<string, unknown>): void;
                expand(): void;
                collapse(): void;
            }

            interface SidebarTabPartDescriptor {
                template: string;
                root?: boolean;
            }

            /** Base class for any content rendered inside a Sidebar tab (Chat, Combat, Settings, ...) — also supports right-click pop-out for free. */
            class AbstractSidebarTab extends foundry.applications.api.ApplicationV2 {
                static tabName: string;
                static PARTS: Record<string, SidebarTabPartDescriptor>;
                readonly active: boolean;
                readonly isPopout: boolean;
                _prepareContext(options: unknown): Promise<Record<string, unknown>>;
                _renderHTML(context: unknown, options: { parts: string[] }): Promise<Record<string, HTMLElement>>;
                _onFirstRender(context: unknown, options: unknown): Promise<void>;
                _onRender(context: unknown, options: unknown): Promise<void>;
                render(options?: { force?: boolean }): Promise<AbstractSidebarTab>;
                activate(): void;
            }
        }
    }
}
