import { describe, expect, it } from "vitest";
import { OperationFailedError, OperationTimeoutError, TransportError, VerusRpcError } from "../src/errors.js";
import { isLosslessNumber } from "../src/lossless.js";
import { WalletApi } from "../src/methods/wallet.js";
import { MockTransport } from "../src/mock.js";

function setup(): { mock: MockTransport; wallet: WalletApi } {
  const mock = new MockTransport();
  return { mock, wallet: new WalletApi(mock) };
}

describe("getBalance", () => {
  it("maps the plain-number result to bigint sats", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("getbalance", "2.00000000");
    await expect(wallet.getBalance()).resolves.toBe(200_000_000n);
    expect(mock.calls[0]).toEqual({ method: "getbalance", params: [] });
  });

  it("fills the deprecated account slot with * when options are given", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("getbalance", "0.00000000");
    await wallet.getBalance({ minConf: 3, includeWatchOnly: true });
    expect(mock.calls[0]!.params).toEqual(["*", 3, true]);
  });
});

describe("getCurrencyBalance", () => {
  it("maps every currency to bigint sats", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("getcurrencybalance", '{"VRSCTEST":2.00000000,"iS8TfRPfVpKo5FVfSUzfHBQxo9KuzpnqLU":0.00000001}');
    await expect(wallet.getCurrencyBalance({ address: "verusrpc-test@" })).resolves.toEqual({
      VRSCTEST: 200_000_000n,
      iS8TfRPfVpKo5FVfSUzfHBQxo9KuzpnqLU: 1n,
    });
    expect(mock.calls[0]!.params).toEqual(["verusrpc-test@"]);
  });

  it("builds positional params in daemon order", async () => {
    const { mock, wallet } = setup();
    mock.respondJson("getcurrencybalance", "{}");
    await wallet.getCurrencyBalance({ address: "x@", friendlyNames: true });
    expect(mock.calls[0]!.params).toEqual(["x@", 1, true]);
  });
});

describe("getTransaction", () => {
  it("maps signed amounts and details", async () => {
    const { mock, wallet } = setup();
    mock.respondJson(
      "gettransaction",
      '{"amount":-0.10000000,"fee":-0.00010000,"confirmations":3,"txid":"ab","time":1,"timereceived":2,' +
        '"details":[{"address":"RAddr","category":"send","amount":-0.10000000,"vout":0}],"somenewfield":1.5}',
    );
    const tx = await wallet.getTransaction({ txid: "ab" });
    expect(tx.amount).toBe(-10_000_000n);
    expect(tx.fee).toBe(-10_000n);
    expect(tx.confirmations).toBe(3);
    expect(tx.details[0]!.amount).toBe(-10_000_000n);
    expect(tx.details[0]!.category).toBe("send");
    // Unknown fractional field passes through as exact decimal string.
    expect(tx["somenewfield"]).toBe("1.5");
  });
});

describe("sendCurrency", () => {
  it("serializes bigint amounts as exact number tokens and returns the opid", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-123");
    const opid = await wallet.sendCurrency({
      fromAddress: "sender@",
      outputs: [{ address: "receiver@", amount: 10_000_000n, currency: "VRSCTEST" }],
    });
    expect(opid).toBe("opid-123");

    const [from, outputs] = mock.calls[0]!.params as [string, Record<string, unknown>[]];
    expect(from).toBe("sender@");
    expect(outputs[0]!["address"]).toBe("receiver@");
    expect(outputs[0]!["currency"]).toBe("VRSCTEST");
    const amount = outputs[0]!["amount"];
    expect(isLosslessNumber(amount)).toBe(true);
    expect(String(amount)).toBe("0.10000000");
  });

  it("appends minConf and feeAmount positionally", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-123");
    await wallet.sendCurrency({
      fromAddress: "*",
      outputs: [{ address: "r@", amount: 1n }],
      feeAmount: 10_000n,
    });
    const params = mock.calls[0]!.params;
    expect(params).toHaveLength(4);
    expect(params[2]).toBe(1); // minConf default when feeAmount present
    expect(String(params[3])).toBe("0.00010000");
  });

  it("propagates daemon errors untouched", async () => {
    const { mock, wallet } = setup();
    mock.respondError("sendcurrency", -6, "Insufficient funds");
    await expect(
      wallet.sendCurrency({ fromAddress: "*", outputs: [{ address: "r@", amount: 1n }] }),
    ).rejects.toThrow(VerusRpcError);
  });
});

describe("getOperationStatus", () => {
  it("maps operation entries, params passthrough keeps amounts exact", async () => {
    const { mock, wallet } = setup();
    mock.respondJson(
      "z_getoperationstatus",
      '[{"id":"opid-1","status":"success","creation_time":5,"execution_secs":0.037381236,' +
        '"result":{"txid":"deadbeef"},"method":"sendcurrency","params":[{"amount":0.10000000}]}]',
    );
    const [status] = await wallet.getOperationStatus({ operationIds: ["opid-1"] });
    expect(status!.id).toBe("opid-1");
    expect(status!.status).toBe("success");
    expect(status!.result?.txid).toBe("deadbeef");
    expect(status!["execution_secs"]).toBe("0.037381236");
    expect(status!.params).toEqual([{ amount: "0.10000000" }]);
    expect(mock.calls[0]!.params).toEqual([["opid-1"]]);
  });
});

describe("sendCurrencyAndWait", () => {
  const sendOptions = {
    fromAddress: "sender@",
    outputs: [{ address: "receiver@", amount: 10_000_000n }],
    pollIntervalMs: 1,
  };

  it("polls until success and resolves with the txid", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"executing"}]');
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"success","result":{"txid":"deadbeef"}}]');

    await expect(wallet.sendCurrencyAndWait(sendOptions)).resolves.toEqual({ opid: "opid-1", txid: "deadbeef" });
    expect(mock.calls.filter((c) => c.method === "z_getoperationstatus")).toHaveLength(2);
  });

  it("throws OperationFailedError with the daemon's reason", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondJson(
      "z_getoperationstatus",
      '[{"id":"opid-1","status":"failed","error":{"code":-6,"message":"Insufficient funds"}}]',
    );

    const err = await wallet.sendCurrencyAndWait(sendOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationFailedError);
    expect((err as OperationFailedError).opid).toBe("opid-1");
    expect((err as OperationFailedError).code).toBe(-6);
    expect((err as OperationFailedError).message).toContain("Insufficient funds");
  });

  it("throws OperationTimeoutError when the deadline passes", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondAlways("z_getoperationstatus", [{ id: "opid-1", status: "executing" }]);

    const err = await wallet
      .sendCurrencyAndWait({ ...sendOptions, pollIntervalMs: 5, waitTimeoutMs: 25 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationTimeoutError);
    expect((err as OperationTimeoutError).opid).toBe("opid-1");
    expect((err as OperationTimeoutError).timeoutMs).toBe(25);
  });

  it("keeps polling through transient transport failures (the send is in flight)", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.failTransport("z_getoperationstatus", "network");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"success","result":{"txid":"deadbeef"}}]');

    await expect(wallet.sendCurrencyAndWait(sendOptions)).resolves.toEqual({ opid: "opid-1", txid: "deadbeef" });
    expect(mock.calls.filter((c) => c.method === "z_getoperationstatus")).toHaveLength(2);
  });

  it("attaches the last poll failure as cause when the deadline passes without an answer", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    // No z_getoperationstatus responses queued: every poll yields the mock's
    // TransportError, which the loop must tolerate until the deadline.
    const err = await wallet
      .sendCurrencyAndWait({ ...sendOptions, pollIntervalMs: 5, waitTimeoutMs: 20 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationTimeoutError);
    expect((err as OperationTimeoutError).opid).toBe("opid-1");
    expect((err as OperationTimeoutError).cause).toBeInstanceOf(TransportError);
  });
});
