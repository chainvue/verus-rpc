# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com): newest first,
one section per released version headed `## <version> (<date>) — <summary>`.
Record changes under **[Unreleased]** as you make them; at release, rename that
heading to the version. This file is adopter-facing ("what changed, what
breaks") — design rationale lives in RISKS.md.

## [Unreleased]

<!-- Add entries here in the same commit as the change; rename this heading to
     the new version at release time. -->

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
