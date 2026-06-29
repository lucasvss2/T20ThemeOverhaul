/**
 * t20-theme-overhaul — main entry point
 *
 * T20-style cinematic dice overlay + chat / sheet redesign for the Tormenta20
 * system. Intercepts T20 roll messages (perícias, resistências, ataques,
 * iniciativa) and displays a full-screen animated overlay with the roll
 * result. Cross-client coordination uses socketlib.
 */

import { MODULE_ID, SYSTEM_ID } from "./constants";
import { setupTheme } from "./theme/index";
import { setupIntegration } from "./integration/index";
import { setupDialogStyling } from "./dialogs/t20-dialog";
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
import { setupSheetLog } from "./sheet-log/index";
import { setupAnimPresets, captureActorAnimations } from "./anim-presets/index";
import { setupHerancaDraconica } from "./heranca-draconica/index";
import { setupTradicaoPerdida } from "./tradicao-perdida/index";
import { setupBaforada } from "./baforada/index";
import { setupVelocidade } from "./velocidade/index";
import { setupMenteDivina } from "./mente-divina/index";
import { setupMiasma } from "./miasma/index";
import { patchT20SpellCDFormula } from "./t20-fixes/spell-cd-formula";
import { patchT20WeaponUpgradeLabels } from "./t20-fixes/weapon-upgrade-always-active";
import { setupOnUseForeignDieDano } from "./t20-fixes/onuse-foreign-die-dano";
import { setupEstiloDisparoDano } from "./t20-fixes/estilo-disparo-dano";
import { setupAcuidadeArma } from "./t20-fixes/acuidade-arma";
import { setupManoplaUpgrades } from "./t20-fixes/manopla-upgrades";
import { setupAdamante } from "./adamante/index";
import { setupCruzado, grantAlmaGuerreira, diagnoseCruzado } from "./cruzado/index";
import { setupProeficiencia } from "./t20-fixes/proficiencia";
import { setupTokenVisibility } from "./token-visibility";
import { setupReactions } from "./reactions";
import { setupCounterspell } from "./counterspell";
import { setupDurationManager } from "./duration-manager/index";
import { setupEmChamas } from "./conditions/em-chamas";
// Side-effect import: src/socket/index.ts registers the `socketlib.ready`
// listener at top-level. This MUST happen at module load (before Foundry's
// `init` hook fires) because socketlib emits the hook from its own `init`
// listener; depending on module load order, registering the listener inside
// our own `init` would be too late and the hook would never call us.
import "./socket/index";
import { log, warn } from "./utils/logging";

// Penalidade por não-proficiência (arma −5 / armadura em perícias For-Des).
// Registrada no top-level para poder instalar os patches no hook `init` — ANTES
// da primeira preparação dos atores (ver nota em t20-fixes/proficiencia.ts).
setupProeficiencia();

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
    setupHerancaDraconica();      // Dracônico: Herança (RD elemental + tipo monstro) + Escamas (+2 Def, RD→10)
    setupTradicaoPerdida();       // Tradição Perdida: PM pelo atributo escolhido (+ Aprimorada: CD de conjuração)
    setupBaforada();              // Baforada Dracônica: sopro elemental (gasta PM → Nd10 + Reflexos CD Con)
    setupOnUseForeignDieDano();   // corrige bônus de dano on-use com face de dado diferente da base
    setupEstiloDisparoDano();     // Estilo de Disparo aplica @des em armas de disparo (ex: Arco de Guerra)
    setupAcuidadeArma();          // Acuidade com Arma aplica @des no dano de armas leves/arremesso
    setupManoplaUpgrades();       // Manopla exibe aprimoramentos de arma (weaponUpgrades) na aba enhancements
    setupAdamante();              // Material Adamante: arma (+1 passo de dano), armadura/escudo (RD), esotérico (reroll 1s)
    setupCruzado();               // Classe Cruzado: Presente dos Deuses (checkbox), Alma Guerreira, Oração Marcial, Guerreiro Santificado
    setupSkillsMenu();   // antes de area-spells: estes registram ações no menu
    setupAreaSpells();
    setupVelocidade();            // Velocidade: sustain automático (1 PM/turno) + cancelar via skills-menu
    setupMenteDivina();           // Mente Divina: alvo escolhe o atributo via pop-up (aprimoramentos cobertos)
    setupMiasma();                // Miasma Mefítico: trevas (tipoDano) + Truque (pó de ônix, morte/imunidade/+2 CD)
    setupSheetRedesign();
    setupEncounterRoller();   // botão GM na toolbar: rolar encontro aleatório
    setupTreasure();          // botões GM (toolbar + ficha de ameaça): gerar tesouro + consulta
    setupSheetLog();          // GM: log de auditoria de alterações de ficha (Journal)
    setupTokenVisibility();   // GM: escolher por checklist quais jogadores veem cada token
    setupReactions();         // Reações de defesa: bloquear ataque elevando a Defesa (Armadura Arcana etc.)
    setupCounterspell();      // Contramágica: janela GM no cast → Misticismo vs CD → anula a magia
    setupDurationManager();   // Gerencia duração (rodadas/cena/dia/sustentada) de buffs e condições em combate
    setupEmChamas();          // Condição Em Chamas: 1d6 de fogo no início do turno da criatura
    setupAnimPresets();       // Memória de animações de skills (Automated Animations): oferece aplicar ao adicionar

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
    // Uso: `game.modules.get("t20-theme-overhaul").api.diagnoseAuras()`
    const mod = game.modules.get(MODULE_ID) as
        | (FoundryModule & { api?: Record<string, unknown> })
        | undefined;
    if (mod) {
        (mod as unknown as { api: Record<string, unknown> }).api = {
            diagnoseAuras,
            captureActorAnimations,
            cruzadoGrantAlmaGuerreira: grantAlmaGuerreira,
            diagnoseCruzado,
        };
    }
    log("Pronto — overlay cinemático de dados Tormenta20 ativo.");
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getModuleVersion(): string {
    return game.modules.get(MODULE_ID)?.version ?? "unknown";
}
