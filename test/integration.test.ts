/**
 * Gated integration (ring 3) — runs only when VERUS_RPC_URL is set (creds
 * from the node host via SSH, never committed). Read-only by default;
 * value-moving tests additionally require VERUS_RPC_ALLOW_SPEND=1 and a
 * VRSCTEST node (dust amounts, dedicated test identities only).
 *
 * VERUS_RPC_MAINNET_SMOKE=1 runs a read-only shape smoke against the public
 * mainnet RPC (https://api.verus.services) to catch mainnet/testnet drift.
 */
import { describe, expect, it } from "vitest";
import { VerusClient } from "../src/client.js";

const url = process.env["VERUS_RPC_URL"];
const user = process.env["VERUS_RPC_USER"] ?? "";
const pass = process.env["VERUS_RPC_PASS"] ?? "";

describe.skipIf(url === undefined)("gated integration: LAN node (read-only)", () => {
  const client = () => new VerusClient({ url: url!, user, pass });

  it("getinfo returns curated fields", async () => {
    const info = await client().chain.getInfo();
    expect(info.VRSCversion.length).toBeGreaterThan(0);
    expect(typeof info.paytxfee).toBe("bigint");
  });

  it("getblockcount returns a plausible height", async () => {
    await expect(client().chain.getBlockCount()).resolves.toBeGreaterThan(0);
  });

  it("getbalance maps to bigint sats", async () => {
    await expect(client().wallet.getBalance()).resolves.toBeTypeOf("bigint");
  });
});

describe.skipIf(process.env["VERUS_RPC_MAINNET_SMOKE"] !== "1")("gated smoke: public mainnet RPC", () => {
  const client = () => new VerusClient({ url: "https://api.verus.services", user: "public", pass: "public" });

  it("getinfo shape holds on mainnet", async () => {
    const info = await client().chain.getInfo();
    expect(info.testnet).toBe(false);
    expect(typeof info.relayfee).toBe("bigint");
  });

  it("getidentity shape holds on mainnet", async () => {
    const result = await client().identity.getIdentity({ nameOrAddress: "Verus Coin Foundation@" });
    expect(result.identity.identityaddress.startsWith("i")).toBe(true);
  });
});
