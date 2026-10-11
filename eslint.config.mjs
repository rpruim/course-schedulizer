// ESLint: the recommended JavaScript and TypeScript checks everywhere, and React's rules of hooks in the web app
// (a hook's dependency list that misses something leaves a page showing stale results). Run with `pnpm lint`.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "design/**", "packages/core/src/settings.defaults.generated.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // A name starting with _ is left unused on purpose (a field taken out of an object, for example).
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }] },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "error" },
  },
  { files: ["tools/**/*.mjs", "fixtures/tools/**/*.mjs", "**/*.config.{ts,mjs}"], languageOptions: { globals: globals.node } },
);
