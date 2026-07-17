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
      // Floors sit ~2 points below the measured coverage so the gate is stable
      // but still catches a real regression. Ratchet them when coverage rises:
      // the previous floors were set for the 2026-07-14 numbers and drifted ~10
      // points behind, which would have let a large silent regression through.
      // Measured 2026-07-17: stmts 84.6 / branch 70.3 / funcs 87.7 / lines 89.0.
      thresholds: {
        statements: 82,
        branches: 68,
        functions: 85,
        lines: 87,
      },
    },
  },
});
