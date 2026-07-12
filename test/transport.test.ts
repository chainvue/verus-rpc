import { describe, expect, it } from "vitest";
import { TransportError, VerusRpcError } from "../src/errors.js";
import { isLosslessNumber, LosslessNumber } from "../src/lossless.js";
import { DaemonTransport } from "../src/transport.js";

interface RecordedRequest {
  headers: Record<string, string>;
  body: string;
}

function fetchReturning(status: number, body: string): { fetchImpl: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    requests.push({
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string,
    });
    return Promise.resolve(new Response(body, { status }));
  };
  return { fetchImpl, requests };
}

function transportWith(fetchImpl: typeof fetch, timeoutMs?: number): DaemonTransport {
  return new DaemonTransport({
    url: "http://127.0.0.1:27486",
    user: "user",
    pass: "pass",
    fetchImpl,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
}

describe("DaemonTransport", () => {
  it("sends JSON-RPC 1.0 with Basic auth and returns the lossless result", async () => {
    const { fetchImpl, requests } = fetchReturning(200, '{"result":{"balance":0.30000000},"error":null,"id":"verus-rpc"}');
    const transport = transportWith(fetchImpl);

    const result = (await transport.request("getbalance", [])) as Record<string, unknown>;
    expect(isLosslessNumber(result["balance"])).toBe(true);
    expect(String(result["balance"])).toBe("0.30000000");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers["authorization"]).toBe("Basic " + btoa("user:pass"));
    expect(requests[0]!.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(requests[0]!.body)).toMatchObject({ jsonrpc: "1.0", method: "getbalance", params: [] });
  });

  it("serializes LosslessNumber params as exact number tokens", async () => {
    const { fetchImpl, requests } = fetchReturning(200, '{"result":null,"error":null}');
    const transport = transportWith(fetchImpl);

    await transport.request("sendcurrency", ["*", [{ amount: new LosslessNumber("0.10000000") }]]);
    expect(requests[0]!.body).toContain('"amount":0.10000000');
  });

  it("parses the error body first — HTTP 500 with JSON-RPC error is an app error", async () => {
    const { fetchImpl } = fetchReturning(500, '{"result":null,"error":{"code":-6,"message":"Insufficient funds"}}');
    const transport = transportWith(fetchImpl);

    const err = await transport.request("sendcurrency", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerusRpcError);
    expect((err as VerusRpcError).code).toBe(-6);
    expect((err as VerusRpcError).method).toBe("sendcurrency");
    expect((err as VerusRpcError).message).toContain("Insufficient funds");
  });

  it("treats unparseable bodies as transport failures", async () => {
    const { fetchImpl } = fetchReturning(502, "<html>Bad Gateway</html>");
    const transport = transportWith(fetchImpl);

    const err = await transport.request("getinfo", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("bad-response");
    expect((err as TransportError).message).toContain("502");
  });

  it("maps fetch rejections to network failures", async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));
    const transport = transportWith(fetchImpl);

    const err = await transport.request("getinfo", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("network");
  });

  it("aborts via the plain timeout", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
      });
    const transport = transportWith(fetchImpl, 20);

    const err = await transport.request("getinfo", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason).toBe("timeout");
  });

  it("rejects an empty url at construction", () => {
    expect(() => new DaemonTransport({ url: "", user: "u", pass: "p" })).toThrow(TypeError);
  });

  it("sends NO authorization header when credentials are omitted (public node)", async () => {
    const { fetchImpl, requests } = fetchReturning(200, '{"result":null,"error":null}');
    const transport = new DaemonTransport({ url: "https://api.verustest.net", fetchImpl });

    await transport.request("getinfo", []);
    expect(requests).toHaveLength(1);
    expect("authorization" in requests[0]!.headers).toBe(false);
    expect(requests[0]!.headers["content-type"]).toBe("application/json");
  });

  it("rejects half-provided credentials at construction", () => {
    expect(() => new DaemonTransport({ url: "https://api.verustest.net", user: "u" })).toThrow(
      /provided together/,
    );
    expect(() => new DaemonTransport({ url: "https://api.verustest.net", pass: "p" })).toThrow(
      /provided together/,
    );
  });
});
