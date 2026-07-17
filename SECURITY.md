# Security Policy

## Supported versions

`@chainvue/verus-rpc` is pre-1.0. Only the latest published minor receives
security fixes; there are no backports to earlier lines.

| Version | Supported |
| --- | --- |
| latest `0.x` minor | ✅ |
| anything older | ❌ — upgrade |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately via GitHub's
[Report a vulnerability](https://github.com/chainvue/verus-rpc/security/advisories/new)
form, which opens a private advisory visible only to the maintainers.

Please include: the version, what an attacker can achieve, and a reproduction
(a failing snippet is ideal — `MockTransport` is exported, so most issues can
be reproduced offline with no daemon and no funds).

You can expect an acknowledgement within **7 days** and an assessment within
**30 days**. If a fix ships, the advisory is published with credit unless you
ask otherwise.

## What is in scope

This package is transport + types. It speaks JSON-RPC to a daemon; it holds
no keys, signs nothing, and builds no transaction bytes — the daemon does
that. It does, however, serialize the amounts that go into
`createrawtransaction`, converting bigint satoshis to the coins the daemon
expects: that conversion is client-side and firmly **in scope**. In scope:

- **Amount correctness** — anything that makes a value field lose precision or
  surface as a float, or that sends a wrong amount to the daemon. This is the
  package's core promise, so a plausible report here is treated as a
  vulnerability, not a bug.
- **Credential handling** — leaking `user`/`pass` (e.g. into an error message,
  log line, or a URL) or attaching them to an unintended host.
- **Secret leakage** — key material returned by `dumpPrivKey`, `zExportKey`,
  `zExportViewingKey`, `dumpWallet`/`zExportWallet` and friends appearing
  anywhere the library writes, or entering the repository (fixtures included).
- **Response handling** — a malicious or compromised RPC endpoint causing the
  client to misreport a balance, a txid, or an operation's success.
- **Supply chain** — anything in the published tarball that is not built from
  this repository at the tagged commit. Releases publish with npm provenance
  via OIDC trusted publishing; the attestation is verifiable on npm.

## What is out of scope

- **Vulnerabilities in `verusd` itself.** Report those to
  [VerusCoin/VerusCoin](https://github.com/VerusCoin/VerusCoin). Where the
  daemon misbehaves in a way this client must work around, we document the
  quirk in JSDoc next to the affected method.
- **Trusting the endpoint you configured.** Pointing the client at a hostile
  RPC URL, or exposing your own daemon's RPC port to the internet, is a
  deployment concern.
- Anything requiring an attacker to already control the machine running the
  client, or the daemon's wallet.
- The gated live test suites (`pnpm test:live`) and `examples/wallet-send.ts`
  move real funds by design. They are opt-in, env-gated, and documented as
  such.
