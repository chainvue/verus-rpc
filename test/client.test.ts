import { describe, expect, it } from "vitest";
import { VerusClient } from "../src/client.js";
import { MockTransport } from "../src/mock.js";

describe("VerusClient", () => {
  it("requires url/user/pass unless a transport is injected", () => {
    expect(() => new VerusClient({})).toThrow(TypeError);
    expect(() => new VerusClient({ transport: new MockTransport() })).not.toThrow();
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
