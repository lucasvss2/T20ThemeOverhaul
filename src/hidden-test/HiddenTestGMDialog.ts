import { getSocket } from "@/socket";
import { SOCKET_HIDDEN_TEST_REQUEST } from "./index";
import { T20_SKILLS } from "./skills";
import type { HiddenTestRequest } from "./types";

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findTokenOwner(actor: FoundryActor): FoundryUser | undefined {
    const owners = Object.entries(actor.ownership ?? {})
        .filter(([, level]) => (level as number) >= 3)
        .map(([userId]) => userId);

    return (game.users?.contents ?? []).find(
        (u) => !u.isGM && u.active && owners.includes(u.id),
    );
}

export function openHiddenTestGMDialog(): void {
    if (!game.user?.isGM) return;

    const targets = game.user.targets;
    if (!targets?.size) {
        ui.notifications.warn("Selecione um ou mais tokens como alvo primeiro (tecla T).");
        return;
    }

    // Collect all valid targets that have an active player owner
    const validTargets: Array<{ actor: FoundryActor; user: FoundryUser }> = [];
    for (const token of targets) {
        const actor = token.actor;
        if (!actor) continue;
        const user = findTokenOwner(actor);
        if (!user) continue;
        validTargets.push({ actor, user });
    }

    if (validTargets.length === 0) {
        ui.notifications.warn("Nenhum token selecionado tem um jogador ativo associado.");
        return;
    }

    const skillOptions = T20_SKILLS.map(
        (s) => `<option value="${esc(s.key)}|${esc(s.label)}">${esc(s.label)}</option>`,
    ).join("");

    const targetsHtml = validTargets.map((t) => `
        <div class="htg-target-check-row">
            <input type="checkbox" class="htg-target-check"
                data-actor-id="${esc(t.actor.id)}"
                data-user-id="${esc(t.user.id)}"
                checked>
            <span class="htg-value-lg">${esc(t.actor.name)}</span>
            <span class="htg-player-tag">${esc(t.user.name)}</span>
        </div>`).join("");

    const content = `
        <div class="htg-body">
            <div class="htg-request-banner">
                <div class="htg-label-sm">PERSONAGENS</div>
                <div class="htg-targets-list">
                    ${targetsHtml}
                </div>
                <div class="htg-divider"></div>
            </div>
            <div class="form-group">
                <label>PERÍCIA</label>
                <select name="skill" autofocus>${skillOptions}</select>
            </div>
            <div class="form-group">
                <label>DIFICULDADE</label>
                <input type="number" name="dc" value="15" min="1" max="99" />
            </div>
            <div class="form-group">
                <label>BÔNUS / PENALIDADE</label>
                <input type="number" name="gmBonus" value="0" min="-99" max="99" />
            </div>
        </div>
    `;

    void foundry.applications.api.DialogV2.wait({
        id: "hidden-test-gm",
        classes: ["t20-dialog"],
        window: { title: "Solicitar Teste" },
        position: { width: 420 },
        content,
        buttons: [
            {
                type: "submit",
                action: "send",
                label: "Solicitar",
                icon: "fas fa-dice-d20",
                default: true,
                callback: (_event, _button, dialog) => {
                    const root = dialog.element;
                    const raw = root.querySelector<HTMLSelectElement>('[name="skill"]')?.value ?? "";
                    const [skillKey, ...rest] = raw.split("|");
                    const skillLabel = rest.join("|");
                    const dc = parseInt(root.querySelector<HTMLInputElement>('[name="dc"]')?.value ?? "", 10);
                    const gmBonusRaw = parseInt(root.querySelector<HTMLInputElement>('[name="gmBonus"]')?.value ?? "", 10);
                    const gmBonus = isNaN(gmBonusRaw) ? 0 : gmBonusRaw;

                    if (!skillKey || !skillLabel || isNaN(dc) || dc < 1) return;

                    const checked = Array.from(root.querySelectorAll<HTMLElement>(".htg-target-check:checked"));
                    if (checked.length === 0) {
                        ui.notifications.warn("Nenhum personagem selecionado.");
                        return;
                    }

                    const socket = getSocket();
                    if (!socket) {
                        ui.notifications.error("socketlib não está pronto — recarregue a página.");
                        return;
                    }

                    for (const el of checked) {
                        const actorId = el.dataset["actorId"] ?? "";
                        const userId  = el.dataset["userId"]  ?? "";
                        if (!actorId || !userId) continue;

                        const payload: HiddenTestRequest = {
                            type: "hidden-test-request",
                            requestId: randomID(),
                            targetUserId: userId,
                            actorId,
                            skillKey,
                            skillLabel,
                            dc,
                            gmBonus,
                        };
                        void socket.executeAsUser(SOCKET_HIDDEN_TEST_REQUEST, userId, payload);
                    }

                    const n = checked.length;
                    ui.notifications.info(
                        `Teste secreto de ${skillLabel} enviado para ${n} jogador${n > 1 ? "es" : ""}.`,
                    );
                },
            },
            {
                type: "submit",
                action: "cancel",
                label: "Cancelar",
                icon: "fas fa-times",
            },
        ],
        rejectClose: false,
    });
}
