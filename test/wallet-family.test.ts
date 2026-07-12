/** Etappe 2 — wallet family beyond the core: T1 curated + T2 typed + key discipline. */
import { describe, expect, it } from "vitest";
import { isLosslessNumber } from "../src/lossless.js";
import { WalletApi } from "../src/methods/wallet.js";
import { MockTransport } from "../src/mock.js";

function setup(): { mock: MockTransport; wallet: WalletApi } {
  const mock = new MockTransport();
  return { mock, wallet: new WalletApi(mock) };
}

describe("listUnspent", () => {
  it("maps UTXO amounts to bigint sats", async () => {
    const { mock, wallet } = setup();
    mock.respondJson(
      "listunspent",
      '[{"txid":"ab","vout":0,"address":"RAddr","amount":2.00000000,"confirmations":120,"spendable":true,"interest":0.00000000}]',
    );
    const [utxo] = await wallet.listUnspent();
    expect(utxo!.amount).toBe(200_000_000n);
    expect(utxo!.spendable).toBe(true);
    expect(utxo!["interest"]).toBe("0.00000000"); // unknown value field: exact string, never float
    expect(mock.calls[0]!.params).toEqual([]);
  });

  it("builds positional params in daemon order", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("listunspent", "[]");
    await wallet.listUnspent({ addresses: ["RAddr"] });
    expect(mock.calls[0]!.params).toEqual([1, 9_999_999, ["RAddr"]]);
  });
});

describe("listTransactions", () => {
  it("maps signed amounts and fills the account slot with *", async () => {
    const { mock, wallet } = setup();
    mock.respondJson(
      "listtransactions",
      '[{"address":"RAddr","category":"send","amount":-0.10000000,"fee":-0.00010000,"time":5,"txid":"ab"}]',
    );
    const [tx] = await wallet.listTransactions({ count: 5 });
    expect(tx!.amount).toBe(-10_000_000n);
    expect(tx!.fee).toBe(-10_000n);
    expect(mock.calls[0]!.params).toEqual(["*", 5]);
  });
});

describe("sendMany", () => {
  it("serializes the amounts map as exact number tokens", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendmany", "txid-1");
    await expect(
      wallet.sendMany({ amounts: { RAddr1: 10_000_000n, RAddr2: 1n }, comment: "hi" }),
    ).resolves.toBe("txid-1");

    const [account, amounts, minConf, comment] = mock.calls[0]!.params as [
      string,
      Record<string, unknown>,
      number,
      string,
    ];
    expect(account).toBe("");
    expect(isLosslessNumber(amounts["RAddr1"])).toBe(true);
    expect(String(amounts["RAddr1"])).toBe("0.10000000");
    expect(String(amounts["RAddr2"])).toBe("0.00000001");
    expect(minConf).toBe(1);
    expect(comment).toBe("hi");
  });
});

describe("address + wallet info", () => {
  it("getNewAddress / getRawChangeAddress return plain strings", async () => {
    const { mock, wallet } = setup();
    mock.respond("getnewaddress", "RNewAddr").respond("getrawchangeaddress", "RChangeAddr");
    await expect(wallet.getNewAddress()).resolves.toBe("RNewAddr");
    await expect(wallet.getRawChangeAddress()).resolves.toBe("RChangeAddr");
  });

  it("getWalletInfo maps balances to bigint sats", async () => {
    const { mock, wallet } = setup();
    mock.respondJson(
      "getwalletinfo",
      '{"walletversion":60000,"balance":2.10000000,"unconfirmed_balance":0.00000000,' +
        '"immature_balance":0.00000000,"txcount":4,"eligible_staking_balance":1.50000000}',
    );
    const info = await wallet.getWalletInfo();
    expect(info.balance).toBe(210_000_000n);
    expect(info.unconfirmed_balance).toBe(0n);
    expect(info["eligible_staking_balance"]).toBe("1.50000000"); // unknown value field stays exact
  });

  it("getUnconfirmedBalance maps to bigint sats", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("getunconfirmedbalance", "0.50000000");
    await expect(wallet.getUnconfirmedBalance()).resolves.toBe(50_000_000n);
  });

  it("listAddressGroupings maps tuple entries", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("listaddressgroupings", '[[["RAddr1",2.00000000],["RAddr2",0.10000000,""]]]');
    const groups = await wallet.listAddressGroupings();
    expect(groups[0]![0]).toEqual({ address: "RAddr1", amount: 200_000_000n });
    expect(groups[0]![1]).toEqual({ address: "RAddr2", amount: 10_000_000n, account: "" });
  });
});

describe("signMessage / verifyMessage", () => {
  it("signMessage returns hash + signature", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("signmessage", '{"hash":"aa","signature":"sig=="}');
    await expect(wallet.signMessage({ signer: "me@", message: "hello" })).resolves.toEqual({
      hash: "aa",
      signature: "sig==",
    });
    expect(mock.calls[0]!.params).toEqual(["me@", "hello"]);
  });

  it("verifyMessage forwards checkLatest for identity freshness", async () => {
    const { mock, wallet } = setup();
    mock.respond("verifymessage", true);
    await expect(
      wallet.verifyMessage({ signer: "me@", signature: "sig==", message: "hello", checkLatest: true }),
    ).resolves.toBe(true);
    expect(mock.calls[0]!.params).toEqual(["me@", "sig==", "hello", true]);
  });
});

describe("T2 — typed with decimal-string values", () => {
  it("listReceivedByAddress keeps amounts as exact strings", async () => {
    const { mock, wallet } = setup();
    mock.respondJson(
      "listreceivedbyaddress",
      '[{"address":"RAddr","account":"","amount":2.00000000,"confirmations":10,"txids":["ab"]}]',
    );
    const [entry] = await wallet.listReceivedByAddress();
    expect(entry!.amount).toBe("2.00000000");
    expect(entry!.confirmations).toBe(10);
  });

  it("listAccounts normalizes legacy balances to strings", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("listaccounts", '{"":2.00000000,"legacy":0.00000000}');
    await expect(wallet.listAccounts()).resolves.toEqual({ "": "2.00000000", legacy: "0.00000000" });
  });
});

describe("key material & backups (mock-only, key discipline)", () => {
  it("importPrivKey sends the key positionally with label/rescan", async () => {
    const { mock, wallet } = setup();
    mock.respond("importprivkey", null);
    await wallet.importPrivKey({ privateKey: "UwFakeKeyForTestsOnly", rescan: false });
    expect(mock.calls[0]!.params).toEqual(["UwFakeKeyForTestsOnly", "", false]);
  });

  it("dumpPrivKey returns the WIF string", async () => {
    const { mock, wallet } = setup();
    mock.respond("dumpprivkey", "UwFakeKeyForTestsOnly");
    await expect(wallet.dumpPrivKey({ address: "RAddr" })).resolves.toBe("UwFakeKeyForTestsOnly");
  });

  it("dumpWallet accepts both string and object results", async () => {
    const { mock, wallet } = setup();
    mock.respond("dumpwallet", "/tmp/dump.txt");
    await expect(wallet.dumpWallet({ filename: "dump.txt" })).resolves.toBe("/tmp/dump.txt");
    mock.respondJson("dumpwallet", '{"filename":"/tmp/dump2.txt"}');
    await expect(wallet.dumpWallet({ filename: "dump2.txt" })).resolves.toBe("/tmp/dump2.txt");
  });

  it("backupWallet returns the destination path", async () => {
    const { mock, wallet } = setup();
    mock.respond("backupwallet", "/backups/wallet.dat");
    await expect(wallet.backupWallet({ destination: "wallet.dat" })).resolves.toBe("/backups/wallet.dat");
  });
});
