/** Etappe 5 — shielded (z_*), addressindex, blockchain/rawtx/util reads. */
import { describe, expect, it } from "vitest";
import { OperationFailedError, ResponseMappingError, TransportError } from "../src/errors.js";
import { isLosslessNumber, LosslessNumber, stringifyLossless } from "../src/lossless.js";
import { AddressIndexApi } from "../src/methods/addressindex.js";
import { BlockchainApi } from "../src/methods/blockchain.js";
import { ShieldedApi } from "../src/methods/shielded.js";
import { MockTransport } from "../src/mock.js";

describe("ShieldedApi", () => {
  it("zGetBalance / zGetTotalBalance normalize to decimal strings", async () => {
    const mock = new MockTransport()
      .respondJson("z_getbalance", "2.00000000")
      .respondJson("z_gettotalbalance", '{"transparent":1.50000000,"private":0.50000000,"total":2.00000000}');
    const shielded = new ShieldedApi(mock);
    await expect(shielded.zGetBalance({ address: "zs1..." })).resolves.toBe("2.00000000");
    await expect(shielded.zGetTotalBalance()).resolves.toEqual({
      transparent: "1.50000000",
      private: "0.50000000",
      total: "2.00000000",
    });
  });

  it("zGetTotalBalance: a field the daemon omits stays absent, never the string 'undefined'", async () => {
    // decimalString(undefined) would materialize the literal "undefined" as a
    // balance, hiding the drift the tier exists to surface. An absent field
    // must stay absent instead.
    const mock = new MockTransport().respondJson("z_gettotalbalance", '{"transparent":"1.00000000","total":"1.00000000"}');
    const bal = await new ShieldedApi(mock).zGetTotalBalance();
    expect(bal.transparent).toBe("1.00000000");
    expect(bal.total).toBe("1.00000000");
    expect(bal.private).toBeUndefined();
    expect(Object.values(bal)).not.toContain("undefined");
  });

  it("waitForOperation is cancellable — a pre-aborted signal rejects as aborted, never polls", async () => {
    const mock = new MockTransport(); // nothing queued: it must not poll at all
    const controller = new AbortController();
    controller.abort();

    const err = await new ShieldedApi(mock)
      .waitForOperation({ opid: "opid-z1", signal: controller.signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("aborted");
    expect(mock.calls.filter((c) => c.method === "z_getoperationstatus")).toHaveLength(0);
  });

  it("zSendMany serializes amounts/memo/fee losslessly", async () => {
    const mock = new MockTransport().respond("z_sendmany", "opid-z1");
    const shielded = new ShieldedApi(mock);
    await expect(
      shielded.zSendMany({
        fromAddress: "zs1from",
        amounts: [{ address: "zs1to", amount: 10_000_000n, memo: "f5" }],
        fee: 10_000n,
      }),
    ).resolves.toBe("opid-z1");

    const params = mock.calls[0]!.params;
    expect(params[0]).toBe("zs1from");
    const [entry] = params[1] as Record<string, unknown>[];
    expect(entry!["memo"]).toBe("f5");
    expect(isLosslessNumber(entry!["amount"])).toBe(true);
    expect(String(entry!["amount"])).toBe("0.10000000");
    expect(params[2]).toBe(1);
    expect(String(params[3])).toBe("0.00010000");
  });

  it("zListAddresses forwards includeWatchOnly only when given", async () => {
    const mock = new MockTransport().respondJson("z_listaddresses", '["zs1a","zs1b"]');
    mock.respondJson("z_listaddresses", '["zs1a"]');
    const sh = new ShieldedApi(mock);
    await expect(sh.zListAddresses()).resolves.toEqual(["zs1a", "zs1b"]);
    expect(mock.calls[0]!.params).toEqual([]);
    await sh.zListAddresses({ includeWatchOnly: true });
    expect(mock.calls[1]!.params).toEqual([true]);
  });

  it("zGetNewAddress forwards the type only when given", async () => {
    const mock = new MockTransport().respondJson("z_getnewaddress", '"zs1new"');
    mock.respondJson("z_getnewaddress", '"zs1sap"');
    const sh = new ShieldedApi(mock);
    await expect(sh.zGetNewAddress()).resolves.toBe("zs1new");
    expect(mock.calls[0]!.params).toEqual([]);
    await sh.zGetNewAddress({ type: "sapling" });
    expect(mock.calls[1]!.params).toEqual(["sapling"]);
  });

  it("zListReceivedByAddress coerces amount and forwards minConf", async () => {
    const mock = new MockTransport().respondJson(
      "z_listreceivedbyaddress",
      '[{"txid":"aa","amount":2,"memo":"f5"}]',
    );
    const [entry] = await new ShieldedApi(mock).zListReceivedByAddress({ address: "zs1a", minConf: 3 });
    expect(mock.calls[0]!.params).toEqual(["zs1a", 3]);
    expect(entry!.amount).toBe("2"); // integer on the wire → exact string
  });

  it("zGetTotalBalance gap-fills minConf when only includeWatchOnly is given", async () => {
    const mock = new MockTransport().respondJson(
      "z_gettotalbalance",
      '{"transparent":"1.00000000","private":"0.00000000","total":"1.00000000"}',
    );
    const res = await new ShieldedApi(mock).zGetTotalBalance({ includeWatchOnly: true });
    expect(mock.calls[0]!.params).toEqual([1, true]); // minConf default 1 fills the slot
    expect(res.transparent).toBe("1.00000000");
  });

  it("zListUnspent gap-fills minConf and maxConf with the daemon's defaults", async () => {
    const mock = new MockTransport().respondJson("z_listunspent", "[]");
    await new ShieldedApi(mock).zListUnspent({ addresses: ["zs1a"] });
    expect(mock.calls[0]!.params).toEqual([1, 9_999_999, false, ["zs1a"]]);
  });

  it("zViewTransaction and zGetOperationResult forward their params", async () => {
    const mock = new MockTransport().respondJson("z_viewtransaction", '{"txid":"aa"}');
    mock.respondJson("z_getoperationresult", "[]");
    const sh = new ShieldedApi(mock);
    await sh.zViewTransaction({ txid: "aa" });
    expect(mock.calls[0]!.params).toEqual(["aa"]);
    await sh.zGetOperationResult({ operationIds: ["opid-1"] });
    expect(mock.calls[1]!.params).toEqual([["opid-1"]]);
  });

  it("zShieldCoinbase gap-fills the fee slot with the daemon default when only limit is given", async () => {
    const mock = new MockTransport().respondJson("z_shieldcoinbase", '{"opid":"opid-1"}');
    await new ShieldedApi(mock).zShieldCoinbase({ fromAddress: "*", toAddress: "zs1a", limit: 20 });
    // fee 0.0001 must occupy slot 3 — positional params, so a skipped slot
    // would silently shift `limit` into the fee position.
    expect(mock.calls[0]!.params).toEqual(["*", "zs1a", new LosslessNumber("0.0001"), 20]);
  });

  it("zListUnspent keeps an absent amount ABSENT instead of the string \"undefined\"", async () => {
    // Coercing a missing field with String() would materialize a truthy
    // "undefined" and hide exactly the daemon drift T2 exists to surface.
    const mock = new MockTransport().respondJson("z_listunspent", '[{"txid":"aa","confirmations":1,"address":"zs1"}]');
    const [entry] = await new ShieldedApi(mock).zListUnspent();
    expect(entry!["amount"]).toBeUndefined();
    expect("amount" in entry!).toBe(false);
  });

  it("zListUnspent coerces a present integer amount to an exact decimal string", async () => {
    const mock = new MockTransport().respondJson(
      "z_listunspent",
      '[{"txid":"aa","confirmations":1,"address":"zs1","amount":2}]',
    );
    const [entry] = await new ShieldedApi(mock).zListUnspent();
    expect(entry!.amount).toBe("2");
  });

  it("zListUnspent surfaces a non-array reply as ResponseMappingError, not a raw TypeError", async () => {
    const mock = new MockTransport().respondJson("z_listunspent", "null");
    const err = await new ShieldedApi(mock).zListUnspent().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResponseMappingError);
    expect((err as ResponseMappingError).method).toBe("z_listunspent");
  });

  it("zSendManyAndWait polls to success", async () => {
    const mock = new MockTransport().respond("z_sendmany", "opid-z1");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-z1","status":"executing"}]');
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-z1","status":"success","result":{"txid":"ztx"}}]');
    const shielded = new ShieldedApi(mock);
    await expect(
      shielded.zSendManyAndWait({
        fromAddress: "zs1from",
        amounts: [{ address: "zs1to", amount: 1n }],
        pollIntervalMs: 1,
      }),
    ).resolves.toEqual({ opid: "opid-z1", txid: "ztx" });
  });

  it("zSendManyAndWait throws ResponseMappingError on success without a txid (shape drift, same contract as sendCurrencyAndWait)", async () => {
    const mock = new MockTransport().respond("z_sendmany", "opid-z1");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-z1","status":"success","result":{}}]');
    const shielded = new ShieldedApi(mock);
    const err = await shielded
      .zSendManyAndWait({ fromAddress: "zs1from", amounts: [{ address: "zs1to", amount: 1n }], pollIntervalMs: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResponseMappingError);
    expect(err).not.toBeInstanceOf(OperationFailedError);
    expect((err as ResponseMappingError).field).toBe("result.txid");
    expect((err as ResponseMappingError).message).toContain("opid-z1");
  });

  it("zMergeToAddress gap-fills skipped slots with the daemon's own defaults", async () => {
    const mock = new MockTransport().respondJson("z_mergetoaddress", '{"opid":"opid-m1"}');
    const shielded = new ShieldedApi(mock);
    await shielded.zMergeToAddress({ fromAddresses: ["ANY_SAPLING"], toAddress: "zs1to", memo: "f5" });
    // fee 0.0001, transparent_limit 50, shielded_limit 200 (sapling default).
    expect(stringifyLossless(mock.calls[0]!.params)).toBe('[["ANY_SAPLING"],"zs1to",0.0001,50,200,"f5"]');
  });

  it("waitForOperation surfaces daemon failure details", async () => {
    const mock = new MockTransport().respondJson(
      "z_getoperationstatus",
      '[{"id":"opid-z1","status":"failed","error":{"code":-6,"message":"insufficient funds"}}]',
    );
    const shielded = new ShieldedApi(mock);
    const err = await shielded.waitForOperation({ opid: "opid-z1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationFailedError);
    expect((err as OperationFailedError).code).toBe(-6);
  });

  it("waitForOperation keeps polling through transient transport failures", async () => {
    const mock = new MockTransport()
      .failTransport("z_getoperationstatus", "network")
      .respondJson("z_getoperationstatus", '[{"id":"opid-z1","status":"success","result":{"txid":"ztx"}}]');
    const shielded = new ShieldedApi(mock);
    await expect(shielded.waitForOperation({ opid: "opid-z1", pollIntervalMs: 1 })).resolves.toMatchObject({
      id: "opid-z1",
      status: "success",
    });
    expect(mock.calls).toHaveLength(2);
  });
});

describe("AddressIndexApi", () => {
  it("maps mixed representations: satoshi ints AND decimal currency values", async () => {
    const mock = new MockTransport().respondJson(
      "getaddressbalance",
      '{"balance":81429402,"received":6141784527,"currencybalance":{"iVRSC":0.81429402},"currencyreceived":{"iVRSC":61.41784527}}',
    );
    const address = new AddressIndexApi(mock);
    const result = await address.getAddressBalance({ addresses: ["RAddr"] });
    expect(result.balance).toBe(81_429_402n);
    expect(result.received).toBe(6_141_784_527n);
    expect(result.currencybalance).toEqual({ iVRSC: 81_429_402n });
    expect(result.currencyreceived).toEqual({ iVRSC: 6_141_784_527n });
    expect(mock.calls[0]!.params).toEqual([{ addresses: ["RAddr"] }]);
  });

  it("maps utxos and signed deltas", async () => {
    const mock = new MockTransport()
      .respondJson(
        "getaddressutxos",
        '[{"address":"RAddr","txid":"ab","outputIndex":1,"script":"76a9","satoshis":200000000,"height":10}]',
      )
      .respondJson(
        "getaddressdeltas",
        '[{"address":"RAddr","txid":"ab","satoshis":-200000000,"index":0,"blockindex":2,"height":11}]',
      );
    const address = new AddressIndexApi(mock);
    const [utxo] = await address.getAddressUtxos({ addresses: ["RAddr"] });
    expect(utxo!.satoshis).toBe(200_000_000n);
    const [delta] = await address.getAddressDeltas({ addresses: ["RAddr"], start: 1, end: 20 });
    expect(delta!.satoshis).toBe(-200_000_000n);
    expect(mock.calls[1]!.params).toEqual([{ addresses: ["RAddr"], start: 1, end: 20 }]);
  });
});

describe("BlockchainApi", () => {
  it("getVdxfId maps the qualified name", async () => {
    const mock = new MockTransport().respondJson(
      "getvdxfid",
      '{"vdxfid":"iHax5q...","hash160result":"dcb1","qualifiedname":{"name":"vrsc::x","namespace":"i5w5"}}',
    );
    const blockchain = new BlockchainApi(mock);
    const result = await blockchain.getVdxfId({ name: "vrsc::x" });
    expect(result.hash160result).toBe("dcb1");
    expect(result.qualifiedname.name).toBe("vrsc::x");
    expect(mock.calls[0]!.params).toEqual(["vrsc::x"]);
  });

  it("getVdxfId sends qualifiers under the daemon's exact keys", async () => {
    const mock = new MockTransport().respondJson(
      "getvdxfid",
      '{"vdxfid":"iAbc...","hash160result":"dcb2","qualifiedname":{"name":"vrsc::x"}}',
    );
    const blockchain = new BlockchainApi(mock);
    await blockchain.getVdxfId({ name: "vrsc::x", vdxfKey: "iKey...", uint256: "ab".repeat(32), indexNum: 3 });
    expect(mock.calls[0]!.params).toEqual([
      "vrsc::x",
      { vdxfkey: "iKey...", uint256: "ab".repeat(32), indexnum: 3 },
    ]);
  });

  it("getBlock passes heights as strings (daemon requirement)", async () => {
    const mock = new MockTransport().respondJson("getblock", '{"hash":"aa","height":100,"tx":["t1"]}');
    const blockchain = new BlockchainApi(mock);
    await blockchain.getBlock({ hashOrHeight: 4147000 });
    expect(mock.calls[0]!.params).toEqual(["4147000"]);
  });

  it("createRawTransaction → sendRawTransaction chain", async () => {
    const mock = new MockTransport().respond("createrawtransaction", "rawhex").respond("sendrawtransaction", "txid1");
    const blockchain = new BlockchainApi(mock);
    await expect(
      blockchain.createRawTransaction({
        inputs: [{ txid: "ab", vout: 0 }],
        outputs: { RAddr: 10_000_000n },
      }),
    ).resolves.toBe("rawhex");
    await expect(blockchain.sendRawTransaction({ hex: "rawhex" })).resolves.toBe("txid1");
  });

  it("createRawTransaction serializes bigint sats as 8-decimal coins in ONE outputs object", async () => {
    const mock = new MockTransport().respond("createrawtransaction", "rawhex");
    const blockchain = new BlockchainApi(mock);
    await blockchain.createRawTransaction({
      inputs: [{ txid: "ab", vout: 0, sequence: 1 }],
      // 0.1 coin as bigint sats, plus an opaque non-bigint passthrough value.
      outputs: { RAddr: 10_000_000n, RAddr2: { currency: 5n } },
      expiryHeight: 100,
    });
    // Assert the exact wire bytes: outputs is a single object (daemon's
    // positional shape, NOT an array) and bigint sats become coin decimals.
    expect(stringifyLossless(mock.calls[0]!.params)).toBe(
      '[[{"txid":"ab","vout":0,"sequence":1}],{"RAddr":0.10000000,"RAddr2":{"currency":0.00000005}},0,100]',
    );
  });

  it("estimateFee returns null for the daemon's -1 no-estimate sentinel", async () => {
    const mock = new MockTransport().respondJson("estimatefee", "-1").respondJson("estimatefee", "0.00010000");
    const blockchain = new BlockchainApi(mock);
    await expect(blockchain.estimateFee({ blocks: 2 })).resolves.toBeNull();
    await expect(blockchain.estimateFee({ blocks: 2 })).resolves.toBe("0.00010000");
  });

  it("getTxOut returns null for spent/unknown outputs", async () => {
    const mock = new MockTransport().respondJson("gettxout", "null");
    const blockchain = new BlockchainApi(mock);
    await expect(blockchain.getTxOut({ txid: "ab", vout: 0 })).resolves.toBeNull();
  });
});
