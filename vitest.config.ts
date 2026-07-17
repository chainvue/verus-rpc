import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Product source only; the root re-export barrel has nothing to execute.
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts", "src/index.ts"],
      reporter: ["text-summary", "html", "lcov"],
      // Floors sit ~2 points below measured coverage: stable enough not to
      // flake, tight enough to catch a real regression. Re-measure and raise
      // them when coverage rises — floors left behind stop gating anything.
      thresholds: {
        statements: 86,
        branches: 72,
        functions: 88,
        lines: 90,
      },
    },
  },
});
