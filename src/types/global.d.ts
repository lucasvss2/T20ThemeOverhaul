/**
 * Minimal Foundry VTT v13 ambient type declarations needed by this module.
 * For full types, install @league-of-foundry-developers/foundry-vtt-types.
 */

// ── Foundry globals ──────────────────────────────────────────────────────────

declare const Hooks: {
    once(event: string, fn: (...args: unknown[]) => void): number;
    on(event: string, fn: (...args: unknown[]) => unknown): number;
    off(event: string, id: number): void;
    callAll(event: string, ...args: unknown[]): boolean;
};

declare const game: {
    system: { id: string; version: string };
    /** Current Foundry version string (e.g. "13.351"). */
    version?: string;
    /** In-game world clock. */
    time?: { worldTime?: number };
    /** Active combat encounter, if any. */
    combat?: { round?: number; combatant?: { tokenId?: string } };
    modules: {
        get(id: string): FoundryModule | undefined;
    };
    actors?: {
        get(id: string): FoundryActor | undefined;
        contents?: FoundryActor[];
    };
    messages?: {
        get(id: string): ChatMessage | undefined;
        contents?: ChatMessage[];
    };
    journal?: {
        getName(name: string): JournalEntry | undefined;
        get(id: string): JournalEntry | undefined;
        contents: JournalEntry[];
    };
    users?: {
        find(fn: (u: FoundryUser) => boolean): FoundryUser | undefined;
        get(id: string): FoundryUser | undefined;
        contents: FoundryUser[];
    };
    user: {
        id: string;
        name: string;
        isGM: boolean;
        targets: Set<FoundryToken>;
    } | null;
    socket?: {
        emit(event: string, data: unknown): void;
        on(event: string, handler: (data: unknown) => void): void;
    };
    i18n: {
        localize(key: string): string;
        format(key: string, data?: Record<string, unknown>): string;
    };
    settings: {
        register(
            namespace: string,
            key: string,
            data: SettingConfig,
        ): void;
        get(namespace: string, key: string): unknown;
        set(namespace: string, key: string, value: unknown): Promise<unknown>;
    };
};

declare interface FoundryModule {
    id: string;
    active: boolean;
    version: string;
    api?: Record<string, unknown>;
}

declare interface FoundryUser {
    id: string;
    name: string;
    isGM: boolean;
    active: boolean;
}

/**
 * Token document (Foundry v11+). Holds the authoritative position, size,
 * disposition and flags. NOTE: inside an `updateToken` hook, `x`/`y` still
 * hold the PRE-move position during animation — the destination is in the
 * hook's `changes` payload (see the v13 quirk handled by `overrideXY`).
 */
declare interface FoundryTokenDocument {
    id?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    disposition?: number;
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>): Promise<unknown>;
}

declare interface FoundryToken {
    id: string;
    name: string;
    actor: FoundryActor | null;
    /** Token document (v11+) — authoritative x/y/size/disposition/flags. */
    document?: FoundryTokenDocument;
    /** True if this token is currently selected/controlled by the user. */
    controlled?: boolean;
    /** Select this token on the canvas. */
    control(options?: { releaseOthers?: boolean }): void;
    /** Legacy direct position (pre-v11) — prefer `document.x/y`. */
    x?: number;
    y?: number;
    /** Legacy data bag (pre-v11) — prefer `document`. */
    data?: { disposition?: number };
}

declare interface FoundryItemEffect {
    id: string;
    name: string;
    disabled: boolean;
    changes: Array<{ key: string; value: string; mode: number; priority?: number | null }>;
    flags: Record<string, Record<string, unknown>>;
    /** "ActiveEffect" — document class name. */
    documentName?: string;
    /** Origin UUID this effect was created from. */
    origin?: string;
    /** Whether the effect transfers from item to owning actor. */
    transfer?: boolean;
    /** Parent document (the owning Actor or Item). */
    parent?: FoundryActor | FoundryItem;
    update(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
    toObject(): Record<string, unknown>;
}

declare interface FoundryItem {
    id: string;
    name: string;
    type: string;
    system: Record<string, unknown>;
    effects?: { contents: FoundryItemEffect[] };
    flags?: Record<string, Record<string, unknown>>;
    /** Full UUID, e.g. "Actor.{id}.Item.{id}" for owned items. */
    uuid?: string;
    /** Owning actor (for embedded/owned items). */
    actor?: FoundryActor | null;
    /** Parent document (the owning actor for owned items). */
    parent?: FoundryActor | null;
}

declare interface FoundryActor {
    id: string;
    /**
     * Full UUID, e.g.
     *  - "Actor.{id}" for world actors
     *  - "Scene.{sceneId}.Token.{tokenId}.Actor.{id}" for token-synthetic actors
     */
    uuid: string;
    name: string;
    type?: string;
    img?: string;
    ownership: Record<string, number>;
    flags?: Record<string, Record<string, unknown>>;
    items?: {
        contents: FoundryItem[];
        /** Look up a single item by id */
        get(id: string): FoundryItem | null;
    };
    effects?: { contents: FoundryItemEffect[] };
    update(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<void>;
    /**
     * Create embedded child documents (e.g. ActiveEffect) on this actor.
     * `toChat: true` triggers the T20 status notification card in chat.
     */
    createEmbeddedDocuments(
        type: string,
        data: Record<string, unknown>[],
        options?: Record<string, unknown>,
    ): Promise<unknown[]>;
    /** Delete embedded child documents (e.g. ActiveEffect) by id. */
    deleteEmbeddedDocuments(type: string, ids: string[], options?: Record<string, unknown>): Promise<unknown[]>;
    /**
     * Toggle a status effect on the actor.
     * Pass `{ active: true }` to force-enable without toggling off.
     */
    toggleStatusEffect(
        statusId: string,
        opts?: { active?: boolean; overlay?: boolean },
    ): Promise<void>;
    system?: {
        pericias?: Record<string, {
            total?: number; label?: string; value?: number;
            outros?: number; condi?: number; atributo?: string;
        }>;
        atributos?: Record<string, { value?: number }>;
        nivel?: { value?: number };
        attributes?: {
            pm?:     { value?: number; max?: number; temp?: number };
            pv?:     { value?: number; max?: number; temp?: number };
            defesa?: { value?: number; base?: number };
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
}

declare interface SettingConfig {
    name: string;
    hint?: string;
    scope: "world" | "client";
    config: boolean;
    type: BooleanConstructor | StringConstructor | NumberConstructor;
    default: unknown;
    onChange?: (value: unknown) => void;
}

// ── Chat message ─────────────────────────────────────────────────────────────

declare class ChatMessage {
    id: string;
    flavor: string;
    content: string;
    speaker: { actor?: string; alias?: string };
    rolls: Roll[];
    isRoll: boolean;
    flags: Record<string, Record<string, unknown>>;
    user: string | { id: string };
    /** Foundry v13 alias for user */
    author?: { id: string };

    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<this>;
    unsetFlag(scope: string, key: string): Promise<this>;
    updateSource(data: Record<string, unknown>): void;
    update(data: Record<string, unknown>): Promise<this>;
    toObject(): Record<string, unknown>;

    static create(data: Record<string, unknown>): Promise<ChatMessage | undefined>;
    static getSpeaker(options?: { actor?: FoundryActor | null; token?: FoundryToken }): Record<string, unknown>;
}

// ── Journal ──────────────────────────────────────────────────────────────────

declare interface JournalEntryPage {
    id: string;
    name: string;
    type: string;
    text?: { content?: string; format?: number };
    flags?: Record<string, Record<string, unknown>>;
    update(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

declare class JournalEntry {
    id: string;
    name: string;
    pages: {
        contents: JournalEntryPage[];
        get(id: string): JournalEntryPage | undefined;
    };
    flags?: Record<string, Record<string, unknown>>;
    createEmbeddedDocuments(
        type: string,
        data: Record<string, unknown>[],
        options?: Record<string, unknown>,
    ): Promise<unknown[]>;
    static create(data: Record<string, unknown>): Promise<JournalEntry | undefined>;
}

// ── Foundry v13 ApplicationV2 / DialogV2 ─────────────────────────────────────

declare namespace foundry {
    namespace applications {
        namespace api {
            interface ApplicationPosition {
                width?: number;
                height?: number | "auto";
                top?: number;
                left?: number;
                scale?: number;
                zIndex?: number;
            }

            interface ApplicationConfiguration {
                id?: string;
                classes?: string[];
                tag?: string;
                window?: {
                    title?: string;
                    icon?: string;
                    frame?: boolean;
                    positioned?: boolean;
                    resizable?: boolean;
                    minimizable?: boolean;
                };
                position?: ApplicationPosition;
                actions?: Record<string, unknown>;
            }

            interface DialogV2Button {
                /** "submit" closes the dialog and resolves the Promise; "button" keeps it open. */
                type?: "submit" | "button" | "reset";
                /** Unique action string; becomes the Promise resolution value for submit buttons. */
                action: string;
                label: string;
                icon?: string;
                class?: string;
                /** Mark this button as the default (triggered on Enter). */
                default?: boolean;
                /** Called when the button is activated. Return value resolves the wait() Promise. */
                callback?: (
                    event: Event,
                    button: HTMLButtonElement,
                    dialog: DialogV2,
                ) => unknown;
            }

            interface DialogV2WaitConfig extends Partial<ApplicationConfiguration> {
                content?: string;
                buttons?: DialogV2Button[];
                /** Called after the dialog is rendered; use dialog.element for DOM access. */
                render?: (event: Event, dialog: DialogV2) => void;
                /** When true, closing without a button rejects the Promise. Default: true. */
                rejectClose?: boolean;
                close?: (event: Event, dialog: DialogV2) => void;
                modal?: boolean;
            }

            class ApplicationV2 {
                get element(): HTMLElement;
                render(options?: { force?: boolean }): Promise<ApplicationV2>;
                close(options?: { force?: boolean }): Promise<void>;
            }

            class DialogV2 extends ApplicationV2 {
                /** Open a dialog and await the user's button choice. Resolves with the action string. */
                static wait(config: DialogV2WaitConfig): Promise<string | null>;
                /** Open a single-prompt dialog. */
                static prompt(config: Partial<ApplicationConfiguration> & {
                    content?: string;
                    label?: string;
                    type?: string;
                    callback?: (event: Event, button: HTMLButtonElement, dialog: DialogV2) => unknown;
                    render?: (event: Event, dialog: DialogV2) => void;
                    rejectClose?: boolean;
                }): Promise<unknown>;
                /** Open a yes/no confirmation dialog. Resolves with true (yes) or false (no). */
                static confirm(config: Partial<ApplicationConfiguration> & {
                    content?: string;
                    yes?: Partial<DialogV2Button> & {
                        callback?: (event: Event, button: HTMLButtonElement, dialog: DialogV2) => unknown;
                    };
                    no?: Partial<DialogV2Button>;
                    rejectClose?: boolean;
                }): Promise<boolean>;
            }
        }
    }
}

// ── Dialog (legacy) ───────────────────────────────────────────────────────────

declare interface DialogButtonConfig {
    icon?: string;
    label: string;
    callback?: ($html: JQuery) => void | Promise<void>;
}

declare interface DialogData {
    title: string;
    content: string;
    buttons?: Record<string, DialogButtonConfig>;
    default?: string;
    render?: ($html: JQuery) => void;
    close?: () => void;
}

declare interface DialogOptions {
    classes?: string[];
    width?: number;
    height?: number | string;
    id?: string;
    resizable?: boolean;
}

declare class Dialog {
    constructor(data: DialogData, options?: DialogOptions);
    render(force: boolean): this;
    close(): Promise<void>;
}

// ── Utility ──────────────────────────────────────────────────────────────────

declare function mergeObject<T extends object, U extends object>(original: T, other: U): T & U;
declare function randomID(length?: number): string;
/** Synchronously resolve a document by its UUID (Foundry v11+) */
declare function fromUuidSync(uuid: string): FoundryActor | null;

// ── Roll ─────────────────────────────────────────────────────────────────────

declare class Roll {
    constructor(formula: string, data?: Record<string, unknown>, options?: Record<string, unknown>);
    formula: string;
    total: number | null;
    terms: RollTerm[];
    dice: DiceTerm[];
    /** Arbitrary options stored on the roll — T20 uses `options.type: "attack" | "damage"` */
    options: Record<string, unknown>;
    evaluate(options?: { async?: boolean; maximize?: boolean; minimize?: boolean }): Promise<Roll>;
    /** Returns rendered HTML for this roll (includes dice visuals and total) */
    render(options?: { flavor?: string; template?: string; isPrivate?: boolean }): Promise<string>;
    toJSON(): Record<string, unknown>;
    static fromData(data: Record<string, unknown>): Roll;
}

declare interface RollTerm {
    expression: string;
}

declare interface DiceTerm extends RollTerm {
    faces: number;
    number?: number;
    total?: number;
    results: Array<{ result: number; active: boolean }>;
}

// ── UI ───────────────────────────────────────────────────────────────────────

/** A MeasuredTemplate document (circle/cone/etc) embedded in a scene. */
declare interface MeasuredTemplateDocument {
    id: string;
    uuid: string;
    x: number;
    y: number;
    distance: number;
    direction?: number;
    angle?: number;
    flags?: Record<string, Record<string, unknown>>;
    /** Author/owner — shape varies across versions. */
    user?: string | { id?: string };
    author?: { id?: string };
    update(data: Record<string, unknown>): Promise<unknown>;
    delete(): Promise<unknown>;
}

declare interface FoundryScene {
    name?: string;
    id?: string;
    grid?: { size?: number; distance?: number };
    templates?: {
        contents?: MeasuredTemplateDocument[];
        get(id: string): MeasuredTemplateDocument | undefined;
    };
    createEmbeddedDocuments(type: string, data: unknown[], opts?: Record<string, unknown>): Promise<unknown[]>;
    deleteEmbeddedDocuments(type: string, ids: string[]): Promise<unknown>;
}

declare const canvas: {
    scene?: FoundryScene;
    tokens?: {
        placeables?: FoundryToken[];
        controlled?: FoundryToken[];
        get(id: string): FoundryToken | undefined;
    };
    /** PIXI app/stage — used for canvas-click prompts. Loosely typed on purpose. */
    app?: { stage?: unknown };
    stage?: unknown;
} | undefined;

declare const ui: {
    notifications: {
        info(msg: string, options?: { permanent?: boolean }): void;
        warn(msg: string, options?: { permanent?: boolean }): void;
        error(msg: string, options?: { permanent?: boolean }): void;
    };
};

// ── socketlib (required peer) ─────────────────────────────────────────────────

declare interface SocketlibSocket {
    /** Register a named handler that other clients can invoke. */
    register(name: string, handler: (...args: unknown[]) => unknown): void;
    /** Run `name` on one active GM. Resolves with the handler's return value. */
    executeAsGM<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
    /** Run `name` on a specific user. Resolves with the handler's return value. */
    executeAsUser<T = unknown>(name: string, userId: string, ...args: unknown[]): Promise<T>;
    /** Broadcast `name` to all connected clients (including self). */
    executeForEveryone(name: string, ...args: unknown[]): Promise<void>;
    /** Broadcast `name` to all clients except self. */
    executeForOthers(name: string, ...args: unknown[]): Promise<void>;
    /** Run `name` on every connected GM (including self if GM). */
    executeForAllGMs(name: string, ...args: unknown[]): Promise<void>;
    /** Run `name` on every connected GM except self. */
    executeForOtherGMs(name: string, ...args: unknown[]): Promise<void>;
    /** Run `name` on a specified list of users. */
    executeForUsers(name: string, recipients: string[], ...args: unknown[]): Promise<void>;
}

declare const socketlib:
    | {
          registerModule(moduleId: string): SocketlibSocket;
          registerSystem(systemId: string): SocketlibSocket;
      }
    | undefined;

// ── Roll metadata (used by the cinematic overlay) ─────────────────────────────

/** Metadata returned by the T20 parser so the overlay knows what to display */
declare interface RollMeta {
    /** Primary label shown in the overlay (e.g. "Fortitude", "Teste de Percepção") */
    category: string;
    /** Optional secondary label (e.g. skill name within the category) */
    subcategory?: string;
    /** Difficulty class / target number, if known */
    target?: number;
    /** "advantage" | "disadvantage" | undefined */
    rollType?: string;
}

// ── Foundry CONFIG (partial — only what this module uses) ────────────────────

declare const CONFIG: {
    statusEffects: Array<{
        id: string;
        name: string;
        icon?: string;
        /** Status IDs this effect applies (usually just [id]) */
        statuses?: string[];
        duration?: { rounds?: number };
        flags?: Record<string, Record<string, unknown>>;
    }>;
    [key: string]: unknown;
};

// ── jQuery (provided by Foundry) ──────────────────────────────────────────────
declare const $: JQueryStatic;
declare type JQuery<T extends Node = HTMLElement> = import("jquery").JQuery<T>;
declare type JQueryStatic = import("jquery").JQueryStatic;
