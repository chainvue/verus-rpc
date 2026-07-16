import { describe, expect, it } from "vitest";
import { formatAmount, parseAmount, SATS_PER_COIN } from "../src/amount.js";

describe("parseAmount", () => {
  it("parses the daemon's 8-decimal notation", () => {
    expect(parseAmount("2.00000000")).toBe(200_000_000n);
    expect(parseAmount("0.10000000")).toBe(10_000_000n);
    expect(parseAmount("1")).toBe(SATS_PER_COIN);
  });

  it("parses zero in all its costumes", () => {
    expect(parseAmount("0")).toBe(0n);
    expect(parseAmount("0.00000000")).toBe(0n);
    expect(parseAmount("-0")).toBe(0n);
    expect(parseAmount("0e10")).toBe(0n);
  });

  it("parses dust", () => {
    expect(parseAmount("0.00000001")).toBe(1n);
  });

  it("parses scientific notation (relayfee arrives as 1e-6 on mainnet)", () => {
    expect(parseAmount("1e-6")).toBe(100n);
    expect(parseAmount("1E-6")).toBe(100n);
    expect(parseAmount("2e-8")).toBe(2n);
    expect(parseAmount("1e8")).toBe(10_000_000_000_000_000n);
    expect(parseAmount("2.5e1")).toBe(2_500_000_000n);
  });

  it("is exact beyond 2^53 sats", () => {
    // 92233720368.54775807 coins = 2^63-1 sats — float64 could never hold this.
    expect(parseAmount("92233720368.54775807")).toBe(9_223_372_036_854_775_807n);
    expect(parseAmount("90071992.54740993")).toBe(9_007_199_254_740_993n); // 2^53+1
  });

  it("parses the VRSC max supply exactly", () => {
    expect(parseAmount("83540184.53174767")).toBe(8_354_018_453_174_767n);
  });

  it("rejects negatives by default, accepts them with allowNegative", () => {
    expect(() => parseAmount("-0.10000000")).toThrow(RangeError);
    expect(parseAmount("-0.10000000", { allowNegative: true })).toBe(-10_000_000n);
    expect(parseAmount("-2", { allowNegative: true })).toBe(-200_000_000n);
  });

  it("rejects sub-satoshi precision", () => {
    expect(() => parseAmount("0.000000001")).toThrow(RangeError);
    expect(() => parseAmount("1.123456789")).toThrow(RangeError);
    expect(() => parseAmount("1e-9")).toThrow(RangeError);
  });

  it("accepts sub-satoshi digits when they are all zeros", () => {
    expect(parseAmount("1.2300000000")).toBe(123_000_000n);
  });

  it("rejects out-of-range exponents cheaply (no giant allocation)", () => {
    expect(() => parseAmount("1e999999999")).toThrow(/exponent out of range/);
    expect(() => parseAmount("1e-999999999")).toThrow(/exponent out of range/);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1.", ".5", "1,5", "NaN", "Infinity", "0x10", "1 "]) {
      expect(() => parseAmount(bad), bad).toThrow(RangeError);
    }
  });

  it("accepts an explicit leading plus (human input)", () => {
    expect(parseAmount("+2.5")).toBe(250_000_000n);
  });
});

describe("formatAmount", () => {
  it("formats with fixed 8 decimals", () => {
    expect(formatAmount(200_000_000n)).toBe("2.00000000");
    expect(formatAmount(0n)).toBe("0.00000000");
    expect(formatAmount(1n)).toBe("0.00000001");
    expect(formatAmount(-10_000_000n)).toBe("-0.10000000");
    expect(formatAmount(8_354_018_453_174_767n)).toBe("83540184.53174767");
  });

  it("round-trips with parseAmount", () => {
    for (const sats of [0n, 1n, 99n, 10_000_000n, 8_354_018_453_174_767n, 9_223_372_036_854_775_807n]) {
      expect(parseAmount(formatAmount(sats))).toBe(sats);
    }
    expect(parseAmount(formatAmount(-42n), { allowNegative: true })).toBe(-42n);
  });
});
