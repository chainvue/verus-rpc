/**
 * Response-mapping helpers for curated (T1) methods. Mappers receive the raw
 * lossless tree from the transport (`LosslessNumber` for every number
 * literal) and produce the curated shape: value fields as bigint sats,
 * heights/counts/timestamps as `number`, unknown fields passed through with
 * safe-number conversion (safe integers → number, everything else → exact
 * decimal string — no float64 rounding, ever).
 */
import { parseAmount } from "./amount.js";
import { ResponseMappingError } from "./errors.js";
import { isLosslessNumber, toSafeNumbers } from "./lossless.js";

export interface FieldContext {
  method: string;
  field: string;
}

function fail(ctx: FieldContext, message: string): never {
  throw new ResponseMappingError(ctx.method, ctx.field, message);
}

/** A known value field: exact decimal → bigint sats. */
export function mapAmount(value: unknown, ctx: FieldContext, opts?: { signed?: boolean }): bigint {
  if (!isLosslessNumber(value)) {
    fail(ctx, `expected a JSON number (amount), got ${describe(value)}`);
  }
  try {
    return parseAmount(value.toString(), opts?.signed === true ? { allowNegative: true } : undefined);
  } catch (err) {
    fail(ctx, err instanceof Error ? err.message : String(err));
  }
}

export function mapAmountOptional(
  value: unknown,
  ctx: FieldContext,
  opts?: { signed?: boolean },
): bigint | undefined {
  return value === undefined || value === null ? undefined : mapAmount(value, ctx, opts);
}

/**
 * A satoshi-INTEGER field (addressindex family emits raw sats, not
 * decimals) → bigint. Exact at any magnitude.
 */
export function mapSats(value: unknown, ctx: FieldContext, opts?: { signed?: boolean }): bigint {
  if (!isLosslessNumber(value)) {
    fail(ctx, `expected a JSON number (integer satoshis), got ${describe(value)}`);
  }
  const text = value.toString();
  if (!/^-?\d+$/.test(text)) {
    fail(ctx, `expected integer satoshis, got ${text}`);
  }
  const sats = BigInt(text);
  if (sats < 0n && opts?.signed !== true) {
    fail(ctx, `negative satoshis: ${text}`);
  }
  return sats;
}

export function mapSatsOptional(value: unknown, ctx: FieldContext, opts?: { signed?: boolean }): bigint | undefined {
  return value === undefined || value === null ? undefined : mapSats(value, ctx, opts);
}

/** Heights, counts, indexes, timestamps — plain safe integers. */
export function mapInt(value: unknown, ctx: FieldContext): number {
  if (!isLosslessNumber(value)) {
    fail(ctx, `expected a JSON number (integer), got ${describe(value)}`);
  }
  const text = value.toString();
  const num = Number(text);
  if (!Number.isSafeInteger(num) || String(num) !== text) {
    fail(ctx, `expected a safe integer, got ${text}`);
  }
  return num;
}

export function mapIntOptional(value: unknown, ctx: FieldContext): number | undefined {
  return value === undefined || value === null ? undefined : mapInt(value, ctx);
}

/** Non-value floats (e.g. difficulty) — float64 is the honest type here. */
export function mapFloat(value: unknown, ctx: FieldContext): number {
  if (!isLosslessNumber(value)) {
    fail(ctx, `expected a JSON number, got ${describe(value)}`);
  }
  return Number(value.toString());
}

export function mapString(value: unknown, ctx: FieldContext): string {
  if (typeof value !== "string") {
    fail(ctx, `expected a string, got ${describe(value)}`);
  }
  return value;
}

export function mapStringOptional(value: unknown, ctx: FieldContext): string | undefined {
  return value === undefined || value === null ? undefined : mapString(value, ctx);
}

export function mapBoolean(value: unknown, ctx: FieldContext): boolean {
  if (typeof value !== "boolean") {
    fail(ctx, `expected a boolean, got ${describe(value)}`);
  }
  return value;
}

export function mapBooleanOptional(value: unknown, ctx: FieldContext): boolean | undefined {
  return value === undefined || value === null ? undefined : mapBoolean(value, ctx);
}

export function mapStringArray(value: unknown, ctx: FieldContext): string[] {
  if (!Array.isArray(value)) {
    fail(ctx, `expected an array, got ${describe(value)}`);
  }
  return value.map((item, i) => mapString(item, { method: ctx.method, field: `${ctx.field}[${i}]` }));
}

/** Assert the raw result is a JSON object and return it for field access. */
export function expectObject(value: unknown, method: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || isLosslessNumber(value)) {
    throw new ResponseMappingError(method, "(result)", `expected an object, got ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown, method: string, field = "(result)"): unknown[] {
  if (!Array.isArray(value)) {
    throw new ResponseMappingError(method, field, `expected an array, got ${describe(value)}`);
  }
  return value;
}

/**
 * Merge unmapped fields into a curated object: every key of `raw` not
 * already produced by the mapper is passed through with safe-number
 * conversion. Newer daemons must never break a reader (drift rule).
 */
export function withPassthrough<T extends Record<string, unknown>>(raw: Record<string, unknown>, curated: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(curated)) {
    if (value !== undefined) out[key] = value; // absent optionals stay absent
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in curated)) {
      out[key] = toSafeNumbers(value);
    }
  }
  return out as T;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (isLosslessNumber(value)) return `number (${value.toString()})`;
  if (Array.isArray(value)) return "array";
  return typeof value;
}
