/**
 * Exact amount handling — the library's core invariant is that no float ever
 * crosses the public API for a value field. Curated (T1) methods surface
 * amounts as `bigint` satoshis; these helpers convert between that and the
 * daemon's 8-decimal notation.
 */

/** Verus amounts have 8 decimal places: 1 VRSC = 100_000_000 satoshis. */
export const SATS_PER_COIN = 100_000_000n;

const AMOUNT_DECIMALS = 8;

// Full JSON number grammar plus an optional leading "+" for human input.
const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

export interface ParseAmountOptions {
  /**
   * Accept negative amounts. Off by default — most value fields are
   * non-negative; signed fields (e.g. `gettransaction.amount`) opt in.
   */
  allowNegative?: boolean;
}

/**
 * Parse an exact decimal amount string into bigint satoshis.
 *
 * `parseAmount("2.00000000") === 200_000_000n`
 *
 * Throws `RangeError` on anything that is not an exact amount: malformed
 * input, more than 8 decimal places of significance, or (by default)
 * negative values.
 */
export function parseAmount(value: string, options?: ParseAmountOptions): bigint {
  const match = DECIMAL_RE.exec(value);
  if (match === null) {
    throw new RangeError(`not a decimal amount: ${JSON.stringify(value)}`);
  }
  const [, sign = "", intPart = "", fracPart = "", expPart] = match;
  const exponent = expPart === undefined ? 0 : Number(expPart);

  // Shift the decimal point right by (AMOUNT_DECIMALS + exponent) places.
  const digits = intPart + fracPart;
  const pointIndex = intPart.length + exponent + AMOUNT_DECIMALS;
  if (pointIndex < 0) {
    // Entire value sits below 1 sat — only exact zero is representable.
    if (/^0*$/.test(digits)) return 0n;
    throw new RangeError(`more than ${AMOUNT_DECIMALS} decimal places: ${value}`);
  }
  const head = digits.slice(0, pointIndex).padEnd(pointIndex, "0");
  const tail = digits.slice(pointIndex);
  if (!/^0*$/.test(tail)) {
    throw new RangeError(`more than ${AMOUNT_DECIMALS} decimal places: ${value}`);
  }

  const sats = head === "" ? 0n : BigInt(head);
  if (sign === "-") {
    if (sats === 0n) return 0n; // normalize -0
    if (options?.allowNegative !== true) {
      throw new RangeError(`negative amount: ${value}`);
    }
    return -sats;
  }
  return sats;
}

/**
 * Format bigint satoshis as the daemon's 8-decimal notation.
 *
 * `formatAmount(200_000_000n) === "2.00000000"`
 */
export function formatAmount(sats: bigint): string {
  const negative = sats < 0n;
  const abs = negative ? -sats : sats;
  const coins = abs / SATS_PER_COIN;
  const frac = abs % SATS_PER_COIN;
  return `${negative ? "-" : ""}${coins}.${frac.toString().padStart(AMOUNT_DECIMALS, "0")}`;
}
