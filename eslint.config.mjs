// ESLint v9 flat config for t20-theme-overhaul.
//
// Goals:
//  - Lint the TypeScript source under src/ (the only thing `npm run lint` targets).
//  - Catch real correctness bugs (unused vars, fallthrough, etc.) without drowning
//    the existing codebase in noise. The project carries deliberate type-casting
//    (~600 `as unknown as` casts bridging minimal Foundry ambient types); rules
//    that would flag those en masse are downgraded to `warn` so the gate stays
//    green while still surfacing them for the planned typing cleanup.
//
// Note: ESLint 9 flat config derives file globs from this file, NOT from a
// `--ext` CLI flag (which was removed). The npm script must not pass `--ext`.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
    // Ignore build output and deps.
    {
        ignores: ["dist/**", "node_modules/**", "*.config.*", "scripts/**"],
    },

    // Base recommended rules.
    js.configs.recommended,
    ...tseslint.configs.recommended,

    // Project-specific tuning for the TypeScript source.
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                // Foundry VTT runtime globals (declared ambiently in global.d.ts).
                Hooks: "readonly",
                game: "readonly",
                canvas: "readonly",
                ui: "readonly",
                CONFIG: "readonly",
                Roll: "readonly",
                ChatMessage: "readonly",
                Dialog: "readonly",
                foundry: "readonly",
                socketlib: "readonly",
                mergeObject: "readonly",
                randomID: "readonly",
                fromUuidSync: "readonly",
            },
        },
        rules: {
            // The codebase deliberately bridges minimal ambient types with casts.
            // Keep these visible (warn) rather than blocking until the typing
            // cleanup (Fase 2) lands.
            "@typescript-eslint/no-explicit-any": "warn",

            // Allow intentionally-unused args/vars when prefixed with `_`.
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],

            // Empty catch blocks are used intentionally for best-effort cleanup.
            "no-empty": ["error", { allowEmptyCatch: true }],
        },
    },

    // Test files: allow the looser patterns vitest suites tend to use.
    {
        files: ["src/tests/**/*.ts", "**/*.test.ts"],
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
);
