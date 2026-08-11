/** View models e contrato de contexto do Footer HUD. */
import type { BuffSlotVM } from "./buffs";
import type { CargaVM } from "./capacity";

export interface ClassLevelVM { name: string; level: number }

export interface SkillSlotVM {
    key: string;
    label: string;
    total: number;
    iconSvgDataUri: string;
}

export interface ItemSlotVM {
    id: string;
    name: string;
    img: string;
    type: string;
}

export type RightTab = "inventario" | "poderes" | "magias" | "macros";

export interface Pool { value: number; max: number; temp: number }

export interface RightTabVM {
    key: RightTab;
    label: string;
    active: boolean;
}

export interface HudRenderContext {
    actor: FoundryActor | null;
    pv: Pool;
    pm: Pool;
    portraitUrl: string;
    charName: string;
    classes: ClassLevelVM[];
    skills: SkillSlotVM[];
    carga: CargaVM | null;
    buffs: BuffSlotVM[];
    rightTabs: RightTabVM[];
    rightItems: ItemSlotVM[];
    combat: { active: boolean; isMyTurn: boolean; canToggle: boolean };
}
