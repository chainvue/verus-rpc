# Changelog

## 0.1.1

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

## 0.1.0

First release. Precision-honest, full-coverage TypeScript client for the Verus
(`verusd`) JSON-RPC interface — see the README.
