/** Etappe 3 — identity family: reads, lifecycle, registration flow, T2 signatures. */
import { describe, expect, it } from "vitest";
import { OperationTimeoutError } from "../src/errors.js";
import { isLosslessNumber } from "../src/lossless.js";
import { IdentityApi } from "../src/methods/identity.js";
import { MockTransport } from "../src/mock.js";

function setup(): { mock: MockTransport; identity: IdentityApi } {
  const mock = new MockTransport();
  return { mock, identity: new IdentityApi(mock) };
}

const IDENTITY_DEF =
  '{"version":3,"flags":0,"primaryaddresses":["RAddr1"],"minimumsignatures":1,"name":"x",' +
  '"identityaddress":"iAddr","parent":"iParent","systemid":"iSystem","contentmap":{},' +
  '"revocationauthority":"iAddr","recoveryauthority":"iAddr","timelock":0}';

describe("identity reads", () => {
  it("getIdentityContent builds positional params up to the last set option", async () => {
    const { mock, identity } = setup();
    mock.respondJson("getidentitycontent", `{"identity":${IDENTITY_DEF}}`);
    await identity.getIdentityContent({ nameOrAddress: "x@", txProofs: true });
    expect(mock.calls[0]!.params).toEqual(["x@", 0, 0, true]);
  });

  it("getIdentityHistory maps history entries", async () => {
    const { mock, identity } = setup();
    mock.respondJson(
      "getidentityhistory",
      `{"fullyqualifiedname":"x.VRSC@","history":[{"blockhash":"aa","height":100,"output":{"txid":"ab","voutnum":0},"identity":${IDENTITY_DEF}}]}`,
    );
    const result = await identity.getIdentityHistory({ nameOrAddress: "x@" });
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.height).toBe(100);
    expect(result.history[0]!.identity.name).toBe("x");
    expect(result.history[0]!.output).toEqual({ txid: "ab", voutnum: 0 });
  });

  it("listIdentities maps wallet identities", async () => {
    const { mock, identity } = setup();
    mock.respondJson("listidentities", `[{"identity":${IDENTITY_DEF},"status":"active","canspendfor":true}]`);
    const [entry] = await identity.listIdentities({ includeWatchOnly: true });
    expect(entry!.identity.name).toBe("x");
    expect(entry!.canspendfor).toBe(true);
    expect(mock.calls[0]!.params).toEqual([true, true, true]);
  });

  it("getIdentitiesWithAddress sends the query object and maps flat identities", async () => {
    const { mock, identity } = setup();
    mock.respondJson("getidentitieswithaddress", `[${IDENTITY_DEF}]`);
    const result = await identity.getIdentitiesWithAddress({ address: "RAddr1", unspent: true });
    expect(result[0]!.identityaddress).toBe("iAddr");
    expect(mock.calls[0]!.params).toEqual([{ address: "RAddr1", unspent: true }]);
  });

  it("getIdentitiesWithRevocation/-Recovery send identityid queries", async () => {
    const { mock, identity } = setup();
    mock.respondJson("getidentitieswithrevocation", "[]").respondJson("getidentitieswithrecovery", "[]");
    await identity.getIdentitiesWithRevocation({ identityId: "iAddr" });
    await identity.getIdentitiesWithRecovery({ identityId: "iAddr", fromHeight: 5 });
    expect(mock.calls[0]!.params).toEqual([{ identityid: "iAddr" }]);
    expect(mock.calls[1]!.params).toEqual([{ identityid: "iAddr", fromheight: 5 }]);
  });
});

describe("identity lifecycle", () => {
  const COMMITMENT =
    '{"txid":"commit-tx","namereservation":{"version":1,"name":"myname","salt":"aa","parent":"iParent","nameid":"iNew"}}';

  it("registerNameCommitment maps the reservation", async () => {
    const { mock, identity } = setup();
    mock.respondJson("registernamecommitment", COMMITMENT);
    const result = await identity.registerNameCommitment({ name: "myname", controlAddress: "RCtrl" });
    expect(result.txid).toBe("commit-tx");
    expect(result.namereservation.salt).toBe("aa");
    expect(mock.calls[0]!.params).toEqual(["myname", "RCtrl"]);
  });

  it("registerNameCommitment fills skipped middle params with null", async () => {
    const { mock, identity } = setup();
    mock.respondJson("registernamecommitment", COMMITMENT);
    await identity.registerNameCommitment({ name: "myname", controlAddress: "RCtrl", parent: "vrsctest" });
    expect(mock.calls[0]!.params).toEqual(["myname", "RCtrl", null, "vrsctest"]);
  });

  it("registerIdentity sends reservation + identity and returns the txid", async () => {
    const { mock, identity } = setup();
    mock.respond("registeridentity", "reg-tx");
    const txid = await identity.registerIdentity({
      txid: "commit-tx",
      namereservation: { name: "myname", salt: "aa" },
      identity: { name: "myname", primaryaddresses: ["RCtrl"], minimumsignatures: 1 },
      feeOffer: 8_000_000_000n,
    });
    expect(txid).toBe("reg-tx");
    const params = mock.calls[0]!.params;
    expect(params[0]).toMatchObject({ txid: "commit-tx" });
    expect(params[1]).toBe(false); // returnTx default when feeOffer set
    expect(isLosslessNumber(params[2])).toBe(true);
    expect(String(params[2])).toBe("80.00000000");
  });

  it("update/revoke/recover map to txid strings", async () => {
    const { mock, identity } = setup();
    mock.respond("updateidentity", "up-tx").respond("revokeidentity", "rev-tx").respond("recoveridentity", "rec-tx");
    await expect(identity.updateIdentity({ identity: { name: "x" } })).resolves.toBe("up-tx");
    await expect(identity.revokeIdentity({ nameOrId: "x@" })).resolves.toBe("rev-tx");
    await expect(identity.recoverIdentity({ identity: { name: "x" } })).resolves.toBe("rec-tx");
  });

  it("setIdentityTimelock demands exactly one lock mode", async () => {
    const { mock, identity } = setup();
    mock.respond("setidentitytimelock", "lock-tx");
    await expect(identity.setIdentityTimelock({ nameOrId: "x@" })).rejects.toThrow(TypeError);
    await expect(
      identity.setIdentityTimelock({ nameOrId: "x@", unlockAtBlock: 100, setUnlockDelay: 5 }),
    ).rejects.toThrow(TypeError);
    await expect(identity.setIdentityTimelock({ nameOrId: "x@", setUnlockDelay: 20 })).resolves.toBe("lock-tx");
    expect(mock.calls[0]!.params).toEqual(["x@", { setunlockdelay: 20 }]);
  });

  it("registerIdentityFlow: commitment -> confirmation poll -> register", async () => {
    const { mock, identity } = setup();
    mock.respondJson("registernamecommitment", COMMITMENT);
    mock.respondJson("gettransaction", '{"amount":0.00000000,"confirmations":0,"txid":"commit-tx","time":1,"timereceived":1,"details":[]}');
    mock.respondJson("gettransaction", '{"amount":0.00000000,"confirmations":1,"txid":"commit-tx","time":1,"timereceived":1,"details":[]}');
    mock.respond("registeridentity", "reg-tx");

    const result = await identity.registerIdentityFlow({
      name: "myname",
      controlAddress: "RCtrl",
      pollIntervalMs: 1,
    });
    expect(result.registrationTxid).toBe("reg-tx");
    expect(result.commitment.txid).toBe("commit-tx");

    const registerCall = mock.calls.find((c) => c.method === "registeridentity");
    expect(registerCall!.params[0]).toMatchObject({
      txid: "commit-tx",
      identity: { name: "myname", primaryaddresses: ["RCtrl"], minimumsignatures: 1 },
    });
  });

  it("registerIdentityFlow times out when the commitment never confirms", async () => {
    const { mock, identity } = setup();
    mock.respondJson("registernamecommitment", COMMITMENT);
    mock.respondAlways("gettransaction", {
      amount: 0,
      confirmations: 0,
      txid: "commit-tx",
      time: 1,
      timereceived: 1,
      details: [],
    });
    await expect(
      identity.registerIdentityFlow({
        name: "myname",
        controlAddress: "RCtrl",
        pollIntervalMs: 5,
        confirmationTimeoutMs: 25,
      }),
    ).rejects.toThrow(OperationTimeoutError);
  });
});

describe("T2 signatures & trust", () => {
  it("verifyHash forwards checkLatest", async () => {
    const { mock, identity } = setup();
    mock.respond("verifyhash", true);
    await expect(
      identity.verifyHash({ signer: "x@", signature: "sig==", hash: "aa", checkLatest: true }),
    ).resolves.toBe(true);
    expect(mock.calls[0]!.params).toEqual(["x@", "sig==", "aa", true]);
  });

  it("signData passes the daemon JSON through and safe-converts the result", async () => {
    const { mock, identity } = setup();
    mock.respondJson("signdata", '{"signature":"sig==","hash":"aa"}');
    await expect(identity.signData({ address: "x@", message: "hi" })).resolves.toEqual({
      signature: "sig==",
      hash: "aa",
    });
    expect(mock.calls[0]!.params).toEqual([{ address: "x@", message: "hi" }]);
  });

  it("getIdentityTrust wraps identity ids", async () => {
    const { mock, identity } = setup();
    mock.respondJson("getidentitytrust", '{"setratings":{},"mode":0}');
    await identity.getIdentityTrust({ identityIds: ["iAddr"] });
    expect(mock.calls[0]!.params).toEqual([{ identities: ["iAddr"] }]);
  });
});
