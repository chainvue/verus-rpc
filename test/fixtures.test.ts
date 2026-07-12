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
import {
  mapConversionEstimate,
  mapCurrencyConverterEntry,
  mapCurrencyDefinition,
  mapCurrencyState,
} from "../src/methods/currency.js";
import { mapAddressBalance } from "../src/methods/addressindex.js";
import { mapGetVdxfId } from "../src/methods/blockchain.js";
import { mapGetIdentity, mapIdentityDefinition, mapIdentityHistory, mapIdentityResult } from "../src/methods/identity.js";
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

  it("getidentitycontent (recorded, mainnet)", () => {
    const result = mapIdentityResult(fixtureResult("getidentitycontent.json"), "getidentitycontent");
    expect(result.identity.identityaddress).toBe("i5v3h9FWVdRFbNHU7DfcpGykQjRaHtMqu7");
    expect(result.identity.contentmultimap).toBeDefined();
  });

  it("getidentityhistory (recorded, mainnet)", () => {
    const result = mapIdentityHistory(fixtureResult("getidentityhistory.json"));
    expect(result.history.length).toBeGreaterThan(0);
    for (const entry of result.history) {
      expect(Number.isSafeInteger(entry.height)).toBe(true);
      expect(entry.identity.name).toBe("Verus Coin Foundation");
    }
  });

  it("getidentitieswithaddress (recorded, mainnet, truncated to 2 entries)", () => {
    const result = fixtureResult("getidentitieswithaddress.json") as unknown[];
    const identities = result.map((item, i) => mapIdentityDefinition(item, "getidentitieswithaddress", `[${i}]`));
    expect(identities).toHaveLength(2);
    expect(identities[0]!.primaryaddresses).toContain("REpxm9bCLMiHRNVPA9unPBWixie7uHFA5C");
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

  it("getcurrency (recorded, mainnet)", () => {
    const def = mapCurrencyDefinition(fixtureResult("getcurrency.json"), "getcurrency");
    expect(def.name).toBe("VRSC");
    expect(def.currencyid).toBe("i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV");
    expect(def.currencyregistrationfee).toBe(20_000_000_000n); // "200.0" on the wire
    expect(def.idregistrationfees).toBe(10_000_000_000n);
    expect(def.lastconfirmedcurrencystate?.supply).toBeTypeOf("bigint");
  });

  it("getcurrencystate (recorded, mainnet)", () => {
    const result = fixtureResult("getcurrencystate.json") as unknown[];
    const state = mapCurrencyState(
      (result[0] as Record<string, unknown>)["currencystate"],
      "getcurrencystate",
    );
    expect(state.currencyid).toBe("i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV");
    // The root chain reports no tracked supply in its own state.
    expect(state.supply).toBe(0n);
    expect(state.flags).toBe(16);
  });

  it("listcurrencies (recorded, mainnet)", () => {
    const result = fixtureResult("listcurrencies.json") as unknown[];
    for (const entry of result) {
      const def = mapCurrencyDefinition(
        (entry as Record<string, unknown>)["currencydefinition"],
        "listcurrencies",
      );
      expect(def.currencyid.length).toBeGreaterThan(0);
    }
    expect(result.length).toBeGreaterThan(0);
  });

  it("getcurrencyconverters (recorded, mainnet)", () => {
    const result = fixtureResult("getcurrencyconverters.json") as unknown[];
    const entries = result.map((item, i) => mapCurrencyConverterEntry(item, i));
    expect(entries.length).toBeGreaterThan(0);
    // Each converter's definition under its dynamic key maps to bigint values.
    const first = entries[0]!;
    const dynamicKey = Object.keys(first).find((k) => k.startsWith("i"));
    const def = first[dynamicKey!] as { initialsupply?: bigint };
    expect(typeof def.initialsupply).toBe("bigint");
  });

  it("estimateconversion (recorded, mainnet — live conversion)", () => {
    const estimate = mapConversionEstimate(fixtureResult("estimateconversion.json"));
    expect(estimate.estimatedcurrencyout).toBe(62_184_921n);
    expect(estimate.estimatedcurrencystate?.reservecurrencies![0]!.weight).toBe(25_000_000n);
  });

  it("getaddressbalance (recorded, mainnet — mixed sat-int + decimal)", () => {
    const result = mapAddressBalance(fixtureResult("getaddressbalance.json"));
    expect(result.balance).toBe(81_429_402n);
    expect(result.received).toBe(6_141_784_527n);
    // Decimal currency values map to the same bigint as the sat-int fields.
    expect(result.currencybalance!["i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV"]).toBe(result.balance);
    expect(result.currencyreceived!["i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV"]).toBe(result.received);
  });

  it("getvdxfid (recorded, mainnet)", () => {
    const result = mapGetVdxfId(fixtureResult("getvdxfid.json"));
    expect(result.hash160result).toBe("dcb11f97bce0c8734d92da7b0f5551acfbb629bb");
    expect(result.qualifiedname.name).toBe("vrsc::system.currency.export");
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
