import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Ignore generated output. Patterns use a `**/` prefix so they match at any depth —
  // e.g. when linting from a parent directory that contains a nested git worktree, the
  // worktree's own .next/dist must still be skipped.
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // tsup library output (build:lib).
    "**/dist/**",
    // Local agent worktrees / scratch (each carries its own build artifacts).
    "**/.claude/**",
  ]),
]);

export default eslintConfig;
