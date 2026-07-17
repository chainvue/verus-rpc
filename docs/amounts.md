# Amounts

The core invariant: **no float ever crosses the public API for a value
field.** This page is the mental model.

## Why

`verusd` returns amounts as JSON decimal numbers. Run them through
`JSON.parse` and two things go wrong:

1. **Float arithmetic is lossy at any magnitude.** `0.1 + 0.2 !== 0.3` in
   float64. The moment you add, subtract, or scale a parsed amount, the result
   can be off by a satoshi — silently, with no error.

2. **Large token amounts exceed float64's exact-integer range.** A JSON number
   holds integers exactly only up to `2^53` sats (`90_071_992.54740992`
   coins). VRSC's own max supply (~83.5M coins) sits *just under* that line, so
   a VRSC balance happens to survive a `JSON.parse` round-trip unrounded — but
   that is luck, not safety. A PBaaS currency can carry far more: the token
   amount `21000000000.12345678` loses **78 satoshis** through `JSON.parse`
   (`2100000000012345678` → `…345600`). Precisely because this client keeps
   sats exact by construction, it is the right choice for the large-supply
   tokens where naive parsing quietly breaks.

Even the wire form resists a round-trip: mainnet sends `relayfee` as `1e-6`,
balances carry trailing zeros. The transport parses the body losslessly, so a
number literal reaches a mapper as an exact decimal string — never a float —
and curated methods turn it into `bigint` sats.

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
