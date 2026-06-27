/**
 * Presets de animação EMPACOTADOS no módulo (camada "bundled").
 *
 * Mapa `nome normalizado da magia/poder → AnimPreset`. É a base distribuída a
 * todos; o mundo pode sobrescrever/adicionar via setting `animPresets`
 * (`world override` — ver anim-presets/index.ts). World vence bundled no merge.
 *
 * Começa vazio: a captura inicial (magias do Victor) popula o override do mundo.
 * Conforme curarmos presets estáveis, eles migram pra cá pra serem distribuídos.
 */

export interface AnimPreset {
    /** Nome de exibição original (ex.: "Aura Sagrada"). */
    displayName: string;
    /** "magia" | "poder". */
    itemType: string;
    /** Módulos necessários pra animação rodar (sequencer, autoanimations, JB2A…). */
    requiredModules: string[];
    /** Config completa de Automated Animations (`item.flags.autoanimations`). */
    autoanimations: Record<string, unknown>;
}

export interface AnimPresetLibrary {
    version: number;
    presets: Record<string, AnimPreset>;
}

export const BUNDLED_ANIM_PRESETS: AnimPresetLibrary = {
    version: 1,
    presets: {},
};
