// ESLint flat config — v402 conventions, reduced to a single package.
//
// Two tiers:
// - src/ and test/ get TYPE-CHECKED linting (projectService resolves
//   tsconfig.json) — this is where no-floating-promises earns its keep.
// - Root config files get the syntactic recommended set only.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "coverage/"],
  },
  {
    files: ["**/*.ts", "**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
  },
  // Type-checked tier: everything tsconfig.json covers — including examples/,
  // which ships to npm next to what users copy (a floating promise in the
  // spend example is exactly what no-floating-promises exists to catch).
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "test/**/*.ts", "examples/**/*.ts"],
  })),
  {
    files: ["src/**/*.ts", "test/**/*.ts", "examples/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // A library never writes to the consumer's console.
      "no-console": "error",
    },
  },
  {
    // Tests and examples are allowed to print — the no-console rule guards the
    // library, not its callers.
    files: ["test/**/*.ts", "examples/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Syntactic tier: root config files (not covered by tsconfig include).
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["*.config.ts"],
  })),
);
