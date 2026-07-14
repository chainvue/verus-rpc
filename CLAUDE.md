# CLAUDE.md — @chainvue/verus-rpc

A **full-coverage, precision-honest** TypeScript client for the Verus
(`verusd`) JSON-RPC interface — daemon-first, npm-published. This is the
general-purpose Verus client (distinct from v402's deliberately minimal,
in-repo `@chainvue/v402-verus-rpc`). Published as `@chainvue/verus-rpc` (renamed
from the unscoped `verus-rpc`, 2026-07-15).

## Correctness — load-bearing
- **Precision-honest**: satoshi amounts are `bigint`; never route money through
  `number`. This is the whole reason the client exists.
- Credentials are optional — omit both `user`/`pass` for unauthenticated public
  gateways; sending only one throws. Public gateways whitelist only the
  light-client method set; the client does not pre-filter, so wallet methods
  surface the daemon's "method not found".

## Conventions
- License **Apache-2.0** (+ `NOTICE`). Node ≥ 22, pnpm.

## Gate (run before claiming done, in order)
`pnpm build` → `pnpm typecheck` → `pnpm lint` → `pnpm test`. `pnpm test:live`
is gated behind `VERUS_RPC_*` and a live daemon (skips in CI). `prepublishOnly`
runs the full gate.

## Releases — automated, do not hand-roll
Conventional Commits drive **semantic-release**. **Never hand-edit
`CHANGELOG.md` or bump `version`.** Do not `git push`, tag, or publish without
an explicit ask.

## Decision log
`RISKS.md` = maintainer-facing "why"; `CHANGELOG.md` = adopter-facing "what".
