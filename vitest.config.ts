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
      // Floors set a few points below the 2026-07-14 measured coverage
      // (stmts 80.2 / branch 62.1 / funcs 84.2 / lines 85.4) so the gate is
      // stable but still catches a real regression. Ratchet upward over time.
      thresholds: {
        statements: 75,
        branches: 57,
        functions: 80,
        lines: 80,
      },
    },
  },
});
