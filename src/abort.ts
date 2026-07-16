/** A composed abort signal plus the teardown that detaches it from its sources. */
export interface LinkedAbort {
  signal: AbortSignal;
  /** Detach from every source signal and cancel the timeout. Idempotent. */
  unlink: () => void;
}

/**
 * Compose abort sources (and an optional timeout) into one signal with
 * deterministic teardown. `AbortSignal.any` keeps its registration on each
 * source until the composite fires or is collected — so per-request
 * composites over a long-lived caller signal pile up listeners for as long
 * as that signal lives (MaxListenersExceededWarning at 11+ concurrent
 * requests sharing one signal, plus retained memory). Callers MUST invoke
 * `unlink()` when the guarded work settles.
 *
 * The timeout aborts with a `DOMException` named "TimeoutError", matching
 * `AbortSignal.timeout`; source aborts propagate the source's reason.
 */
export function linkedAbort(sources: (AbortSignal | undefined)[], timeoutMs?: number): LinkedAbort {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  const unlink = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
  if (timeoutMs !== undefined) {
    const timer = setTimeout(() => {
      controller.abort(new DOMException(`timed out after ${timeoutMs}ms`, "TimeoutError"));
    }, timeoutMs);
    cleanups.push(() => clearTimeout(timer));
  }
  for (const source of sources) {
    if (source === undefined) continue;
    if (source.aborted) {
      controller.abort(source.reason);
      break;
    }
    const onAbort = (): void => controller.abort(source.reason);
    source.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => source.removeEventListener("abort", onAbort));
  }
  return { signal: controller.signal, unlink };
}
