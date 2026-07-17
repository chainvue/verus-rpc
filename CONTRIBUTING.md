# Contributing to `@chainvue/verus-rpc`

Thanks for helping. This is a **precision-honest** client: the reason it exists
is that satoshi amounts are `bigint` and **never** pass through a float. Most of
the rules below exist to protect that invariant. Read [`docs/amounts.md`](./docs/amounts.md)
first — it's the money model the whole library is built around.

## Getting set up

- **Node ≥ 22** and **pnpm** (the repo pins `pnpm@11`; `corepack enable` picks it
  up automatically).

```bash
pnpm install
pnpm build
```

## The gate — run it before every push

CI runs exactly this, in order. Green locally means green in CI:

```bash
pnpm build       # tsc -p tsconfig.build.json
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run
```

Also useful:

```bash
pnpm test:watch      # vitest in watch mode
pnpm test:coverage   # enforces the coverage floors in vitest.config.ts
pnpm test:live       # integration suites — see below
```

`test:live` talks to a real `verusd` and is **gated behind `VERUS_RPC_*` env
vars**; it skips when they're unset (so it's silent in CI). See
[`docs/testing-live.md`](./docs/testing-live.md) for how to point it at a node.

## The precision invariant (non-negotiable)

- **No `number` for any money/value field.** Amounts are `bigint` satoshis, or
  exact decimal strings — never a JS float. No `Number()` / `parseFloat` /
  `.toFixed` shims on a value path.
- **Money leaving the wallet** is encoded losslessly (`amountParam(sats)` /
  `new LosslessNumber(formatAmount(sats))`), never a bare float token.
- **1 VRSC = `100_000_000n`.** Below `2^53` sats float64 happens to be exact, but
  large-supply PBaaS tokens exceed it — that's exactly the case this client is
  for, so we don't gamble on it anywhere.

Every method sits in one of three tiers:

| Tier | Value fields | How | Example |
|---|---|---|---|
| **T1** curated | `bigint` sats | a `mapX` mapper + a recorded fixture | `getBalance()` → `200_000_000n` |
| **T2** typed | exact decimal `string` | `requestT2` (no per-field validation) | `zGetBalance()` → `"2.00000000"` |
| **T3** escape hatch | caller's problem | `client.call(method, params)` | anything not curated |

## Adding or changing an RPC method

1. **Verify the signature against the daemon source**, not a guess — the
   `CRPCCommand` tables and the handler in
   [`VerusCoin/VerusCoin`](https://github.com/VerusCoin/VerusCoin). Param order,
   optionality, and the exact result field set must match. (Guessing a field set
   is how precision bugs get in.)
2. **Pick a tier.** Curate to **T1** only when you can pin the result shape with a
   real recorded response. Otherwise **T2** (`requestT2`) is the honest choice —
   typed access without over-claiming validation.
3. **T1 methods must ship a fixture.** `test/fixtures.test.ts` *enforces* this: it
   discovers every exported `map*` and fails if one has no conformance assertion.
   - Record fixtures with the repo's own tool (raw HTTP, byte-exact — nothing in
     the library can reproduce the exact bytes):
     ```bash
     VERUS_RPC_URL=… VERUS_RPC_USER=… VERUS_RPC_PASS=… \
       node scripts/record-fixtures.mjs <name>…
     ```
   - Never hand-edit number tokens in a fixture, and never truncate with
     `JSON.stringify`/`python -m json.tool` (they rewrite `6.00000000` → `6.0`).
     Use the package's own lossless writer. See [`fixtures/README.md`](./fixtures/README.md).
   - **Scrub anything wallet-unique** that isn't public chain data (`seedfp`,
     commitment salts, node IPs) — preserve the shape, remove the value.
4. **Add a family test** (`MockTransport`) covering param construction and result
   passthrough, plus a conformance assertion for T1.
5. **Never commit real key material.** Key-bearing methods (WIF / passphrase /
   z-spending-key) must not log arguments or results and must have **mock-only**
   tests — no real-key fixture, ever.

## Commits and releases

Releases are **fully automated** by [semantic-release](https://semantic-release.gitbook.io/).
Your **PR title** (and squashed commit) must be a [Conventional Commit](https://www.conventionalcommits.org/):

| Prefix | Effect (this is a `0.x` project) |
|---|---|
| `feat:` | minor bump |
| `fix:` / `perf:` | patch bump |
| `feat!:` or a `BREAKING CHANGE:` footer | still a **minor** on `0.x` (the breaking channel) |
| `docs:` `test:` `refactor:` `chore:` `ci:` `build:` | no release |

**Do not** edit `version` in `package.json` or touch `CHANGELOG.md` by hand — the
release workflow owns both. Don't `git push` tags or publish manually.

## Pull request flow

1. Branch off `main` (short, prefixed: `feat/…`, `fix/…`, `docs/…`).
2. Make the **smallest reviewable change** — don't mix a refactor with a feature,
   and don't touch unrelated files.
3. Run the gate. Update the README/docs when you change user-facing behavior.
4. Open the PR — the [PR template](./.github/PULL_REQUEST_TEMPLATE.md) is a
   checklist that mirrors the rules above. Fill it in honestly; CI must be green.

## Reporting issues

Use the issue templates (bug report, feature request, new-method request). For a
**security vulnerability**, do **not** open a public issue — follow
[`SECURITY.md`](./SECURITY.md).

## License

By contributing you agree your work is licensed under **Apache-2.0** (see
[`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE)).
