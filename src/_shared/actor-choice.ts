/** Ações de habilidades sempre atuam em um ator escolhido, mesmo quando o GM
 * possui várias fichas. Evita configurar/dispensar poderes de toda a mesa. */
export async function chooseActionActor<T extends { id?: string; name?: string }>(actors: T[], title: string): Promise<T | undefined> {
    if (actors.length < 2) return actors[0];
    const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    return new Promise(resolve => new Dialog({
        title,
        content: `<form><div class="form-group"><label>Personagem</label><select name="actor">${actors.map((a, i) => `<option value="${i}">${escape(a.name ?? "Personagem")}</option>`).join("")}</select></div></form>`,
        buttons: { choose: { label: "Continuar", callback: (html: unknown) => {
            const value=(html as {0: HTMLElement})[0].querySelector<HTMLSelectElement>("select")?.value;
            resolve(actors[Number(value)]);
        } }, cancel: { label: "Cancelar", callback: () => resolve(undefined) } },
        close: () => resolve(undefined),
    }, { classes: ["t20-dialog"], width: 440 }).render(true));
}
