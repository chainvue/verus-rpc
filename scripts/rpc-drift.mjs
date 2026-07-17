#!/usr/bin/env node
/**
 * RPC drift checker — flags when the Verus daemon's RPC command set moves
 * away from what this client is built against.
 *
 * The authoritative list of commands (documented, hidden, and everything in
 * between) is the `CRPCCommand` tables in the daemon source
 * (`VerusCoin/VerusCoin`), not `verus help` — so this reads the source at a
 * release tag and diffs it against a committed baseline.
 *
 *   node scripts/rpc-drift.mjs [--ref <tag>] [--json <file>] [--update-baseline]
 *
 * --ref             VerusCoin tag to check (default: the latest release tag).
 * --json <file>     also write a machine-readable result to <file>.
 * --update-baseline overwrite rpc/commands-baseline.json with the checked set
 *                   (do this once you've accounted for the drift).
 *
 * Set GITHUB_TOKEN to lift the unauthenticated API rate limit (the CI job
 * passes the workflow token).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = "VerusCoin/VerusCoin";
const ROOT = join(import.meta.dirname, "..");
const BASELINE_PATH = join(ROOT, "rpc", "commands-baseline.json");

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? true);
}
const UPDATE = args.includes("--update-baseline");
const JSON_OUT = flag("--json");
let ref = flag("--ref");

const TOKEN = process.env["GITHUB_TOKEN"];
const apiHeaders = {
  accept: "application/vnd.github+json",
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: apiHeaders });
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function raw(path, atRef) {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${atRef}/${path}`);
  if (res.status === 404) return null; // genuinely absent at this ref (moved/renamed)
  if (!res.ok) throw new Error(`raw ${path}@${atRef}: HTTP ${res.status}`); // 5xx/rate-limit: fail loud
  return res.text();
}

/**
 * Every CRPCCommand entry is `{ "category", "name", &function, … }`. The two
 * leading string literals followed by a `&function` pointer is specific enough
 * to these tables not to collide with other brace-initialised structs.
 */
const ENTRY_RE = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*&\w+/g;

/** Pull `{ name: category }` from the daemon's rpc/wallet source at `atRef`. */
async function daemonCommands(atRef) {
  const dir = await api(`/repos/${REPO}/contents/src/rpc?ref=${encodeURIComponent(atRef)}`);
  const files = dir.filter((e) => e.type === "file" && e.name.endsWith(".cpp")).map((e) => e.path);
  files.push("src/wallet/rpcwallet.cpp"); // command table lives outside src/rpc
  const commands = {};
  for (const path of files) {
    const text = await raw(path, atRef); // 5xx/rate-limit throws (fail loud); 404 → null
    if (text === null) continue;
    for (const m of text.matchAll(ENTRY_RE)) {
      const [, category, name] = m;
      // A few names register under two categories (e.g. invalidateblock as both
      // "hidden" and "util"); the first wins. Only the category LABEL is
      // affected — drift detection keys on the name.
      if (!Object.hasOwn(commands, name)) commands[name] = category;
    }
  }
  return commands;
}

/**
 * Every lowercase string literal in the client's method modules. Intersected
 * with the daemon command set to escalate a REMOVED command into a breaking
 * change. Matching literals broadly (not just the `request("…")` argument) is
 * deliberate: the identity/currency methods dispatch through a `const method`
 * or a helper, so a narrow call-site regex misses exactly the churn-prone
 * methods. Over-capturing an unrelated literal is the safe direction — at worst
 * it over-flags a breaking removal; it can never hide one.
 */
function clientCommandLiterals() {
  const literals = new Set();
  const methodsDir = join(ROOT, "src", "methods");
  const files = [join(ROOT, "src", "client.ts"), ...readdirSync(methodsDir).map((f) => join(methodsDir, f))];
  const RE = /"([a-z][a-z0-9_]*)"/g;
  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(RE)) literals.add(m[1]);
  }
  return literals;
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  if (ref === undefined) {
    ref = (await api(`/repos/${REPO}/releases/latest`)).tag_name;
  }
  const latest = await daemonCommands(ref);
  const latestNames = Object.keys(latest).sort();

  if (UPDATE) {
    // recordedAt is intentionally not stamped here (kept deterministic); set it
    // in the commit. Sort keys for a stable, reviewable diff.
    const sorted = Object.fromEntries(latestNames.map((n) => [n, latest[n]]));
    writeFileSync(BASELINE_PATH, JSON.stringify({ verusRef: ref, commands: sorted }, null, 2) + "\n");
    console.log(`Baseline updated to ${ref} (${latestNames.length} commands): ${BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline();
  if (baseline === null) {
    throw new Error(`no baseline at ${BASELINE_PATH} — seed one with --update-baseline`);
  }
  const baseNames = new Set(Object.keys(baseline.commands));
  const used = clientCommandLiterals();

  const added = latestNames.filter((n) => !baseNames.has(n));
  const removed = [...baseNames].filter((n) => !Object.hasOwn(latest, n)).sort();
  const removedBreaking = removed.filter((n) => used.has(n));

  const drift = ref !== baseline.verusRef && (added.length > 0 || removed.length > 0);
  const result = { baselineRef: baseline.verusRef, checkedRef: ref, added, removed, removedBreaking, drift };

  const lines = [];
  lines.push(`## RPC command drift — \`${baseline.verusRef}\` → \`${ref}\``);
  lines.push("");
  if (!drift) {
    lines.push(added.length || removed.length ? "_Command set differs but tag unchanged — no action._" : "No command drift. ✅");
  } else {
    if (removedBreaking.length) {
      lines.push(`### ⚠️ Breaking — ${removedBreaking.length} removed command(s) this client calls`);
      for (const n of removedBreaking) lines.push(`- \`${n}\` — a curated/used method now hits \`-32601\``);
      lines.push("");
    }
    if (added.length) {
      lines.push(`### ${added.length} new command(s) — curation candidates`);
      for (const n of added) lines.push(`- \`${n}\`  _(${latest[n]})_`);
      lines.push("");
    }
    const removedOnly = removed.filter((n) => !used.has(n));
    if (removedOnly.length) {
      lines.push(`### ${removedOnly.length} removed command(s) — not used by this client`);
      for (const n of removedOnly) lines.push(`- \`${n}\``);
      lines.push("");
    }
    lines.push("---");
    lines.push(
      "Verify each against the daemon source before curating, then run " +
        "`node scripts/rpc-drift.mjs --update-baseline --ref " +
        ref +
        "` and commit the baseline.",
    );
  }
  const report = lines.join("\n");
  console.log(report);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ ...result, report }, null, 2) + "\n");

  // Exit 0 always: drift is reported, not an error. The workflow reads the JSON.
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
