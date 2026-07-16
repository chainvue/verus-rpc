/** A composed abort signal plus the teardown that detaches it from its sources. */
export interface LinkedAbort {
  signal: AbortSignal;
  /** Detach from every source signal and cancel the timeout. Idempotent. */
  unlink: () => void;
}

/**
 * Compose abort sources (and an optional timeout) into one signal with
 * deterministic teardown. `AbortSignal.any` keeps its (internal, weak)
 * registrations on each source until the composite aborts or is
 * garbage-collected — per-request composites over a long-lived caller signal
 * are therefore retained for an unbounded, GC-dependent time after the
 * request settles. Here teardown is explicit: callers MUST invoke `unlink()`
 * when the guarded work settles, and every abort path also tears down
 * eagerly on its own — so even work that never settles (an abort-ignoring
 * fetch implementation) cannot park listeners on a shared caller signal
 * beyond the abort itself.
 *
 * The timeout aborts with a `DOMException` named "TimeoutError", matching
 * `AbortSignal.timeout` (including its unref'd timer — the pending timeout
 * never holds a Node process open); source aborts propagate the source's
 * reason. A pre-aborted source short-circuits: nothing is armed and `unlink`
 * is a no-op.
 */
/**
 * `setTimeout` returns an opaque number in browsers and a Timeout object in
 * Node; only the latter can (and must) be unref'd so a pending timeout never
 * holds the process open — matching `AbortSignal.timeout`. The structural
 * check keeps this file compiling under either lib typing.
 */
function unrefTimer(timer: unknown): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
}

export function linkedAbort(sources: (AbortSignal | undefined)[], timeoutMs?: number): LinkedAbort {
  const controller = new AbortController();
  for (const source of sources) {
    if (source !== undefined && source.aborted) {
      controller.abort(source.reason);
      return { signal: controller.signal, unlink: () => undefined };
    }
  }
  const cleanups: (() => void)[] = [];
  const unlink = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
  const abortAndUnlink = (reason: unknown): void => {
    unlink();
    controller.abort(reason);
  };
  if (timeoutMs !== undefined) {
    const timer = setTimeout(() => {
      abortAndUnlink(new DOMException(`timed out after ${timeoutMs}ms`, "TimeoutError"));
    }, timeoutMs);
    unrefTimer(timer);
    cleanups.push(() => clearTimeout(timer));
  }
  for (const source of sources) {
    if (source === undefined) continue;
    const onAbort = (): void => abortAndUnlink(source.reason);
    source.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => source.removeEventListener("abort", onAbort));
  }
  return { signal: controller.signal, unlink };
}
