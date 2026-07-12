import { describe, expect, it } from "vitest";
import {
  isLosslessNumber,
  LosslessNumber,
  parseLossless,
  stringifyLossless,
  toJsNumbers,
  toSafeNumbers,
} from "../src/lossless.js";

describe("parseLossless", () => {
  it("preserves number literals exactly", () => {
    const tree = parseLossless('{"VRSCTEST":2.00000000}') as Record<string, unknown>;
    const value = tree["VRSCTEST"];
    expect(isLosslessNumber(value)).toBe(true);
    expect(String(value)).toBe("2.00000000");
  });
});

describe("toSafeNumbers", () => {
  it("keeps safe integers as number, converts the rest to exact strings", () => {
    const tree = parseLossless('{"height":4147436,"neg":-497513811,"frac":2.1,"big":9007199254740993,"fee":1e-6}');
    expect(toSafeNumbers(tree)).toEqual({
      height: 4_147_436,
      neg: -497_513_811,
      frac: "2.1",
      big: "9007199254740993", // 2^53+1 — Number() would silently round this
      fee: "1e-6",
    });
  });

  it("recurses through arrays and nested objects, leaves other types alone", () => {
    const tree = parseLossless('{"a":[{"x":0.30000000}],"s":"1.5","b":true,"n":null}');
    expect(toSafeNumbers(tree)).toEqual({ a: [{ x: "0.30000000" }], s: "1.5", b: true, n: null });
  });
});

describe("toJsNumbers", () => {
  it("applies classic JSON.parse semantics (float64)", () => {
    const tree = parseLossless('{"frac":2.1,"height":100}');
    expect(toJsNumbers(tree)).toEqual({ frac: 2.1, height: 100 });
  });
});

describe("stringifyLossless", () => {
  it("writes LosslessNumber and bigint as exact number tokens", () => {
    expect(stringifyLossless({ a: new LosslessNumber("0.10000000"), b: 5n })).toBe('{"a":0.10000000,"b":5}');
  });

  it("throws on unserializable values", () => {
    expect(() => stringifyLossless(undefined)).toThrow(TypeError);
  });
});
