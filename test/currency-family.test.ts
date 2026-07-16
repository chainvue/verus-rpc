/** Etappe 4 — currency/DeFi family + marketplace T2. */
import { describe, expect, it } from "vitest";
import { isLosslessNumber } from "../src/lossless.js";
import { CurrencyApi } from "../src/methods/currency.js";
import { MockTransport } from "../src/mock.js";

function setup(): { mock: MockTransport; currency: CurrencyApi } {
  const mock = new MockTransport();
  return { mock, currency: new CurrencyApi(mock) };
}

const STATE =
  '{"flags":16,"version":1,"currencyid":"iBridge","initialsupply":100.0,"emitted":0.0,"supply":125.50000000,' +
  '"reservecurrencies":[{"currencyid":"iVRSC","weight":0.25000000,"reserves":1000.12345678,"priceinreserve":18.05966718}],' +
  '"currencies":{"iVRSC":{"reservein":0.99975,"reserveout":24.93590074,"lastconversionprice":18.05966718,' +
  '"viaconversionprice":0.0,"fees":0.0013003,"conversionfees":0.0005,"primarycurrencyin":0.0,"priorweights":0.25}},' +
  '"primarycurrencyfees":0.0,"primarycurrencyconversionfees":0.0,"primarycurrencyout":0.0,"preconvertedout":0.0}';

describe("getCurrencyState", () => {
  it("maps supplies, reserves, weights and prices to 1e8-scaled bigint", async () => {
    const { mock, currency } = setup();
    mock.respondJson("getcurrencystate", `[{"height":100,"blocktime":5,"currencystate":${STATE}}]`);
    const [snapshot] = await currency.getCurrencyState({ currency: "iBridge" });
    const state = snapshot!.currencystate;
    expect(state.supply).toBe(12_550_000_000n);
    expect(state.initialsupply).toBe(10_000_000_000n);
    expect(state.reservecurrencies![0]!.weight).toBe(25_000_000n);
    expect(state.reservecurrencies![0]!.reserves).toBe(100_012_345_678n);
    expect(state.reservecurrencies![0]!.priceinreserve).toBe(1_805_966_718n);
    expect(state.currencies!["iVRSC"]!.lastconversionprice).toBe(1_805_966_718n);
    expect(state.currencies!["iVRSC"]!.fees).toBe(130_030n);
  });

  it("gap-fills a skipped height with null (0 would mean genesis, not tip)", async () => {
    const { mock, currency } = setup();
    mock.respondJson("getcurrencystate", `[{"height":100,"currencystate":${STATE}}]`);
    await currency.getCurrencyState({ currency: "iBridge", conversionDataCurrency: "VRSCTEST" });
    expect(mock.calls[0]!.params).toEqual(["iBridge", null, "VRSCTEST"]);
  });
});

describe("getCurrency / listCurrencies", () => {
  it("maps definition fee fields and weights", async () => {
    const { mock, currency } = setup();
    mock.respondJson(
      "getcurrency",
      '{"version":1,"name":"Bridge","currencyid":"iBridge","systemid":"iSys","options":33,' +
        '"currencies":["iVRSC","iDAI"],"weights":[0.50000000,0.50000000],"initialsupply":100.0,' +
        '"idregistrationfees":100.0,"currencyregistrationfee":200.0}',
    );
    const def = await currency.getCurrency({ currency: "Bridge" });
    expect(def.weights).toEqual([50_000_000n, 50_000_000n]);
    expect(def.idregistrationfees).toBe(10_000_000_000n);
    expect(def.currencies).toEqual(["iVRSC", "iDAI"]);
  });

  it("listCurrencies converts the query to daemon field names", async () => {
    const { mock, currency } = setup();
    mock.respondJson("listcurrencies", "[]");
    await currency.listCurrencies({ query: { launchState: "complete", systemType: "pbaas" } });
    expect(mock.calls[0]!.params).toEqual([{ launchstate: "complete", systemtype: "pbaas" }]);
  });
});

describe("getCurrencyConverters", () => {
  it("maps the dynamic currency-id key as a full definition", async () => {
    const { mock, currency } = setup();
    mock.respondJson(
      "getcurrencyconverters",
      '[{"fullyqualifiedname":"Bridge.vETH","height":100,' +
        '"iBridge":{"version":1,"name":"Bridge","currencyid":"iBridge","systemid":"iSys","initialsupply":100.0},' +
        '"lastnotarization":{"proofroots":[]}}]',
    );
    const [entry] = await currency.getCurrencyConverters({ currencies: ["VRSC", "DAI.vETH"] });
    expect(entry!.fullyqualifiedname).toBe("Bridge.vETH");
    const def = entry!["iBridge"] as { initialsupply: bigint };
    expect(def.initialsupply).toBe(10_000_000_000n); // mapped as T1 definition, not passthrough
    expect(mock.calls[0]!.params).toEqual(["VRSC", "DAI.vETH"]);
  });
});

describe("estimateConversion", () => {
  it("serializes the amount exactly and maps the estimate", async () => {
    const { mock, currency } = setup();
    mock.respondJson(
      "estimateconversion",
      '{"estimatedcurrencyout":0.62184921,"netinputamount":0.99975,"inputcurrencyid":"iVRSC","outputcurrencyid":"iDAI"}',
    );
    const estimate = await currency.estimateConversion({
      currency: "VRSC",
      convertTo: "DAI.vETH",
      via: "Bridge.vETH",
      amount: 100_000_000n,
    });
    expect(estimate.estimatedcurrencyout).toBe(62_184_921n);
    expect(estimate.netinputamount).toBe(99_975_000n);

    const [query] = mock.calls[0]!.params as [Record<string, unknown>];
    expect(query["convertto"]).toBe("DAI.vETH");
    expect(query["via"]).toBe("Bridge.vETH");
    expect(isLosslessNumber(query["amount"])).toBe(true);
    expect(String(query["amount"])).toBe("1.00000000");
  });
});

describe("marketplace T2", () => {
  it("makeOffer forwards the offer JSON and fee", async () => {
    const { mock, currency } = setup();
    mock.respondJson("makeoffer", '{"txid":"offer-tx"}');
    const offer = { changeaddress: "RAddr", offer: { currency: "VRSC", amount: 1 }, for: { name: "x" } };
    await currency.makeOffer({ fromAddress: "me@", offer, feeAmount: 10_000n });
    const params = mock.calls[0]!.params;
    expect(params[0]).toBe("me@");
    expect(params[1]).toEqual(offer);
    expect(params[2]).toBe(false);
    expect(String(params[3])).toBe("0.00010000");
  });

  it("getReserveDeposits keeps amounts as exact strings", async () => {
    const { mock, currency } = setup();
    mock.respondJson("getreservedeposits", '{"iVRSC":1234.56789012}');
    await expect(currency.getReserveDeposits({ currency: "Bridge" })).resolves.toEqual({
      iVRSC: "1234.56789012",
    });
  });

  it("getOffers builds positional params", async () => {
    const { mock, currency } = setup();
    mock.respondJson("getoffers", "{}");
    await currency.getOffers({ currencyOrId: "VRSC", isCurrency: true });
    expect(mock.calls[0]!.params).toEqual(["VRSC", true]);
  });
});
