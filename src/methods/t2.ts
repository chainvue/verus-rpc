import { toSafeNumbers } from "../lossless.js";
import { expectArray } from "../mapping.js";
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

/**
 * Coerce a declared-`string` value field on every entry of a T2 list.
 *
 * An ABSENT field stays absent: `String(undefined)` would materialize the
 * key as the truthy string "undefined", hiding exactly the daemon drift the
 * tier exists to surface. The list itself is checked, so a non-array reply
 * fails as a ResponseMappingError naming the method rather than as a raw
 * TypeError from `.map`.
 */
export function decimalStringEntries<T extends Record<string, unknown>>(raw: unknown, method: string, field: string): T[] {
  return expectArray(raw, method).map((entry) => {
    const obj = entry as T;
    const value = obj[field];
    return value === undefined ? obj : { ...obj, [field]: decimalString(value) };
  });
}
