/**
 * Public lite-wallet node smoke — the 0.2 acceptance gate, as a repeatable
 * test: a `VerusClient` with NO credentials against a public gateway, using
 * only the light-client method whitelist. The wallet-scoped
 * `integration.test.ts` deliberately stays daemon-only; this file is the
 * public-node counterpart.
 *
 * Gated on VERUS_RPC_PUBLIC_URL (e.g. https://api.verustest.net). Read-only
 * by construction — nothing here can spend.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { VerusClient } from "../src/client.js";
import { VerusRpcError } from "../src/errors.js";

const PUBLIC_URL = process.env["VERUS_RPC_PUBLIC_URL"];

// The VRSCTEST chain identity — a stable public constant on that chain.
const VRSCTEST_CHAIN_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";

describe.skipIf(PUBLIC_URL === undefined || PUBLIC_URL === "")(
  "public node, no credentials",
  () => {
    let client: VerusClient;

    beforeAll(() => {
      // The 0.2 feature under test: url only, user/pass omitted entirely.
      client = new VerusClient({ url: PUBLIC_URL as string });
    });

    it("answers getinfo without an Authorization header", async () => {
      const info = await client.chain.getInfo();
      expect(info.blocks).toBeGreaterThan(0);
      console.log(`[public-node] ${String(info.name ?? "?")} height=${String(info.blocks)}`);
    });

    it("resolves the chain identity via getidentity", async () => {
      const result = await client.identity.getIdentity({ nameOrAddress: "VRSCTEST@" });
      expect(result.identity.identityaddress).toBe(VRSCTEST_CHAIN_ID);
    });

    it("returns the chain currency definition via getcurrency", async () => {
      const currency = await client.currency.getCurrency({ currency: "VRSCTEST" });
      expect(currency.currencyid).toBe(VRSCTEST_CHAIN_ID);
    });

    it("serves addressindex reads (getaddressbalance / getaddressutxos)", async () => {
      const balance = await client.addressIndex.getAddressBalance({
        addresses: [VRSCTEST_CHAIN_ID],
      });
      expect(balance.balance).toBeTypeOf("bigint");
      const utxos = await client.addressIndex.getAddressUtxos({
        addresses: [VRSCTEST_CHAIN_ID],
      });
      expect(Array.isArray(utxos)).toBe(true);
    });

    it("createRawTransaction: bigint sats arrive at the daemon as coins (round-trip via decode)", async () => {
      // Regression for the sats-vs-coins unit bug: build an unsigned tx
      // (pure function, no wallet) and decode it back — the daemon must see
      // 12_345_678 sats as 0.12345678 coins, and the single-object outputs
      // shape must be accepted (the array form errors).
      const hex = await client.blockchain.createRawTransaction({
        outputs: { RCG8KwJNDVwpUBcdoa6AoHqHVJsA1uMYMR: 12_345_678n },
      });
      const decoded = await client.blockchain.decodeRawTransaction({ hex });
      const vout = decoded["vout"] as { value: unknown }[];
      expect(vout).toHaveLength(1);
      expect(vout[0]!.value).toBe("0.12345678");
    });

    it("rejects wallet-scoped methods (whitelist, documented behavior)", async () => {
      // Public gateways whitelist the light-client set only; wallet methods
      // answer with a JSON-RPC error, NOT a transport failure.
      await expect(client.wallet.getBalance()).rejects.toBeInstanceOf(VerusRpcError);
    });

    it("serves getspentinfo (whitelisted) but not coinsupply — pinned 2026-07-17", async () => {
      // Chain data, stable: the spend of an output of an early VRSCTEST tx.
      const spent = await client.addressIndex.getSpentInfo({
        txid: "ae62836b65e6f229187258facfb764cd46c6c49bd094c355470742204e7a9c0c",
        index: 0,
      });
      expect(spent.height).toBe(1_515);
      await expect(client.blockchain.coinSupply({ height: 1_000 })).rejects.toBeInstanceOf(VerusRpcError);
    });
  },
);
