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

/**
 * Make a T2 value field honest to its declared `string` type.
 *
 * `toSafeNumbers` renders a safe INTEGER as `number` and everything else as
 * an exact decimal string, so whether a T2 amount arrives as a string is a
 * function of the daemon's formatting, not of our types. verusd's
 * `ValueFromAmount` emits 8 decimals ("2.00000000"), which never round-trips
 * to a JS number — so in practice these fields do arrive as strings. This
 * keeps the declared type true even if that ever stops holding, at any
 * field declared `string`.
 */
export function decimalString(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}
