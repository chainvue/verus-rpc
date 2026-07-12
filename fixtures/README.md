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
| `getcurrencybalance.json` | VRSCTEST node probe (RESEARCH.md §A.2, daemon v1.2.17) | 2026-07-12 | Verbatim documented raw-body probe |
| `getbalance.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Replace with VRSCTEST recording when node access is available |
| `gettransaction.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Wallet-only — not exposed on the public gateway |
| `sendcurrency.json` | **synthetic** (opid shape) | 2026-07-12 | Write-method: record once from a deliberate VRSCTEST dust send |
| `z_getoperationstatus.json` | **synthetic** (hand-written from `help` v1.2.17) | 2026-07-12 | Replace with the recording of the same dust send |

T1 discipline: synthetic fixtures are a stopgap — the tier promise ("no T1
method without a recorded fixture") is only fully honored once the wallet
methods are re-recorded from the VRSCTEST node (tracked in RISKS.md).
