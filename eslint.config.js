import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".output/", ".output-e2e/", ".wxt/", "node_modules/", "playwright-report/", "test-results/", ".auth/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    // Shipped code: no HTML string sinks (see SECURITY.md: untrusted page content).
    files: ["src/**", "entrypoints/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Build DOM with createElement/textContent." },
        { property: "outerHTML", message: "Build DOM with createElement/textContent." },
        { property: "insertAdjacentHTML", message: "Build DOM with createElement/textContent." },
      ],
    },
  },
  {
    // Playwright fixtures must destructure their dependencies, even when there are none.
    files: ["tests/e2e/**"],
    rules: { "no-empty-pattern": "off" },
  },
  prettier,
);
