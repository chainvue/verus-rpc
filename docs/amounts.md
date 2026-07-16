# Amounts

The core invariant: **no float ever crosses the public API for a value
field.** This page is the mental model.

## Why

`verusd` returns amounts as JSON decimal numbers. Two failure modes make
naive `JSON.parse` unsafe:

1. **Arithmetic on floats** — `0.1 + 0.2 !== 0.3` in float64.
2. **Integers beyond 2^53** — Verus max supply (~83.5M coins ≈ 8.35e15 sats)
   is close enough to `Number.MAX_SAFE_INTEGER` (9.007e15) that satoshi-scale
   integers can silently lose precision.

Mainnet even sends `relayfee` as `1e-6`. The transport parses the body
losslessly, so a number literal reaches a mapper as an exact decimal string,
never a float.

## The three surfaces

| Surface | Value type | Example |
|---|---|---|
| Curated (T1) | `bigint` satoshis | `getBalance()` → `200_000_000n` |
| Typed (T2) | exact decimal `string` | `zGetBalance()` → `"2.00000000"` |
| `call()` | safe int → `number`, else exact `string` | `call("getcurrencybalance", …)` |

`bigint` satoshis are the arithmetic-safe representation: 1 VRSC =
`100_000_000n`. The same 1e8-scaling applies to non-money 8-decimal values
like reserve weights and conversion prices — one convention everywhere.

## Helpers

```ts
import { parseAmount, formatAmount, amountParam, SATS_PER_COIN } from "@chainvue/verus-rpc";

parseAmount("2.00000000")      // 200_000_000n
parseAmount("1e-6")            // 100n   (scientific notation on the wire)
parseAmount("-0.1", { allowNegative: true })  // -10_000_000n
formatAmount(200_000_000n)     // "2.00000000"
amountParam(200_000_000n)      // LosslessNumber — serializes as the exact token 2.00000000
```

`parseAmount` rejects negatives by default and throws on sub-satoshi
precision or malformed input. Signed value fields (`gettransaction.amount`,
address deltas) opt in with `allowNegative`.

## Escape hatch numbers

```ts
await client.call("getcurrencybalance", ["addr@"]);                 // { VRSCTEST: "2.00000000" }
await client.call("getcurrencybalance", ["addr@"], { numbers: "js" }); // { VRSCTEST: 2 }  — float64
```

`"js"` is the explicit opt-in to classic `JSON.parse` semantics. Documented
as unsafe for arithmetic on amounts.
