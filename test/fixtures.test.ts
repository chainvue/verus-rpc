/**
 * Fixture conformance (ring 2) — recorded daemon responses are parsed
 * losslessly and run through the curated T1 mappers offline. This is the
 * type-honesty check: if a mapper or curated type disagrees with what the
 * daemon actually sends, it fails here, not at a consumer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VerusRpcError } from "../src/errors.js";
import { parseLossless } from "../src/lossless.js";
import { mapGetInfo } from "../src/methods/chain.js";
import { mapGetIdentity } from "../src/methods/identity.js";
import {
  mapAddressGroupings,
  mapCurrencyBalance,
  mapGetTransaction,
  mapGetWalletInfo,
  mapListedTransaction,
  mapOperationStatus,
  mapSignMessage,
  mapUnspentOutput,
} from "../src/methods/wallet.js";
import { mapAmount, mapInt, mapString } from "../src/mapping.js";
import { DaemonTransport } from "../src/transport.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

/** Parse a fixture body losslessly and return its `result` subtree. */
function fixtureResult(name: string): unknown {
  const text = readFileSync(join(FIXTURES, name), "utf8");
  const body = parseLossless(text) as Record<string, unknown>;
  expect(body["error"] ?? null).toBeNull();
  return body["result"];
}

describe("fixture conformance", () => {
  it("getinfo (recorded, mainnet)", () => {
    const info = mapGetInfo(fixtureResult("getinfo.json"));
    expect(info.VRSCversion).toBe("1.2.17");
    expect(info.paytxfee).toBe(10_000n);
    expect(info.relayfee).toBe(100n); // "1e-6" on the wire
    expect(info.testnet).toBe(false);
    expect(Number.isSafeInteger(info.blocks)).toBe(true);
    expect(info["magic"]).toBe(-497_513_811);
    // Fractional unknown fields must never surface as float64.
    for (const value of Object.values(info)) {
      expect(typeof value === "number" && !Number.isSafeInteger(value) && value !== info.difficulty).toBe(false);
    }
  });

  it("getblockcount (recorded, mainnet)", () => {
    const height = mapInt(fixtureResult("getblockcount.json"), { method: "getblockcount", field: "(result)" });
    expect(height).toBeGreaterThan(4_000_000);
  });

  it("getidentity (recorded, mainnet)", () => {
    const result = mapGetIdentity(fixtureResult("getidentity.json"));
    expect(result.identity.identityaddress).toBe("i5v3h9FWVdRFbNHU7DfcpGykQjRaHtMqu7");
    expect(result.identity.parent).toBe("i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV");
    expect(result.identity.primaryaddresses.length).toBeGreaterThan(0);
    expect(result.fullyqualifiedname).toBe("Verus Coin Foundation.VRSC@");
    expect(result.status).toBe("active");
  });

  it("getcurrencybalance (recorded VRSCTEST probe)", () => {
    expect(mapCurrencyBalance(fixtureResult("getcurrencybalance.json"))).toEqual({ VRSCTEST: 200_000_000n });
  });

  it("getbalance (synthetic)", () => {
    expect(mapAmount(fixtureResult("getbalance.json"), { method: "getbalance", field: "(result)" })).toBe(
      200_000_000n,
    );
  });

  it("gettransaction (synthetic)", () => {
    const tx = mapGetTransaction(fixtureResult("gettransaction.json"));
    expect(tx.amount).toBe(-10_000_000n);
    expect(tx.fee).toBe(-10_000n);
    expect(tx.details[0]!.amount).toBe(-10_000_000n);
  });

  it("sendcurrency (synthetic)", () => {
    const opid = mapString(fixtureResult("sendcurrency.json"), { method: "sendcurrency", field: "(result)" });
    expect(opid.startsWith("opid-")).toBe(true);
  });

  it("z_getoperationstatus (synthetic)", () => {
    const result = fixtureResult("z_getoperationstatus.json") as unknown[];
    const status = mapOperationStatus(result[0], 0);
    expect(status.status).toBe("success");
    expect(status.result?.txid).toBeTypeOf("string");
    expect(status["execution_secs"]).toBe("0.037381236"); // fractional passthrough → exact string
  });

  it("listunspent (synthetic)", () => {
    const result = fixtureResult("listunspent.json") as unknown[];
    const utxos = result.map((item, i) => mapUnspentOutput(item, i));
    expect(utxos[0]!.amount).toBe(200_000_000n);
    expect(utxos[1]!.amount).toBe(1n); // dust
    expect(utxos[0]!["interest"]).toBe("0.00000000"); // unknown value field stays exact
  });

  it("listtransactions (synthetic)", () => {
    const result = fixtureResult("listtransactions.json") as unknown[];
    const txs = result.map((item, i) => mapListedTransaction(item, i));
    expect(txs[0]!.amount).toBe(200_000_000n);
    expect(txs[1]!.amount).toBe(-10_000_000n);
    expect(txs[1]!.fee).toBe(-10_000n);
  });

  it("getwalletinfo (synthetic)", () => {
    const info = mapGetWalletInfo(fixtureResult("getwalletinfo.json"));
    expect(info.balance).toBe(210_000_000n);
    expect(info.paytxfee).toBe(10_000n);
    expect(info["eligible_staking_balance"]).toBe("0.00000000");
  });

  it("listaddressgroupings (synthetic)", () => {
    const groups = mapAddressGroupings(fixtureResult("listaddressgroupings.json"));
    expect(groups[0]![0]!.amount).toBe(200_000_000n);
    expect(groups[1]![0]!.amount).toBe(0n);
  });

  it("signmessage (synthetic)", () => {
    const result = mapSignMessage(fixtureResult("signmessage.json"));
    expect(result.hash.length).toBeGreaterThan(0);
    expect(result.signature.length).toBeGreaterThan(0);
  });

  it("daemon error body (recorded gateway rejection)", async () => {
    const text = readFileSync(join(FIXTURES, "error-method-not-found.json"), "utf8");
    const transport = new DaemonTransport({
      url: "http://127.0.0.1:1",
      user: "u",
      pass: "p",
      fetchImpl: () => Promise.resolve(new Response(text, { status: 500 })),
    });
    const err = await transport.request("getcurrencybalance", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerusRpcError);
    expect((err as VerusRpcError).code).toBe(-32601);
  });
});
