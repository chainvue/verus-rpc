/**
 * Coverage-expansion methods (Etappe 3) — Blockchain/rawtx reads, wallet
 * reads + spends + encryption, shielded key/op methods, and PBaaS cross-chain
 * reads. Driven offline through MockTransport: param construction (esp. the
 * lossless money encoding for spends) and result passthrough.
 */
import { describe, expect, it } from "vitest";
import { parseAmount } from "../src/amount.js";
import { BlockchainApi } from "../src/methods/blockchain.js";
import { CurrencyApi } from "../src/methods/currency.js";
import { ShieldedApi } from "../src/methods/shielded.js";
import { WalletApi } from "../src/methods/wallet.js";
import { MockTransport } from "../src/mock.js";

describe("BlockchainApi — coverage expansion", () => {
  it("getBestBlockHash returns the tip hash", async () => {
    const mock = new MockTransport().respondJson("getbestblockhash", '"aabbcc"');
    await expect(new BlockchainApi(mock).getBestBlockHash()).resolves.toBe("aabbcc");
    expect(mock.calls[0]!.params).toEqual([]);
  });

  it("getBlockHeader defaults to verbose (no param) and passes hash", async () => {
    const mock = new MockTransport().respondJson("getblockheader", '{"hash":"aa","height":10}');
    await new BlockchainApi(mock).getBlockHeader({ hash: "aa" });
    expect(mock.calls[0]!.params).toEqual(["aa"]);
  });

  it("getBlockHeader forwards verbose=false for hex", async () => {
    const mock = new MockTransport().respondJson("getblockheader", '"deadbeef"');
    const res = await new BlockchainApi(mock).getBlockHeader({ hash: "aa", verbose: false });
    expect(mock.calls[0]!.params).toEqual(["aa", false]);
    expect(res).toBe("deadbeef");
  });

  it("getRawMempool defaults to no params; verbose forwarded", async () => {
    const mock = new MockTransport().respondJson("getrawmempool", '["t1","t2"]').respondJson("getrawmempool", "{}");
    const bc = new BlockchainApi(mock);
    await expect(bc.getRawMempool()).resolves.toEqual(["t1", "t2"]);
    expect(mock.calls[0]!.params).toEqual([]);
    await bc.getRawMempool({ verbose: true });
    expect(mock.calls[1]!.params).toEqual([true]);
  });

  it("getMempoolInfo / getChainTips / getDifficulty are param-free reads", async () => {
    const mock = new MockTransport()
      .respondJson("getmempoolinfo", '{"size":3}')
      .respondJson("getchaintips", '[{"height":10,"status":"active"}]')
      .respondJson("getdifficulty", "123456.5");
    const bc = new BlockchainApi(mock);
    await expect(bc.getMempoolInfo()).resolves.toMatchObject({ size: 3 });
    await expect(bc.getChainTips()).resolves.toHaveLength(1);
    // non-integer difficulty surfaces losslessly as a decimal string
    await expect(bc.getDifficulty()).resolves.toBe("123456.5");
  });

  it("decodeRawTransaction / decodeScript forward the hex", async () => {
    const mock = new MockTransport()
      .respondJson("decoderawtransaction", '{"txid":"aa"}')
      .respondJson("decodescript", '{"asm":"OP_DUP"}');
    const bc = new BlockchainApi(mock);
    await bc.decodeRawTransaction({ hex: "00aa" });
    expect(mock.calls[0]!.params).toEqual(["00aa"]);
    await bc.decodeScript({ hex: "76a9" });
    expect(mock.calls[1]!.params).toEqual(["76a9"]);
  });
});

describe("WalletApi — reads + locks", () => {
  it("listSinceBlock builds optional positional params", async () => {
    const mock = new MockTransport().respondAlways("listsinceblock", { transactions: [], lastblock: "z" });
    const w = new WalletApi(mock);
    await w.listSinceBlock();
    expect(mock.calls[0]!.params).toEqual([]);
    await w.listSinceBlock({ blockHash: "bh" });
    expect(mock.calls[1]!.params).toEqual(["bh"]);
    await w.listSinceBlock({ includeWatchOnly: true });
    expect(mock.calls[2]!.params).toEqual(["", 1, true]);
  });

  it("lockUnspent with and without outputs", async () => {
    const mock = new MockTransport().respondJson("lockunspent", "true").respondJson("lockunspent", "true");
    const w = new WalletApi(mock);
    await expect(w.lockUnspent({ unlock: true })).resolves.toBe(true);
    expect(mock.calls[0]!.params).toEqual([true]);
    await w.lockUnspent({ unlock: false, outputs: [{ txid: "aa", vout: 1 }] });
    expect(mock.calls[1]!.params).toEqual([false, [{ txid: "aa", vout: 1 }]]);
  });

  it("listLockUnspent is a param-free read", async () => {
    const mock = new MockTransport().respondJson("listlockunspent", '[{"txid":"aa","vout":0}]');
    await expect(new WalletApi(mock).listLockUnspent()).resolves.toHaveLength(1);
    expect(mock.calls[0]!.params).toEqual([]);
  });
});

describe("WalletApi — spends (lossless money encoding)", () => {
  it("sendToAddress encodes bigint sats without float loss and returns txid", async () => {
    const mock = new MockTransport().respondJson("sendtoaddress", '"txid-1"');
    const txid = await new WalletApi(mock).sendToAddress({ address: "RAddr", amount: 150_000_000n });
    expect(txid).toBe("txid-1");
    const [addr, amount] = mock.calls[0]!.params;
    expect(addr).toBe("RAddr");
    // round-trips exactly back to the original sats — no float precision loss
    expect(parseAmount(String(amount))).toBe(150_000_000n);
  });

  it("sendToAddress positional padding when subtractFeeFromAmount is set", async () => {
    const mock = new MockTransport().respondJson("sendtoaddress", '"txid-2"');
    await new WalletApi(mock).sendToAddress({
      address: "RAddr",
      amount: 1n,
      subtractFeeFromAmount: true,
    });
    const params = mock.calls[0]!.params;
    expect(params).toHaveLength(5);
    expect(params[2]).toBe(""); // comment slot
    expect(params[3]).toBe(""); // comment-to slot
    expect(params[4]).toBe(true);
    expect(parseAmount(String(params[1]))).toBe(1n);
  });

  it("sendFrom defaults the account to '' and encodes the amount losslessly", async () => {
    const mock = new MockTransport().respondJson("sendfrom", '"txid-3"');
    await new WalletApi(mock).sendFrom({ toAddress: "RAddr", amount: 250_000_000n, minConf: 6 });
    const params = mock.calls[0]!.params;
    expect(params[0]).toBe(""); // fromAccount default
    expect(params[1]).toBe("RAddr");
    expect(parseAmount(String(params[2]))).toBe(250_000_000n);
    expect(params[3]).toBe(6); // minConf
  });

  it("setTxFee encodes the fee (bigint sats) losslessly", async () => {
    const mock = new MockTransport().respondJson("settxfee", "true");
    await expect(new WalletApi(mock).setTxFee({ amount: 10_000n })).resolves.toBe(true);
    expect(parseAmount(String(mock.calls[0]!.params[0]))).toBe(10_000n);
  });
});

describe("WalletApi — encryption / unlock (key-bearing, mock-only)", () => {
  it("walletPassphrase forwards passphrase + timeout", async () => {
    const mock = new MockTransport().respondJson("walletpassphrase", "null");
    await new WalletApi(mock).walletPassphrase({ passphrase: "s3cret", timeout: 60 });
    expect(mock.calls[0]!.params).toEqual(["s3cret", 60]);
  });

  it("walletLock is param-free", async () => {
    const mock = new MockTransport().respondJson("walletlock", "null");
    await new WalletApi(mock).walletLock();
    expect(mock.calls[0]!.params).toEqual([]);
  });

  it("walletPassphraseChange forwards old + new", async () => {
    const mock = new MockTransport().respondJson("walletpassphrasechange", "null");
    await new WalletApi(mock).walletPassphraseChange({ oldPassphrase: "a", newPassphrase: "b" });
    expect(mock.calls[0]!.params).toEqual(["a", "b"]);
  });

  it("encryptWallet returns the daemon advisory message", async () => {
    const mock = new MockTransport().respondJson("encryptwallet", '"wallet encrypted; restart"');
    await expect(new WalletApi(mock).encryptWallet({ passphrase: "s3cret" })).resolves.toContain("encrypted");
  });
});

describe("ShieldedApi — coverage expansion", () => {
  it("zListOperationIds with and without status filter", async () => {
    const mock = new MockTransport().respondJson("z_listoperationids", '["op-1"]').respondJson("z_listoperationids", "[]");
    const z = new ShieldedApi(mock);
    await expect(z.zListOperationIds()).resolves.toEqual(["op-1"]);
    expect(mock.calls[0]!.params).toEqual([]);
    await z.zListOperationIds({ status: "executing" });
    expect(mock.calls[1]!.params).toEqual(["executing"]);
  });

  it("zExportKey forwards zaddr (+ outputAsHex) and returns the key", async () => {
    const mock = new MockTransport().respondJson("z_exportkey", '"secret-zkey"');
    const key = await new ShieldedApi(mock).zExportKey({ zaddr: "zs1abc", outputAsHex: true });
    expect(key).toBe("secret-zkey");
    expect(mock.calls[0]!.params).toEqual(["zs1abc", true]);
  });

  it("zImportKey defaults rescan to whenkeyisnew when startHeight is given", async () => {
    const mock = new MockTransport().respondJson("z_importkey", '{"type":"sapling","address":"zs1abc"}');
    await new ShieldedApi(mock).zImportKey({ zkey: "secret", startHeight: 100 });
    expect(mock.calls[0]!.params).toEqual(["secret", "whenkeyisnew", 100]);
  });
});

describe("CurrencyApi — cross-chain reads", () => {
  it("getExports forwards chain + optional height range", async () => {
    const mock = new MockTransport().respondJson("getexports", "[]").respondJson("getexports", "[]");
    const c = new CurrencyApi(mock);
    await c.getExports({ chainName: "VRSCTEST" });
    expect(mock.calls[0]!.params).toEqual(["VRSCTEST"]);
    await c.getExports({ chainName: "VRSCTEST", heightEnd: 50 });
    expect(mock.calls[1]!.params).toEqual(["VRSCTEST", 0, 50]);
  });

  it("getImports forwards chain + optional range", async () => {
    const mock = new MockTransport().respondJson("getimports", "[]");
    await new CurrencyApi(mock).getImports({ chainName: "VRSCTEST", startHeight: 5, endHeight: 9 });
    expect(mock.calls[0]!.params).toEqual(["VRSCTEST", 5, 9]);
  });

  it("getPendingTransfers forwards the chain name", async () => {
    const mock = new MockTransport().respondJson("getpendingtransfers", "[]");
    await new CurrencyApi(mock).getPendingTransfers({ chainName: "VRSCTEST" });
    expect(mock.calls[0]!.params).toEqual(["VRSCTEST"]);
  });
});
