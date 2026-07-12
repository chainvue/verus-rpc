/**
 * Lossless JSON layer — the daemon emits value amounts as JSON decimal
 * numbers (`{"VRSCTEST":2.00000000}`), so the transport never runs them
 * through `JSON.parse`'s float64. Number literals survive parsing as
 * `LosslessNumber` (exact decimal string inside) until a mapper decides what
 * they are.
 */
import { isLosslessNumber, LosslessNumber, parse, stringify } from "lossless-json";

export { isLosslessNumber, LosslessNumber };

/** Parse JSON text with number literals preserved as `LosslessNumber`. */
export function parseLossless(text: string): unknown {
  return parse(text);
}

/**
 * Serialize a request/params tree. `LosslessNumber` and `bigint` nodes are
 * written as exact JSON number tokens — outbound amounts keep full precision
 * without relying on the daemon accepting strings for numeric params.
 */
export function stringifyLossless(value: unknown): string {
  const text = stringify(value);
  if (text === undefined) {
    throw new TypeError("value is not serializable to JSON");
  }
  return text;
}

/**
 * Deep-convert `LosslessNumber` nodes for surfaces without curated types
 * (unknown T1 passthrough fields, `call()` in "lossless" mode):
 * safe integers become `number`, everything else (fractional values,
 * integers beyond 2^53) becomes an exact decimal `string`. No float64
 * rounding can occur.
 */
export function toSafeNumbers(tree: unknown): unknown {
  return transformNumbers(tree, (ln) => {
    const text = ln.toString();
    const value = Number(text);
    return Number.isSafeInteger(value) && String(value) === text ? value : text;
  });
}

/**
 * Deep-convert `LosslessNumber` nodes to plain JS `number` — classic
 * `JSON.parse` semantics. Float64 rounding applies; documented as unsafe for
 * arithmetic on amounts. Used by `call()` in "js" mode only.
 */
export function toJsNumbers(tree: unknown): unknown {
  return transformNumbers(tree, (ln) => Number(ln.toString()));
}

function transformNumbers(tree: unknown, convert: (ln: LosslessNumber) => unknown): unknown {
  if (isLosslessNumber(tree)) {
    return convert(tree);
  }
  if (Array.isArray(tree)) {
    return tree.map((item) => transformNumbers(item, convert));
  }
  if (tree !== null && typeof tree === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tree)) {
      out[key] = transformNumbers(value, convert);
    }
    return out;
  }
  return tree;
}
