/**
 * Live WRITE harness (ring 3, value-moving) — the post-release breaking-change
 * check for the write path. Gated behind BOTH VERUS_RPC_URL and
 * VERUS_RPC_ALLOW_SPEND=1, so CI (no flags) never runs it. Uses dust on
 * VRSCTEST and a FRESH throwaway identity per run — it never touches existing
 * identities.
 *
 * Run (via SSH tunnel to your node, creds kept on the host):
 *   VERUS_RPC_URL=http://127.0.0.1:18843 VERUS_RPC_USER=… VERUS_RPC_PASS=… \
 *   VERUS_RPC_ALLOW_SPEND=1 pnpm test test/spend.integration.test.ts
 *
 * Add VERUS_RPC_RECORD_FIXTURES=1 to also promote sanitized captures into
 * fixtures/. See docs/testing-live.md.
 */
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseAmount } from "../src/amount.js";
import { LosslessNumber } from "../src/lossless.js";
import type { VerusClient } from "../src/client.js";
import {
  buildLiveClient,
  liveConfig,
  sanitizeAndRecordFixtures,
  uniqueTestName,
  waitForBalance,
  waitForConfirmation,
  waitForIdentity,
  waitForOffer,
  writeArtifacts,
  type CapturingTransport,
} from "./support/live.js";

const cfg = liveConfig();
const DUST = parseAmount("0.0001");
const MIN = 60_000;

// Generous timeouts — testnet confirmations dominate (~1 block/min).
const T_SEND = 8 * MIN;
const T_LIFECYCLE = 30 * MIN;
const T_BEST_EFFORT = 10 * MIN;

describe.skipIf(!(cfg.hasUrl && cfg.allowSpend))("live write harness (VRSCTEST, dust)", () => {
  let client: VerusClient;
  let transport: CapturingTransport;
  const summary: Record<string, unknown> = {};

  beforeAll(async () => {
    const built = buildLiveClient();
    client = built.client;
    transport = built.transport;
    const info = await client.chain.getInfo();
    if (info.testnet !== true) {
      throw new Error(`refusing to run write harness against a non-testnet chain (${info.name})`);
    }
    console.log(`[spend] daemon ${info.name} v${info.VRSCversion}; balance=${await client.wallet.getBalance()} sats`);
  }, MIN);

  afterAll(() => {
    const dir = writeArtifacts("spend", transport.captures, summary);
    console.log(`[spend] artifacts written to ${dir}`);
    if (cfg.recordFixtures) {
      const written = sanitizeAndRecordFixtures(transport, join(process.cwd(), "fixtures"));
      console.log(`[spend] recorded sanitized fixtures: ${written.join(", ")}`);
    }
  });

  it(
    "A. sendCurrencyAndWait — dust round-trip + opid polling",
    async () => {
      const dest = await client.wallet.getNewAddress();
      const { opid, txid } = await client.wallet.sendCurrencyAndWait({
        fromAddress: "*",
        outputs: [{ address: dest, amount: DUST }],
      });
      expect(opid.startsWith("opid-")).toBe(true);
      expect(txid).toHaveLength(64);
      const tx = await client.wallet.getTransaction({ txid });
      expect(typeof tx.amount).toBe("bigint");
      // On-chain effect: the fresh dest actually received exactly the dust.
      await waitForConfirmation(client, txid, { minConf: 1, timeoutMs: T_SEND - MIN });
      const bal = await waitForBalance(client, dest, DUST, { timeoutMs: T_SEND - MIN });
      expect(bal["VRSCTEST"]).toBe(DUST);
      summary["sendCurrency"] = { dest, opid, txid, destBalance: bal["VRSCTEST"]?.toString() };
    },
    T_SEND,
  );

  it(
    "B. sendMany — two recipients, one tx",
    async () => {
      const a = await client.wallet.getNewAddress();
      const b = await client.wallet.getNewAddress();
      const txid = await client.wallet.sendMany({ amounts: { [a]: DUST, [b]: DUST } });
      expect(txid).toHaveLength(64);
      await waitForConfirmation(client, txid, { minConf: 1, timeoutMs: T_SEND - MIN });
      // On-chain effect: each fresh recipient received exactly the dust.
      const balA = await waitForBalance(client, a, DUST, { timeoutMs: T_SEND - MIN });
      const balB = await waitForBalance(client, b, DUST, { timeoutMs: T_SEND - MIN });
      expect(balA["VRSCTEST"]).toBe(DUST);
      expect(balB["VRSCTEST"]).toBe(DUST);
      summary["sendMany"] = { recipients: [a, b], txid };
    },
    T_SEND,
  );

  it(
    "C. identity lifecycle — register → update → revoke → recover (fresh throwaway id)",
    async () => {
      // A separate authority id: a Verus id cannot be revoked while it is its
      // own recovery authority (it would be unrecoverable), so the throwaway
      // test id delegates revocation + recovery to this fresh authority id.
      const authName = uniqueTestName();
      const authControl = await client.wallet.getNewAddress();
      await client.identity.registerIdentityFlow({
        name: authName,
        controlAddress: authControl,
        confirmationTimeoutMs: 12 * MIN,
        pollIntervalMs: 5_000,
      });
      const auth = await waitForIdentity(client, `${authName}@`, (r) => (r.blockheight ?? 0) > 0, {
        timeoutMs: 12 * MIN,
      });
      const authId = auth.identity.identityaddress;

      const name = uniqueTestName();
      const fq = `${name}@`;
      const control = await client.wallet.getNewAddress();
      const stages: Record<string, unknown> = { authName, authId, name, control };

      // --- register (commitment → confirm → register), delegating authority ---
      const { commitment, registrationTxid } = await client.identity.registerIdentityFlow({
        name,
        controlAddress: control,
        identity: { revocationauthority: authId, recoveryauthority: authId },
        confirmationTimeoutMs: 12 * MIN,
        pollIntervalMs: 5_000,
      });
      stages["commitmentTxid"] = commitment.txid;
      stages["registrationTxid"] = registrationTxid;
      const registered = await waitForIdentity(client, fq, (r) => (r.blockheight ?? 0) > 0, {
        timeoutMs: 12 * MIN,
      });
      expect(registered.identity.name).toBe(name);
      expect(registered.identity.recoveryauthority).toBe(authId);
      // The full identity object from getidentity is exactly what update/recover
      // want back — round-trip it (read → modify → write).
      const def = registered.identity;

      // --- update: add a second primary address (an observable, daemon-accepted
      // change; keep minimumsignatures at 1 so the original key still controls it) ---
      const extraAddress = await client.wallet.getNewAddress();
      const updateTxid = await client.identity.updateIdentity({
        identity: { ...def, primaryaddresses: [...def.primaryaddresses, extraAddress] },
      });
      expect(updateTxid).toHaveLength(64);
      await waitForConfirmation(client, updateTxid, { minConf: 1, timeoutMs: 8 * MIN });
      const updated = await client.identity.getIdentity({ nameOrAddress: fq });
      expect(updated.identity.primaryaddresses).toContain(extraAddress);
      stages["updateTxid"] = updateTxid;

      // --- revoke ---
      const revokeTxid = await client.identity.revokeIdentity({ nameOrId: fq });
      expect(revokeTxid).toHaveLength(64);
      const revoked = await waitForIdentity(client, fq, (r) => r.status === "revoked", { timeoutMs: 8 * MIN });
      expect(revoked.status).toBe("revoked");
      stages["revokeTxid"] = revokeTxid;

      // --- recover (recovery authority is self → wallet holds the key) ---
      const recoverTxid = await client.identity.recoverIdentity({ identity: def });
      expect(recoverTxid).toHaveLength(64);
      const recovered = await waitForIdentity(client, fq, (r) => r.status !== "revoked", { timeoutMs: 8 * MIN });
      expect(recovered.status).not.toBe("revoked");
      stages["recoverTxid"] = recoverTxid;

      summary["identityLifecycle"] = stages;
    },
    T_LIFECYCLE,
  );

  it(
    "D. shielded z_sendmany — dust t→z (best-effort; testnet z-support is partial)",
    async () => {
      try {
        const utxos = await client.wallet.listUnspent({ minConf: 1 });
        const funded = utxos.find((u) => u.address !== undefined && u.amount > DUST * 2n);
        if (funded?.address === undefined) {
          console.log("[spend] D skipped: no funded t-address");
          return;
        }
        const zaddr = await client.shielded.zGetNewAddress();
        const { txid } = await client.shielded.zSendManyAndWait({
          fromAddress: funded.address,
          amounts: [{ address: zaddr, amount: DUST }],
          waitTimeoutMs: T_BEST_EFFORT - MIN,
          pollIntervalMs: 5_000,
        });
        expect(txid).toHaveLength(64);
        // On-chain effect: the fresh z-address received exactly the dust.
        await waitForConfirmation(client, txid, { minConf: 1, timeoutMs: T_BEST_EFFORT - MIN });
        const zbal = await client.shielded.zGetBalance({ address: zaddr, minConf: 1 });
        expect(parseAmount(zbal)).toBe(DUST);
        summary["shielded"] = { from: funded.address, to: zaddr, txid, zBalance: zbal };
      } catch (err) {
        console.log(`[spend] D best-effort z_sendmany did not complete: ${err instanceof Error ? err.message : String(err)}`);
        summary["shielded"] = { skipped: String(err) };
      }
    },
    T_BEST_EFFORT,
  );

  it(
    "E. marketplace makeOffer → closeOffers (best-effort, self-cancel)",
    async () => {
      let offerTxid: string | undefined;
      try {
        const change = await client.wallet.getNewAddress();
        const receive = await client.wallet.getNewAddress();
        const info = await client.chain.getInfo();
        const res = await client.currency.makeOffer({
          fromAddress: "*",
          offer: {
            changeaddress: change,
            expiryheight: info.blocks + 200,
            // Offer a small (above-dust) amount of VRSCTEST, ask for dust of a
            // token the wallet knows. The offered amount must exceed the network
            // fee by more than the dust threshold — closeoffers reclaims
            // (offered − fee) with no extra inputs, so an exactly-dust offer
            // (0.0001) yields a dust reclaim output the daemon rejects, leaking
            // the offer. The "for" ask needs only a valid destination address.
            offer: { currency: "VRSCTEST", amount: new LosslessNumber("0.001") },
            for: { address: receive, currency: "ownora", amount: new LosslessNumber("0.0001") },
          },
        });
        offerTxid = typeof res["txid"] === "string" ? res["txid"] : undefined;
        expect(offerTxid).toBeTypeOf("string");
        // On-chain effect: the offer actually shows up in this wallet's open
        // offers before we cancel it.
        await waitForOffer(client, offerTxid!, true, { timeoutMs: T_BEST_EFFORT - MIN });
        summary["marketplace"] = { offerTxid, appeared: true };
      } catch (err) {
        console.log(`[spend] E makeOffer rejected: ${err instanceof Error ? err.message : String(err)}`);
        summary["marketplace"] = { skipped: String(err) };
      } finally {
        // Always attempt cleanup so no dust stays locked in an open offer.
        if (offerTxid !== undefined) {
          try {
            await client.currency.closeOffers({ offerTxids: [offerTxid] });
            // On-chain effect: the offer is gone from open offers after close.
            await waitForOffer(client, offerTxid, false, { timeoutMs: T_BEST_EFFORT - MIN });
            console.log(`[spend] E closed offer ${offerTxid}`);
          } catch (err) {
            console.log(`[spend] E closeOffers failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    },
    T_BEST_EFFORT,
  );
});
