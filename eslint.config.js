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
  // Type-checked tier: everything tsconfig.json covers.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "test/**/*.ts"],
  })),
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
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
    files: ["test/**/*.ts"],
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
