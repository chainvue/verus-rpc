import { toSafeNumbers } from "../lossless.js";
import type { RpcTransport } from "../transport.js";

/**
 * T2 request: safe-number conversion + typed cast, no per-field validation.
 * The T2 contract is typing + exact decimal strings for value fields; the
 * strong per-field honesty check is T1's fixture-backed mapping.
 */
export async function requestT2<T>(transport: RpcTransport, method: string, params: unknown[]): Promise<T> {
  return toSafeNumbers(await transport.request(method, params)) as T;
}
