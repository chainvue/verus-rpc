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

  it("arms nothing when a source is pre-aborted — no listener lands on live sources", () => {
    const live = new AbortController();
    const { signal, unlink } = linkedAbort([live.signal, AbortSignal.abort()], 60_000);
    expect(signal.aborted).toBe(true);
    expect(getEventListeners(live.signal, "abort")).toHaveLength(0);
    unlink(); // no-op, must not throw
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

  it("tears itself down when one source aborts — other sources are released without unlink", () => {
    const a = new AbortController();
    const b = new AbortController();
    const { signal } = linkedAbort([a.signal, b.signal]);
    a.abort();
    expect(signal.aborted).toBe(true);
    // Even though the guarded work never settled (unlink never called), the
    // abort itself must release the registration on the other source.
    expect(getEventListeners(b.signal, "abort")).toHaveLength(0);
  });

  it("tears itself down when the timeout fires — sources are released without unlink", async () => {
    const controller = new AbortController();
    const { signal } = linkedAbort([controller.signal], 5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signal.aborted).toBe(true);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});

describe("DaemonTransport abort-wiring teardown", () => {
  it("attaches one listener to the caller signal while in flight and detaches on settle", async () => {
    let releaseResponse: (() => void) | undefined;
    const fetchImpl: typeof fetch = () =>
      new Promise((resolve) => {
        releaseResponse = () => resolve(new Response('{"result":1,"error":null}', { status: 200 }));
      });
    const transport = new DaemonTransport({ url: "http://127.0.0.1:27486", fetchImpl });
    const longLived = new AbortController();

    const pending = transport.request("getblockcount", [], longLived.signal);
    // In flight: exactly the one live registration this request owns.
    expect(getEventListeners(longLived.signal, "abort")).toHaveLength(1);
    releaseResponse!();
    await pending;
    // Settled: the registration must be gone (this is what a dropped
    // finally/unlink would break — the listener would linger here).
    expect(getEventListeners(longLived.signal, "abort")).toHaveLength(0);
  });

  it("detaches from the caller signal when the request fails, too", async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error("connection refused"));
    const transport = new DaemonTransport({ url: "http://127.0.0.1:27486", fetchImpl });
    const longLived = new AbortController();

    await expect(transport.request("getinfo", [], longLived.signal)).rejects.toThrow(/connection refused/);
    expect(getEventListeners(longLived.signal, "abort")).toHaveLength(0);
  });
});
