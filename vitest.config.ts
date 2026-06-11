import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        setupFiles: ["./src/tests/setup.ts"],
        // Worktrees do Claude vivem em .claude/worktrees/<nome>/src/tests e
        // carregam cópias ANTIGAS dos testes (que importam o src atual via
        // alias "@") — excluí-los evita falhas fantasma de versões passadas.
        exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
});
