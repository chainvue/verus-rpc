#!/usr/bin/env node
/**
 * Record daemon responses as fixtures — byte-exact.
 *
 * Why this exists rather than the test harness: fixtures/README.md promises
 * "raw response bodies, byte-exact as received", and no code path in the
 * library can deliver that. DaemonTransport consumes `response.text()` and
 * returns only the parsed `result`, so the body is unrecoverable above the
 * transport; CapturingTransport sits above it, and writeArtifacts() runs
 * captures through toSafeNumbers (turning `0.0001` into the STRING
 * "0.00010000"), which would break mapAmount if fed back as a fixture. This
 * script talks raw HTTP and writes what the daemon actually sent.
 *
 *   VERUS_RPC_URL=… VERUS_RPC_USER=… VERUS_RPC_PASS=… \
 *     node scripts/record-fixtures.mjs <name>...
 *
 * Names: the keys of RECIPES below, or `reads` / `spend` / `all`.
 * The spend recipe additionally requires VERUS_RPC_ALLOW_SPEND=1.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const URL_ = process.env["VERUS_RPC_URL"];
const USER = process.env["VERUS_RPC_USER"];
const PASS = process.env["VERUS_RPC_PASS"];
const ALLOW_SPEND = process.env["VERUS_RPC_ALLOW_SPEND"] === "1";
const FIXTURES = join(import.meta.dirname, "..", "fixtures");
// The daemon reads sendcurrency amounts as coins. This literal is exact
// through JSON.stringify (asserted below) — but the library's amountParam()
// is unavailable here on purpose, so anything less trivial MUST NOT be
// hand-written as a float. Widen this only with a bigint→token conversion.
const DUST_COINS = 0.0001;
if (JSON.stringify(DUST_COINS) !== "0.0001") {
  throw new Error(`dust amount does not serialize exactly: ${JSON.stringify(DUST_COINS)}`);
}

if (URL_ === undefined) {
  console.error("Set VERUS_RPC_URL (and USER/PASS for a wallet node).");
  process.exit(1);
}

/** One raw JSON-RPC round-trip. Returns the response body TEXT, untouched. */
async function callRaw(method, params) {
  const headers = { "content-type": "application/json" };
  if (USER !== undefined && PASS !== undefined) {
    headers["authorization"] = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
  }
  const res = await fetch(URL_, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "1.0", id: "fixture", method, params }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  // Surface daemon errors here rather than writing a broken fixture.
  const probe = JSON.parse(text);
  if (probe.error !== null && probe.error !== undefined) {
    throw new Error(`${method}: ${JSON.stringify(probe.error)}`);
  }
  return text;
}

/** Parsed view of a call, for control flow only — never for fixture bytes. */
async function call(method, params) {
  return JSON.parse(await callRaw(method, params)).result;
}

function write(name, text) {
  const path = join(FIXTURES, `${name}.json`);
  writeFileSync(path, text.endsWith("\n") ? text : text + "\n");
  console.log(`  wrote fixtures/${name}.json (${text.length} bytes)`);
}

/** The write harness's guard, repeated here: this script can move funds. */
async function assertTestnet() {
  const info = await call("getinfo", []);
  if (info.testnet !== true) {
    throw new Error(`refusing to record against a non-testnet chain (${info.name})`);
  }
  return info;
}

const RECIPES = {
  // --- reads: no funds move ---
  getbalance: () => callRaw("getbalance", []),
  getblocksubsidy: () => callRaw("getblocksubsidy", []),
  getnetworkinfo: () => callRaw("getnetworkinfo", []),
  getwalletinfo: () => callRaw("getwalletinfo", []),
  listunspent: () => callRaw("listunspent", [1]),
  listtransactions: () => callRaw("listtransactions", ["*", 10]),
  listaddressgroupings: () => callRaw("listaddressgroupings", []),
  gettransaction: async () => {
    // The mapper curates a SIGNED top-level `amount`, so the fixture must
    // carry a negative one. Filtering listtransactions is not enough: it
    // reports per-leg amounts, while gettransaction re-aggregates them, so a
    // self-send's legs look negative but its net is 0.00000000 — which maps
    // identically with or without the signed flag and proves nothing. Check
    // the body actually being recorded.
    const txs = await call("listtransactions", ["*", 200]);
    const txids = [...new Set(txs.filter((t) => t.category === "send").map((t) => t.txid))];
    for (const txid of txids) {
      const tx = await call("gettransaction", [txid]);
      if (tx.amount < 0 && tx.fee !== undefined) return callRaw("gettransaction", [txid]);
    }
    throw new Error("wallet has no transaction with a negative net amount to record");
  },
  signmessage: async () => {
    const [group] = await call("listaddressgroupings", []);
    const signer = group?.[0]?.[0];
    if (signer === undefined) throw new Error("no wallet address to sign with");
    return callRaw("signmessage", [signer, "verus-rpc fixture"]);
  },

  // --- spend: ONE dust transaction, to this wallet's own fresh address ---
  spend: async () => {
    if (!ALLOW_SPEND) throw new Error("refusing to spend without VERUS_RPC_ALLOW_SPEND=1");
    await assertTestnet();
    const dest = await call("getnewaddress", []); // this wallet's own address
    console.log(`  dust ${DUST_COINS} -> ${dest} (own wallet)`);
    const sendBody = await callRaw("sendcurrency", ["*", [{ address: dest, amount: DUST_COINS }]]);
    write("sendcurrency", sendBody);
    const opid = JSON.parse(sendBody).result;

    // Poll to a final state; only a "success" body carries result.txid. This
    // runs AFTER the broadcast, so it must fail loudly and specifically: the
    // funds are already gone and sendcurrency.json is already written.
    for (let i = 0; i < 120; i++) {
      const body = await callRaw("z_getoperationstatus", [[opid]]);
      const result = JSON.parse(body).result;
      if (!Array.isArray(result)) {
        throw new Error(`z_getoperationstatus returned a non-array after the send (opid ${opid}): ${body.slice(0, 200)}`);
      }
      if (result.length === 0) {
        throw new Error(`opid ${opid} vanished from z_getoperationstatus after the send — was z_getoperationresult called concurrently? The transaction WAS broadcast.`);
      }
      const [status] = result;
      if (status?.status === "success") {
        write("z_getoperationstatus", body);
        console.log(`  txid ${status.result.txid}`);
        return null; // already written
      }
      if (status?.status === "failed" || status?.status === "cancelled") {
        throw new Error(`operation ${opid} ${status.status}: ${JSON.stringify(status.error)}`);
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    throw new Error(`operation ${opid} never reached a final state — the transaction WAS broadcast; check the opid before re-running`);
  },
};

const READS = ["getbalance", "getblocksubsidy", "getnetworkinfo", "getwalletinfo", "listunspent", "listtransactions", "listaddressgroupings", "gettransaction", "signmessage"];
const argv = process.argv.slice(2);
const requested = argv.includes("all") ? [...READS, "spend"] : argv.includes("reads") ? READS : argv;

if (requested.length === 0) {
  console.error(`Usage: record-fixtures.mjs <name>...\nNames: ${Object.keys(RECIPES).join(", ")}, reads, all`);
  process.exit(1);
}

for (const name of requested) {
  const recipe = RECIPES[name];
  if (recipe === undefined) {
    console.error(`unknown recipe: ${name}`);
    process.exit(1);
  }
  console.log(`recording ${name}…`);
  const body = await recipe();
  if (body !== null) write(name, body);
}
console.log("done — review the diff, then truncate/scrub per fixtures/README.md");
