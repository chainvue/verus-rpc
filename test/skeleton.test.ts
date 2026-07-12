import { describe, expect, it } from "vitest";

describe("package skeleton", () => {
  it("entry point is importable", async () => {
    await expect(import("../src/index.js")).resolves.toBeDefined();
  });
});
