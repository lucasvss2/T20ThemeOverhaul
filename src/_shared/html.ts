/**
 * Minimal HTML-escaping helper for chat-card / dialog string interpolation.
 * Escapes the three characters that can break out of text context (& < >).
 *
 * Extracted verbatim from aura-sagrada.ts / egide-sagrada.ts (and the inline
 * lambda in bola-de-fogo.ts) during Phase 1 helper consolidation.
 */
export function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
