/**
 * Base de dados de armas p/ o poder Armamento Aberrante (v1.74.0).
 *
 * EMPACOTADA no módulo (regra de bundle: funciona em instalação limpa, sem
 * depender de compêndios de suplemento). Os stats foram colhidos ao vivo dos
 * compêndios T20 instalados (base + Atlas/Heróis de Arton), priorizando as
 * fontes canônicas. Cada linha é uma tupla compacta:
 *
 *   [nome, proficiencia, proposito, empunhadura, criticoM, criticoX, alcance,
 *    dado, tipoDano, atributoDano, atributoAtaque]
 *
 * - proficiencia: "simples" | "marcial" | "exotica" | "fogo"
 * - proposito:    "corpo-a-corpo" | "arremesso" | "disparo" | "corpo-a-corpo-arremesso"
 * - dado:         dado-base de dano (ex.: "1d8"); "" p/ armas sem dano (Rede, Desmontador)
 * - atributoDano/Ataque: parte de atributo do roll ("@for", "pont", "luta", ...)
 */

export type WeaponProf = "simples" | "marcial" | "exotica" | "fogo";

export interface AberrantWeapon {
    name: string;
    prof: WeaponProf;
    proposito: string;
    empunhadura: string;
    criticoM: number;
    criticoX: number;
    alcance: string;
    die: string;
    tipoDano: string;
    danoAttr: string;
    ataqueAttr: string;
}

type Row = [string, string, string, string, number, number, string, string, string, string, string];

// Colhido ao vivo — NÃO editar manualmente sem reharvestar.
const ROWS: Row[] = [
    ["Bastão lúdico", "simples", "corpo-a-corpo", "leve", 19, 2, "", "1d6", "perfuracao", "@for", "luta"],
    ["Besta de mão", "simples", "disparo", "uma", 19, 2, "short", "1d6", "perfuracao", "", "pont"],
    ["Adaga", "simples", "corpo-a-corpo", "leve", 19, 2, "short", "1d4", "perfuracao", "@for", "luta"],
    ["Espada curta", "simples", "corpo-a-corpo", "leve", 19, 2, "", "1d6", "perfuracao", "@for", "luta"],
    ["Foice", "simples", "corpo-a-corpo", "leve", 20, 3, "", "1d6", "corte", "@for", "luta"],
    ["Clava", "simples", "corpo-a-corpo", "uma", 20, 2, "-", "1d6", "impacto", "@for", "luta"],
    ["Lança", "simples", "arremesso", "uma", 20, 2, "short", "1d6", "perfuracao", "@for", "luta"],
    ["Maça", "simples", "corpo-a-corpo", "uma", 20, 2, "", "1d8", "impacto", "@for", "luta"],
    ["Bordão", "simples", "corpo-a-corpo", "duas", 20, 2, "", "1d6", "impacto", "@for", "luta"],
    ["Pique", "simples", "corpo-a-corpo", "duas", 20, 2, "-", "1d8", "perfuracao", "@for", "luta"],
    ["Tacape", "simples", "corpo-a-corpo", "duas", 20, 2, "", "1d10", "impacto", "@for", "luta"],
    ["Azagaia", "simples", "arremesso", "uma", 20, 2, "medium", "1d6", "perfuracao", "@for", "pont"],
    ["Besta leve", "simples", "disparo", "duas", 19, 2, "medium", "1d8", "perfuracao", "", "pont"],
    ["Funda", "simples", "disparo", "uma", 20, 2, "medium", "1d4", "impacto", "@for", "pont"],
    ["Arco curto", "simples", "disparo", "duas", 20, 3, "medium", "1d6", "perfuracao", "", "pont"],
    ["Porrete", "simples", "corpo-a-corpo", "leve", 20, 2, "", "1d6", "impacto", "", "luta"],
    ["Zarabatana", "simples", "disparo", "uma", 20, 2, "short", "1d3", "perfuracao", "", "pont"],
    ["Adaga oposta", "marcial", "corpo-a-corpo", "leve", 19, 2, "", "1d4", "perfuracao", "@for", "luta"],
    ["Agulha de Ahlen", "marcial", "corpo-a-corpo", "leve", 19, 2, "short", "1d4", "perfuracao", "@for", "luta"],
    ["Cinquedea", "marcial", "corpo-a-corpo", "leve", 19, 2, "", "1d4", "perfuracao", "@for", "luta"],
    ["Dirk", "marcial", "corpo-a-corpo", "leve", 19, 2, "", "1d4", "perfuracao", "@for", "luta"],
    ["Martelo leve", "marcial", "corpo-a-corpo-arremesso", "leve", 20, 4, "short", "1d4", "", "@for", "luta"],
    ["Espada larga", "marcial", "corpo-a-corpo", "uma", 19, 2, "", "2d4", "corte", "@for", "luta"],
    ["Espadim", "marcial", "corpo-a-corpo", "uma", 20, 2, "", "1d8", "corte", "@for", "luta"],
    ["Maça-estrela", "marcial", "corpo-a-corpo", "uma", 20, 2, "", "2d4", "perfuracao", "@for", "luta"],
    ["Serrilheira", "marcial", "corpo-a-corpo", "uma", 19, 2, "", "1d6", "dano", "@for", "luta"],
    ["Bico de corvo", "marcial", "corpo-a-corpo", "duas", 20, 3, "", "1d8", "perfuracao", "@for", "luta"],
    ["Desmontador", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "", "", "", "luta"],
    ["Espada de execução", "marcial", "corpo-a-corpo", "duas", 18, 4, "", "2d6", "corte", "@for", "luta"],
    ["Lança de justa", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "1d8", "perfuracao", "@for", "luta"],
    ["Malho", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "1d10", "impacto", "@for", "luta"],
    ["Martelo longo", "marcial", "corpo-a-corpo", "duas", 20, 4, "", "2d4", "impacto", "@for", "luta"],
    ["Tan-korak", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "1d8", "impacto", "@for", "luta"],
    ["Tai-tai", "marcial", "disparo", "uma", 20, 2, "medium", "2d4", "impacto", "", "luta"],
    ["Arco montado", "marcial", "disparo", "duas", 20, 3, "medium", "1d6", "perfuracao", "", "pont"],
    ["Besta dupla", "marcial", "disparo", "duas", 19, 2, "medium", "1d8", "perfuracao", "", "pont"],
    ["Machadinha", "marcial", "corpo-a-corpo-arremesso", "leve", 20, 3, "short", "1d6", "corte", "@for", "luta"],
    ["Cimitarra", "marcial", "corpo-a-corpo", "uma", 18, 2, "", "1d6", "corte", "@for", "luta"],
    ["Espada longa", "marcial", "corpo-a-corpo", "uma", 19, 2, "-", "1d8", "corte", "@for", "luta"],
    ["Florete", "marcial", "corpo-a-corpo", "uma", 18, 2, "-", "1d6", "perfuracao", "@for", "luta"],
    ["Machado de batalha", "marcial", "corpo-a-corpo", "uma", 20, 3, "", "1d8", "corte", "@for", "luta"],
    ["Mangual", "marcial", "corpo-a-corpo", "uma", 20, 2, "", "1d8", "impacto", "@for", "luta"],
    ["Martelo de guerra", "marcial", "corpo-a-corpo", "uma", 20, 3, "", "1d8", "impacto", "@for", "luta"],
    ["Picareta", "marcial", "corpo-a-corpo", "uma", 20, 4, "", "1d6", "perfuracao", "@for", "luta"],
    ["Tridente", "marcial", "arremesso", "uma", 20, 2, "short", "1d8", "perfuracao", "@for", "luta"],
    ["Alabarda", "marcial", "corpo-a-corpo", "duas", 20, 3, "", "1d10", "corte", "@for", "luta"],
    ["Alfange", "marcial", "corpo-a-corpo", "duas", 18, 2, "", "2d4", "corte", "@for", "luta"],
    ["Gadanho", "marcial", "corpo-a-corpo", "duas", 20, 4, "-", "2d4", "corte", "@for", "luta"],
    ["Lança montada", "marcial", "corpo-a-corpo", "duas", 20, 3, "", "1d8", "perfuracao", "@for", "luta"],
    ["Machado de guerra", "marcial", "corpo-a-corpo", "duas", 20, 3, "", "1d12", "corte", "@for", "luta"],
    ["Marreta", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "3d4", "impacto", "@for", "luta"],
    ["Montante", "marcial", "corpo-a-corpo", "duas", 19, 2, "", "2d6", "corte", "@for", "luta"],
    ["Arco longo", "marcial", "disparo", "duas", 20, 3, "medium", "1d8", "perfuracao", "@for", "pont"],
    ["Besta pesada", "marcial", "disparo", "duas", 19, 2, "medium", "1d12", "perfuracao", "", "pont"],
    ["Neko-te", "marcial", "corpo-a-corpo", "leve", 19, 2, "", "1d4", "dano", "", "luta"],
    ["Gládio", "marcial", "corpo-a-corpo", "uma", 19, 3, "", "1d6", "perfuracao", "", "luta"],
    ["Tetsubo", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "1d10", "impacto", "", "luta"],
    ["Kimbata", "exotica", "corpo-a-corpo", "leve", 18, 2, "", "1d4", "corte", "", "luta"],
    ["Clava-grão", "exotica", "corpo-a-corpo", "uma", 20, 2, "", "1d6", "impacto", "@sab", "luta"],
    ["Espada canora", "exotica", "corpo-a-corpo", "uma", 19, 2, "", "1d6", "perfuracao", "@for", "luta"],
    ["Espada-gadanho", "exotica", "corpo-a-corpo", "uma", 18, 2, "", "1d6", "corte", "@for", "luta"],
    ["Khopesh", "exotica", "corpo-a-corpo", "uma", 19, 3, "", "1d8", "corte", "@for", "luta"],
    ["Lança de falange", "exotica", "corpo-a-corpo-arremesso", "uma", 20, 3, "short", "1d8", "perfuracao", "@for", "luta"],
    ["Machado de haste", "exotica", "corpo-a-corpo", "uma", 20, 3, "", "1d8", "corte", "@for", "luta"],
    ["Rapieira", "exotica", "corpo-a-corpo", "uma", 18, 2, "", "1d8", "perfuracao", "@for", "luta"],
    ["Marrão", "exotica", "corpo-a-corpo", "duas", 20, 3, "", "4d4", "impacto", "@for", "luta"],
    ["Montante cinético", "exotica", "corpo-a-corpo", "duas", 19, 4, "", "2d6", "", "@for", "luta"],
    ["Boleadeira", "simples", "corpo-a-corpo", "uma", 20, 2, "short", "1d4", "impacto", "", "pont"],
    ["Chakram", "exotica", "arremesso", "uma", 19, 3, "", "1d6", "", "", "pont"],
    ["Arco de guerra", "exotica", "disparo", "duas", 20, 3, "medium", "1d12", "perfuracao", "@for", "pont"],
    ["Balestra", "exotica", "disparo", "duas", 19, 2, "medium", "1d12", "perfuracao", "@for", "pont"],
    ["Besta de repetição", "exotica", "disparo", "duas", 19, 2, "medium", "1d8", "perfuracao", "", "pont"],
    ["Chicote", "exotica", "corpo-a-corpo", "uma", 20, 2, "", "1d3", "corte", "@for", "luta"],
    ["Espada bastarda", "exotica", "corpo-a-corpo", "uma", 19, 2, "", "1d10", "corte", "@for", "luta"],
    ["Katana", "exotica", "corpo-a-corpo", "uma", 19, 2, "", "1d8", "corte", "@for", "luta"],
    ["Machado anão", "exotica", "corpo-a-corpo", "uma", 20, 3, "", "1d10", "corte", "@for", "luta"],
    ["Corrente de espinhos", "exotica", "corpo-a-corpo", "uma", 19, 2, "", "2d4", "corte", "@for", "luta"],
    ["Machado táurico", "exotica", "corpo-a-corpo", "duas", 20, 3, "", "2d8", "corte", "@for", "luta"],
    ["Rede", "exotica", "disparo", "uma", 20, 2, "short", "", "", "", "pont"],
    ["Açoite finntroll", "exotica", "corpo-a-corpo", "uma", 20, 2, "", "1d8", "corte", "", "luta"],
    ["Espada vespa", "exotica", "corpo-a-corpo", "uma", 20, 2, "", "2d4", "corte", "", "luta"],
    ["Pistola-punhal", "exotica", "disparo", "uma", 18, 2, "", "1d6", "perfuracao", "", "luta"],
    ["Mordida do diabo", "exotica", "corpo-a-corpo", "uma", 20, 2, "", "1d4", "perfuracao", "", "luta"],
    ["Presa de serpente", "exotica", "corpo-a-corpo", "uma", 17, 2, "", "1d8", "corte", "", "luta"],
    ["Lança de fogo", "exotica", "corpo-a-corpo", "duas", 20, 3, "", "1d10", "perfuracao", "", "luta"],
    ["Shuriken", "exotica", "arremesso", "leve", 20, 2, "short", "1d4", "perfuracao", "", "luta"],
    ["Arpão", "exotica", "arremesso", "uma", 20, 3, "short", "1d10", "perfuracao", "", "luta"],
    ["Espada-Calibre", "exotica", "disparo", "uma", 19, 3, "short", "2d6", "perfuracao", "padrao", "luta"],
    ["Garrucha", "fogo", "disparo", "leve", 19, 3, "short", "2d4", "perfuracao", "", "pont"],
    ["Canhão portátil", "exotica", "disparo", "duas", 19, 3, "short", "4d10", "impacto", "", "pont"],
    ["Sifão cáustico", "fogo", "disparo", "duas", 20, 2, "", "4d6", "acido", "", "pont"],
    ["Pistola", "fogo", "disparo", "uma", 19, 3, "short", "2d6", "perfuracao", "", "pont"],
    ["Mosquete", "fogo", "disparo", "duas", 19, 3, "medium", "2d8", "perfuracao", "", "pont"],
    ["Traque", "simples", "disparo", "leve", 19, 3, "", "2d6", "perfuracao", "", "pont"],
    ["Arcabuz", "fogo", "disparo", "duas", 19, 3, "medium", "2d10", "perfuracao", "", "pont"],
    ["Bacamarte", "fogo", "disparo", "duas", 19, 3, "", "4d6", "perfuracao", "", "pont"],
    // Adições (compêndios T20/Suplementos — faltantes na lista original)
    ["Maça de guerra", "exotica", "corpo-a-corpo", "uma", 20, 3, "", "1d12", "impacto", "@for", "luta"],
    ["Cajado de batalha", "marcial", "corpo-a-corpo", "duas", 20, 2, "", "1d8", "impacto", "@for", "luta"],
    ["Machado de Lenha", "simples", "corpo-a-corpo", "uma", 20, 3, "", "1d6", "corte", "", "luta"],
    ["Pistola Tambor", "fogo", "disparo", "uma", 19, 3, "short", "2d6", "perfuracao", "", "pont"],
];

export const ABERRANT_WEAPONS: AberrantWeapon[] = ROWS.map(([name, prof, proposito, empunhadura, criticoM, criticoX, alcance, die, tipoDano, danoAttr, ataqueAttr]) => ({
    name, prof: prof as WeaponProf, proposito, empunhadura,
    criticoM, criticoX, alcance, die, tipoDano, danoAttr, ataqueAttr,
}));

/** Rótulos de categoria de proficiência (ordem de exibição). */
export const PROF_ORDER: WeaponProf[] = ["simples", "marcial", "exotica", "fogo"];
export const PROF_LABEL: Record<WeaponProf, string> = {
    simples: "Armas Simples",
    marcial: "Armas Marciais",
    exotica: "Armas Exóticas",
    fogo: "Armas de Fogo",
};
