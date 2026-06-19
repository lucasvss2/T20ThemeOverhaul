/**
 * Duration manager — manual duration prompt.
 *
 * Shown when a condition is added manually (via the token HUD condition
 * palette). Lets the user pick how long it should last. Default: rounds = 1.
 */

import type { ClassifyResult } from "./classify";
import { escHtml } from "@/_shared";

/**
 * Open the T20-styled duration picker for a manually-applied condition.
 * Resolves with the chosen duration. "Cancelar" resolves to indeterminate
 * (the condition stays applied, just without automatic expiry).
 */
export function promptDuration(condName: string): Promise<ClassifyResult> {
    const name = escHtml(condName || "condição");
    const content =
        `<div class="t20-dur-dialog">` +
        `<p class="t20-dur-head">Por quanto tempo <b>${name}</b> dura?</p>` +
        `<label class="t20-dur-row">` +
        `<input type="radio" name="durkind" value="rounds" checked/>` +
        `<span>Rodadas</span>` +
        `<input type="number" name="durrounds" min="1" step="1" value="1" class="t20-dur-rounds"/>` +
        `</label>` +
        `<label class="t20-dur-row"><input type="radio" name="durkind" value="scene"/>` +
        `<span>Cena <em>— some ao fim do encontro</em></span></label>` +
        `<label class="t20-dur-row"><input type="radio" name="durkind" value="day"/>` +
        `<span>Dia <em>— some ao descansar</em></span></label>` +
        `<label class="t20-dur-row"><input type="radio" name="durkind" value="indeterminate"/>` +
        `<span>Indeterminada <em>— só remoção manual</em></span></label>` +
        `</div>`;

    return new Promise<ClassifyResult>((resolve) => {
        let resolved = false;
        const done = (r: ClassifyResult): void => {
            if (resolved) return;
            resolved = true;
            resolve(r);
        };
        const read = ($html: JQuery | HTMLElement): ClassifyResult => {
            const root =
                ($html as unknown as { 0?: HTMLElement })[0] ?? ($html as unknown as HTMLElement);
            const kind =
                root.querySelector<HTMLInputElement>('input[name="durkind"]:checked')?.value ??
                "rounds";
            if (kind === "rounds") {
                const n = Number(
                    root.querySelector<HTMLInputElement>('input[name="durrounds"]')?.value ?? "1",
                );
                return { kind: "rounds", rounds: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1 };
            }
            return { kind: kind as ClassifyResult["kind"] };
        };

        new Dialog(
            {
                title: "Duração da condição",
                content,
                buttons: {
                    apply: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Aplicar",
                        callback: ($html: JQuery) => done(read($html)),
                    },
                    cancel: {
                        icon: '<i class="fas fa-ban"></i>',
                        label: "Indeterminada",
                        callback: () => done({ kind: "indeterminate" }),
                    },
                },
                default: "apply",
                close: () => done({ kind: "indeterminate" }),
            },
            { classes: ["t20-dialog", "t20-dur-dialog-app"], width: 380 },
        ).render(true);
    });
}
