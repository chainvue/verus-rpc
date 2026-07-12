/**
 * Shared helpers for the gated live suites (read sweep + write harness).
 * These run only against a real daemon (env-gated) and never in CI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VerusClient } from "../../src/client.js";
import type { GetIdentityResult } from "../../src/methods/identity.js";
import type { GetTransactionResult } from "../../src/methods/wallet.js";
import { stringifyLossless, toSafeNumbers } from "../../src/lossless.js";
import { DaemonTransport, type RpcTransport } from "../../src/transport.js";

export interface LiveConfig {
  url: string | undefined;
  user: string;
  pass: string;
  /** VERUS_RPC_URL is set → read-only integration may run. */
  hasUrl: boolean;
  /** VERUS_RPC_ALLOW_SPEND=1 → value-moving write harness may run. */
  allowSpend: boolean;
  /** VERUS_RPC_RECORD_FIXTURES=1 → promote sanitized captures into fixtures/. */
  recordFixtures: boolean;
}

export function liveConfig(): LiveConfig {
  const url = process.env["VERUS_RPC_URL"];
  return {
    url,
    user: process.env["VERUS_RPC_USER"] ?? "",
    pass: process.env["VERUS_RPC_PASS"] ?? "",
    hasUrl: url !== undefined && url !== "",
    allowSpend: process.env["VERUS_RPC_ALLOW_SPEND"] === "1",
    recordFixtures: process.env["VERUS_RPC_RECORD_FIXTURES"] === "1",
  };
}

export interface Capture {
  method: string;
  params: unknown[];
  /** Raw result subtree (LosslessNumber for every number literal). */
  raw: unknown;
}

/**
 * Transport decorator that tees every successful `(method, params, raw)` into
 * an in-memory log — lets the harness dump exact daemon responses without a
 * second request. Mirrors the shape of src/mock.ts's MockTransport.
 */
export class CapturingTransport implements RpcTransport {
  readonly captures: Capture[] = [];

  constructor(private readonly inner: RpcTransport) {}

  async request(method: string, params: unknown[]): Promise<unknown> {
    const raw = await this.inner.request(method, params);
    this.captures.push({ method, params, raw });
    return raw;
  }

  /** Most recent capture for a method (write harness records repeatedly). */
  last(method: string): Capture | undefined {
    for (let i = this.captures.length - 1; i >= 0; i--) {
      if (this.captures[i]!.method === method) return this.captures[i];
    }
    return undefined;
  }
}

export function buildLiveClient(): { client: VerusClient; transport: CapturingTransport } {
  const cfg = liveConfig();
  if (!cfg.hasUrl) throw new Error("buildLiveClient: VERUS_RPC_URL not set");
  const transport = new CapturingTransport(
    new DaemonTransport({ url: cfg.url!, user: cfg.user, pass: cfg.pass, timeoutMs: 30_000 }),
  );
  return { client: new VerusClient({ transport }), transport };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll gettransaction until the tx has >= minConf confirmations. */
export async function waitForConfirmation(
  client: VerusClient,
  txid: string,
  opts?: { minConf?: number; timeoutMs?: number; pollMs?: number },
): Promise<GetTransactionResult> {
  const minConf = opts?.minConf ?? 1;
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const pollMs = opts?.pollMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const tx = await client.wallet.getTransaction({ txid });
      if (tx.confirmations >= minConf) return tx;
    } catch {
      // tx not visible to the wallet yet — keep polling
    }
    if (Date.now() > deadline) {
      throw new Error(`txid ${txid} not confirmed (>=${minConf}) within ${timeoutMs}ms`);
    }
    await sleep(pollMs);
  }
}

/** Poll getidentity until `predicate` holds (registration, revoke, recover). */
export async function waitForIdentity(
  client: VerusClient,
  nameOrId: string,
  predicate: (r: GetIdentityResult) => boolean,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<GetIdentityResult> {
  const timeoutMs = opts?.timeoutMs ?? 360_000;
  const pollMs = opts?.pollMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await client.identity.getIdentity({ nameOrAddress: nameOrId });
      if (predicate(r)) return r;
    } catch {
      // identity not registered/visible yet
    }
    if (Date.now() > deadline) {
      throw new Error(`identity ${nameOrId} did not reach the expected state within ${timeoutMs}ms`);
    }
    await sleep(pollMs);
  }
}

/** Unique, Verus-name-safe throwaway id name (lowercase + base36). */
export function uniqueTestName(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1_000_000).toString(36);
  return `verusrpc-test-${t}${r}`;
}

/** Dump captures (safe-number converted for readability) to a gitignored dir. */
export function writeArtifacts(label: string, captures: Capture[], summary?: Record<string, unknown>): string {
  const dir = join(process.cwd(), "test-artifacts", `${label}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const readable = captures.map((c) => ({
    method: c.method,
    params: toSafeNumbers(c.params),
    result: toSafeNumbers(c.raw),
  }));
  writeFileSync(join(dir, "captures.json"), JSON.stringify(readable, null, 2));
  if (summary !== undefined) {
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  }
  return dir;
}

/** Stable placeholder generator: same input token → same placeholder. */
function makeSanitizer(): (text: string) => string {
  const seen = new Map<string, string>();
  const counters: Record<string, number> = {};
  const placeholder = (kind: string, token: string): string => {
    const existing = seen.get(token);
    if (existing !== undefined) return existing;
    const n = (counters[kind] = (counters[kind] ?? 0) + 1);
    const made =
      kind === "hash"
        ? `${String(n).padStart(2, "0")}`.padEnd(64, "0")
        : kind === "zaddr"
          ? `zsTEST${String(n).padStart(2, "0")}`.padEnd(78, "x")
          : `${kind === "iaddr" ? "iTest" : "RTest"}Address${String(n).padStart(2, "0")}`.padEnd(34, "1");
    seen.set(token, made);
    return made;
  };
  return (text: string) =>
    text
      .replace(/\bzs1[0-9a-z]{60,}\b/g, (m) => placeholder("zaddr", m))
      .replace(/\b[Ri][1-9A-HJ-NP-Za-km-z]{33}\b/g, (m) => placeholder(m.startsWith("i") ? "iaddr" : "raddr", m))
      .replace(/\b[0-9a-f]{64}\b/g, (m) => placeholder("hash", m));
}

/**
 * Opt-in: write sanitized write-method captures into fixtures/, replacing the
 * synthetic ones. Wallet addresses / txids / z-addresses become stable
 * placeholders; the throwaway identity name is not sensitive and is kept.
 */
export function sanitizeAndRecordFixtures(transport: CapturingTransport, fixturesDir: string): string[] {
  const sanitize = makeSanitizer();
  const wanted = [
    "sendcurrency",
    "sendmany",
    "z_getoperationstatus",
    "registernamecommitment",
    "registeridentity",
    "updateidentity",
    "revokeidentity",
    "recoveridentity",
  ];
  const written: string[] = [];
  for (const method of wanted) {
    const cap = transport.last(method);
    if (cap === undefined) continue;
    const body = stringifyLossless({ result: cap.raw, error: null, id: "recorded" });
    writeFileSync(join(fixturesDir, `${method}.json`), sanitize(body) + "\n");
    written.push(`${method}.json`);
  }
  return written;
}
