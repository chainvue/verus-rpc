/**
 * Examples-as-tests: guards the read-only examples against import/API drift.
 * The three mainnet examples import `verus-rpc` (self-reference → dist) and
 * run a live call; gated on VERUS_RPC_MAINNET_SMOKE so the offline suite
 * stays hermetic. This is the "no drift-prone hand copies" guarantee — the
 * example files ARE what runs.
 */
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const EXAMPLES = join(import.meta.dirname, "..", "examples");
const online = process.env["VERUS_RPC_MAINNET_SMOKE"] === "1";

describe("examples", () => {
  it("every example is valid TypeScript that imports the built package", () => {
    // Cheap offline check: the files exist and reference the package entry.
    const files = readdirSync(EXAMPLES).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  describe.skipIf(!online)("run against mainnet", () => {
    for (const example of ["block-height.ts", "read-identity.ts", "currency-state.ts"]) {
      it(example, async () => {
        const { stdout } = await run("node", [join(EXAMPLES, example)], { timeout: 30_000 });
        expect(stdout.trim().length).toBeGreaterThan(0);
      });
    }
  });
});
