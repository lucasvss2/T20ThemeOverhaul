/**
 * Identificação de poções/pergaminhos não identificados.
 *
 * Regra citada pelo usuário: "Identificar Magia (CD 15 + Custo em PM da
 * Magia)" — rola Misticismo (mesma perícia usada em Contramágica). Quem tem
 * acesso passivo à magia "Visão Mística" (a magia em si, ou um poder/traço
 * que deixa o personagem permanentemente sob seu efeito básico — achado ao
 * vivo nos compêndios: "Sentidos Místicos" e "Visão Feérica", ambos com a
 * cláusula "Você está sempre sob o efeito básico da magia Visão Mística")
 * identifica automaticamente, sem teste.
 */

import { computeSkillTotal } from "@/hidden-test/skills";
import { normalizeCondName } from "@/spell-resistance/index";
import { warn } from "@/utils/logging";

/** Poderes/magias com acesso PASSIVO e PERMANENTE à Visão Mística (colhido ao vivo dos compêndios). */
const VISAO_MISTICA_NAMES = ["visao mistica", "sentidos misticos", "visao feerica"];

/** CD do teste de identificação: 15 + custo em PM da magia contida. Puro. */
export function identifyCD(custoPM: number): number {
    return 15 + (Number(custoPM) || 0);
}

interface ItemLike { name?: string }
interface ActorLike { items?: { contents?: ItemLike[] } | ItemLike[] }

function actorItems(actor: ActorLike): ItemLike[] {
    return Array.isArray(actor.items) ? actor.items : (actor.items?.contents ?? []);
}

/** O ator tem acesso passivo à Visão Mística (magia ou poder equivalente)? */
export function actorHasVisaoMistica(actor: ActorLike | null | undefined): boolean {
    if (!actor) return false;
    return actorItems(actor).some((it) => VISAO_MISTICA_NAMES.includes(normalizeCondName(it.name ?? "")));
}

// ── Animação opcional (Sequencer + JB2A, se instalados) ────────────────────────

interface TokenLike { document?: { getFlag?: (s: string, k: string) => unknown; x?: number; y?: number } }

/** Toca um efeito curto de "revelação" no token do ator, se Sequencer+JB2A estiverem instalados. No-op caso contrário. */
export async function playIdentifyAnimation(token: TokenLike | null | undefined): Promise<void> {
    if (!token) return;
    try {
        const seq = (window as unknown as { Sequencer?: { EffectManager?: unknown } }).Sequencer;
        const jb2aActive = game.modules?.get("jb2a_patreon")?.active || game.modules?.get("JB2A_DnD5e")?.active;
        if (!seq || !jb2aActive) return;
        interface SequenceEffectBuilder {
            file: (f: string) => SequenceEffectBuilder;
            atLocation: (t: unknown) => SequenceEffectBuilder;
            scale: (n: number) => SequenceEffectBuilder;
            duration: (n: number) => SequenceEffectBuilder;
            fadeOut: (n: number) => SequenceEffectBuilder;
            play: () => Promise<unknown>;
        }
        interface SequenceBuilder { effect: () => SequenceEffectBuilder }
        const Sequence = (window as unknown as { Sequence?: new () => SequenceBuilder }).Sequence;
        if (!Sequence) return;
        await new Sequence()
            .effect()
            .file("jb2a.magic_signs.rune.evocation.intro.blue")
            .atLocation(token)
            .scale(0.6)
            .duration(1500)
            .fadeOut(400)
            .play();
    } catch (e) { warn("pocoes-pergaminhos: animação de identificação falhou (opcional, ignorando):", e); }
}

// ── Dialog de identificação ─────────────────────────────────────────────────────

export interface IdentifyOutcome { identified: boolean; roll?: number; total?: number; cd?: number; auto?: boolean }

function escHtml(s: string): string {
    return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Abre o modal de identificação. Resolve com o resultado (ou {identified:false} se cancelado). */
export function openIdentifyDialog(itemLabel: string, actor: ActorLike & { name?: string }, custoPM: number): Promise<IdentifyOutcome> {
    const cd = identifyCD(custoPM);
    const auto = actorHasVisaoMistica(actor);
    return new Promise((resolve) => {
        const buttons: Record<string, { label: string; icon?: string; callback: () => void }> = {
            test: {
                icon: '<i class="fas fa-dice-d20"></i>',
                label: "Tentar identificar (Misticismo)",
                callback: () => {
                    const mist = computeSkillTotal(actor as never, "mist");
                    const roll = 1 + Math.floor(Math.random() * 20);
                    const total = roll + mist;
                    resolve({ identified: total >= cd, roll, total, cd, auto: false });
                },
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar", callback: () => resolve({ identified: false }) },
        };
        if (auto) {
            buttons.auto = {
                icon: '<i class="fas fa-eye"></i>',
                label: "Identificar automaticamente (Visão Mística)",
                callback: () => resolve({ identified: true, auto: true, cd }),
            };
        }
        new Dialog({
            title: "Identificar item mágico",
            content: `<p><strong>${escHtml(itemLabel)}</strong> não foi identificado.</p>
                <p>Teste de Misticismo (CD ${cd}) para identificar — reflexos e resquícios da magia usada em sua fabricação.</p>
                ${auto ? `<p style="color:#c8a96e"><i class="fas fa-eye"></i> ${escHtml(actor.name ?? "Você")} enxerga auras mágicas automaticamente (Visão Mística).</p>` : ""}`,
            buttons,
            default: auto ? "auto" : "test",
            close: () => resolve({ identified: false }),
        }, { classes: ["dialog", "t20-dialog"] }).render(true);
    });
}
