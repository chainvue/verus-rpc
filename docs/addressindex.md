# Address index

`client.addressIndex` — balances, UTXOs and history for **any** transparent
address, not just ones your wallet controls. No wallet, no credentials: the
public gateways serve this family too.

Requires the daemon to run with `-addressindex=1` (and `-spentindex=1` for
`getSpentInfo`). A node without the index answers with an error, not an empty
result.

```ts
const client = new VerusClient({ url: "https://api.verus.services" });
await client.addressIndex.getAddressBalance({ addresses: ["REpxm9…"] });
```

## The wire quirk that shapes this family

verusd is inconsistent here, and the client hides it:

| Wire field | Daemon sends | Client gives you | Where |
|---|---|---|---|
| `balance`, `received` | satoshi **integers** | `bigint` sats | `getAddressBalance` |
| `currencybalance`, `currencyreceived` | **8-decimal** values | `bigint` sats | `getAddressBalance` |
| `satoshis` | satoshi **integer** | `bigint` sats | `getAddressUtxos`, `getAddressDeltas` |
| `currencyvalues` | **8-decimal** value | exact decimal **string** (passthrough) | `getAddressDeltas` |

The curated fields all become `bigint` sats regardless of which
representation the daemon chose. `currencyvalues` is **not** curated — it
passes through, so it stays an exact decimal string (never a float). Convert
it with `parseAmount` if you need to do arithmetic on it.

A recorded `getaddressdeltas` fixture carries the same value **twice** —
`satoshis: 1013218` next to `currencyvalues: {…: 0.01013218}` — and the
conformance suite asserts they agree after conversion.

## Balances & UTXOs

```ts
const balance = await client.addressIndex.getAddressBalance({ addresses: ["REpxm9…"] });
balance.balance;         // bigint sats
balance.currencybalance; // Record<string, bigint> | undefined

const utxos = await client.addressIndex.getAddressUtxos({ addresses: ["REpxm9…"] });
utxos[0].satoshis;       // bigint sats
```

Expect 0-value entries: identity and CC outputs carry no coin value but do
occupy a UTXO.

## History

```ts
// Height-bounded — an unbounded query on a busy address returns everything.
await client.addressIndex.getAddressDeltas({ addresses: ["REpxm9…"], start: 3_634_845, end: 3_634_846 });
await client.addressIndex.getAddressTxids({ addresses: ["REpxm9…"], start: 800_000, end: 800_200 });
await client.addressIndex.getAddressMempool({ addresses: ["REpxm9…"] });
```

Deltas are **signed** — negative for a spend — and stay exact as `bigint`:

```ts
const [d] = await client.addressIndex.getAddressDeltas({ addresses: ["REpxm9…"], start: 3_634_845, end: 3_634_846 });
d.satoshis;                                  // 1013218n  — curated
parseAmount(String(d["currencyvalues"]["i5w5…"])); // 1013218n  — passthrough string, converted
```

## Where an output was spent

```ts
const spent = await client.addressIndex.getSpentInfo({ txid, index: 0 });
spent.txid;   // the SPENDING transaction
spent.index;  // its input index
spent.height;
```

For an unspent (or unindexed) output the daemon answers
`RPC_INVALID_ADDRESS_OR_KEY` ("Unable to get spent info") — that surfaces as
`VerusRpcError`. It does **not** mean the output is invalid; it usually means
it is still unspent.
