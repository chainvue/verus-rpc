# Wallet & privacy

`client.wallet` (transparent) and `client.shielded` (`z_*`).

## Balances & transactions

```ts
await client.wallet.getBalance();                       // bigint sats
await client.wallet.getCurrencyBalance({ address: "me@" });  // Record<string, bigint>
await client.wallet.getWalletInfo();                    // balances as bigint sats
await client.wallet.listUnspent({ addresses: ["R…"] }); // UnspentOutput[]
await client.wallet.listTransactions({ count: 20 });    // signed bigint amounts
```

## Sending

`sendcurrency` is asynchronous — it returns an operation id. Use the helper
unless you want to manage polling yourself:

```ts
const { txid } = await client.wallet.sendCurrencyAndWait({
  fromAddress: "*",
  outputs: [{ address: "receiver@", amount: parseAmount("1.5") }],
});
```

`amount` is `bigint` sats and is serialized to the daemon as an exact number
token — no precision loss on the way out either. Conversion params
(`convertto`, `via`, `preconvert`, …) are first-class typed options on each
output.

Errors: `OperationFailedError` (daemon reported failure, carries the code)
and `OperationTimeoutError` (no final state within the deadline; carries
`timeoutMs`, and the last poll failure as `cause` if polling itself was
failing). While waiting, transient transport failures are tolerated until
the deadline — the operation is already in flight and is never abandoned —
but `auth` (bad credentials) and `aborted` (caller cancel) fail immediately.
On a timeout the operation may still complete on the daemon: check the opid
(`getOperationStatus`) before retrying a send.

One edge is deliberately NOT retry-shaped: a final `success` status whose
result is missing `txid` throws `ResponseMappingError` (naming
`z_getoperationstatus` / `result.txid`), not `OperationFailedError` — the
send completed on the daemon and only the response shape drifted, so
retrying it would double-spend.

## Shielded

```ts
await client.shielded.zGetTotalBalance();               // { transparent, private, total } strings
const { txid } = await client.shielded.zSendManyAndWait({
  fromAddress: "zs1…",
  amounts: [{ address: "zs1…", amount: parseAmount("0.1"), memo: "f5" }],
});
```

Note: on VRSCTEST the shielded surface (memos, sapling addresses) is
partially supported — see per-method JSDoc.

## Key material

`importPrivKey`, `dumpPrivKey`, `dumpWallet`, `backupWallet` and friends are
typed but handled as secrets: the library never logs their results, and no
fixture ever contains real key material. Treat the returned strings
accordingly.
