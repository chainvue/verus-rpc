# verus-rpc

A TypeScript client for talking to a Verus daemon (`verusd`) — the whole
JSON-RPC surface, typed, with amounts you can actually trust.

```bash
npm install verus-rpc
```

```ts
import { VerusClient, formatAmount } from "verus-rpc";

// No daemon needed to try it — this is the public read-only mainnet RPC.
const client = new VerusClient({
  url: "https://api.verus.services",
  user: "public",
  pass: "public",
});

const height = await client.chain.getBlockCount();
const id = await client.identity.getIdentity({ nameOrAddress: "Verus Coin Foundation@" });

console.log(height, id.identity.identityaddress);
```

That's the whole setup. Point it at your own node when you're ready:

```ts
const client = new VerusClient({
  url: "http://127.0.0.1:27486",   // 27486 mainnet · 18843 testnet
  user: process.env.VERUS_RPC_USER,
  pass: process.env.VERUS_RPC_PASS,
});
```

## Money is exact, always

The one thing that sets this client apart: **amounts never touch a float.**
Curated methods hand you `bigint` satoshis, and two helpers convert to and
from the human form:

```ts
import { parseAmount, formatAmount } from "verus-rpc";

const balance = await client.wallet.getBalance();  // 923_514_291_611n
formatAmount(balance);                              // "9235.14291611"
parseAmount("1.5");                                 // 150_000_000n
```

Why it matters: `verusd` sends amounts as JSON decimals (and things like
`relayfee: 1e-6`). A client that runs those through `JSON.parse` quietly puts
float64 rounding in your money path — and Verus' supply is large enough that
plain numbers lose precision. `verus-rpc` parses losslessly and keeps every
value field exact. You never think about it; it just doesn't drift.

## What you can do

Everything hangs off the client under a namespace per area. Here's the tour.

### Chain & blocks

```ts
await client.chain.getInfo();                          // version, height, fees…
await client.chain.getBlockCount();
await client.blockchain.getBlock({ hashOrHeight: 4147000, verbosity: 2 });
await client.blockchain.getBlockchainInfo();
```

### Wallet & sending

Balances, history, and sending — including the async send done right:

```ts
await client.wallet.getBalance();                      // bigint sats
await client.wallet.getCurrencyBalance({ address: "me@" });   // per-currency
await client.wallet.getWalletInfo();
await client.wallet.listUnspent();
await client.wallet.listTransactions({ count: 20 });

// sendcurrency returns an operation id and settles asynchronously.
// This helper polls it to completion and hands you the txid:
const { txid } = await client.wallet.sendCurrencyAndWait({
  fromAddress: "*",
  outputs: [{ address: "receiver@", amount: parseAmount("1.5") }],
});
```

Need multiple recipients or fine control? `sendMany`, `sendCurrency` (raw
opid), `getNewAddress`, `signMessage`/`verifyMessage`, and the key
import/export/backup methods are all there.

### Identities (VerusID)

Look them up, and run the full lifecycle:

```ts
await client.identity.getIdentity({ nameOrAddress: "name@" });
await client.identity.getIdentityHistory({ nameOrAddress: "name@" });
await client.identity.listIdentities();                // your wallet's own

// Registration is a two-step commit/reveal — this helper does both,
// waiting for the commitment to confirm in between:
const { registrationTxid } = await client.identity.registerIdentityFlow({
  name: "mynewid",
  controlAddress: "R…",
});

await client.identity.updateIdentity({ identity: modified });
await client.identity.revokeIdentity({ nameOrId: "name@" });
await client.identity.recoverIdentity({ identity: recovered });
```

Plus data signing and trust: `signData`, `verifyHash`, `getIdentityTrust`, and
friends.

### Currencies, conversion & marketplace

Read currency state and estimate conversions across the PBaaS/DeFi system:

```ts
await client.currency.getCurrency({ currency: "Bridge.vETH" });
await client.currency.listCurrencies({ query: { systemType: "pbaas" } });

const quote = await client.currency.estimateConversion({
  currency: "VRSC",
  convertTo: "DAI.vETH",
  via: "Bridge.vETH",
  amount: parseAmount("10"),
});
formatAmount(quote.estimatedcurrencyout);
```

The on-chain marketplace is here too: `makeOffer`, `takeOffer`, `getOffers`,
`listOpenOffers`, `closeOffers`.

### Private (shielded) balances & sends

The `z_*` family, with the same opid-polling ergonomics as transparent sends:

```ts
await client.shielded.zGetTotalBalance();              // { transparent, private, total }

const { txid } = await client.shielded.zSendManyAndWait({
  fromAddress: "zs1…",
  amounts: [{ address: "zs1…", amount: parseAmount("0.1"), memo: "f5" }],
});
```

### Address index

Query any address, not just your wallet's:

```ts
await client.addressIndex.getAddressBalance({ addresses: ["R…"] });
await client.addressIndex.getAddressUtxos({ addresses: ["R…"] });
```

### Anything else — the escape hatch

Coverage is broad, but the client never blocks you. `call()` reaches **every**
daemon method, typed or not:

```ts
await client.call("getmininginfo");
await client.call("z_validateaddress", ["zs1…"]);
```

Numbers come back exact by default (safe integers as `number`, everything else
as a precise decimal string). Opt into raw floats with `{ numbers: "js" }` if
you really want them.

## Handling errors

Errors tell you *what kind* of thing went wrong, so you can branch cleanly:

```ts
import { VerusRpcError, TransportError, RpcErrorCode } from "verus-rpc";

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

Async sends also throw `OperationFailedError` (the daemon reported failure,
with its code) and `OperationTimeoutError` (no result in time).

## Optional resilience

It's a library, so it stays out of your way by default. Flip on a circuit
breaker and per-attempt timeout when you want them — daemon-level errors never
trip the breaker:

```ts
new VerusClient({
  url, user, pass,
  resilience: { timeoutMs: 5000, breaker: { failuresBeforeOpen: 5 } },
});
```

## How complete is each area?

Every method is reachable; the difference is how much typing and testing it
carries.

- **Curated** — named options, precise types, `bigint` amounts, tested against
  recorded daemon responses: chain reads, wallet & sends, identity (reads +
  full lifecycle), currency/conversion reads, address index.
- **Typed** — typed in and out, amounts as exact decimal strings: shielded
  (`z_*`), marketplace, raw-transaction building, network/util reads, identity
  signatures.
- **Escape hatch** — `call()` for everything else. Always available.

Areas graduate toward "curated" based on what people actually use.

## Testing your own code

`MockTransport` is exported so your tests never need a live node:

```ts
import { VerusClient, MockTransport } from "verus-rpc";

const mock = new MockTransport().respondJson("getblockcount", "42");
const client = new VerusClient({ transport: mock });
// client.chain.getBlockCount() → 42
```

## Where this fits

`verus-rpc` is the layer that talks to your own `verusd` — transport and types,
nothing more. It deliberately doesn't do client-side signing, login consent,
VerusPay invoices, or transaction construction; that's
[`verusid-ts-client`](https://github.com/VerusCoin/verusid-ts-client) and the
Verus BitGo fork. Use them together.

## Good to know

- Node ≥ 22. No `Buffer`/`fs` in the client path.
- Typed against daemon **v1.2.17**; unknown fields from newer daemons pass
  through untouched, so an upgrade won't break your reads.
- More depth per area in [`docs/`](./docs): amounts, wallet, identity,
  currencies. Runnable scripts in [`examples/`](./examples).

## License

Copyright 2026 Robert Lech (chainvue). Licensed under Apache-2.0 — see
[LICENSE](./LICENSE) and [NOTICE](./NOTICE).
