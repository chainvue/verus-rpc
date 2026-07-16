# Changelog

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
