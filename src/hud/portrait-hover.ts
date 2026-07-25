/**
 * Integração opcional com o módulo "Image Hover" (id `image-hover`, ativo
 * neste mundo): reaproveita o preview de arte que ele já mostra ao passar o
 * mouse num TOKEN no canvas (posicionado num canto da tela — configurável
 * pelo GM nas settings do módulo) para o retrato do HUD, dando a mesma
 * experiência visual.
 *
 * Integração OPCIONAL — sem o módulo instalado, o hover não faz nada (feature
 * cosmética; mesmo padrão de integração opcional já usado p/ Arms Reach).
 * `canvas.hud.imageHover` só existe com o módulo ativo; chamamos `.bind()`
 * diretamente (como o próprio módulo faz no seu `showToAll()`) — pular
 * `showArtworkRequirements()` porque ele exige `token === canvas.tokens.hover`
 * (comparação de referência com o token de fato sob o cursor no canvas, que
 * nunca é o caso aqui).
 */

interface ImageHoverHudLike {
    bind(token: unknown): unknown;
    close(): unknown;
}

function getImageHoverHud(): ImageHoverHudLike | null {
    const mod = game.modules?.get("image-hover") as { active?: boolean } | undefined;
    if (!mod?.active) return null;
    const hud = (canvas as unknown as { hud?: { imageHover?: ImageHoverHudLike } } | null)?.hud?.imageHover;
    return hud ?? null;
}

/**
 * Shim mínimo do formato "token" que o Image Hover lê: `actor.img`,
 * `actor.prototypeToken.randomImg`, `document.actorLink`,
 * `document.texture.src` (fallback se não houver retrato) e
 * `document.getFlag("image-hover","specificArt")` (sempre vazio no shim —
 * a config por-token do GM não se aplica a um "token" sintético).
 */
function buildTokenShim(actor: FoundryActor): unknown {
    const proto = (actor as unknown as { prototypeToken?: { randomImg?: boolean; texture?: { src?: string } } }).prototypeToken;
    return {
        actor,
        document: {
            actorLink: true,
            texture: { src: proto?.texture?.src || actor.img },
            getFlag: () => undefined,
        },
    };
}

/** Ao dar hover no retrato: mostra o preview do Image Hover (se o módulo estiver ativo). */
export function showPortraitHoverPreview(actor: FoundryActor | null): void {
    if (!actor) return;
    const hud = getImageHoverHud();
    if (!hud) return;
    // Se o ator ativo É o token controlado, usa o token REAL (respeita specificArt/actorLink de verdade).
    const controlled = canvas?.tokens?.controlled?.[0];
    const bound = controlled?.actor?.id === actor.id ? controlled : buildTokenShim(actor);
    try { hud.bind(bound); } catch { /* cosmético — nunca quebra a HUD */ }
}

/** Ao tirar o mouse do retrato: fecha o preview. */
export function hidePortraitHoverPreview(): void {
    const hud = getImageHoverHud();
    if (!hud) return;
    try { hud.close(); } catch { /* noop */ }
}
