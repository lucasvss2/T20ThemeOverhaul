/**
 * Presets de animacao EMPACOTADOS no modulo (camada "bundled").
 *
 * Mapa `nome normalizado da magia/poder -> AnimPreset`. E a base distribuida a
 * todos; o mundo pode sobrescrever/adicionar via setting `animPresets`
 * (`world override` - ver anim-presets/index.ts). World vence bundled no merge.
 *
 * Promovidos da captura inicial (magias do Victor) em v1.67.1.
 */

export interface AnimPreset {
    /** Nome de exibicao original (ex.: "Aura Sagrada"). */
    displayName: string;
    /** "magia" | "poder" | "arma". */
    itemType: string;
    /** Modulos necessarios pra animacao rodar (sequencer, autoanimations, JB2A...). */
    requiredModules: string[];
    /** Config completa de Automated Animations (`item.flags.autoanimations`). */
    autoanimations: Record<string, unknown>;
}

/**
 * Categorias de arma de DISPARO (`system.proposito === "disparo"`) — T20 não
 * tem um campo próprio de categoria (arco/besta/arma de fogo), só o
 * `proposito` genérico "disparo" compartilhado por todas. Classificação por
 * NOME (`classifyRangedWeapon` em `anim-presets/index.ts`): contém "arco" →
 * arco; contém "besta" → besta; senão (fundas, zarabatanas, armas de fogo de
 * verdade) → "arma-fogo" (catch-all — decisão do usuário: só 3 baldes).
 */
export type WeaponAnimCategory = "arco" | "besta" | "arma-fogo";

export const WEAPON_CATEGORY_LABELS: Record<WeaponAnimCategory, string> = {
    arco: "Arco",
    besta: "Besta",
    "arma-fogo": "Arma de Fogo",
};

export interface AnimPresetLibrary {
    version: number;
    presets: Record<string, AnimPreset>;
    /** Presets aplicados a QUALQUER arma de disparo da categoria (não por nome exato) — ver `resolvePresetForItem`. */
    weaponCategoryPresets?: Record<WeaponAnimCategory, AnimPreset>;
}

export const BUNDLED_ANIM_PRESETS: AnimPresetLibrary = {
    version: 1,
    /**
     * Capturado ao vivo (v1.114.0) de armas reais na ficha dos jogadores —
     * "Arco longo"/"Arco de Guerra Maciço" (idênticos entre si: seta/regular),
     * "Besta leve" (virote/físico) e "Traque" (bala/laranja) — promovidos pra
     * categoria em vez de nome exato, pra servir qualquer arco/besta/arma de
     * fogo que o jogador tiver, não só essas 4 específicas.
     */
    weaponCategoryPresets: {
        "arco": {
            "displayName": "Arco (categoria)",
            "itemType": "arma",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "09f932fc-862b-4f66-90bd-9c130a5df955",
                "label": "Arco (categoria)",
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "range",
                "primary": {
                    "video": {
                        "dbSection": "range",
                        "menuType": "weapon",
                        "animation": "arrow",
                        "variant": "regular",
                        "color": "regular",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isReturning": false,
                        "isWait": false,
                        "onlyX": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
        "besta": {
            "displayName": "Besta (categoria)",
            "itemType": "arma",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "49836836-4f66-466f-849c-8256ddb25d69",
                "label": "Besta (categoria)",
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "range",
                "primary": {
                    "video": {
                        "dbSection": "range",
                        "menuType": "weapon",
                        "animation": "bolt",
                        "variant": "physical",
                        "color": "white",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isReturning": false,
                        "isWait": false,
                        "onlyX": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
        "arma-fogo": {
            "displayName": "Arma de Fogo (categoria)",
            "itemType": "arma",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "1b9f4f66-4a4b-46b3-8846-0e4de9716c4b",
                "label": "Arma de Fogo (categoria)",
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "range",
                "primary": {
                    "video": {
                        "dbSection": "range",
                        "menuType": "weapon",
                        "animation": "bullet",
                        "variant": "3",
                        "color": "orange",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isReturning": false,
                        "isWait": false,
                        "onlyX": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        }
    },
    presets: {
        "armadura arcana": {
            "displayName": "Armadura Arcana",
            "itemType": "magia",
            "requiredModules": [
                "sequencer",
                "autoanimations"
            ],
            "autoanimations": {
                "id": "58ab9605-8fd8-4c16-9e6b-2ff0d0a5e132",
                "label": "Armadura Arcana",
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "aura",
                "primary": {
                    "video": {
                        "dbSection": "static",
                        "menuType": "shieldspell",
                        "animation": "complete",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": true,
                        "alpha": false,
                        "alphaMax": 0.5,
                        "alphaMin": -0.5,
                        "alphaDuration": 1000,
                        "breath": false,
                        "breathMax": 1.05,
                        "breathMin": 0.95,
                        "breathDuration": 1000,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "playOn": "source",
                        "size": 3,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "tintSaturate": 0,
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
        "explosao de chamas": {
            "displayName": "Explosão de Chamas",
            "itemType": "magia",
            "requiredModules": [
                "sequencer",
                "autoanimations"
            ],
            "autoanimations": {
                "id": "7f8a3610-3db2-41f9-a78b-69770d4e7cc1",
                "label": "Explosão de Chamas",
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "templatefx",
                "primary": {
                    "video": {
                        "dbSection": "templatefx",
                        "menuType": "cone",
                        "animation": "burninghands",
                        "variant": "01",
                        "color": "orange",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isMasked": false,
                        "isWait": false,
                        "occlusionAlpha": 0.5,
                        "occlusionMode": "3",
                        "opacity": 1,
                        "persistent": false,
                        "persistType": "sequencerground",
                        "playbackRate": 1,
                        "removeTemplate": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "rotate": 0,
                        "saturate": 0,
                        "scale": "1",
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
        "ataque desarmado": {
            "displayName": "Ataque desarmado",
            "itemType": "arma",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "f1fda8c4-8f9b-43bc-802f-21a7c3b8d083",
                "label": "Ataque desarmado",
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "melee",
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5,
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "meleeSwitch": {
                    "video": {
                        "dbSection": "range",
                        "menuType": "weapon",
                        "animation": "arrow",
                        "variant": "regular",
                        "color": "regular"
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "detect": "automatic",
                        "range": 2,
                        "returning": false,
                        "switchType": "on"
                    }
                },
                "primary": {
                    "video": {
                        "dbSection": "melee",
                        "menuType": "weapon",
                        "animation": "unarmedstrike",
                        "variant": "physical",
                        "color": "darkred",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isWait": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                }
            }
        },
        "pata inseto 1 (membros extras)": {
            "displayName": "Pata Inseto 1 (Membros Extras)",
            "itemType": "arma",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "47616c35-4ef5-43c3-8dd7-75894ab836d1",
                "label": "Pata Inseto 1 (Membros Extras)",
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "meleeSwitch": {
                    "video": {
                        "dbSection": "range",
                        "menuType": "weapon",
                        "animation": "arrow",
                        "variant": "regular",
                        "color": "regular"
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "detect": "automatic",
                        "range": 2,
                        "returning": false,
                        "switchType": "on"
                    }
                },
                "menu": "melee",
                "primary": {
                    "video": {
                        "dbSection": "melee",
                        "menuType": "creature",
                        "animation": "claw",
                        "variant": "01",
                        "color": "darkred",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isWait": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
        "pata inseto 2 (membros extras)": {
            "displayName": "Pata Inseto 2 (Membros Extras)",
            "itemType": "arma",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "47616c35-4ef5-43c3-8dd7-75894ab836d1",
                "label": "Pata Inseto 2 (Membros Extras)",
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "meleeSwitch": {
                    "video": {
                        "dbSection": "range",
                        "menuType": "weapon",
                        "animation": "arrow",
                        "variant": "regular",
                        "color": "regular"
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "detect": "automatic",
                        "range": 2,
                        "returning": false,
                        "switchType": "on"
                    }
                },
                "menu": "melee",
                "primary": {
                    "video": {
                        "dbSection": "melee",
                        "menuType": "creature",
                        "animation": "claw",
                        "variant": "01",
                        "color": "darkred",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "isWait": false,
                        "opacity": 1,
                        "playbackRate": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
        "presente dos deuses": {
            "displayName": "Presente dos Deuses",
            "itemType": "poder",
            "requiredModules": [
                "sequencer",
                "autoanimations",
                "levels-3d-preview"
            ],
            "autoanimations": {
                "id": "8036c757-b002-4cbb-beb2-c27eace8ddd1",
                "label": "Presente dos Deuses",
                "levels3d": {
                    "type": "explosion",
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    },
                    "sound": {
                        "enable": false
                    },
                    "secondary": {
                        "enable": false,
                        "data": {
                            "color01": "#FFFFFF",
                            "color02": "#FFFFFF",
                            "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                        }
                    }
                },
                "macro": {
                    "enable": false,
                    "playWhen": "0"
                },
                "menu": "ontoken",
                "primary": {
                    "video": {
                        "dbSection": "static",
                        "menuType": "marker",
                        "animation": "light",
                        "variant": "complete",
                        "color": "yellow",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": false,
                        "opacity": 1,
                        "persistent": false,
                        "playbackRate": 1,
                        "playOn": "source",
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 0.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "secondary": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": true,
                        "isWait": false,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1.5,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "soundOnly": {
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    }
                },
                "source": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "isWait": true,
                        "opacity": 1,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "zIndex": 1
                    }
                },
                "target": {
                    "enable": false,
                    "video": {
                        "dbSection": "static",
                        "menuType": "spell",
                        "animation": "curewounds",
                        "variant": "01",
                        "color": "blue",
                        "enableCustom": false,
                        "customPath": ""
                    },
                    "sound": {
                        "enable": false,
                        "delay": 0,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "startTime": 0,
                        "volume": 0.75
                    },
                    "options": {
                        "addTokenWidth": false,
                        "anchor": "0.5",
                        "contrast": 0,
                        "delay": 0,
                        "elevation": 1000,
                        "fadeIn": 250,
                        "fadeOut": 500,
                        "isMasked": false,
                        "isRadius": false,
                        "opacity": 1,
                        "persistent": false,
                        "repeat": 1,
                        "repeatDelay": 250,
                        "saturate": 0,
                        "size": 1,
                        "tint": false,
                        "tintColor": "#FFFFFF",
                        "unbindAlpha": false,
                        "unbindVisibility": false,
                        "zIndex": 1
                    }
                },
                "isEnabled": true,
                "isCustomized": true,
                "fromAmmo": false,
                "version": 5
            }
        },
    "aura sagrada": {
        "displayName": "Aura Sagrada",
        "itemType": "poder",
        "requiredModules": [
            "sequencer",
            "autoanimations",
            "levels-3d-preview"
        ],
        "autoanimations": {
            "id": "cdc4c00f-c546-43fb-85aa-bdf1e3138e48",
            "label": "Aura Sagrada",
            "levels3d": {
                "type": "explosion",
                "data": {
                    "color01": "#FFFFFF",
                    "color02": "#FFFFFF",
                    "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                },
                "sound": {
                    "enable": false
                },
                "secondary": {
                    "enable": false,
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    }
                }
            },
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "ontoken",
            "primary": {
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "detectmagic",
                    "variant": "01",
                    "color": "yellow",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "persistent": true,
                    "playbackRate": 1,
                    "playOn": "source",
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 6,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5
        }
    },
    "bencao da justica: egide sagrada": {
        "displayName": "Bênção da Justiça: Égide Sagrada",
        "itemType": "poder",
        "requiredModules": [
            "sequencer",
            "autoanimations",
            "levels-3d-preview"
        ],
        "autoanimations": {
            "id": "a2c4367e-28f0-4b27-b578-ca339dc473ac",
            "label": "Bênção da Justiça: Égide Sagrada",
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "ontoken",
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5,
            "levels3d": {
                "type": "explosion",
                "data": {
                    "color01": "#FFFFFF",
                    "color02": "#FFFFFF",
                    "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                },
                "sound": {
                    "enable": false
                },
                "secondary": {
                    "enable": false,
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    }
                }
            },
            "primary": {
                "video": {
                    "dbSection": "static",
                    "menuType": "shieldfx",
                    "animation": "energyfield",
                    "variant": "01",
                    "color": "yellow",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "persistent": true,
                    "playbackRate": 1,
                    "playOn": "source",
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 6,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            }
        }
    },
    "adaga mental": {
        "displayName": "Adaga Mental",
        "itemType": "magia",
        "requiredModules": [
            "sequencer",
            "autoanimations",
            "levels-3d-preview"
        ],
        "autoanimations": {
            "id": "c8c7f6aa-a0bd-47a5-aeca-17b5104b33e2",
            "label": "Adaga Mental",
            "levels3d": {
                "type": "explosion",
                "data": {
                    "color01": "#FFFFFF",
                    "color02": "#FFFFFF",
                    "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                },
                "sound": {
                    "enable": false
                },
                "secondary": {
                    "enable": false,
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    }
                }
            },
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "range",
            "primary": {
                "video": {
                    "dbSection": "range",
                    "menuType": "weapon",
                    "animation": "dagger",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "isReturning": false,
                    "isWait": false,
                    "onlyX": false,
                    "opacity": 1,
                    "playbackRate": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5
        }
    },
    "consagrar": {
        "displayName": "Consagrar",
        "itemType": "magia",
        "requiredModules": [
            "sequencer",
            "autoanimations"
        ],
        "autoanimations": {
            "id": "21b0f7e0-7d61-4d63-b405-8ab3a0ec343f",
            "label": "Consagrar",
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "templatefx",
            "primary": {
                "video": {
                    "dbSection": "templatefx",
                    "menuType": "circle",
                    "animation": "energy",
                    "variant": "loop",
                    "color": "orange",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "contrast": 0.39,
                    "delay": 0,
                    "elevation": 1000,
                    "isMasked": false,
                    "isWait": false,
                    "occlusionAlpha": 0.5,
                    "occlusionMode": "3",
                    "opacity": 1,
                    "persistent": true,
                    "persistType": "attachtemplate",
                    "playbackRate": 1,
                    "removeTemplate": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "rotate": 0,
                    "saturate": 0,
                    "scale": "1",
                    "tint": false,
                    "tintColor": "#e5d466",
                    "zIndex": 1,
                    "saturation": 1
                }
            },
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5
        }
    },
    "arma de jade": {
        "displayName": "Arma de Jade",
        "itemType": "magia",
        "requiredModules": [
            "sequencer",
            "autoanimations",
            "levels-3d-preview"
        ],
        "autoanimations": {
            "id": "029e7b30-7710-443d-8d48-6490429b748f",
            "label": "Arma de Jade",
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "ontoken",
            "primary": {
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "bless",
                    "variant": "intro",
                    "color": "green",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": false,
                    "opacity": 1,
                    "persistent": false,
                    "playbackRate": 1,
                    "playOn": "default",
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5,
            "levels3d": {
                "type": "explosion",
                "data": {
                    "color01": "#FFFFFF",
                    "color02": "#FFFFFF",
                    "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                },
                "sound": {
                    "enable": false
                },
                "secondary": {
                    "enable": false,
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    }
                }
            }
        }
    },
    "miasma mefitico": {
        "displayName": "Miasma Mefítico",
        "itemType": "magia",
        "requiredModules": [
            "sequencer",
            "autoanimations"
        ],
        "autoanimations": {
            "id": "cffca850-8b73-4215-9dff-5b826c49bee8",
            "label": "Miasma Mefítico",
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "templatefx",
            "primary": {
                "video": {
                    "dbSection": "templatefx",
                    "menuType": "circle",
                    "animation": "explosion",
                    "variant": "01",
                    "color": "purple",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "isMasked": false,
                    "isWait": false,
                    "occlusionAlpha": 0.5,
                    "occlusionMode": "3",
                    "opacity": 1,
                    "persistent": false,
                    "persistType": "sequencerground",
                    "playbackRate": 1,
                    "removeTemplate": true,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "rotate": 0,
                    "saturate": 0,
                    "scale": "1",
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5
        }
    },
    "curar ferimentos": {
        "displayName": "Curar Ferimentos",
        "itemType": "magia",
        "requiredModules": [
            "sequencer",
            "autoanimations",
            "levels-3d-preview"
        ],
        "autoanimations": {
            "id": "425e6cdb-26b1-44bb-8459-f65d15927c2d",
            "label": "Curar Ferimentos",
            "levels3d": {
                "type": "explosion",
                "data": {
                    "color01": "#FFFFFF",
                    "color02": "#FFFFFF",
                    "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                },
                "sound": {
                    "enable": false
                },
                "secondary": {
                    "enable": false,
                    "data": {
                        "color01": "#FFFFFF",
                        "color02": "#FFFFFF",
                        "spritePath": "modules/levels-3d-preview/assets/particles/dust.png"
                    }
                }
            },
            "macro": {
                "enable": false,
                "playWhen": "0"
            },
            "menu": "ontoken",
            "primary": {
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "yellow",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": false,
                    "opacity": 1,
                    "persistent": false,
                    "playbackRate": 1,
                    "playOn": "default",
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "secondary": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": true,
                    "isWait": false,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1.5,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "soundOnly": {
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                }
            },
            "source": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "isWait": true,
                    "opacity": 1,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "zIndex": 1
                }
            },
            "target": {
                "enable": false,
                "video": {
                    "dbSection": "static",
                    "menuType": "spell",
                    "animation": "curewounds",
                    "variant": "01",
                    "color": "blue",
                    "enableCustom": false,
                    "customPath": ""
                },
                "sound": {
                    "enable": false,
                    "delay": 0,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "startTime": 0,
                    "volume": 0.75
                },
                "options": {
                    "addTokenWidth": false,
                    "anchor": "0.5",
                    "contrast": 0,
                    "delay": 0,
                    "elevation": 1000,
                    "fadeIn": 250,
                    "fadeOut": 500,
                    "isMasked": false,
                    "isRadius": false,
                    "opacity": 1,
                    "persistent": false,
                    "repeat": 1,
                    "repeatDelay": 250,
                    "saturate": 0,
                    "size": 1,
                    "tint": false,
                    "tintColor": "#FFFFFF",
                    "unbindAlpha": false,
                    "unbindVisibility": false,
                    "zIndex": 1
                }
            },
            "isEnabled": true,
            "isCustomized": true,
            "fromAmmo": false,
            "version": 5
        }
    }
},
};
