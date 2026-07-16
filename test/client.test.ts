import { describe, expect, it } from "vitest";
import { VerusClient } from "../src/client.js";
import { MockTransport } from "../src/mock.js";

describe("VerusClient", () => {
  it("requires url unless a transport is injected", () => {
    expect(() => new VerusClient({})).toThrow(TypeError);
    expect(() => new VerusClient({ transport: new MockTransport() })).not.toThrow();
  });

  it("accepts url without credentials (public node) but rejects half-provided credentials", () => {
    expect(() => new VerusClient({ url: "https://api.verustest.net" })).not.toThrow();
    expect(() => new VerusClient({ url: "https://api.verustest.net", user: "u" })).toThrow(
      /provided together/,
    );
    expect(() => new VerusClient({ url: "https://api.verustest.net", pass: "p" })).toThrow(
      /provided together/,
    );
  });

  it("rejects transport combined with default-transport options (nothing silently ignored)", () => {
    const transport = new MockTransport();
    expect(() => new VerusClient({ transport, url: "http://127.0.0.1:27486" })).toThrow(/injected/);
    expect(() => new VerusClient({ transport, user: "u", pass: "p" })).toThrow(/injected/);
    expect(() => new VerusClient({ transport, timeoutMs: 5_000 })).toThrow(/injected/);
  });

  it("applies resilience over an injected transport", async () => {
    const mock = new MockTransport();
    for (let i = 0; i < 3; i++) mock.failTransport("getinfo", "network");
    const client = new VerusClient({ transport: mock, resilience: { breaker: { failuresBeforeOpen: 3 } } });

    for (let i = 0; i < 3; i++) {
      await expect(client.call("getinfo")).rejects.toThrow();
    }
    // Circuit open: the 4th call never reaches the mock.
    await expect(client.call("getinfo")).rejects.toThrow(/circuit/);
    expect(mock.calls).toHaveLength(3);
  });

  it("call() defaults to lossless numbers — no float64 for amounts", async () => {
    const mock = new MockTransport().respondJson("getcurrencybalance", '{"VRSCTEST":2.00000000,"height":100}');
    const client = new VerusClient({ transport: mock });
    await expect(client.call("getcurrencybalance", ["x@"])).resolves.toEqual({
      VRSCTEST: "2.00000000",
      height: 100,
    });
  });

  it("call() with numbers:'js' opts into classic JSON.parse semantics", async () => {
    const mock = new MockTransport().respondJson("getcurrencybalance", '{"VRSCTEST":2.00000000}');
    const client = new VerusClient({ transport: mock });
    await expect(client.call("getcurrencybalance", ["x@"], { numbers: "js" })).resolves.toEqual({ VRSCTEST: 2 });
  });

  it("family namespaces share the injected transport", async () => {
    const mock = new MockTransport().respondJson("getblockcount", "42");
    const client = new VerusClient({ transport: mock });
    await expect(client.chain.getBlockCount()).resolves.toBe(42);
    expect(mock.calls[0]!.method).toBe("getblockcount");
  });
});
