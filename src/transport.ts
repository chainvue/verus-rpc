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
   */
  request(method: string, params: unknown[]): Promise<unknown>;
}

export interface DaemonTransportConfig {
  /** e.g. `http://127.0.0.1:27486` (VRSC) / `:18843` (VRSCTEST) */
  url: string;
  user: string;
  pass: string;
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
  private readonly authorization: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: DaemonTransportConfig) {
    if (config.url === "") throw new TypeError("DaemonTransport: url must not be empty");
    this.url = config.url;
    this.authorization = "Basic " + toBase64(`${config.user}:${config.pass}`);
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request(method: string, params: unknown[]): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: this.authorization,
        },
        body: stringifyLossless({ jsonrpc: "1.0", id: "verus-rpc", method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new TransportError("timeout", `${method}: no response within ${this.timeoutMs}ms`);
      }
      throw new TransportError("network", `${method}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = parseLossless(text);
    } catch {
      throw new TransportError("bad-response", `${method}: HTTP ${response.status}, non-JSON body`);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new TransportError("bad-response", `${method}: HTTP ${response.status}, non-object body`);
    }

    const { result, error } = body as { result?: unknown; error?: unknown };
    if (error !== undefined && error !== null) {
      const { code, message } = extractRpcError(error);
      throw new VerusRpcError(method, code, message);
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
