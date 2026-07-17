# Fixtures — recorded daemon responses

Raw response bodies, byte-exact as received (number tokens untouched —
fixtures are parsed losslessly by the conformance suite, never through
`JSON.parse`). Do not reformat these files.

| File | Source | Recorded | Notes |
|---|---|---|---|
| `getinfo.json` | https://api.verus.services (mainnet, VRSC, daemon v1.2.17) | 2026-07-12 | Contains `relayfee:1e-6` — scientific notation on the wire |
| `getblockcount.json` | https://api.verus.services | 2026-07-12 | |
| `getidentity.json` | https://api.verus.services, `"Verus Coin Foundation@"` | 2026-07-12 | Includes contentmultimap |
| `error-method-not-found.json` | https://api.verus.services | 2026-07-12 | Gateway allowlist rejection, code -32601 |
| `getcurrencybalance.json` | VRSCTEST node probe (daemon v1.2.17) | 2026-07-12 | Verbatim documented raw-body probe |
| `getbalance.json` | VRSCTEST node (daemon v1.2.17) | 2026-07-17 | Byte-exact |
| `gettransaction.json` | VRSCTEST node | 2026-07-17 | Byte-exact. A self-send, deliberately chosen: net `amount` 0 while `details` carry the signed legs (−77.43/+77.43) and `fee` is `-25.0` — a single-decimal token |
| `sendcurrency.json` | VRSCTEST node — **one deliberate dust send** | 2026-07-17 | Byte-exact. 0.0001 to one of the wallet's OWN fresh addresses (`getnewaddress`); the wallet's net effect was 0, only the 0.0001 miner fee left. Body is just an opid (a UUID) |
| `z_getoperationstatus.json` | VRSCTEST node — the same dust send | 2026-07-17 | Byte-exact, polled to `success`. `execution_secs` is `0.06622409899999999` — a real float-shaped token that `JSON.parse` would round |
| `listunspent.json` | VRSCTEST node | 2026-07-17 | **Truncated 473 → 2** via the package's own lossless parser (Python's json would have rewritten `6.00000000` → `6.0`). Carries `currencyvalues`, which the old synthetic lacked entirely |
| `listtransactions.json` | VRSCTEST node | 2026-07-17 | **Truncated 10 → 2**: one real receive and one real send with a NEGATIVE amount + `fee:-25.0`. No `comment` field exists on this wallet |
| `getwalletinfo.json` | VRSCTEST node | 2026-07-17 | **Two scrubs, number tokens untouched:** `seedfp` → zeros (same length; a wallet-unique seed fingerprint, not derivable from the chain — precedent: `registernamecommitment.salt`), and the `reserve_balance` currency names → `testcurrency-a..f` (they were the operator's own PBaaS currencies) |
| `listaddressgroupings.json` | VRSCTEST node | 2026-07-17 | **Truncated 442 groups / 1112 addresses → 2 groups / 3 addresses.** This method exposes the wallet's common-ownership linkage graph, so only the structure is kept: a 2-tuple, a 3-tuple (empty `account`), and a value-bearing group |
| `signmessage.json` | VRSCTEST node, message `"verus-rpc fixture"` | 2026-07-17 | Byte-exact. Confirms verusd returns `{hash, signature}`, not a bare string. A signature permits pubkey recovery but never discloses the private key |
| `getidentitycontent.json` | https://api.verus.services, `"Verus Coin Foundation@"` | 2026-07-12 | |
| `getidentityhistory.json` | https://api.verus.services, `"Verus Coin Foundation@"` | 2026-07-12 | 15 history entries |
| `getidentitieswithaddress.json` | https://api.verus.services (foundation primary address) | 2026-07-12 | Truncated from 3451 to 2 entries (int-only re-serialization, lossless); flat identity shape |
| `getcurrency.json` | https://api.verus.services, `"VRSC"` | 2026-07-12 | Fees arrive as `100.0`/`200.0` — single-decimal tokens |
| `getcurrencystate.json` | https://api.verus.services, `"VRSC"` | 2026-07-12 | Array-of-snapshots shape |
| `listcurrencies.json` | https://api.verus.services, `{"systemtype":"pbaas"}` | 2026-07-12 | Wrapped `currencydefinition` shape |
| `getcurrencyconverters.json` | https://api.verus.services, `["VRSC","DAI.vETH"]` | 2026-07-12 | Converter definition under dynamic currency-id key |
| `estimateconversion.json` | https://api.verus.services, VRSC→DAI.vETH via Bridge.vETH | 2026-07-12 | Live conversion estimate incl. reserve state |
| `getaddressbalance.json` | https://api.verus.services (foundation primary address) | 2026-07-12 | **Mixed representations**: `balance` = satoshi integer, `currencybalance` = 8-decimal value |
| `getvdxfid.json` | https://api.verus.services, `vrsc::system.currency.export` | 2026-07-12 | |
| `getblocksubsidy.json` | https://api.verus.services, height 4147000 | 2026-07-12 | `"miner":3.0` single-decimal token |
| `getblockchaininfo.json` | https://api.verus.services | 2026-07-12 | T2 reference shape |
| `getaddressutxos.json` | https://api.verus.services (foundation primary address) | 2026-07-17 | Truncated from 517 to 2 entries (int-only re-serialization, verified lossless — this body carries no `currencyvalues`): one real 0-value CC/identity output, one real value UTXO |
| `getaddressdeltas.json` | https://api.verus.services (foundation primary address, heights 3634845-3634846) | 2026-07-17 | **Byte-exact, untruncated.** Carries the same value in BOTH representations at once: `satoshis:1013218` and `currencyvalues:{...:0.01013218}`. Known gap: this address had no spend in range, so the recording has no negative (signed) delta — that path is covered by unit tests only |
| `registernamecommitment.json` | VRSCTEST live write-harness capture (daemon v1.2.17) | 2026-07-17 | Real recorded response; **`salt` scrubbed** to zeros (same length) — a commitment secret never enters the repo. All other values verbatim; int-only re-serialization, lossless |
| `gettxout.json` | https://api.verus.services (foundation UTXO, the same output `getaddressutxos.json` carries) | 2026-07-17 | Byte-exact. `value:0.01013218` must equal that fixture's `satoshis:1013218` — one value, three methods, asserted |
| `coinsupply.json` | VRSCTEST node probe (daemon v1.2.17), height 1000000 | 2026-07-17 | Supply-scale amounts; trailing-zero token `55999999.99700000`. Not on the public gateway (`-32601`); daemon reports failures in-band (`{"error": ...}`) |

T1 discipline: `test/fixtures.test.ts` now ENFORCES the rule — it discovers
every exported `map*` in `src/methods/` and fails if one has no conformance
assertion here, with exceptions listed explicitly and with a reason. Until
2026-07-17 the rule lived only in a PR-template checkbox, and three T1 money
mappers (`mapAddressUtxo`, `mapAddressDelta`, `mapNameCommitment`) had
shipped with no fixture at all; those are now recorded.

**No synthetic fixtures remain.** The nine that were hand-written from `help`
v1.2.17 — every one of them on the wallet/write surface — were replaced with
real recordings on 2026-07-17. Recording is now reproducible:
`node scripts/record-fixtures.mjs reads` for the read surface, and
`VERUS_RPC_ALLOW_SPEND=1 … spend` for the one dust transaction that closes
`sendcurrency` + `z_getoperationstatus`.

Byte-exactness note: the recorder talks raw HTTP on purpose. Nothing inside
the library can deliver a byte-exact body — `DaemonTransport` consumes
`response.text()` and returns only the parsed `result`, and the test harness's
`writeArtifacts` additionally runs captures through `toSafeNumbers`, turning
`0.00010000` into the STRING `"0.00010000"`, which would break `mapAmount` if
fed back. Truncated fixtures are re-serialized with the package's own lossless
writer, so number tokens survive verbatim; each is declared as truncated
above.
