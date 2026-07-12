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
  return err instanceof TransportError || err instanceof TaskCancelledError;
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
    async request(method: string, params: unknown[]): Promise<unknown> {
      try {
        return await policy.execute(() => transport.request(method, params));
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
