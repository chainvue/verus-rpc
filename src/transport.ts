import { TransportError, VerusRpcError } from "./errors.js";
import { isLosslessNumber, parseLossless, stringifyLossless } from "./lossless.js";

/**
 * A JSON-RPC transport to a Verus daemon. `DaemonTransport` (direct
 * rpcuser/rpcpassword) is the v1 implementation; a future `GatewayTransport`
 * (Verus Mobile APIAuth) slots in behind the same interface.
 */
export interface RpcTransport {
  /**
   * Send one JSON-RPC call. Returns the `result` subtree with number
   * literals preserved as `LosslessNumber`. Throws `VerusRpcError` when the
   * daemon answers with an error body, `TransportError` otherwise.
   *
   * `signal` (optional) aborts the in-flight HTTP request — the resilience
   * policy passes its timeout signal here so a policy timeout does not leave
   * the request running against the daemon.
   */
  request(method: string, params: unknown[], signal?: AbortSignal): Promise<unknown>;
}

export interface DaemonTransportConfig {
  /**
   * e.g. `http://127.0.0.1:27486` (VRSC) / `:18843` (VRSCTEST), or a public
   * lite-wallet node: `https://api.verus.services` (mainnet) /
   * `https://api.verustest.net` (VRSCTEST).
   */
  url: string;
  /**
   * Basic-auth credentials. Omit BOTH for unauthenticated public nodes
   * (they expose a whitelisted read+broadcast subset: getaddressutxos,
   * getaddressbalance, getidentity, getcurrency, getrawtransaction,
   * sendrawtransaction, …). Supplying only one of user/pass is a config
   * error.
   */
  user?: string;
  pass?: string;
  /** Injectable for tests and exotic runtimes; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Plain per-request timeout in ms; generous by default (60s). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Buffer-free base64 for Basic auth (handles non-latin1 credentials). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

interface RpcErrorBody {
  code: number;
  message: string;
}

/**
 * Direct-daemon transport: native fetch, JSON-RPC 1.0 over HTTP POST, Basic
 * auth. verusd answers application errors with HTTP 500 *and* a JSON-RPC
 * error body — the body is parsed first; only unparseable responses count as
 * transport failures.
 */
export class DaemonTransport implements RpcTransport {
  private readonly url: string;
  private readonly authorization: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: DaemonTransportConfig) {
    if (config.url === "") throw new TypeError("DaemonTransport: url must not be empty");
    if ((config.user === undefined) !== (config.pass === undefined)) {
      throw new TypeError("DaemonTransport: user and pass must be provided together (omit both for public nodes)");
    }
    this.url = config.url;
    this.authorization =
      config.user !== undefined ? "Basic " + toBase64(`${config.user}:${config.pass}`) : undefined;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request(method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.authorization !== undefined ? { authorization: this.authorization } : {}),
        },
        body: stringifyLossless({ jsonrpc: "1.0", id: "verus-rpc", method, params }),
        signal: signal === undefined ? timeoutSignal : AbortSignal.any([timeoutSignal, signal]),
      });
    } catch (err) {
      // A caller/policy abort surfaces with the caller's reason (not
      // necessarily a DOMException) — classify by the signal, not the error.
      if (signal?.aborted === true) {
        throw new TransportError("timeout", `${method}: request aborted before a response`);
      }
      if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new TransportError("timeout", `${method}: no response within ${this.timeoutMs}ms`);
      }
      throw new TransportError("network", `${method}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }

    // 401/403 is a credentials problem, whatever the body looks like.
    const authFailure = response.status === 401 || response.status === 403;
    const reason = authFailure ? "auth" : "bad-response";
    const authHint = authFailure ? " (check rpcuser/rpcpassword)" : "";

    const text = await response.text();
    let body: unknown;
    try {
      body = parseLossless(text);
    } catch {
      throw new TransportError(reason, `${method}: HTTP ${response.status}, non-JSON body${authHint}`);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new TransportError(reason, `${method}: HTTP ${response.status}, non-object body${authHint}`);
    }

    const { result, error } = body as { result?: unknown; error?: unknown };
    if (error !== undefined && error !== null) {
      const { code, message } = extractRpcError(error);
      throw new VerusRpcError(method, code, message);
    }
    if (!response.ok) {
      // Non-2xx without a JSON-RPC error body (proxy/gateway page, 401 with a
      // JSON body, …) — never trust a `result` delivered on an error status.
      throw new TransportError(reason, `${method}: HTTP ${response.status} without a JSON-RPC error body${authHint}`);
    }
    return result;
  }
}

function extractRpcError(error: unknown): RpcErrorBody {
  if (error !== null && typeof error === "object") {
    const raw = error as { code?: unknown; message?: unknown };
    const code = isLosslessNumber(raw.code) ? Number(raw.code.toString()) : typeof raw.code === "number" ? raw.code : 0;
    const message = typeof raw.message === "string" ? raw.message : JSON.stringify(error);
    return { code, message };
  }
  return { code: 0, message: String(error) };
}
