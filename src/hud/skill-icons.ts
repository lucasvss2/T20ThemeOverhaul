/**
 * Ícones de perícia (line-icons, estilo Lucide desenhado à mão) — portados 1:1
 * do projeto Claude Design "Barra de Skills Foundry VTT" (`skill-icons.js`).
 * Cada entrada mapeia pelo LABEL PT-BR exato da perícia T20 (não pela key).
 */
export interface SkillIcon { name: string; inner: string }

export const SKILL_ICONS: SkillIcon[] = [
    { name: "Acrobacia", inner: '<path d="M20 12a8 8 0 1 0-2.34 5.66"/><path d="M20 6v6h-6"/>' },
    { name: "Adestramento", inner: '<circle cx="8" cy="7" r="1.5"/><circle cx="12" cy="5.3" r="1.5"/><circle cx="16" cy="7" r="1.5"/><ellipse cx="12" cy="13.2" rx="4.2" ry="3.4"/>' },
    { name: "Atletismo", inner: '<rect x="2" y="9" width="3" height="6" rx="1"/><rect x="19" y="9" width="3" height="6" rx="1"/><rect x="5" y="7" width="2" height="10" rx="1"/><rect x="17" y="7" width="2" height="10" rx="1"/><line x1="7" y1="12" x2="17" y2="12"/>' },
    { name: "Atuação", inner: '<path d="M4 9c0-3 3-5 8-5s8 2 8 5-2 9-8 9-8-6-8-9Z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><path d="M9 14q3 2 6 0"/>' },
    { name: "Cavalgar", inner: '<path d="M7 20v-7a5 5 0 0 1 10 0v7"/><circle cx="7" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>' },
    { name: "Conhecimento", inner: '<path d="M12 6c-2-1.5-5-2-9-1v13c4-1 7-.5 9 1 2-1.5 5-2 9-1V5c-4-1-7-.5-9 1Z"/><line x1="12" y1="6" x2="12" y2="19"/>' },
    { name: "Cura", inner: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>' },
    { name: "Diplomacia", inner: '<path d="M3 12l4-3 3 2 3-2 3 2 4-3"/><path d="M9 11l2 4"/><path d="M15 11l-2 4"/>' },
    { name: "Enganação", inner: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><line x1="5" y1="19" x2="19" y2="5"/>' },
    { name: "Fortitude", inner: '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z"/>' },
    { name: "Furtividade", inner: '<ellipse cx="8" cy="8" rx="2.2" ry="3"/><ellipse cx="15" cy="15" rx="2.2" ry="3"/><circle cx="8" cy="3.6" r="0.8"/><circle cx="15" cy="10.6" r="0.8"/>' },
    { name: "Guerra", inner: '<line x1="4" y1="20" x2="18" y2="4"/><line x1="20" y1="20" x2="6" y2="4"/><path d="M4 20l3-1M20 20l-3-1"/>' },
    { name: "Iniciativa", inner: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>' },
    { name: "Intimidação", inner: '<path d="M8 12V7a2 2 0 0 1 4 0v4M12 11V6a2 2 0 0 1 4 0v5M16 12V8a2 2 0 0 1 4 0v6c0 4-3 7-7 7s-7-2-7-6v-2l-2-2a1.4 1.4 0 0 1 2-2l2 2"/>' },
    { name: "Intuição", inner: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>' },
    { name: "Investigação", inner: '<circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="20" y2="20"/>' },
    { name: "Jogatina", inner: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1"/><circle cx="15" cy="9" r="1.1"/><circle cx="9" cy="15" r="1.1"/><circle cx="15" cy="15" r="1.1"/><circle cx="12" cy="12" r="1.1"/>' },
    { name: "Ladinagem", inner: '<circle cx="7" cy="12" r="4"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="17" y1="12" x2="17" y2="16"/><line x1="20" y1="12" x2="20" y2="15"/>' },
    { name: "Luta", inner: '<line x1="5" y1="19" x2="17" y2="7"/><path d="M14 4l6 6"/><path d="M13 8l3 3"/>' },
    { name: "Misticismo", inner: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z"/>' },
    { name: "Nobreza", inner: '<path d="M4 18h16l-1-9-4 4-3-6-3 6-4-4-1 9Z"/>' },
    { name: "Ofício", inner: '<path d="M13 7l4-4 4 4-4 4-4-4Z"/><line x1="13" y1="11" x2="5" y2="19"/><path d="M3 21l2-2 2 2-2 2Z"/>' },
    { name: "Percepção", inner: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>' },
    { name: "Pilotagem", inner: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/>' },
    { name: "Pontaria", inner: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>' },
    { name: "Reflexos", inner: '<path d="M3 12h4l2-6 4 12 2-6h6"/>' },
    { name: "Religião", inner: '<circle cx="12" cy="8" r="3.4"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="8" y1="17" x2="16" y2="17"/>' },
    { name: "Sobrevivência", inner: '<path d="M3 19h18L12 5 3 19Z"/><line x1="12" y1="5" x2="12" y2="19"/>' },
    { name: "Vontade", inner: '<path d="M12 3s-5 5-5 10a5 5 0 0 0 10 0c0-2-1-3-1-3s0 2-1.5 2.5C15 10 12 8 12 3Z"/>' },
];

/** Constrói um data URI de SVG a partir do miolo (paths/shapes) de um ícone. */
export function iconDataUri(inner: string, color = "#c9a76a"): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
}

const BY_NAME = new Map(SKILL_ICONS.map(s => [s.name, s]));

/** Ícone por label PT-BR exato; cai no ícone genérico "Ofício" se não encontrado. */
export function iconForLabel(label: string, color?: string): string {
    const icon = BY_NAME.get(label) ?? BY_NAME.get("Ofício")!;
    return iconDataUri(icon.inner, color);
}
