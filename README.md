# verus-rpc

**Work in progress — first release (0.1.0) not yet published.**

The npm-published, full-coverage, precision-honest TypeScript client for
talking to your own `verusd` — daemon-first JSON-RPC transport and types.

Core invariant: **no float ever crosses the public API for a value field.**
Amounts are `bigint` satoshis (curated methods) or exact decimal strings —
never `number`.

Deliberately complementary to the official VerusCoin TypeScript stack
(`verusid-ts-client` for signing/login/VerusPay, the BitGo fork for
transaction construction): this library moves bytes to and from the daemon,
nothing else.

- License: Apache-2.0
- Runtime: Node ≥ 22
- Status: skeleton (Etappe 0); transport + first curated methods land in 0.1.0
