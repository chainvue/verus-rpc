import { getEventListeners } from "node:events";
import { describe, expect, it } from "vitest";
import { linkedAbort } from "../src/abort.js";
import { DaemonTransport } from "../src/transport.js";

describe("linkedAbort", () => {
  it("propagates a source abort with its reason", () => {
    const controller = new AbortController();
    const { signal } = linkedAbort([controller.signal]);
    expect(signal.aborted).toBe(false);
    controller.abort(new Error("caller cancelled"));
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(Error);
    expect((signal.reason as Error).message).toBe("caller cancelled");
  });

  it("aborts with a TimeoutError DOMException when the timeout fires", async () => {
    const { signal } = linkedAbort([], 5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
  });

  it("is aborted immediately for a pre-aborted source", () => {
    const { signal } = linkedAbort([AbortSignal.abort(new Error("dead on arrival"))]);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).message).toBe("dead on arrival");
  });

  it("skips undefined sources", () => {
    const controller = new AbortController();
    const { signal } = linkedAbort([undefined, controller.signal, undefined]);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("unlink detaches from the source and cancels the timeout (idempotent)", async () => {
    const controller = new AbortController();
    const { signal, unlink } = linkedAbort([controller.signal], 5);
    unlink();
    unlink();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signal.aborted).toBe(false);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});

describe("DaemonTransport abort-wiring teardown", () => {
  it("leaves zero listeners on a long-lived caller signal after requests settle", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(new Response('{"result":1,"error":null}', { status: 200 }));
    const transport = new DaemonTransport({ url: "http://127.0.0.1:27486", fetchImpl });
    const longLived = new AbortController();

    // Before the fix, each request parked one AbortSignal.any registration on
    // the caller signal until the 60s timeout signal fired — 20 concurrent
    // requests over one signal meant 20 lingering listeners (and a
    // MaxListenersExceededWarning from the 11th).
    await Promise.all(
      Array.from({ length: 20 }, () => transport.request("getblockcount", [], longLived.signal)),
    );
    expect(getEventListeners(longLived.signal, "abort")).toHaveLength(0);
  });

  it("leaves zero listeners after a failed request too", async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error("connection refused"));
    const transport = new DaemonTransport({ url: "http://127.0.0.1:27486", fetchImpl });
    const longLived = new AbortController();

    await expect(transport.request("getinfo", [], longLived.signal)).rejects.toThrow(/connection refused/);
    expect(getEventListeners(longLived.signal, "abort")).toHaveLength(0);
  });
});
