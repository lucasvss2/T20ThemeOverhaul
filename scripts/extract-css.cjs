#!/usr/bin/env node
// Extracts CSS template literal blocks from TypeScript files into standalone .css files.
// Run from repo root: node scripts/extract-css.cjs

const fs = require("fs");
const path = require("path");

function extract(file, startMarker, endMarker, outFile) {
    // Normalize CRLF → LF so indexOf works reliably on Windows
    const src = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const si = src.indexOf(startMarker);
    if (si === -1) { console.error("  ✗ startMarker not found:", file, JSON.stringify(startMarker.slice(0, 40))); return false; }
    const contentStart = si + startMarker.length;
    const ei = src.indexOf(endMarker, contentStart);
    if (ei === -1) { console.error("  ✗ endMarker not found:", file, JSON.stringify(endMarker.slice(0, 40))); return false; }
    const css = src.slice(contentStart, ei);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, css);
    console.log("  ✓", outFile, "(" + css.split("\n").length + " lines)");
    return true;
}

const BT = "`"; // backtick, avoids shell quoting issues

const tasks = [
    ["src/chat/chatStyles.ts",          `const CHAT_STYLES = ${BT}`,            `${BT};\n\n// ── Condition`,            "src/chat/chat.css"],
    ["src/overlay/T20Overlay.ts",       `const STYLES = ${BT}`,                 `${BT};\n\n// ── Helpers`,              "src/overlay/t20-overlay.css"],
    ["src/dialogs/t20-dialog.ts",       `const DIALOG_STYLES = ${BT}`,          `${BT};\n\n// ── Attribute`,            "src/dialogs/t20-dialog.css"],
    ["src/auto-damage/index.ts",        `const AUTO_DAMAGE_STYLES = ${BT}`,     `${BT};\n\nfunction ensureStyles`,      "src/auto-damage/auto-damage.css"],
    ["src/ui/skills-menu.ts",           `const MENU_STYLES = ${BT}`,            `${BT};\n\nfunction ensureMenuStyles`,  "src/ui/skills-menu.css"],
    ["src/hidden-test/index.ts",        `const HIDDEN_TEST_STYLES = ${BT}`,     `${BT};\n\nfunction ensureHidden`,      "src/hidden-test/hidden-test.css"],
    ["src/spell-resistance/index.ts",   `const SPELL_RESIST_STYLES = ${BT}`,    `${BT};\n\nfunction ensureStyles`,      "src/spell-resistance/spell-resistance.css"],
    ["src/area-spells/aura-sagrada.ts", `const AURA_STYLES = ${BT}`,            `${BT};\n\nfunction ensureAuraStyles`,  "src/area-spells/aura-sagrada.css"],
    ["src/area-spells/consagrar.ts",    `const CONSAGRAR_STYLES = ${BT}`,       `${BT};\n\nfunction ensureConsagrar`,   "src/area-spells/consagrar.css"],
];

let ok = 0;
for (const [file, start, end, out] of tasks) {
    if (extract(file, start, end, out)) ok++;
}
console.log(`\nDone: ${ok}/${tasks.length}`);
