import {
  OperationFailedError,
  OperationTimeoutError,
  ResponseMappingError,
  RpcErrorCode,
  TransportError,
  VerusRpcError,
} from "../errors.js";
import type { OperationStatus } from "./wallet.js";

/** A `setTimeout` sleep that rejects promptly if `signal` aborts mid-wait. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransportError("aborted", "polling aborted"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new TransportError("aborted", "polling aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Throw a `TransportError("aborted")` if the caller's signal is already aborted. */
export function throwIfAborted(signal: AbortSignal | undefined, context: string): void {
  if (signal?.aborted) throw new TransportError("aborted", `${context} aborted`);
}

/**
 * Extract the txid from a final "success" status. A success entry without
 * `result.txid` is daemon response-shape drift, NOT an operation failure —
 * the send completed on the daemon — so it must never surface as a
 * retry-shaped error (retrying a completed send double-spends). It throws
 * `ResponseMappingError` naming the drifted method+field, like every other
 * shape mismatch.
 */
export function requireTxid(status: OperationStatus): string {
  const txid = status.result?.txid;
  if (typeof txid !== "string") {
    throw new ResponseMappingError("z_getoperationstatus", "result.txid", `success without txid (opid ${status.id})`);
  }
  return txid;
}

/**
 * Poll an async wallet operation (opid) until it reaches a final state.
 *
 * `fetchStatus` performs one z_getoperationstatus round-trip and returns the
 * matching entry (or undefined while the daemon has not listed it yet).
 * Transient failures are tolerated until the deadline — the operation is
 * already in flight and must not be abandoned, and re-driving the whole send
 * on a poll error would double-spend. Tolerated: any non-auth/non-aborted
 * transport failure, plus the daemon's warmup window (`RPC_IN_WARMUP`, e.g. a
 * mid-poll daemon restart). "auth" (bad credentials), "aborted" (deliberate
 * cancel), and any other daemon error cannot recover by re-polling and fail
 * immediately.
 *
 * `signal` (optional) makes the wait cancellable: it aborts the in-flight
 * poll request (the closure passes it to the transport) and is checked at the
 * top of each iteration and during the inter-poll sleep, so a cancel surfaces
 * as `TransportError("aborted")` within one interval rather than after up to
 * `timeoutMs`. The already-broadcast operation still completes on the daemon.
 */
export async function pollOperation(
  fetchStatus: () => Promise<OperationStatus | undefined>,
  opid: string,
  timing: { intervalMs: number; timeoutMs: number },
  signal?: AbortSignal,
): Promise<OperationStatus> {
  const deadline = Date.now() + timing.timeoutMs;
  let lastPollError: TransportError | VerusRpcError | undefined;
  for (;;) {
    throwIfAborted(signal, `operation ${opid} polling`);
    let status: OperationStatus | undefined;
    try {
      status = await fetchStatus();
      lastPollError = undefined;
    } catch (err) {
      const transient =
        (err instanceof TransportError && err.reason !== "auth" && err.reason !== "aborted") ||
        (err instanceof VerusRpcError && err.code === RpcErrorCode.RPC_IN_WARMUP);
      if (!transient) throw err;
      lastPollError = err;
    }
    if (status !== undefined) {
      if (status.status === "success") return status;
      if (status.status === "failed" || status.status === "cancelled") {
        throw new OperationFailedError(opid, status.status, status.error?.code, status.error?.message ?? "no error message");
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new OperationTimeoutError(opid, timing.timeoutMs, lastPollError);
    }
    await sleep(Math.min(timing.intervalMs, remaining), signal);
  }
}
