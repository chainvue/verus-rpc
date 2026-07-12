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
});
