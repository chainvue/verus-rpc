# @chainvue/verus-rpc

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
import { parseAmount, formatAmount } from "@chainvue/verus-rpc";

const balance = await client.wallet.getBalance(); // 923_514_291_611n
formatAmount(balance);                            // "9235.14291611"
parseAmount("1.5");                               // 150_000_000n
```

## What's on the client

Everything hangs off a namespace. Async sends (`sendcurrency`, `z_*`) return an
op-id — the `…AndWait` helpers poll it to the txid for you.

| Namespace | Highlights |
|---|---|
| `chain` / `blockchain` | `getInfo`, `getBlockCount`, `getBlock`, `getBlockchainInfo` |
| `wallet` | `getBalance`, `getCurrencyBalance`, `listUnspent`, `listTransactions`, `sendCurrencyAndWait`, `sendMany` |
| `identity` | `getIdentity`, `getIdentityHistory`, `registerIdentityFlow` (commit/reveal), `updateIdentity`, `revokeIdentity`, `recoverIdentity`, `signData` |
| `currency` | `getCurrency`, `listCurrencies`, `estimateConversion`; marketplace: `makeOffer`, `takeOffer`, `getOffers` |
| `shielded` | the `z_*` family: `zGetTotalBalance`, `zSendManyAndWait` |
| `addressIndex` | `getAddressBalance`, `getAddressUtxos` — any address, not just yours |

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
    // couldn't reach the node / timed out
  }
}
```

Async sends also throw `OperationFailedError` / `OperationTimeoutError`.

## Good to know

- **Test without a node** — `MockTransport` is exported:
  ```ts
  const mock = new MockTransport().respondJson("getblockcount", "42");
  new VerusClient({ transport: mock }); // .chain.getBlockCount() → 42
  ```
- **Resilience (opt-in)** — `resilience: { timeoutMs, breaker: { failuresBeforeOpen } }`; daemon-level errors never trip the breaker.
- Node ≥ 22, no `Buffer`/`fs` in the client path. Typed against daemon **v1.2.17**; unknown fields from newer daemons pass through untouched.
- Deliberately transport + types only — no client-side signing or tx construction (that's [`@chainvue/verus-sdk`](https://www.npmjs.com/package/@chainvue/verus-sdk) / `verusid-ts-client`).
- More depth per area in [`docs/`](./docs); runnable scripts in [`examples/`](./examples).

Apache-2.0 · Copyright 2026 Robert Lech · see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
