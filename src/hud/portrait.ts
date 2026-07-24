const FALLBACK_PORTRAIT = "icons/svg/mystery-man.svg";

/** Retrato do ator ativo, com fallback ao ícone genérico do Foundry. */
export function portraitUrlFor(actor: FoundryActor | null): string {
    return actor?.img || FALLBACK_PORTRAIT;
}
