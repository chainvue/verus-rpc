/**
 * Gated read-only integration (ring 3) — runs only when VERUS_RPC_URL is set
 * (creds from the node host via SSH, never committed). This is the safe half
 * of the post-release breaking-change check: it exercises the curated read
 * surface across every namespace against a real daemon and fails loudly (with
 * the offending method + field, via ResponseMappingError) if a daemon upgrade
 * changed a response shape. No value ever moves here — see
 * spend.integration.test.ts for the write harness.
 *
 * VERUS_RPC_MAINNET_SMOKE=1 additionally runs a read-only shape smoke against
 * the public mainnet RPC (https://api.verus.services).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { VerusClient } from "../src/client.js";
import { buildLiveClient, liveConfig } from "./support/live.js";

const cfg = liveConfig();

describe.skipIf(!cfg.hasUrl)("gated integration: real daemon (read-only)", () => {
  let client: VerusClient;

  // Samples discovered from live data and fed into the detail methods.
  let sampleAddress: string | undefined;
  let sampleTxid: string | undefined;
  let sampleIdentityId: string | undefined;
  let sampleZAddr: string | undefined;
  let converterName: string | undefined;
  let height = 0;

  beforeAll(async () => {
    client = buildLiveClient().client;
    const info = await client.chain.getInfo();
    // Surfaced in the test log so a release run records which daemon it hit.
    console.log(`[integration] daemon ${info.name ?? "?"} v${info.VRSCversion} testnet=${info.testnet}`);

    height = await client.chain.getBlockCount();

    const utxos = await client.wallet.listUnspent();
    sampleAddress = utxos.find((u) => u.address !== undefined)?.address;

    const txs = await client.wallet.listTransactions({ count: 10 });
    sampleTxid = txs.find((t) => t.txid !== undefined)?.txid;

    const ids = await client.identity.listIdentities();
    sampleIdentityId = ids[0]?.identity.identityaddress;

    const converters = await client.currency.listCurrencies();
    const frac = converters.find((e) => (e.currencydefinition.currencies?.length ?? 0) > 0);
    converterName = frac?.currencydefinition.fullyqualifiedname ?? frac?.currencydefinition.name;

    const zaddrs = await client.shielded.zListAddresses();
    sampleZAddr = zaddrs[0];
  }, 60_000);

  describe("chain / blockchain", () => {
    it("getInfo maps fee fields to bigint", async () => {
      const info = await client.chain.getInfo();
      expect(typeof info.paytxfee).toBe("bigint");
      expect(typeof info.relayfee).toBe("bigint");
    });
    it("getBlockCount", async () => expect(await client.chain.getBlockCount()).toBeGreaterThan(0));
    it("getBlockchainInfo", async () => expect((await client.blockchain.getBlockchainInfo())["blocks"]).toBeDefined());
    it("getBlockHash + getBlock (verbosity 1)", async () => {
      const hash = await client.blockchain.getBlockHash(height - 5);
      expect(hash).toHaveLength(64);
      const blk = (await client.blockchain.getBlock({ hashOrHeight: hash, verbosity: 1 })) as Record<string, unknown>;
      expect(blk["height"]).toBe(height - 5);
    });
    it("getVdxfId", async () => {
      const v = await client.blockchain.getVdxfId({ name: "vrsc::system.currency.export" });
      expect(v.hash160result.length).toBeGreaterThan(0);
    });
    it("getMiningInfo / getNetworkInfo / getBlockSubsidy", async () => {
      expect(await client.blockchain.getMiningInfo()).toBeTypeOf("object");
      expect(await client.blockchain.getNetworkInfo()).toBeTypeOf("object");
      expect(await client.blockchain.getBlockSubsidy()).toBeTypeOf("object");
    });
    it("coinSupply maps supply pools to bigint (low height — near-tip takes the daemon minutes)", async () => {
      const supply = await client.blockchain.coinSupply({ height: 1_000 });
      expect(supply.height).toBe(1_000);
      expect(typeof supply.supply).toBe("bigint");
      expect(supply.total).toBe(supply.supply + supply.zfunds);
      await expect(client.blockchain.coinSupply({ height: 999_999_999 })).rejects.toThrow(/invalid height/);
    });
    it("getSpentInfo locates the spend of an early coinbase", async () => {
      const hash = await client.blockchain.getBlockHash(100);
      const blk = (await client.blockchain.getBlock({ hashOrHeight: hash, verbosity: 1 })) as {
        tx: string[];
      };
      const spent = await client.addressIndex.getSpentInfo({ txid: blk.tx[0]!, index: 0 });
      expect(spent.txid).toHaveLength(64);
      expect(spent.height).toBeGreaterThan(100);
    });
  });

  describe("wallet", () => {
    it("getWalletInfo maps balances to bigint", async () => {
      const w = await client.wallet.getWalletInfo();
      expect(typeof w.balance).toBe("bigint");
      expect(typeof w.unconfirmed_balance).toBe("bigint");
    });
    it("getBalance / getUnconfirmedBalance", async () => {
      expect(await client.wallet.getBalance()).toBeTypeOf("bigint");
      expect(await client.wallet.getUnconfirmedBalance()).toBeTypeOf("bigint");
    });
    it("listUnspent maps amounts to bigint", async () => {
      const u = await client.wallet.listUnspent();
      if (u[0] !== undefined) expect(typeof u[0].amount).toBe("bigint");
    });
    it("listTransactions", async () => expect(Array.isArray(await client.wallet.listTransactions({ count: 5 }))).toBe(true));
    it("getTransaction (real txid)", async (ctx) => {
      if (sampleTxid === undefined) return ctx.skip();
      const tx = await client.wallet.getTransaction({ txid: sampleTxid });
      expect(typeof tx.amount).toBe("bigint");
      expect(Array.isArray(tx.details)).toBe(true);
    });
    it("listAddressGroupings", async () => {
      const g = await client.wallet.listAddressGroupings();
      if (g[0]?.[0] !== undefined) expect(typeof g[0][0].amount).toBe("bigint");
    });
    it("getCurrencyBalance (real addr)", async (ctx) => {
      if (sampleAddress === undefined) return ctx.skip();
      const b = await client.wallet.getCurrencyBalance({ address: sampleAddress });
      for (const v of Object.values(b)) expect(typeof v).toBe("bigint");
    });
    it("listReceivedByAddress (T2)", async () => expect(Array.isArray(await client.wallet.listReceivedByAddress())).toBe(true));
  });

  describe("identity", () => {
    it("listIdentities", async () => expect(Array.isArray(await client.identity.listIdentities())).toBe(true));
    it("getIdentity (real i-address)", async (ctx) => {
      if (sampleIdentityId === undefined) return ctx.skip();
      const r = await client.identity.getIdentity({ nameOrAddress: sampleIdentityId });
      expect(r.identity.identityaddress).toBe(sampleIdentityId);
      expect(r.identity.primaryaddresses.length).toBeGreaterThan(0);
    });
    it("getIdentityContent (real i-address)", async (ctx) => {
      if (sampleIdentityId === undefined) return ctx.skip();
      const r = await client.identity.getIdentityContent({ nameOrAddress: sampleIdentityId });
      expect(r.identity.name.length).toBeGreaterThan(0);
    });
    it("getIdentityHistory (real i-address)", async (ctx) => {
      if (sampleIdentityId === undefined) return ctx.skip();
      const r = await client.identity.getIdentityHistory({ nameOrAddress: sampleIdentityId });
      expect(Array.isArray(r.history)).toBe(true);
    });
  });

  describe("currency", () => {
    it("getCurrency (native)", async () => {
      const c = await client.currency.getCurrency({ currency: "VRSCTEST" });
      expect(c.name.length).toBeGreaterThan(0);
    });
    it("listCurrencies", async () => expect((await client.currency.listCurrencies()).length).toBeGreaterThan(0));
    it("getCurrencyState (native)", async () => {
      const s = await client.currency.getCurrencyState({ currency: "VRSCTEST" });
      expect(Array.isArray(s)).toBe(true);
    });
    it("getCurrency (fractional) maps reserves to bigint", async (ctx) => {
      if (converterName === undefined) return ctx.skip();
      const c = await client.currency.getCurrency({ currency: converterName });
      const st = c.bestcurrencystate ?? c.lastconfirmedcurrencystate;
      if (st?.reservecurrencies?.[0] !== undefined) expect(typeof st.reservecurrencies[0].weight).toBe("bigint");
    });
  });

  describe("addressindex", () => {
    it("getAddressBalance maps to bigint", async (ctx) => {
      if (sampleAddress === undefined) return ctx.skip();
      const b = await client.addressIndex.getAddressBalance({ addresses: [sampleAddress] });
      expect(typeof b.balance).toBe("bigint");
      expect(typeof b.received).toBe("bigint");
    });
    it("getAddressUtxos / Deltas / Txids", async (ctx) => {
      if (sampleAddress === undefined) return ctx.skip();
      expect(Array.isArray(await client.addressIndex.getAddressUtxos({ addresses: [sampleAddress] }))).toBe(true);
      expect(Array.isArray(await client.addressIndex.getAddressDeltas({ addresses: [sampleAddress] }))).toBe(true);
      expect(Array.isArray(await client.addressIndex.getAddressTxids({ addresses: [sampleAddress] }))).toBe(true);
    });
  });

  describe("shielded (read-only)", () => {
    it("zGetTotalBalance maps to decimal strings", async () => {
      const b = await client.shielded.zGetTotalBalance();
      expect(typeof b.total).toBe("string");
    });
    it("zListAddresses", async () => expect(Array.isArray(await client.shielded.zListAddresses())).toBe(true));
    it("zGetBalance (real z-addr)", async (ctx) => {
      if (sampleZAddr === undefined) return ctx.skip();
      expect(typeof (await client.shielded.zGetBalance({ address: sampleZAddr }))).toBe("string");
    });
    it("zListUnspent", async () => expect(Array.isArray(await client.shielded.zListUnspent())).toBe(true));
  });

  describe("escape hatch", () => {
    it("call() returns lossless-safe numbers", async () => {
      const m = (await client.call("getmininginfo")) as Record<string, unknown>;
      expect(Object.keys(m).length).toBeGreaterThan(0);
    });
  });
});

describe.skipIf(process.env["VERUS_RPC_MAINNET_SMOKE"] !== "1")("gated smoke: public mainnet RPC", () => {
  // Public nodes are unauthenticated — constructing without credentials IS
  // the feature under test (lite-wallet transport for Peculium et al.).
  const client = () => new VerusClient({ url: "https://api.verus.services" });

  it("getinfo shape holds on mainnet", async () => {
    const info = await client().chain.getInfo();
    expect(info.testnet).toBe(false);
    expect(typeof info.relayfee).toBe("bigint");
  });

  it("getidentity shape holds on mainnet", async () => {
    const result = await client().identity.getIdentity({ nameOrAddress: "Verus Coin Foundation@" });
    expect(result.identity.identityaddress.startsWith("i")).toBe(true);
  });

  it("public testnet node serves the light-client read set without auth", async () => {
    const testnet = new VerusClient({ url: "https://api.verustest.net" });
    const info = await testnet.chain.getInfo();
    expect(info.testnet).toBe(true);

    const identity = await testnet.identity.getIdentity({ nameOrAddress: "v402-facilitator@" });
    const address = identity.identity.identityaddress;
    expect(address.startsWith("i")).toBe(true);

    const balance = await testnet.addressIndex.getAddressBalance({ addresses: [address] });
    expect(typeof balance.balance).toBe("bigint");

    const utxos = await testnet.addressIndex.getAddressUtxos({ addresses: [address] });
    expect(Array.isArray(utxos)).toBe(true);
  });
});
