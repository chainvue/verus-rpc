import { TransportError, VerusRpcError, type TransportFailureReason } from "./errors.js";
import { parseLossless, stringifyLossless } from "./lossless.js";
import type { RpcTransport } from "./transport.js";

type MockOutcome =
  | { kind: "result"; json: string }
  | { kind: "rpc-error"; code: number; message: string }
  | { kind: "transport-error"; reason: TransportFailureReason; message: string };

/**
 * In-memory transport for unit tests (exported for consumers too, e.g.
 * Peculium's test suite). Responses round-trip through the lossless JSON
 * layer, so number handling behaves exactly like production.
 */
export class MockTransport implements RpcTransport {
  /** Every request made, in order. */
  readonly calls: { method: string; params: unknown[] }[] = [];

  private readonly queues = new Map<string, MockOutcome[]>();
  private readonly sticky = new Map<string, MockOutcome>();

  /** Queue one response for `method`. `value` may contain bigint/LosslessNumber. */
  respond(method: string, value: unknown): this {
    return this.push(method, { kind: "result", json: stringifyLossless(value) });
  }

  /** Queue one response from raw JSON text (exactly what the daemon would send in `result`). */
  respondJson(method: string, json: string): this {
    return this.push(method, { kind: "result", json });
  }

  /** Every future unqueued call of `method` gets this response. */
  respondAlways(method: string, value: unknown): this {
    this.sticky.set(method, { kind: "result", json: stringifyLossless(value) });
    return this;
  }

  /** Queue a daemon error (JSON-RPC error body). */
  respondError(method: string, code: number, message: string): this {
    return this.push(method, { kind: "rpc-error", code, message });
  }

  /** Queue a transport failure. */
  failTransport(
    method: string,
    reason: TransportFailureReason = "network",
    message = "mocked transport failure",
  ): this {
    return this.push(method, { kind: "transport-error", reason, message });
  }

  request(method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
    this.calls.push({ method, params });
    // Mirror the real transport: a pre-aborted signal rejects as "aborted"
    // before any response is consumed, so cancellation is testable end-to-end.
    if (signal?.aborted) {
      return Promise.reject(new TransportError("aborted", `${method}: aborted`));
    }
    const queue = this.queues.get(method);
    const outcome = queue !== undefined && queue.length > 0 ? queue.shift() : this.sticky.get(method);
    if (outcome === undefined) {
      return Promise.reject(new TransportError("bad-response", `MockTransport: no response queued for ${method}`));
    }
    switch (outcome.kind) {
      case "result":
        return Promise.resolve(parseLossless(outcome.json));
      case "rpc-error":
        return Promise.reject(new VerusRpcError(method, outcome.code, outcome.message));
      case "transport-error":
        return Promise.reject(new TransportError(outcome.reason, `${method}: ${outcome.message}`));
    }
  }

  private push(method: string, outcome: MockOutcome): this {
    const queue = this.queues.get(method);
    if (queue === undefined) {
      this.queues.set(method, [outcome]);
    } else {
      queue.push(outcome);
    }
    return this;
  }
}
