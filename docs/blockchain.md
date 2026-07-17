# Chain & blockchain

Two namespaces, deliberately split — `client.chain` is the tiny always-there
surface, `client.blockchain` is everything else about the chain itself.

## `client.chain` — and only these two

```ts
await client.chain.getInfo();        // T1: paytxfee/relayfee as bigint sats
await client.chain.getBlockCount();  // number
```

`getBlockCount` lives here and **nowhere else**: it was duplicated on
`blockchain` until 0.5.0, and one public entry point per RPC is the rule.
Everything else chain-shaped is on `client.blockchain`.

## Blocks & headers

```ts
const hash = await client.blockchain.getBlockHash(3_634_845); // positional number
await client.blockchain.getBlock({ hashOrHeight: hash, verbosity: 1 });
await client.blockchain.getBlockHeader({ hash });             // verbose:false → raw hex
await client.blockchain.getBestBlockHash();
await client.blockchain.getBlockchainInfo();
await client.blockchain.getChainTips();
```

## Coin supply — T1

```ts
const supply = await client.blockchain.coinSupply({ height: 1_000_000 });
formatAmount(supply.total); // "55999999.99700000"
```

`supply`, `immature`, `zfunds` and `total` are `bigint` sats. This is the one
method whose values sit at the magnitude `docs/amounts.md` warns about
(~8.35e15 sats, near `Number.MAX_SAFE_INTEGER`), which is why it is T1.

Three daemon facts worth knowing, all verified against v1.2.17:

- The height goes on the wire as a **string** (the daemon reads it with
  `uni_get_str`). The client sends it correctly and **rejects** heights that
  `atoi` would silently mangle — `1e21` would become height 1, `420.7` would
  truncate — with a `RangeError`.
- Failures arrive **in-band** (`{"error": "invalid height"}` on a success
  envelope), not as a JSON-RPC error. They surface as `VerusRpcError` with
  code `RpcErrorCode.RPC_NO_CODE`.
- Near-tip heights on a mature chain can take the daemon **minutes**. Raise
  `timeoutMs` on the client for those.

## Raw transactions

```ts
const hex = await client.blockchain.createRawTransaction({
  outputs: { RCG8KwJNDVwpUBcdoa6AoHqHVJsA1uMYMR: 12_345_678n },
});
await client.blockchain.decodeRawTransaction({ hex });
await client.blockchain.sendRawTransaction({ hex });
```

`outputs` is a **single object** keyed by address (the array form the daemon
rejects), and amounts are `bigint` sats — the client converts to the coins
the daemon expects on the wire. Passing sats where coins are meant is a
1e8x overpay; that conversion is the client's job, not yours.

`signRawTransaction` is typed but cannot sign marketplace/CC inputs — the
daemon answers `INCOMPLETE`. No client-side signing lives here by design.

## Fees, mempool, misc

```ts
await client.blockchain.estimateFee({ blocks: 6 }); // string | null
await client.blockchain.getRawMempool({ verbose: true });
await client.blockchain.getMempoolInfo();
await client.blockchain.getTxOut({ txid, vout: 0 });
await client.blockchain.getVdxfId({ name: "vrsc::system.currency.export" });
await client.blockchain.validateAddress({ address: "R…" });
```

`estimateFee` returns `null` when the daemon has insufficient data — it
answers with a `-1` sentinel, and a real fee-per-kB is never negative.

## `verifyChain` — read the positional trap

```ts
await client.blockchain.verifyChain({ checkLevel: 4, numBlocks: 100 });
```

Expensive: the daemon holds its main lock for the duration. Omit both options
and the node uses its own `-checklevel`/`-checkblocks`. But the params are
positional, so passing **`numBlocks` alone sends the compiled-in level 3** —
overriding a `-checklevel=4` the node was started with. Pass both to be
explicit.

## Public gateways

`coinsupply` is **not** on the public light-client whitelist (`-32601`
"Method not found"); `getblock`, `getblockchaininfo`, `getrawtransaction`,
`sendrawtransaction` and `getvdxfid` are. The client does not pre-filter — a
non-whitelisted method surfaces the daemon's own error.
