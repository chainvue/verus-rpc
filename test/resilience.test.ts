import { describe, expect, it } from "vitest";
import { TransportError, VerusRpcError } from "../src/errors.js";
import { MockTransport } from "../src/mock.js";
import { withResilience } from "../src/resilience.js";

describe("withResilience", () => {
  it("opens the circuit after consecutive transport failures", async () => {
    const mock = new MockTransport();
    for (let i = 0; i < 3; i++) mock.failTransport("getinfo", "network");
    const transport = withResilience(mock, { breaker: { failuresBeforeOpen: 3, recoveryMs: 60_000 } });

    for (let i = 0; i < 3; i++) {
      await expect(transport.request("getinfo", [])).rejects.toThrow(TransportError);
    }
    // Circuit is now open: the request never reaches the inner transport.
    const err = await transport.request("getinfo", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("circuit-open");
    expect(mock.calls).toHaveLength(3);
  });

  it("never counts auth failures toward the breaker (client misconfig, node healthy)", async () => {
    const mock = new MockTransport();
    for (let i = 0; i < 10; i++) mock.failTransport("getinfo", "auth", "HTTP 401");
    mock.respond("getinfo", "ok");
    const transport = withResilience(mock, { breaker: { failuresBeforeOpen: 3, recoveryMs: 60_000 } });

    for (let i = 0; i < 10; i++) {
      await expect(transport.request("getinfo", [])).rejects.toThrow(TransportError);
    }
    // Still closed — the 11th call goes through.
    await expect(transport.request("getinfo", [])).resolves.toBe("ok");
  });

  it("never counts daemon app errors toward the breaker", async () => {
    const mock = new MockTransport();
    for (let i = 0; i < 10; i++) mock.respondError("sendcurrency", -6, "Insufficient funds");
    mock.respond("sendcurrency", "opid-ok");
    const transport = withResilience(mock, { breaker: { failuresBeforeOpen: 3, recoveryMs: 60_000 } });

    for (let i = 0; i < 10; i++) {
      await expect(transport.request("sendcurrency", [])).rejects.toThrow(VerusRpcError);
    }
    // Still closed — the 11th call goes through.
    await expect(transport.request("sendcurrency", [])).resolves.toBe("opid-ok");
  });

  it("applies the policy timeout", async () => {
    const hanging = { request: () => new Promise<unknown>(() => undefined) };
    const transport = withResilience(hanging, { timeoutMs: 20 });

    const err = await transport.request("getinfo", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("timeout");
  });

  it("caller aborts never count toward the breaker (deliberate cancel ≠ node trouble)", async () => {
    // Inner transport mimics DaemonTransport: rejects reason "aborted" when
    // the signal fires, otherwise answers successfully.
    let answered = 0;
    const inner = {
      request: (_m: string, _p: unknown[], signal?: AbortSignal) =>
        new Promise<unknown>((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new TransportError("aborted", "caller cancelled")));
          if (signal === undefined || !signal.aborted) setTimeout(() => resolve(`ok-${++answered}`), 30);
        }),
    };
    const transport = withResilience(inner, { timeoutMs: 60_000, breaker: { failuresBeforeOpen: 1 } });

    // Abort several requests in a row — with failuresBeforeOpen=1, a single
    // counted failure would open the circuit.
    for (let i = 0; i < 3; i++) {
      const controller = new AbortController();
      const pending = transport.request("getinfo", [], controller.signal).catch((e: unknown) => e);
      controller.abort();
      const err = await pending;
      expect(err).toBeInstanceOf(TransportError);
      expect((err as TransportError).reason).toBe("aborted");
    }
    // Circuit still closed: the next request reaches the node and succeeds
    // (with failuresBeforeOpen=1, a single counted failure would have opened
    // it and this would reject with "circuit-open" instead).
    await expect(transport.request("getinfo", [])).resolves.toMatch(/^ok-/);
  });

  it("aborts the in-flight request when the policy timeout fires (no orphaned send)", async () => {
    let sawAbort = false;
    const hanging = {
      request: (_method: string, _params: unknown[], signal?: AbortSignal) =>
        new Promise<unknown>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            sawAbort = true;
            reject(new TransportError("timeout", "aborted"));
          });
        }),
    };
    const transport = withResilience(hanging, { timeoutMs: 20 });

    const err = await transport.request("sendcurrency", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("timeout");
    expect(sawAbort).toBe(true);
  });
});
