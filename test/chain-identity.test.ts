import { describe, expect, it } from "vitest";
import { ResponseMappingError } from "../src/errors.js";
import { ChainApi } from "../src/methods/chain.js";
import { IdentityApi } from "../src/methods/identity.js";
import { MockTransport } from "../src/mock.js";

const GETINFO_BODY =
  '{"version":2000753,"protocolversion":170010,"VRSCversion":"1.2.17","blocks":10,"longestchain":10,' +
  '"connections":8,"difficulty":2645830048654.279,"testnet":false,"paytxfee":0.0001,"relayfee":1e-6,' +
  '"errors":"","magic":-497513811,"CCid":1}';

describe("ChainApi", () => {
  it("getInfo maps fee value fields to bigint sats", async () => {
    const mock = new MockTransport().respondJson("getinfo", GETINFO_BODY);
    const info = await new ChainApi(mock).getInfo();
    expect(info.paytxfee).toBe(10_000n);
    expect(info.relayfee).toBe(100n); // 1e-6 VRSC — scientific notation on the wire
    expect(info.VRSCversion).toBe("1.2.17");
    expect(info.difficulty).toBeCloseTo(2645830048654.279);
    expect(info["magic"]).toBe(-497_513_811); // unknown safe int passes through as number
  });

  it("getInfo fails loudly when a required field is missing", async () => {
    const mock = new MockTransport().respondJson("getinfo", '{"version":1}');
    await expect(new ChainApi(mock).getInfo()).rejects.toThrow(ResponseMappingError);
  });

  it("getBlockCount returns a safe integer", async () => {
    const mock = new MockTransport().respondJson("getblockcount", "4147436");
    await expect(new ChainApi(mock).getBlockCount()).resolves.toBe(4_147_436);
  });

  it("getBlockCount rejects a non-integer result", async () => {
    const mock = new MockTransport().respondJson("getblockcount", "1.5");
    await expect(new ChainApi(mock).getBlockCount()).rejects.toThrow(ResponseMappingError);
  });
});

const IDENTITY_BODY =
  '{"friendlyname":"x.VRSC@","fullyqualifiedname":"x.VRSC@","status":"active","canspendfor":false,"cansignfor":false,' +
  '"blockheight":100,"txid":"ab","vout":0,"identity":{"version":3,"flags":0,' +
  '"primaryaddresses":["RAddr1"],"minimumsignatures":1,"name":"x","identityaddress":"iAddr",' +
  '"parent":"iParent","systemid":"iSystem","contentmap":{},"contentmultimap":{},' +
  '"revocationauthority":"iAddr","recoveryauthority":"iAddr","timelock":0}}';

describe("IdentityApi", () => {
  it("getIdentity maps the identity definition", async () => {
    const mock = new MockTransport().respondJson("getidentity", IDENTITY_BODY);
    const result = await new IdentityApi(mock).getIdentity({ nameOrAddress: "x@" });
    expect(result.identity.name).toBe("x");
    expect(result.identity.primaryaddresses).toEqual(["RAddr1"]);
    expect(result.identity.minimumsignatures).toBe(1);
    expect(result.status).toBe("active");
    expect(mock.calls[0]!.params).toEqual(["x@"]);
  });

  it("builds positional params for height/txproof", async () => {
    const mock = new MockTransport().respondJson("getidentity", IDENTITY_BODY);
    await new IdentityApi(mock).getIdentity({ nameOrAddress: "x@", txProof: true });
    expect(mock.calls[0]!.params).toEqual(["x@", 0, true]);
  });
});
