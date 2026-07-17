import { describe, expect, it, vi } from "vitest";
import { OperationFailedError, OperationTimeoutError, ResponseMappingError, TransportError, VerusRpcError } from "../src/errors.js";
import { isLosslessNumber } from "../src/lossless.js";
import { WalletApi, type OperationStatus } from "../src/methods/wallet.js";
import { pollOperation, sleep } from "../src/methods/operations.js";
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

  it("surfaces a failed op whose error omits message as OperationFailedError, not a shape error", async () => {
    // The op DID fail; a missing `message` must not turn that into a
    // ResponseMappingError that hides the failure. code stays reported.
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"failed","error":{"code":-6}}]');

    const err = await wallet.sendCurrencyAndWait(sendOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationFailedError);
    expect(err).not.toBeInstanceOf(ResponseMappingError);
    expect((err as OperationFailedError).code).toBe(-6);
    expect((err as OperationFailedError).message).toContain("no error message");
  });

  it("surfaces a failed op with an empty error object, code undefined, without throwing a shape error", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"failed","error":{}}]');

    const err = await wallet.sendCurrencyAndWait(sendOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationFailedError);
    expect((err as OperationFailedError).code).toBeUndefined();
  });

  it("keeps polling through the daemon's warmup window (RPC_IN_WARMUP) — the send is in flight", async () => {
    // A mid-poll daemon restart answers z_getoperationstatus with -28. The op
    // is already broadcast; abandoning it would tempt a caller into a
    // double-spending retry, so warmup is tolerated like a transport blip.
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondError("z_getoperationstatus", -28, "Loading block index...");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"success","result":{"txid":"deadbeef"}}]');

    await expect(wallet.sendCurrencyAndWait(sendOptions)).resolves.toEqual({ opid: "opid-1", txid: "deadbeef" });
    expect(mock.calls.filter((c) => c.method === "z_getoperationstatus")).toHaveLength(2);
  });

  it("fails fast on a non-warmup daemon error while polling (only warmup is transient)", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondError("z_getoperationstatus", -8, "opid not found");

    const err = await wallet.sendCurrencyAndWait(sendOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerusRpcError);
    expect((err as VerusRpcError).code).toBe(-8);
    expect(mock.calls.filter((c) => c.method === "z_getoperationstatus")).toHaveLength(1);
  });

  it("throws ResponseMappingError on success without a txid (shape drift — the send completed, never retry-shaped)", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.respondJson("z_getoperationstatus", '[{"id":"opid-1","status":"success","result":{}}]');

    const err = await wallet.sendCurrencyAndWait(sendOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResponseMappingError);
    expect(err).not.toBeInstanceOf(OperationFailedError);
    expect((err as ResponseMappingError).method).toBe("z_getoperationstatus");
    expect((err as ResponseMappingError).field).toBe("result.txid");
    expect((err as ResponseMappingError).message).toContain("opid-1");
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

  it("fails fast when polling hits an auth failure (bad credentials cannot recover)", async () => {
    const { mock, wallet } = setup();
    mock.respond("sendcurrency", "opid-1");
    mock.failTransport("z_getoperationstatus", "auth", "HTTP 401");

    const err = await wallet.sendCurrencyAndWait(sendOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("auth");
    // One poll, no 120s deadline wait.
    expect(mock.calls.filter((c) => c.method === "z_getoperationstatus")).toHaveLength(1);
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

  it("does not broadcast when the signal is already aborted (cancel before send)", async () => {
    const { mock, wallet } = setup();
    const controller = new AbortController();
    controller.abort();

    const err = await wallet.sendCurrencyAndWait({ ...sendOptions, signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("aborted");
    // The whole point: a pre-aborted wait must not put a transaction on-chain.
    expect(mock.calls.filter((c) => c.method === "sendcurrency")).toHaveLength(0);
  });

  it("getOperationStatus threads the signal — a pre-aborted request rejects as aborted", async () => {
    const { wallet } = setup();
    const controller = new AbortController();
    controller.abort();

    const err = await wallet.getOperationStatus({ signal: controller.signal }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("aborted");
  });
});

describe("pollOperation cancellation", () => {
  const timing = { intervalMs: 10_000, timeoutMs: 60_000 };

  it("throws aborted at the loop top without ever polling when the signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let polled = 0;

    const err = await pollOperation(
      () => {
        polled++;
        return Promise.resolve(undefined);
      },
      "opid-1",
      timing,
      controller.signal,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("aborted");
    expect(polled).toBe(0);
  });

  it("interrupts the inter-poll sleep the moment the signal aborts (no full interval wait)", async () => {
    const controller = new AbortController();
    // Abort from inside the first poll: the op is still executing, so the loop
    // enters the 10s sleep — which must reject at once, not after 10s.
    const executing: OperationStatus = { id: "opid-1", status: "executing" };
    const err = await pollOperation(
      () => {
        controller.abort();
        return Promise.resolve(executing);
      },
      "opid-1",
      timing,
      controller.signal,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("aborted");
  });

  it("sleep clears its pending timer and rejects when aborted mid-wait (not the pre-aborted path)", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = sleep(10_000, controller.signal); // timer genuinely armed
      const rejected = expect(pending).rejects.toMatchObject({ reason: "aborted" });
      controller.abort(); // fire onAbort while the timer is still pending
      await rejected;
      // If the onAbort branch dropped its clearTimeout, this timer would linger.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
