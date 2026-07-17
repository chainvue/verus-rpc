# Live testing against a daemon

Three gated suites exercise the client against **real** endpoints. None run in
CI — they only activate when you set the env flags below. Together they are
the **post-release breaking-change check**: run them after a new `verus-cli`
release; if a daemon response shape changed, a curated mapper throws
`ResponseMappingError` naming the exact method and field.

| Suite | File | Gate | Moves funds? |
|---|---|---|---|
| Read sweep | `test/integration.test.ts` | `VERUS_RPC_URL` | No |
| Write harness | `test/spend.integration.test.ts` | `VERUS_RPC_URL` + `VERUS_RPC_ALLOW_SPEND=1` | **Yes (dust, VRSCTEST)** |
| Public gateway | `test/public-node.integration.test.ts` | `VERUS_RPC_PUBLIC_URL` | No |

Two further env flags, both optional and read outside the table above:

- `VERUS_RPC_MAINNET_SMOKE=1` — adds a read-only shape smoke against mainnet
  to the read sweep (`test/integration.test.ts`) and runs the examples live
  (`test/examples.test.ts`).
- `VERUS_RPC_PUBLIC_URL` — the credential-less gateway suite; it pins which
  methods a public node actually serves (e.g. `getspentinfo` yes,
  `coinsupply` no).

## 1. Point at your node

The daemon RPC binds to localhost. Tunnel it and pull the credentials from the
node's own config (they never leave the host — don't paste them into a shell):

```bash
# Tunnel local 18843 → the node's RPC
ssh -f -N -L 127.0.0.1:18843:127.0.0.1:18843 vrsc-testnet

# Credentials straight from the daemon's config into env vars (never printed)
export VERUS_RPC_URL="http://127.0.0.1:18843"
export VERUS_RPC_USER=$(ssh vrsc-testnet 'grep "^rpcuser=" ~/.komodo/vrsctest/vrsctest.conf | cut -d= -f2-')
export VERUS_RPC_PASS=$(ssh vrsc-testnet 'grep "^rpcpassword=" ~/.komodo/vrsctest/vrsctest.conf | cut -d= -f2-')
```

> The running `-chain=vrsctest` daemon authenticates against
> `~/.komodo/vrsctest/vrsctest.conf` (rpcport 18843) — **not** `~/.verus/vrsc.conf`
> (that's mainnet; its creds return 401 here).

Tear the tunnel down when done: `pkill -f "127.0.0.1:18843:127.0.0.1:18843"`.

## 2. Read sweep (safe)

```bash
pnpm test test/integration.test.ts
```

Exercises the curated read surface across every namespace (chain, wallet,
identity, currency, addressindex, shielded, `call()`), pulling real samples
(a txid, an i-address, an address) into the detail methods. Read-only. The
daemon name + version is printed at the top for your release log.

## 3. Write harness (spends dust)

```bash
export VERUS_RPC_ALLOW_SPEND=1
pnpm test test/spend.integration.test.ts
# or all three gated suites:  pnpm test:live
```

Runs, in order, on **VRSCTEST only** (it aborts if the chain reports
`testnet:false`):

- **A** `sendCurrencyAndWait` — dust (0.0001) to a fresh wallet address, full opid poll to txid.
- **B** `sendMany` — dust to two fresh addresses in one tx.
- **C** identity lifecycle — registers **two fresh throwaway** ids: an authority id, then `verusrpc-test-<unique>@` that delegates revocation/recovery to it (a Verus id can't be revoked while it is its own recovery authority). Then update (adds a primary address) → revoke → recover. Never touches existing identities.
- **D** shielded `z_sendmany` t→z dust — best-effort (logs "skipped" if testnet z-support rejects it, does not fail the run).
- **E** marketplace `makeOffer` → `closeOffers` — best-effort self-cancel; always attempts to close any offer it opened.

### Cost & side effects

- Dust sends (~0.0004 VRSCTEST total) — negligible.
- **Registration fees**: stage C registers two ids per run (~100 VRSCTEST each
  on VRSCTEST, ~200 total observed). Fresh ids per run are deliberate — they
  re-test the registration path each time — so throwaway `verusrpc-test-*@`
  identities accumulate on testnet. Harmless.
- Runtime is dominated by confirmations (~1 block/min): a full run is ~10–20 min.

## 4. Outputs

Every run writes raw + mapped captures to a gitignored
`test-artifacts/spend-<timestamp>/` for inspection.

To promote a clean run's write-method responses into the offline conformance
suite (replacing the synthetic fixtures), add:

```bash
export VERUS_RPC_RECORD_FIXTURES=1
```

Wallet addresses, txids and z-addresses are rewritten to stable placeholders
before writing into `fixtures/`; the throwaway identity name is kept (not
sensitive). Review the diff before committing.

## 5. CI stays clean

With no env flags, `pnpm test` runs only the offline suite — both live suites
skip. CI never sets the flags, so it never spends or reaches a daemon.
