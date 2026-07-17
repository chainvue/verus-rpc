/**
 * Error taxonomy — the split matters for resilience:
 *
 * - `VerusRpcError` — the daemon answered with a JSON-RPC error (bad params,
 *   unknown identity, insufficient funds, …). The node is HEALTHY; these never
 *   count toward the optional circuit breaker, otherwise malformed requests
 *   could trip it and deny service (v402 lesson).
 * - `TransportError` — the node could not be reached, did not answer in time,
 *   answered with an unparseable body, or the breaker is open.
 *
 * Two `TransportError` reasons are client-side conditions, not node health,
 * and never count toward the circuit breaker: `"auth"` (HTTP 401/403 — bad
 * or missing rpcuser/rpcpassword) and `"aborted"` (the caller's AbortSignal
 * cancelled the request deliberately).
 */

export type TransportFailureReason = "network" | "timeout" | "auth" | "aborted" | "bad-response" | "circuit-open";

export class TransportError extends Error {
  readonly reason: TransportFailureReason;

  constructor(reason: TransportFailureReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransportError";
    this.reason = reason;
  }
}

/**
 * Common daemon error codes (Bitcoin/Zcash lineage, `rpcprotocol.h`) so
 * consumers can branch on `error.code` without string-matching messages.
 */
export const RpcErrorCode = {
  // JSON-RPC 2.0-style protocol errors
  RPC_INVALID_REQUEST: -32600,
  RPC_METHOD_NOT_FOUND: -32601,
  RPC_INVALID_PARAMS: -32602,
  RPC_INTERNAL_ERROR: -32603,
  RPC_PARSE_ERROR: -32700,
  // General application errors
  RPC_MISC_ERROR: -1,
  RPC_FORBIDDEN_BY_SAFE_MODE: -2,
  RPC_TYPE_ERROR: -3,
  RPC_INVALID_ADDRESS_OR_KEY: -5,
  RPC_OUT_OF_MEMORY: -7,
  RPC_INVALID_PARAMETER: -8,
  RPC_DATABASE_ERROR: -20,
  RPC_DESERIALIZATION_ERROR: -22,
  RPC_VERIFY_ERROR: -25,
  RPC_VERIFY_REJECTED: -26,
  RPC_VERIFY_ALREADY_IN_CHAIN: -27,
  RPC_IN_WARMUP: -28,
  // P2P client errors
  RPC_CLIENT_NOT_CONNECTED: -9,
  RPC_CLIENT_IN_INITIAL_DOWNLOAD: -10,
  RPC_CLIENT_NODE_ALREADY_ADDED: -23,
  RPC_CLIENT_NODE_NOT_ADDED: -24,
  // Wallet errors
  RPC_WALLET_ERROR: -4,
  RPC_WALLET_INSUFFICIENT_FUNDS: -6,
  RPC_WALLET_INVALID_ACCOUNT_NAME: -11,
  RPC_WALLET_KEYPOOL_RAN_OUT: -12,
  RPC_WALLET_UNLOCK_NEEDED: -13,
  RPC_WALLET_PASSPHRASE_INCORRECT: -14,
  RPC_WALLET_WRONG_ENC_STATE: -15,
  RPC_WALLET_ENCRYPTION_FAILED: -16,
  RPC_WALLET_ALREADY_UNLOCKED: -17,
  // Not from rpcprotocol.h. Some handlers (e.g. coinsupply) report failures
  // in-band on a success envelope with no JSON-RPC code at all; error bodies
  // can also omit `code`. Both surface with this sentinel.
  RPC_NO_CODE: 0,
} as const;

export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode];

/**
 * The daemon reported an error: a JSON-RPC error body, or an in-band
 * `error` field on a success envelope (then `code` is `RPC_NO_CODE`).
 */
export class VerusRpcError extends Error {
  readonly method: string;
  readonly code: number;

  constructor(method: string, code: number, message: string) {
    super(`${method}: ${message} (code ${code})`);
    this.name = "VerusRpcError";
    this.method = method;
    this.code = code;
  }
}

/**
 * A curated (T1) response did not have the shape the mapper expects — the
 * daemon version drifted or the type curation is wrong. The raw value is
 * intact on the wire; `client.call()` always works as the escape hatch.
 */
export class ResponseMappingError extends Error {
  readonly method: string;
  readonly field: string;

  constructor(method: string, field: string, message: string) {
    super(`${method}: field "${field}": ${message}`);
    this.name = "ResponseMappingError";
    this.method = method;
    this.field = field;
  }
}

/** An async wallet operation (opid) finished with status "failed" or "cancelled". */
export class OperationFailedError extends Error {
  readonly opid: string;
  readonly status: string;
  readonly code: number | undefined;

  constructor(opid: string, status: string, code: number | undefined, message: string) {
    super(`operation ${opid} ${status}: ${message}`);
    this.name = "OperationFailedError";
    this.opid = opid;
    this.status = status;
    this.code = code;
  }
}

/**
 * An async wallet operation (opid) did not reach a final state within the
 * polling deadline. If polling itself was failing at the deadline, the last
 * poll error (a `TransportError`, or a warmup `VerusRpcError`) is attached as
 * `cause`. The operation may still complete on the daemon — check the opid
 * before retrying the send.
 */
export class OperationTimeoutError extends Error {
  readonly opid: string;
  readonly timeoutMs: number;

  constructor(opid: string, timeoutMs: number, cause?: unknown) {
    // Only attach a cause when one exists — an unconditional { cause } would
    // define an own `cause: undefined` property, changing `"cause" in err`.
    super(`operation ${opid} still pending after ${timeoutMs}ms`, cause === undefined ? undefined : { cause });
    this.name = "OperationTimeoutError";
    this.opid = opid;
    this.timeoutMs = timeoutMs;
  }
}
