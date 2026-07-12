# verus-rpc

The npm-published, full-coverage, precision-honest TypeScript client for
talking to your own `verusd` — daemon-first JSON-RPC transport and types.

```bash
npm install verus-rpc   # or: pnpm add verus-rpc
```

```ts
import { VerusClient, formatAmount } from "verus-rpc";

// Read-only against the public mainnet RPC — no daemon, no credentials.
const client = new VerusClient({
  url: "https://api.verus.services",
  user: "public",
  pass: "public",
});

const id = await client.identity.getIdentity({ nameOrAddress: "Verus Coin Foundation@" });
console.log(id.identity.identityaddress);

const balance = await client.wallet.getBalance();       // 200_000_000n  (bigint sats)
console.log(formatAmount(balance));                      // "2.00000000"
```

## The one invariant

**No float ever crosses the public API for a value field.**

The daemon emits amounts as JSON decimal numbers (`{"VRSCTEST":2.00000000}`,
and on mainnet even `relayfee:1e-6`). A client that runs those through
`JSON.parse` puts float64 in its money path. `verus-rpc` parses the response
body losslessly and maps every value field to an exact type:

- **Curated methods** → `bigint` satoshis (Verus = 8 decimals). Helpers:
  `parseAmount("2.00000000") === 200_000_000n`, `formatAmount(200_000_000n) === "2.00000000"`.
- **Typed methods** → exact decimal `string`.
- **`call()` escape hatch** → safe integers become `number`, everything else
  an exact decimal `string`; opt into raw float64 with `{ numbers: "js" }`.

Heights, counts and timestamps stay `number`. Unknown fields a newer daemon
adds are passed through (safe integer → `number`, otherwise exact string) —
never stripped, never rounded.

## What this is (and isn't)

Deliberately complementary to the official VerusCoin TypeScript stack. This
library is the **daemon-first RPC transport + types** — the layer VerusCoin
doesn't ship on npm. It does **not** do client-side signing, login consent,
VerusPay invoices, or transaction construction — that is
[`verusid-ts-client`](https://github.com/VerusCoin/verusid-ts-client) and the
BitGo `utxo-lib-verus` fork. Link to them; don't reimplement them.

| Lane | Library |
|---|---|
| Talk to your own `verusd` (this) | **`verus-rpc`** |
| VerusID signing / login / VerusPay | `verusid-ts-client` |
| Transaction building | `@bitgo/utxo-lib` (Verus fork) |
| ZMQ block/tx events | `verus-zmq-client` |

## Coverage tiers

A tier is a promise about **testing**, not just typing.

| Tier | Contract | Families |
|---|---|---|
| **T1 — curated** | Named-options params, curated response types, value fields as `bigint` sats, recorded-fixture conformance test per method | Chain reads, wallet + sends, identity (read + lifecycle), currency/conversion reads, addressindex, `getvdxfid` |
| **T2 — typed** | Typed params/results, value fields as exact decimal strings | Shielded (`z_*`), marketplace, raw-transaction chain, network/util reads, identity signatures/trust |
| **T3 — escape hatch** | `client.call(method, params)` — untyped, always available | everything else — mining/staking, notarization internals, `definecurrency` depth |

Promotion T3→T2→T1 is demand-driven. `call()` means the client never blocks
you on missing coverage.

## Client namespaces

```ts
client.chain        // getInfo, getBlockCount
client.blockchain   // blocks, raw-tx chain, network/util reads, getVdxfId
client.wallet       // balances, transactions, sends, sendCurrencyAndWait, keys
client.shielded     // z_* family + z-operation polling helpers
client.identity     // reads, lifecycle, registerIdentityFlow
client.currency     // getCurrency, listCurrencies, estimateConversion, marketplace
client.addressIndex // getAddressBalance/Utxos/Deltas (arbitrary addresses)
client.call(method, params, { numbers })  // anything else
```

### High-level helpers

- `wallet.sendCurrencyAndWait(...)` — `sendcurrency` returns an operation id;
  this polls `z_getoperationstatus` to success/failure and resolves with the
  txid (or throws `OperationFailedError` / `OperationTimeoutError`).
- `identity.registerIdentityFlow(...)` — `registernamecommitment` →
  wait-for-confirmation → `registeridentity` as one guided call.
- `shielded.zSendManyAndWait(...)` — the same opid pattern for `z_sendmany`.

## Resilience (opt-in)

This is a library — you own your retry/breaker posture. A circuit breaker +
per-attempt timeout are available and **off by default**; application errors
never trip the breaker.

```ts
new VerusClient({ url, user, pass, resilience: { timeoutMs: 5000, breaker: { failuresBeforeOpen: 5 } } });
```

## Errors

- `VerusRpcError(method, code, message)` — the daemon answered with an error.
  Branch on `error.code` via the `RpcErrorCode` enum (no message string-matching).
- `TransportError(reason, message)` — network / timeout / bad-response / circuit-open.
- `ResponseMappingError` — a curated response didn't match the mapper (daemon
  drift); the raw value is still reachable via `call()`.

## Testing

Three rings (see `test/`):

1. **Unit** — `MockTransport` (exported for your tests too); every method's
   param marshalling, error paths, amount edge cases.
2. **Fixture conformance** — responses recorded from a real daemon
   (`fixtures/`), curated mappers validated **offline**. This is the
   type-honesty check.
3. **Gated integration** — set `VERUS_RPC_URL` to run read-only against your
   node; `VERUS_RPC_MAINNET_SMOKE=1` runs a read-only smoke against
   api.verus.services.

Examples in `examples/` are executed as-is (guarded in the test suite) — the
code you read is the code that runs.

## Compatibility

- Node ≥ 22. Isomorphic-clean core (no `Buffer`/`fs` in the client path).
- Types are curated against **daemon v1.2.17**; `getInfo().VRSCversion` lets
  you check at runtime. Unknown response fields pass through.

## License

Apache-2.0
