/**
 * Integração opcional com o módulo de terceiros "Visual Active Effects" (VAE,
 * id `visual-active-effects`) — mesmo padrão de integração opcional já usado
 * em `portrait-hover.ts`/`pocoes-pergaminhos/identify.ts`: checa se está
 * instalado+ativo, no-op se não.
 *
 * Sem isso, o VAE mostra seu próprio painel flutuante (`#visual-active-effects`,
 * ancorado no canto da tela) com os Active Effects do ator — duplicando
 * exatamente os que já aparecem na nossa Barra de Buffs & Condições
 * (`hud/buffs.ts`, v1.109.0). Era um gap conhecido documentado no CLAUDE.md
 * ("coexistem, não colidem mais" — só resolvia sobreposição de z-index, não
 * a duplicação em si).
 *
 * Suprime (via classe CSS) só os itens do painel do VAE cujo Active Effect
 * JÁ passa no mesmo critério `isVisibleBuff` usado pra decidir a barra —
 * critério POR-EFFECT, não por-ator-ativo-da-HUD: um item some do VAE se o
 * PRÓPRIO effect seria mostrado em alguma barra nossa, independente de qual
 * ficha o VAE estiver exibindo no momento (cobre hover/seleção de qualquer
 * token, não só o "ator ativo" da nossa HUD).
 *
 * Reage via MutationObserver no próprio painel do VAE, não nos hooks da
 * nossa HUD — desacopla da ordem de execução entre os dois módulos. O VAE
 * recria o DOM do painel sempre que o efeito muda ou o token exibido muda,
 * então observar o painel é suficiente e correto em qualquer cenário.
 */
import { warn } from "@/utils/logging";
import { isVisibleBuff } from "./buffs";

const VAE_MODULE_ID = "visual-active-effects";
const VAE_PANEL_ID = "visual-active-effects";
const SUPPRESSED_CLASS = "t20-vae-suppressed";

type EffectDoc = Parameters<typeof isVisibleBuff>[0];

/** Puro/testável — decide se um item do painel do VAE deve ser escondido (uuid não resolvido = mantém visível). */
export function shouldHideVaeItem(effect: EffectDoc | null | undefined): boolean {
    return !!effect && isVisibleBuff(effect);
}

function resyncPanel(panel: HTMLElement): void {
    const items = panel.querySelectorAll<HTMLElement>(".effect-item[data-effect-uuid]");
    for (const item of items) {
        const uuid = item.dataset["effectUuid"];
        if (!uuid) continue;
        let hide = false;
        try {
            const effect = fromUuidSync(uuid) as unknown as EffectDoc | null;
            hide = shouldHideVaeItem(effect);
        } catch { /* uuid pode apontar pra um documento já removido — mantém visível */ }
        item.classList.toggle(SUPPRESSED_CLASS, hide);
    }
}

function watchPanel(panel: HTMLElement): void {
    resyncPanel(panel);
    const observer = new MutationObserver(() => resyncPanel(panel));
    observer.observe(panel, { childList: true, subtree: true });
}

export function setupVaeIntegration(): void {
    Hooks.once("ready", () => {
        try {
            const mod = game.modules?.get(VAE_MODULE_ID) as { active?: boolean } | undefined;
            if (!mod?.active) return;

            const existing = document.getElementById(VAE_PANEL_ID);
            if (existing) {
                watchPanel(existing);
                return;
            }
            // Painel ainda não renderizou (primeiro load) — observa #interface
            // até ele aparecer, depois passa a observar só o painel em si.
            const iface = document.getElementById("interface");
            if (!iface) return;
            const bootObserver = new MutationObserver(() => {
                const el = document.getElementById(VAE_PANEL_ID);
                if (el) {
                    bootObserver.disconnect();
                    watchPanel(el);
                }
            });
            bootObserver.observe(iface, { childList: true, subtree: true });
        } catch (e) {
            warn("hud/vae-sync: falha ao integrar com Visual Active Effects", e);
        }
    });
}
