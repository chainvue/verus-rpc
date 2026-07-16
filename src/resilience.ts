import {
  BrokenCircuitError,
  ConsecutiveBreaker,
  TaskCancelledError,
  TimeoutStrategy,
  circuitBreaker,
  handleWhen,
  timeout,
  wrap,
} from "cockatiel";
import { TransportError } from "./errors.js";
import type { RpcTransport } from "./transport.js";

/**
 * Opt-in resilience (off by default) — this is a library, consumers own
 * their retry/breaker posture. When enabled: per-attempt timeout + a
 * consecutive-failure circuit breaker. Application errors (`VerusRpcError`)
 * never trip the breaker — only transport failures count (v402 DoS lesson).
 */
export interface ResilienceConfig {
  /** Per-attempt timeout applied by the policy. Default 10s. */
  timeoutMs?: number;
  breaker?: {
    /** Consecutive transport failures before the circuit opens. Default 5. */
    failuresBeforeOpen?: number;
    /** Time until a half-open probe is allowed. Default 30s. */
    recoveryMs?: number;
  };
}

const DEFAULTS = { timeoutMs: 10_000, failuresBeforeOpen: 5, recoveryMs: 30_000 };

function isTransportFailure(err: unknown): boolean {
  // "auth" (HTTP 401/403) and "aborted" (deliberate caller cancel) are
  // client-side conditions — the node is healthy, so neither may open the
  // circuit. Policy timeouts (TaskCancelledError) DO count.
  return (
    (err instanceof TransportError && err.reason !== "auth" && err.reason !== "aborted") ||
    err instanceof TaskCancelledError
  );
}

/** Wrap a transport with timeout + circuit breaker per `config`. */
export function withResilience(transport: RpcTransport, config: ResilienceConfig): RpcTransport {
  const timeoutMs = config.timeoutMs ?? DEFAULTS.timeoutMs;
  const breakerConfig = config.breaker ?? {};
  const policy = wrap(
    circuitBreaker(handleWhen(isTransportFailure), {
      halfOpenAfter: breakerConfig.recoveryMs ?? DEFAULTS.recoveryMs,
      breaker: new ConsecutiveBreaker(breakerConfig.failuresBeforeOpen ?? DEFAULTS.failuresBeforeOpen),
    }),
    timeout(timeoutMs, TimeoutStrategy.Aggressive),
  );

  return {
    async request(method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
      try {
        // The policy's signal aborts the in-flight HTTP request on policy
        // timeout — without it, a timed-out call keeps running against the
        // daemon (duplicate-send hazard if the caller retries). The caller's
        // signal is combined HERE rather than handed to cockatiel: that way a
        // deliberate caller abort surfaces from the transport as reason
        // "aborted", which isTransportFailure exempts — only real node
        // trouble (policy timeouts included) moves the breaker.
        return await policy.execute(({ signal: policySignal }) =>
          transport.request(
            method,
            params,
            signal === undefined ? policySignal : AbortSignal.any([policySignal, signal]),
          ),
        );
      } catch (err) {
        if (err instanceof BrokenCircuitError) {
          throw new TransportError("circuit-open", `${method}: circuit breaker is open`);
        }
        if (err instanceof TaskCancelledError) {
          throw new TransportError("timeout", `${method}: no response within ${timeoutMs}ms`);
        }
        throw err;
      }
    },
  };
}
