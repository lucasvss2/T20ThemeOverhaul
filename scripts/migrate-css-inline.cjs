#!/usr/bin/env node
// Replaces inline CSS template literals in TypeScript files with ?inline imports.
// For each entry: [tsFile, cssFile, constName, importAlias, ensureFnOld, ensureFnNew]

const fs = require("fs");

const BT = "`";

// Each task: [tsFile, cssFile, cssVar, importAlias, oldEnsureBody, newEnsureBody]
// We perform three replacements in each file:
//   1. Add import at top (after last existing import or after first line)
//   2. Remove "const VAR = `...`;" block
//   3. Rewrite ensureXxx() body to use imported string directly

const tasks = [
    {
        ts: "src/chat/chatStyles.ts",
        css: "./chat.css?inline",
        alias: "CHAT_STYLES",
        startMarker: `const CHAT_STYLES = ${BT}`,
        endMarker: `${BT};\n\n// ── Condition`,
        endReplacement: "\n\n// ── Condition",
        injectFn: "ensureChatStyles",
        injectOld: `el.textContent = CHAT_STYLES;`,
        injectNew: `el.textContent = CHAT_STYLES;`,
    },
    {
        ts: "src/overlay/T20Overlay.ts",
        css: "./t20-overlay.css?inline",
        alias: "STYLES",
        startMarker: `const STYLES = ${BT}`,
        endMarker: `${BT};\n\n// ── Helpers`,
        endReplacement: "\n\n// ── Helpers",
        injectFn: "ensureStyles",
        injectOld: `el.textContent = STYLES;`,
        injectNew: `el.textContent = STYLES;`,
    },
    {
        ts: "src/dialogs/t20-dialog.ts",
        css: "./t20-dialog.css?inline",
        alias: "DIALOG_STYLES",
        startMarker: `const DIALOG_STYLES = ${BT}`,
        endMarker: `${BT};\n\n// ── Attribute`,
        endReplacement: "\n\n// ── Attribute",
        injectFn: "ensureDialogStyles",
        injectOld: `el.textContent = DIALOG_STYLES;`,
        injectNew: `el.textContent = DIALOG_STYLES;`,
    },
    {
        ts: "src/auto-damage/index.ts",
        css: "./auto-damage.css?inline",
        alias: "AUTO_DAMAGE_STYLES",
        startMarker: `const AUTO_DAMAGE_STYLES_ID = "t20-auto-damage-styles";\n\nconst AUTO_DAMAGE_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureStyles`,
        endReplacement: "\n\nfunction ensureStyles",
        extraClean: `const AUTO_DAMAGE_STYLES_ID = "t20-auto-damage-styles";\n\n`,
        injectFn: "ensureStyles",
        injectOld: `el.textContent = AUTO_DAMAGE_STYLES;`,
        injectNew: `el.textContent = AUTO_DAMAGE_STYLES;`,
    },
    {
        ts: "src/ui/skills-menu.ts",
        css: "./skills-menu.css?inline",
        alias: "MENU_STYLES",
        startMarker: `const MENU_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureMenuStyles`,
        endReplacement: "\n\nfunction ensureMenuStyles",
        injectFn: "ensureMenuStyles",
        injectOld: `el.textContent = MENU_STYLES;`,
        injectNew: `el.textContent = MENU_STYLES;`,
    },
    {
        ts: "src/hidden-test/index.ts",
        css: "./hidden-test.css?inline",
        alias: "HIDDEN_TEST_STYLES",
        startMarker: `const HIDDEN_TEST_STYLES_ID = "t20-hidden-test-styles";\n\nconst HIDDEN_TEST_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureHiddenTestStyles`,
        endReplacement: "\n\nfunction ensureHiddenTestStyles",
        extraClean: `const HIDDEN_TEST_STYLES_ID = "t20-hidden-test-styles";\n\n`,
        injectFn: "ensureHiddenTestStyles",
        injectOld: `el.textContent = HIDDEN_TEST_STYLES;`,
        injectNew: `el.textContent = HIDDEN_TEST_STYLES;`,
    },
    {
        ts: "src/spell-resistance/index.ts",
        css: "./spell-resistance.css?inline",
        alias: "SPELL_RESIST_STYLES",
        startMarker: `const SPELL_RESIST_STYLES_ID = "t20-spell-resist-styles";\n\nconst SPELL_RESIST_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureStyles`,
        endReplacement: "\n\nfunction ensureStyles",
        extraClean: `const SPELL_RESIST_STYLES_ID = "t20-spell-resist-styles";\n\n`,
        injectFn: "ensureStyles",
        injectOld: `el.textContent = SPELL_RESIST_STYLES;`,
        injectNew: `el.textContent = SPELL_RESIST_STYLES;`,
    },
    {
        ts: "src/area-spells/aura-sagrada.ts",
        css: "./aura-sagrada.css?inline",
        alias: "AURA_STYLES",
        startMarker: `const AURA_STYLES_ID = "t20-aura-sagrada-styles";\nconst AURA_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureAuraStyles`,
        endReplacement: "\n\nfunction ensureAuraStyles",
        extraClean: `const AURA_STYLES_ID = "t20-aura-sagrada-styles";\n`,
        injectFn: "ensureAuraStyles",
        injectOld: `el.textContent = AURA_STYLES;`,
        injectNew: `el.textContent = AURA_STYLES;`,
    },
    {
        ts: "src/area-spells/consagrar.ts",
        css: "./consagrar.css?inline",
        alias: "CONSAGRAR_STYLES",
        startMarker: `const CONSAGRAR_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureConsagrarStyles`,
        endReplacement: "\n\nfunction ensureConsagrarStyles",
        injectFn: "ensureConsagrarStyles",
        injectOld: `el.textContent = CONSAGRAR_STYLES;`,
        injectNew: `el.textContent = CONSAGRAR_STYLES;`,
    },
    {
        ts: "src/sheet/index.ts",
        css: "./sheet.css?inline",
        alias: "SHEET_STYLES",
        startMarker: `const SHEET_STYLES_ID = "t20-sheet-redesign-styles";\n\nconst SHEET_STYLES = ${BT}`,
        endMarker: `${BT};\n\nfunction ensureSheetStyles`,
        endReplacement: "\n\nfunction ensureSheetStyles",
        extraClean: `const SHEET_STYLES_ID = "t20-sheet-redesign-styles";\n\n`,
        injectFn: "ensureSheetStyles",
        injectOld: `el.textContent = SHEET_STYLES;`,
        injectNew: `el.textContent = SHEET_STYLES;`,
    },
];

function addImport(src, cssPath, alias) {
    // Find the last import statement line, add our import after it
    const lines = src.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("import ")) lastImportIdx = i;
    }
    const importLine = `import ${alias} from "${cssPath}";`;
    if (lastImportIdx === -1) {
        // No imports — add at top
        lines.unshift(importLine, "");
    } else {
        lines.splice(lastImportIdx + 1, 0, importLine);
    }
    return lines.join("\n");
}

let totalOk = 0;
for (const t of tasks) {
    let src = fs.readFileSync(t.ts, "utf8").replace(/\r\n/g, "\n");
    const original = src;

    // 1. Remove the CSS const block (startMarker ... endMarker → endReplacement)
    const si = src.indexOf(t.startMarker);
    if (si === -1) { console.error("✗ startMarker not found:", t.ts); continue; }
    const ei = src.indexOf(t.endMarker, si + t.startMarker.length);
    if (ei === -1) { console.error("✗ endMarker not found:", t.ts); continue; }
    src = src.slice(0, si) + t.endReplacement + src.slice(ei + t.endMarker.length);

    // 1b. Also remove the standalone ID const if it was NOT part of startMarker
    if (t.extraClean && !t.startMarker.includes(t.extraClean.trim())) {
        src = src.replace(t.extraClean, "");
    }

    // 2. Add import at top
    src = addImport(src, t.css, t.alias);

    if (src === original) {
        console.error("✗ No changes made:", t.ts);
        continue;
    }

    fs.writeFileSync(t.ts, src);
    console.log("✓", t.ts);
    totalOk++;
}

console.log(`\nDone: ${totalOk}/${tasks.length}`);
