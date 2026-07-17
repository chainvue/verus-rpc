# Changelog

# [0.7.0](https://github.com/chainvue/verus-rpc/compare/v0.6.0...v0.7.0) (2026-07-17)


* feat(blockchain)!: getBlockSubsidy and getNetworkInfo return bigint sats ([d3ff99d](https://github.com/chainvue/verus-rpc/commit/d3ff99d2de04abbe98d10ae41ce6d578ae250ed9))
* feat(blockchain)!: getTxOut returns bigint sats; replace all 9 synthetic fixtures with real recordings ([7e0780c](https://github.com/chainvue/verus-rpc/commit/7e0780c86d95eec1ccb83f135630933f89b9ee01))


### Bug Fixes

* close review-found robustness gaps in operation polling and z_gettotalbalance ([9fa5376](https://github.com/chainvue/verus-rpc/commit/9fa5376a43810028d88b043fceefb16d15a37eb4))
* **examples:** make a fresh clone actually work, and stop contradicting the credential-optional feature ([825ccae](https://github.com/chainvue/verus-rpc/commit/825ccaec0abfd079dc2a6fe40f784e4e182ac99c))
* **review:** correct docs that contradicted the code, and drop comment narration ([f39a129](https://github.com/chainvue/verus-rpc/commit/f39a1297d0543b5b1ed759d4d0c201da05b98517))
* **review:** correct false fixture claims, and record what the mapper actually needs ([a551f98](https://github.com/chainvue/verus-rpc/commit/a551f980c390b1aa768a3235237b12e511195252))
* **review:** stop the T2 coercion from hiding drift, and close the holes in the enforcement test ([d45666f](https://github.com/chainvue/verus-rpc/commit/d45666f71e132e920e52cfc49080e3aa40ad4c4b))


### Features

* make the …AndWait helpers cancellable via AbortSignal ([1100018](https://github.com/chainvue/verus-rpc/commit/1100018749684d0061079ed32dc0af526b6ae211))


### BREAKING CHANGES

* getBlockSubsidy() and getNetworkInfo() return curated result
types with bigint value fields instead of Record<string, unknown> with decimal
strings. At 0.x this is a minor bump.
* getTxOut returns GetTxOutResult | null instead of
Record<string, unknown> | null, and its `value` is bigint sats rather than an
untyped passthrough string. The same output read through listUnspent().amount
or getAddressUtxos().satoshis already gave bigint — one concept had three
types. `interest` (Komodo heritage, pushed only when non-zero) is bigint too.
Verified live: getTxOut.value === listUnspent.amount === 600000000n, and an
unknown output still short-circuits to null before mapping.

Fixtures — the write surface had no recorded evidence at all. All nine
synthetic ones are now real, and the recorded set cross-checks itself:

- ONE deliberate VRSCTEST dust send closed sendcurrency +
  z_getoperationstatus. 0.0001 to an address from getnewaddress — the wallet's
  OWN — so the net wallet effect was 0.00000000 and only the 0.0001 miner fee
  left (7470.00801611 -> 7470.00791611, verified before/after).
- gettxout was recorded from the public mainnet gateway (no wallet needed) and
  is the SAME output getaddressutxos.json already carries. value 0.01013218 ==
  satoshis 1013218n == getaddressdeltas' currencyvalues token. One value,
  three methods, now asserted.
- gettransaction deliberately picks a send with a negative amount: a self-send
  nets to 0 and would exercise nothing. It carries fee -25.0 — a single-decimal
  token, the same hazard class as getblocksubsidy's 3.0.
- Scrubbed: getwalletinfo's seedfp (wallet-unique, not chain-derivable) and its
  reserve_balance currency names. Truncated: listunspent 473->2 (keeping the
  currencyvalues entry the synthetic lacked), listaddressgroupings 442
  groups/1112 addresses -> 2/3 (it exposes the ownership linkage graph),
  listtransactions 10->2. Number tokens verified verbatim after every cut.

scripts/record-fixtures.mjs makes this reproducible. It talks raw HTTP because
nothing in the library can: DaemonTransport consumes response.text() and
returns only the parsed result, and writeArtifacts additionally runs captures
through toSafeNumbers — "0.00010000" as a STRING, which mapAmount rejects. The
spend recipe refuses non-testnet chains and only sends to getnewaddress output.

Also: shielded.ts was the weakest file at 76.6% lines — 7 targeted mock tests
cover zListAddresses/zGetNewAddress/zListReceivedByAddress/zViewTransaction/
zGetOperationResult/zShieldCoinbase and two gap-fill branches. Coverage floors
ratcheted to ~2 under measured (86/72/88/90). getNetworkInfo now documents that
its relayfee passthrough duplicates chain.getInfo()'s curated bigint.

# [0.6.0](https://github.com/chainvue/verus-rpc/compare/v0.5.1...v0.6.0) (2026-07-16)


### Bug Fixes

* **review:** daemon-truth corrections, RPC_NO_CODE taxonomy, live + fixture coverage ([e2c45cd](https://github.com/chainvue/verus-rpc/commit/e2c45cd7b5f305291b6842df627a9e34c89d1728))
* **transport:** self-teardown on abort, unref'd timer, honest leak rationale ([1b06496](https://github.com/chainvue/verus-rpc/commit/1b06496f7ec8fa514dadae1f477e6e566cf113d9))
* **transport:** tear down per-request abort wiring when the request settles ([7d313db](https://github.com/chainvue/verus-rpc/commit/7d313dbfa89b5fb4ab38d4e3d23ba22dbf13aad1))


### Features

* expand typed coverage +10 methods (supply, spent index, currency trust, shielded keys) ([57e3537](https://github.com/chainvue/verus-rpc/commit/57e35373f3232eb6ce7d91502b7b40502a991abf))

## [0.5.1](https://github.com/chainvue/verus-rpc/compare/v0.5.0...v0.5.1) (2026-07-16)


### Bug Fixes

* **wallet:** success-without-txid is shape drift — unify both AndWait paths on ResponseMappingError ([5328ee0](https://github.com/chainvue/verus-rpc/commit/5328ee0051ec9402327413d99c8db561cf95ddde))
* **wallet:** throw OperationFailedError on success-without-txid, align with zSendManyAndWait ([dead756](https://github.com/chainvue/verus-rpc/commit/dead756b9fd97b49ecfe1974e6463a7075373fe7))

# [0.5.0](https://github.com/chainvue/verus-rpc/compare/v0.4.0...v0.5.0) (2026-07-16)


* refactor(methods)!: single getBlockCount entry point; shared polling + amount helpers ([521b200](https://github.com/chainvue/verus-rpc/commit/521b200a93d9d079b96358a3c2e6580be82ad76b))


### BREAKING CHANGES

* BlockchainApi.getBlockCount is removed — use
client.chain.getBlockCount (identical RPC and result).

# [0.4.0](https://github.com/chainvue/verus-rpc/compare/v0.3.0...v0.4.0) (2026-07-16)


* feat(transport)!: abort-signal threading, auth classification, fail-closed HTTP handling ([dd8029c](https://github.com/chainvue/verus-rpc/commit/dd8029c842c545c77dc900d5eec30681d380907e))
* fix(rpc)!: correct daemon param shapes and money-path serialization ([151016a](https://github.com/chainvue/verus-rpc/commit/151016adb9b10c77778934d6963a53e476f204ff))
* fix(transport)!: review findings — 'aborted' reason, fail-closed body reads, auth-first classification ([343fc32](https://github.com/chainvue/verus-rpc/commit/343fc32ef91fc01124373154e1fd0e7295f57e59))


### Bug Fixes

* **pkg:** ship src/ so published source maps resolve; add npm metadata ([7197346](https://github.com/chainvue/verus-rpc/commit/7197346503fe17e1d241a27d4c996e5c56c450b0))


### BREAKING CHANGES

* TransportFailureReason gains 'aborted'; caller-signal
cancellations now surface with reason 'aborted' instead of 'timeout'.
* TransportFailureReason gains 'auth' (exhaustive
switches must handle it); the VerusClient constructor throws on
config combinations it previously ignored silently.
* RawTransactionOptions.outputs is a single
Record<string, unknown> (was an array); getVdxfId's parent option is
replaced by vdxfKey/uint256/indexNum; getCurrencyConverters takes an
options object; estimateFee returns string | null. All four replace
behavior that was broken or silently wrong against a real daemon.

# [0.3.0](https://github.com/chainvue/verus-rpc/compare/v0.2.0...v0.3.0) (2026-07-14)


### Features

* expand typed RPC coverage (+24 methods) and reconcile positioning ([612a01e](https://github.com/chainvue/verus-rpc/commit/612a01e22ae0ad40092828c5c67c98eace9727c5))

## 0.2.0 (2026-07-13) — public lite-wallet node support

Public lite-wallet node support (Track P0 for Peculium).

- **Feature (`DaemonTransport` / `VerusClient`):** `user`/`pass` are now
  optional — omit both to talk to unauthenticated public gateways
  (`https://api.verustest.net`, `https://api.verus.services`). No
  `Authorization` header is sent when credentials are omitted; providing only
  one of the two throws a `TypeError`.
- **Docs/behavior note:** public gateways whitelist only the light-client
  method set (`getaddressutxos`, `getaddressbalance`, `getidentity`,
  `getcurrency`, `getrawtransaction`, `sendrawtransaction`, ...). Wallet
  methods answer with a JSON-RPC "Method not found" error; the client
  deliberately does not pre-filter.
- **Test:** new gated public-node smoke (`VERUS_RPC_PUBLIC_URL`), exercising
  the credential-less path against a live public testnet gateway, including
  the documented wallet-method rejection.

No breaking changes.

## 0.1.1 (2026-07-12) — live-daemon validation fixes

Fixes surfaced by end-to-end validation against a live VRSCTEST daemon.

- **Fix (`registerIdentityFlow`):** the commitment-confirmation poll no longer
  throws on the transient daemon error `-5` ("invalid/non-wallet transaction
  id") that occurs in the brief window before a just-broadcast commitment lands
  in the wallet. It now keeps polling to the deadline and rethrows any other
  daemon error. (0.1.0 could fail registration spuriously right after broadcast.)
- **Types (`IdentitySpec`):** `contentmap` is now `Record<string, unknown>` and
  the optional fields accept `| undefined`, so a `getIdentity()` result's
  `.identity` can be passed straight back into `updateIdentity` /
  `recoverIdentity` — the natural read → modify → write round-trip — under
  `exactOptionalPropertyTypes`.
- Added `NOTICE` (Apache-2.0) and a copyright statement.

No public API changes.

## 0.1.0 (2026-07-12) — first release

First release. Precision-honest, full-coverage TypeScript client for the Verus
(`verusd`) JSON-RPC interface — see the README.
