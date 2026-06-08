/**
 * aeris-bg3-rolls-t20 — main entry point
 *
 * BG3-style cinematic dice overlay + chat / sheet redesign for the Tormenta20
 * system. Intercepts T20 roll messages (perícias, resistências, ataques,
 * iniciativa) and displays a full-screen animated overlay with the roll
 * result. Cross-client coordination uses socketlib.
 */

import { MODULE_ID, SYSTEM_ID } from "./constants";
import { setupTheme } from "./theme/index";
import { setupIntegration } from "./integration/index";
import { setupDialogStyling } from "./dialogs/bg3-dialog";
import { setupChatStyling } from "./chat/chatStyles";
import { setupHiddenTest } from "./hidden-test/index";
import { setupAutoDamage } from "./auto-damage/index";
import { setupSpellResistance } from "./spell-resistance/index";
import { setupBuffApply } from "./buff-apply/index";
import { setupWeaponAETransfer } from "./weapon-ae-transfer/index";
import { setupMedalhaoAfiado } from "./medalhao-afiado/index";
import { setupKiaiDivino } from "./kiai-divino/index";
import { setupGritoKiai } from "./grito-kiai/index";
import { setupDisparoSublime } from "./disparo-sublime/index";
import { setupDeformidade } from "./deformidade/index";
import { setupBriga } from "./briga/index";
import { setupAreaSpells } from "./area-spells/index";
import { diagnoseAuras } from "./area-spells/aura-sagrada";
import { setupSkillsMenu } from "./ui/skills-menu";
import { setupSheetRedesign } from "./sheet/index";
import { setupEncounterRoller } from "./encounter-roller/index";
import { setupTreasure } from "./treasure/index";
import { patchT20SpellCDFormula } from "./t20-fixes/spell-cd-formula";
import { patchT20WeaponUpgradeLabels } from "./t20-fixes/weapon-upgrade-always-active";
import { setupOnUseForeignDieDano } from "./t20-fixes/onuse-foreign-die-dano";
import { setupEstiloDisparoDano } from "./t20-fixes/estilo-disparo-dano";
import { setupAcuidadeArma } from "./t20-fixes/acuidade-arma";
import { setupManoplaUpgrades } from "./t20-fixes/manopla-upgrades";
// Side-effect import: src/socket/index.ts registers the `socketlib.ready`
// listener at top-level. This MUST happen at module load (before Foundry's
// `init` hook fires) because socketlib emits the hook from its own `init`
// listener; depending on module load order, registering the listener inside
// our own `init` would be too late and the hook would never call us.
import "./socket/index";
import { log, warn } from "./utils/logging";

// ── Init: sanity checks ───────────────────────────────────────────────────────

Hooks.once("init", () => {
    log(`Initializing v${getModuleVersion()}`);

    if (game.system.id !== SYSTEM_ID) {
        warn(
            `This module is designed for the "${SYSTEM_ID}" system, ` +
                `but the active system is "${game.system.id}". ` +
                `The module will remain inactive.`,
        );
        return;
    }
});

// ── Setup: wire up roll integration and dialog styling ────────────────────────

Hooks.once("setup", () => {
    if (game.system.id !== SYSTEM_ID) return;
    setupTheme();           // PRIMEIRO — tokens CSS disponíveis para os demais
    setupIntegration();
    setupDialogStyling();
    setupChatStyling();
    setupHiddenTest();
    setupAutoDamage();
    setupSpellResistance();
    setupBuffApply();
    setupWeaponAETransfer();
    setupMedalhaoAfiado();
    setupKiaiDivino();
    setupGritoKiai();
    setupDisparoSublime();        // Caçador: Percepção vs CD + crítico automático no ataque com arco
    setupDeformidade();           // Lefou: modal de escolha de perícias (+2) ao adicionar Deformidade
    setupBriga();                 // Lutador: escala o dano do ataque desarmado pela tabela de Briga
    setupOnUseForeignDieDano();   // corrige bônus de dano on-use com face de dado diferente da base
    setupEstiloDisparoDano();     // Estilo de Disparo aplica @des em armas de disparo (ex: Arco de Guerra)
    setupAcuidadeArma();          // Acuidade com Arma aplica @des no dano de armas leves/arremesso
    setupManoplaUpgrades();       // Manopla exibe aprimoramentos de arma (weaponUpgrades) na aba enhancements
    setupSkillsMenu();   // antes de area-spells: estes registram ações no menu
    setupAreaSpells();
    setupSheetRedesign();
    setupEncounterRoller();   // botão GM na toolbar: rolar encontro aleatório
    setupTreasure();          // botões GM (toolbar + ficha de ameaça): gerar tesouro + consulta

});

// ── Ready: expose diagnostic API + confirm everything loaded ──────────────────

Hooks.once("ready", () => {
    if (game.system.id !== SYSTEM_ID) return;
    // Patch global do T20: fórmula de CD de magia/consumível.
    // Tem que rodar no ready (depois de game.tormenta20 estar inicializado).
    patchT20SpellCDFormula();
    // Patch global do T20: labels de crítico (ficha) refletem AEs `upgrade`
    // (Precisa, Certeira, etc.). Não modifica system.criticoM — só labels.critico,
    // evitando dupla aplicação com o applyOnUseEffects que roda durante o roll.
    patchT20WeaponUpgradeLabels();

    // API de diagnóstico — útil quando algo parece quebrado em mesa.
    // Uso: `game.modules.get("aeris-bg3-rolls-t20").api.diagnoseAuras()`
    const mod = game.modules.get(MODULE_ID) as
        | (FoundryModule & { api?: Record<string, unknown> })
        | undefined;
    if (mod) {
        (mod as unknown as { api: Record<string, unknown> }).api = {
            diagnoseAuras,
        };
    }
    log("Pronto — overlay cinemático de dados Tormenta20 ativo.");
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getModuleVersion(): string {
    return game.modules.get(MODULE_ID)?.version ?? "unknown";
}
