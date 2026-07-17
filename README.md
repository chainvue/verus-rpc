# @chainvue/verus-rpc

[![npm](https://img.shields.io/npm/v/%40chainvue%2Fverus-rpc)](https://www.npmjs.com/package/@chainvue/verus-rpc)
[![CI](https://github.com/chainvue/verus-rpc/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/chainvue/verus-rpc/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40chainvue%2Fverus-rpc)](./LICENSE)
[![node](https://img.shields.io/node/v/%40chainvue%2Fverus-rpc)](https://nodejs.org)

A typed TypeScript client for the Verus daemon (`verusd`) JSON-RPC interface,
with **amounts you can trust** (`bigint` satoshis, never a float). Every daemon
RPC method is reachable via `call()`; the common surface — wallet, identity,
currency, shielded, blockchain, addressindex — is curated with precise types.

```bash
npm i @chainvue/verus-rpc
```

```ts
import { VerusClient } from "@chainvue/verus-rpc";

// Public nodes need no credentials:
// https://api.verus.services (mainnet) · https://api.verustest.net (VRSCTEST)
const client = new VerusClient({ url: "https://api.verus.services" });

const height = await client.chain.getBlockCount();
const id = await client.identity.getIdentity({ nameOrAddress: "Verus Coin Foundation@" });
```

Point it at your own daemon for wallet methods:

```ts
const client = new VerusClient({
  url: "http://127.0.0.1:27486", // 27486 mainnet · 18843 testnet
  user: process.env.VERUS_RPC_USER,
  pass: process.env.VERUS_RPC_PASS,
});
```

## Money is exact, always

`verusd` sends amounts as JSON decimals (`relayfee: 1e-6`, large balances) —
run those through `JSON.parse` and you've put float64 rounding in your money
path. This client parses losslessly: curated methods return **`bigint`
satoshis**, and two helpers convert to/from the human form.

```ts
import { parseAmount, formatAmount, amountParam } from "@chainvue/verus-rpc";

const balance = await client.wallet.getBalance(); // 923_514_291_611n
formatAmount(balance);                            // "9235.14291611"
parseAmount("1.5");                               // 150_000_000n
```

Sending an amount through the untyped `call()` escape hatch? `amountParam(sats)`
produces the exact number token the daemon expects — never a float.

## Why this client

Most Verus RPC code is a hand-rolled `fetch` + `JSON.parse` wrapper. That holds
until an amount crosses float64's exact-integer range (`2^53` sats, ≈ 90M
coins). A VRSC balance sits just under that line and survives by luck; a
large-supply PBaaS token routinely sits above it, and there `JSON.parse`
silently drops satoshis — e.g. `21000000000.12345678` loses 78 of them.

| | `@chainvue/verus-rpc` | hand-rolled `fetch` + `JSON.parse` |
|---|---|---|
| Amounts | `bigint` satoshis, exact at any supply | float64 — silent rounding past `2^53` sats |
| Surface | curated types for the common methods, plus `call()` for every RPC | untyped, per call |
| Wire quirks | lossless — `1e-6` and trailing zeros survive verbatim | rewritten by `JSON.parse` |
| Verified | asserted offline against recorded real daemon responses (mainnet + VRSCTEST) | — |
| Errors | typed by kind (`VerusRpcError` / `TransportError.reason`) | raw throw |

It is transport + types only — for key material, signing, and transaction
construction pair it with
[`verusid-ts-client`](https://github.com/VerusCoin/verusid-ts-client) or
[`@chainvue/verus-sdk`](https://www.npmjs.com/package/@chainvue/verus-sdk).

## What's on the client

Everything hangs off a namespace. Async sends (`sendcurrency`, `z_*`) return an
op-id — the `…AndWait` helpers poll it to the txid for you.

| Namespace | Highlights | Docs |
|---|---|---|
| `chain` | `getInfo`, `getBlockCount` — and only those two | [chain & blockchain](./docs/blockchain.md) |
| `blockchain` | `getBlock`, `getBlockchainInfo`, `getBlockHash`, `coinSupply`, raw-tx: `createRawTransaction`, `decodeRawTransaction`, `sendRawTransaction` | [chain & blockchain](./docs/blockchain.md) |
| `wallet` | `getBalance`, `getCurrencyBalance`, `listUnspent`, `listTransactions`, `sendCurrencyAndWait`, `sendMany` | [wallet & privacy](./docs/wallet.md) |
| `identity` | `getIdentity`, `getIdentityHistory`, `registerIdentityFlow` (commit/reveal), `updateIdentity`, `revokeIdentity`, `recoverIdentity`, `signData` | [identity](./docs/identity.md) |
| `currency` | `getCurrency`, `listCurrencies`, `estimateConversion`; marketplace: `makeOffer`, `takeOffer`, `getOffers` | [currencies](./docs/currencies.md) |
| `shielded` | the `z_*` family: `zGetTotalBalance`, `zSendManyAndWait` | [wallet & privacy](./docs/wallet.md) |
| `addressIndex` | `getAddressBalance`, `getAddressUtxos`, `getAddressDeltas`, `getSpentInfo` — any address, not just yours | [address index](./docs/addressindex.md) |

**Escape hatch:** `client.call("anymethod", [args])` reaches every daemon
method, typed or not.

## Errors

Typed by kind, so you can branch cleanly:

```ts
import { VerusRpcError, TransportError, RpcErrorCode } from "@chainvue/verus-rpc";

try {
  await client.wallet.sendCurrencyAndWait({ /* … */ });
} catch (err) {
  if (err instanceof VerusRpcError && err.code === RpcErrorCode.RPC_WALLET_INSUFFICIENT_FUNDS) {
    // the daemon said no — not enough funds
  } else if (err instanceof TransportError) {
    // err.reason: "network" | "timeout" | "auth" | "aborted" | "bad-response" | "circuit-open"
  }
}
```

`TransportError.reason` distinguishes node trouble from client-side
conditions: `auth` (HTTP 401/403 — bad rpcuser/rpcpassword) and `aborted`
(your `AbortSignal` cancelled the call) never count toward the circuit
breaker. Async sends also throw `OperationFailedError` /
`OperationTimeoutError`; the `…AndWait` helpers tolerate transient transport
failures while polling — an in-flight operation is never abandoned — and a
deadline hit surfaces the last poll failure as `cause`.

## Good to know

- **Test without a node** — `MockTransport` is exported:
  ```ts
  const mock = new MockTransport().respondJson("getblockcount", "42");
  new VerusClient({ transport: mock }); // .chain.getBlockCount() → 42
  ```
- **Resilience (opt-in)** — `resilience: { timeoutMs, breaker: { failuresBeforeOpen } }`; a policy timeout aborts the in-flight HTTP request (no orphaned sends). Daemon-level errors, auth failures, and caller aborts never trip the breaker. Note the two timeouts differ: the plain transport allows **60s**, the resilience policy **10s** — so opting in tightens your effective deadline unless you set `resilience.timeoutMs` yourself.
- **Cancellation** — `call(method, params, { signal })` aborts the in-flight request (`TransportError`, reason `"aborted"`).
- Node ≥ 22, no `Buffer`/`fs` in the client path. Typed against daemon **v1.2.17**; unknown fields from newer daemons pass through untouched.
- Deliberately transport + types only — no client-side signing or tx construction (that's [`@chainvue/verus-sdk`](https://www.npmjs.com/package/@chainvue/verus-sdk) / `verusid-ts-client`).
- Per-area depth in the table above, plus [amounts](./docs/amounts.md) (the money model) and [live testing](./docs/testing-live.md); runnable scripts in [`examples/`](./examples) (`pnpm i` builds first, then `node --experimental-strip-types examples/block-height.ts`).

Apache-2.0 · Copyright 2026 Robert Lech · see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
