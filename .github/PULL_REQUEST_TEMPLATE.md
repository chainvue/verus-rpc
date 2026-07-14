<!--
Title MUST be a Conventional Commit — it drives semantic-release + the changelog.
  feat: …  (minor)   fix: …  (patch)   perf: …  (patch)
  docs|test|refactor|chore|ci|build: …  (no release)
  Add `!` or a `BREAKING CHANGE:` footer for a breaking change (stays 0.x → minor).
Do NOT bump `version` or edit `CHANGELOG.md` by hand — the release workflow owns both.
-->

## What & why

<!-- One or two sentences: what this changes and the motivation. -->

## Precision & safety (load-bearing)

- [ ] No `number` for any money/value field — amounts are `bigint` satoshis (T1) or exact decimal strings (T2). No `.toString()`/`Number()` float shims.
- [ ] Money leaving the wallet is encoded losslessly (`new LosslessNumber(formatAmount(sats))`), never a JS float.
- [ ] Key-bearing methods (WIF / passphrase / z-key) never log arguments or results and have **no** real-key fixture (mock-only).

## New / changed RPC methods

<!-- Delete if N/A. -->
- Method(s):
- [ ] Signature verified against the verusd source (`VerusCoin/VerusCoin` `CRPCCommand` tables), not guessed — param order/optionality matches.
- Tier: [ ] T1 (curated mapper + recorded fixture) · [ ] T2 (`requestT2`, decimal strings) · [ ] T3 (`call()` only)
- [ ] T1 methods ship a fixture in `fixtures/` and a conformance assertion in `test/fixtures.test.ts`.
- [ ] Family test added (param construction + result passthrough via `MockTransport`).

## Checklist

- [ ] `pnpm build` → `pnpm typecheck` → `pnpm lint` → `pnpm test` all green (the gate).
- [ ] Coverage thresholds hold (`pnpm test:coverage`) — new code is exercised.
- [ ] Public API changes are reflected in the README where user-facing.
- [ ] Live/integration paths (gated behind `VERUS_RPC_*`) considered; noted if untested here.
- [ ] Conventional-Commit PR title; no manual `version`/`CHANGELOG.md` edits.

## Notes for reviewers

<!-- Risks, follow-ups, anything gated behind a live daemon, deliberate scope limits. -->
