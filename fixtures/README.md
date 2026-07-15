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
| `getbalance.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Replace with VRSCTEST recording when node access is available |
| `gettransaction.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Wallet-only — not exposed on the public gateway |
| `sendcurrency.json` | **synthetic** (opid shape) | 2026-07-12 | Write-method: record once from a deliberate VRSCTEST dust send |
| `z_getoperationstatus.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Replace with the recording of the same dust send |
| `listunspent.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Wallet-only; includes dust + `interest` passthrough field |
| `listtransactions.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Wallet-only |
| `getwalletinfo.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Includes verus staking-balance fields as passthrough |
| `listaddressgroupings.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Tuple-array shape |
| `signmessage.json` | **synthetic** (shape from v402's verified usage) | 2026-07-12 | verusd returns `{hash, signature}`, not a bare string |
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

T1 discipline: synthetic fixtures are a stopgap — the tier promise ("no T1
method without a recorded fixture") is only fully honored once the wallet
methods are re-recorded from the VRSCTEST node.
