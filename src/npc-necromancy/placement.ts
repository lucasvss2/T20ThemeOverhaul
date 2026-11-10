type Point = { x: number; y: number };
type Occupied = Point & { width: number; height: number };
type Bounds = Point & { width: number; height: number };
type Stage = {
    on(event: string, handler: (event: Pointer) => void): void;
    off(event: string, handler: (event: Pointer) => void): void;
    addChild(child: Graphic): void;
    removeChild(child: Graphic): void;
};
type Pointer = { button?: number; stopPropagation?(): void; preventDefault?(): void; getLocalPosition?(stage: Stage): Point; data?: { button?: number; getLocalPosition(stage: Stage): Point } };
type Graphic = { clear(): Graphic; lineStyle(width: number, color: number, alpha?: number): Graphic;
    beginFill(color: number, alpha: number): Graphic; drawRect(x: number, y: number, w: number, h: number): Graphic;
    endFill(): Graphic; destroy(): void; eventMode?: string };
let selecting = false;

export function validateShadowPosition(point: Point, origin: Occupied, bounds: Bounds, size: number, distance: number,
    occupied: Occupied[], selected: Point[], measuredDistance?: number): boolean {
    if (![point.x, point.y, size, distance].every(Number.isFinite) || size <= 0 || distance <= 0) return false;
    if (point.x < bounds.x || point.y < bounds.y || point.x + size > bounds.x + bounds.width || point.y + size > bounds.y + bounds.height) return false;
    const range = measuredDistance ?? Math.hypot(point.x + size / 2 - (origin.x + origin.width * size / 2),
        point.y + size / 2 - (origin.y + origin.height * size / 2)) / size * distance;
    if (range > 9 + 0.0001) return false;
    return ![...occupied, ...selected.map(p => ({ ...p, width: 1, height: 1 }))].some(t =>
        point.x < t.x + t.width * size && point.x + size > t.x && point.y < t.y + t.height * size && point.y + size > t.y);
}

/** Collect all positions before the native roll spends mana or creates documents. */
export async function chooseShadowPositions(origin: Occupied, scene: { id: string; width: number; height: number; grid: { size: number; distance: number };
    tokens: { contents: Array<Occupied & { id: string }> }; dimensions?: { sceneX: number; sceneY: number } },
    count: number, replaceIds: string[] = []): Promise<Point[] | null> {
    const cv = canvas as unknown as { stage?: Stage; app?: { stage?: Stage }; grid?: {
        getTopLeftPoint?(offset: unknown): Point; getOffset?(point: Point): unknown;
        measurePath?(points: Point[]): { distance: number };
    } };
    const stage = cv.stage ?? cv.app?.stage;
    const Graphics = (globalThis as unknown as { PIXI?: { Graphics: new () => Graphic } }).PIXI?.Graphics;
    if (!stage || !Graphics) return null;
    if (selecting) { ui.notifications.warn("Conclua ou cancele o posicionamento atual dos servos."); return null; }
    selecting = true;
    const size = scene.grid.size;
    const bounds = { x: scene.dimensions?.sceneX ?? 0, y: scene.dimensions?.sceneY ?? 0, width: scene.width, height: scene.height };
    const occupied = () => scene.tokens.contents.filter(t => !replaceIds.includes(t.id));
    const selected: Point[] = [];
    const graphics = new Graphics(); graphics.eventMode = "none"; stage.addChild(graphics);
    const hud = document.createElement("div");
    hud.id = "t20-shadow-placement";
    hud.style.cssText = "position:fixed;z-index:100000;left:50%;top:20px;transform:translateX(-50%);padding:14px 20px;background:#17121eef;color:#efddc0;border:1px solid #a88b55;border-radius:6px;font-size:15px;box-shadow:0 4px 20px #000a";
    const label = document.createElement("span");
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancelar";
    cancel.style.cssText = "margin-left:16px;width:auto;display:inline-block";
    hud.append(label, cancel); document.body.append(hud);
    const updateLabel = () => { label.textContent = `Servos de Sombra — ${selected.length}/${count}. Clique em espaços livres em alcance curto. ESC cancela.`; };
    updateLabel();
    return new Promise(resolve => {
        let finished = false;
        function finish(result: Point[] | null) {
            if (finished) return; finished = true; selecting = false;
            stage!.off("pointerdowncapture", click); stage!.off("pointermovecapture", move);
            document.removeEventListener("keydown", key, true);
            document.removeEventListener("contextmenu", context, true);
            Hooks.off("canvasTearDown", sceneHook);
            hud.remove(); stage!.removeChild(graphics); graphics.destroy(); resolve(result);
        }
        function snap(e: Pointer): Point | undefined {
            const p = e.getLocalPosition?.(stage!) ?? e.data?.getLocalPosition(stage!);
            if (!p) return;
            return cv.grid?.getTopLeftPoint && cv.grid.getOffset ? cv.grid.getTopLeftPoint(cv.grid.getOffset(p))
                : { x: bounds.x + Math.floor((p.x - bounds.x) / size) * size, y: bounds.y + Math.floor((p.y - bounds.y) / size) * size };
        }
        function valid(point: Point): boolean {
            const measured = cv.grid?.measurePath?.([{ x: origin.x + origin.width * size / 2, y: origin.y + origin.height * size / 2 },
                { x: point.x + size / 2, y: point.y + size / 2 }]).distance;
            return validateShadowPosition(point, origin, bounds, size, scene.grid.distance, occupied(), selected, measured);
        }
        function paint(point?: Point) {
            graphics.clear();
            for (const p of selected) graphics.lineStyle(3, 0xc0a3ef).beginFill(0x8d5abb, 0.35).drawRect(p.x, p.y, size, size).endFill();
            if (point) graphics.lineStyle(3, valid(point) ? 0x8be3b4 : 0xef7b75).beginFill(0x8d5abb, 0.15).drawRect(point.x, point.y, size, size).endFill();
        }
        function move(e: Pointer) { paint(snap(e)); }
        function click(e: Pointer) {
            // Tokens consume the bubbling pointerdown event. Capture it first,
            // also preventing selection/dragging while choosing summon spaces.
            e.stopPropagation?.(); e.preventDefault?.();
            if ((e.button ?? e.data?.button ?? 0) !== 0) { finish(null); return; }
            if (canvas?.scene?.id !== scene.id) { finish(null); return; }
            const point = snap(e);
            if (!point || !valid(point)) { ui.notifications.warn("Escolha um espaço desocupado em alcance curto (9m)."); return; }
            selected.push(point); updateLabel(); paint();
            if (selected.length === count) finish(selected);
        }
        function key(e: KeyboardEvent) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); } }
        function context(e: Event) { e.preventDefault(); e.stopPropagation(); finish(null); }
        const sceneHook = Hooks.on("canvasTearDown", () => finish(null));
        cancel.onclick = () => finish(null);
        document.addEventListener("keydown", key, true); document.addEventListener("contextmenu", context, true);
        stage!.on("pointerdowncapture", click); stage!.on("pointermovecapture", move);
    });
}
