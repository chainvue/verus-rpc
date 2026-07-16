import { amountParam } from "../amount.js";
import { toSafeNumbers } from "../lossless.js";
import {
  expectArray,
  expectObject,
  mapAmount,
  mapAmountOptional,
  mapInt,
  mapIntOptional,
  mapString,
  mapStringOptional,
  withPassthrough,
  type FieldContext,
} from "../mapping.js";
import type { RpcTransport } from "../transport.js";
import { requestT2 } from "./t2.js";

/**
 * Currency/DeFi family. All 8-decimal wire values — supplies, reserves,
 * fees, conversion prices AND fractional weights — surface as bigint scaled
 * by 1e8 (sats convention), exactly as emitted by the daemon.
 */

export interface ReserveCurrencyState {
  currencyid: string;
  /** Reserve weight — 1e8-scaled fraction (0.25 → 25000000n). */
  weight: bigint;
  /** Reserves held — 1e8-scaled. */
  reserves: bigint;
  /** Price in this reserve — 1e8-scaled. */
  priceinreserve: bigint;
  [key: string]: unknown;
}

/** Per-reserve conversion data inside a currency state's `currencies` map. */
export interface CurrencyConversionData {
  reservein: bigint;
  reserveout: bigint;
  lastconversionprice: bigint;
  viaconversionprice: bigint;
  fees: bigint;
  conversionfees: bigint;
  primarycurrencyin: bigint;
  /** 1e8-scaled fraction. */
  priorweights: bigint;
  [key: string]: unknown;
}

export interface CurrencyState {
  version?: number | undefined;
  flags: number;
  currencyid: string;
  initialsupply: bigint;
  emitted: bigint;
  supply: bigint;
  reservecurrencies?: ReserveCurrencyState[] | undefined;
  currencies?: Record<string, CurrencyConversionData> | undefined;
  primarycurrencyfees?: bigint | undefined;
  primarycurrencyconversionfees?: bigint | undefined;
  primarycurrencyout?: bigint | undefined;
  preconvertedout?: bigint | undefined;
  [key: string]: unknown;
}

/** Currency definition as returned by `getcurrency` (flat) and inside `listcurrencies`. */
export interface CurrencyDefinition {
  version: number;
  name: string;
  fullyqualifiedname?: string | undefined;
  currencyid: string;
  parent?: string | undefined;
  systemid: string;
  options?: number | undefined;
  proofprotocol?: number | undefined;
  notarizationprotocol?: number | undefined;
  launchsystemid?: string | undefined;
  startblock?: number | undefined;
  endblock?: number | undefined;
  /** Reserve currency ids (fractional currencies). */
  currencies?: string[] | undefined;
  /** Reserve weights — 1e8-scaled fractions. */
  weights?: bigint[] | undefined;
  initialsupply?: bigint | undefined;
  idregistrationfees?: bigint | undefined;
  idimportfees?: bigint | undefined;
  idreferrallevels?: number | undefined;
  currencyregistrationfee?: bigint | undefined;
  currencyimportfee?: bigint | undefined;
  transactionexportfee?: bigint | undefined;
  transactionimportfee?: bigint | undefined;
  pbaassystemregistrationfee?: bigint | undefined;
  gatewayconverterissuance?: bigint | undefined;
  definitiontxid?: string | undefined;
  bestheight?: number | undefined;
  bestcurrencystate?: CurrencyState | undefined;
  lastconfirmedcurrencystate?: CurrencyState | undefined;
  [key: string]: unknown;
}

export interface CurrencyStateSnapshot {
  height: number;
  blocktime?: number | undefined;
  currencystate: CurrencyState;
  [key: string]: unknown;
}

export interface ListCurrenciesEntry {
  currencydefinition: CurrencyDefinition;
  bestheight?: number | undefined;
  besttxid?: string | undefined;
  bestcurrencystate?: CurrencyState | undefined;
  lastconfirmedheight?: number | undefined;
  lastconfirmedcurrencystate?: CurrencyState | undefined;
  [key: string]: unknown;
}

/**
 * One converter entry from `getcurrencyconverters`. The converter's full
 * definition sits under its own currency-id key (daemon shape) — mapped as
 * a `CurrencyDefinition` when recognizable.
 */
export interface CurrencyConverterEntry {
  fullyqualifiedname: string;
  height?: number | undefined;
  [key: string]: unknown;
}

export interface EstimateConversionOptions {
  /** Source currency name/id. */
  currency: string;
  convertTo: string;
  /** Amount to convert — 1e8-scaled bigint. */
  amount: bigint;
  /** Route the conversion via this fractional currency. */
  via?: string;
  preConvert?: boolean;
}

export interface ConversionEstimate {
  /** 1e8-scaled bigint. */
  estimatedcurrencyout: bigint;
  netinputamount?: bigint | undefined;
  inputcurrencyid?: string | undefined;
  outputcurrencyid?: string | undefined;
  estimatedcurrencystate?: CurrencyState | undefined;
  [key: string]: unknown;
}

export interface GetCurrencyOptions {
  currency: string;
  /** Definition as of this height. */
  height?: number;
}

export interface GetCurrencyStateOptions {
  currency: string;
  /** Height, or "m,n"/"m,n,o" range notation per daemon help. */
  height?: number | string;
  /** Currency to express conversion data in. */
  conversionDataCurrency?: string;
}

export interface ListCurrenciesQuery {
  launchState?: "prelaunch" | "launched" | "refund" | "complete";
  systemType?: "local" | "imported" | "gateway" | "pbaas";
  fromSystem?: string;
  /** Only converters holding these currencies as reserves. */
  converter?: string[];
}

export interface ListCurrenciesOptions {
  query?: ListCurrenciesQuery;
  startBlock?: number;
  endBlock?: number;
}

export function mapCurrencyState(raw: unknown, method: string, field = "currencystate"): CurrencyState {
  const obj = expectObject(raw, method);
  const ctx = (name: string): FieldContext => ({ method, field: `${field}.${name}` });
  let currencies: Record<string, CurrencyConversionData> | undefined;
  const rawCurrencies = obj["currencies"];
  if (rawCurrencies !== undefined && rawCurrencies !== null) {
    currencies = {};
    for (const [id, data] of Object.entries(expectObject(rawCurrencies, method))) {
      const dataObj = expectObject(data, method);
      const dctx = (name: string): FieldContext => ({ method, field: `${field}.currencies.${id}.${name}` });
      currencies[id] = withPassthrough<CurrencyConversionData>(dataObj, {
        reservein: mapAmount(dataObj["reservein"], dctx("reservein")),
        reserveout: mapAmount(dataObj["reserveout"], dctx("reserveout")),
        lastconversionprice: mapAmount(dataObj["lastconversionprice"], dctx("lastconversionprice")),
        viaconversionprice: mapAmount(dataObj["viaconversionprice"], dctx("viaconversionprice")),
        fees: mapAmount(dataObj["fees"], dctx("fees")),
        conversionfees: mapAmount(dataObj["conversionfees"], dctx("conversionfees")),
        primarycurrencyin: mapAmount(dataObj["primarycurrencyin"], dctx("primarycurrencyin")),
        priorweights: mapAmount(dataObj["priorweights"], dctx("priorweights")),
      });
    }
  }
  const rawReserves = obj["reservecurrencies"];
  const reservecurrencies =
    rawReserves === undefined || rawReserves === null
      ? undefined
      : expectArray(rawReserves, method, `${field}.reservecurrencies`).map((item, i) => {
          const entry = expectObject(item, method);
          const rctx = (name: string): FieldContext => ({
            method,
            field: `${field}.reservecurrencies[${i}].${name}`,
          });
          return withPassthrough<ReserveCurrencyState>(entry, {
            currencyid: mapString(entry["currencyid"], rctx("currencyid")),
            weight: mapAmount(entry["weight"], rctx("weight")),
            reserves: mapAmount(entry["reserves"], rctx("reserves")),
            priceinreserve: mapAmount(entry["priceinreserve"], rctx("priceinreserve")),
          });
        });
  return withPassthrough<CurrencyState>(obj, {
    version: mapIntOptional(obj["version"], ctx("version")),
    flags: mapInt(obj["flags"], ctx("flags")),
    currencyid: mapString(obj["currencyid"], ctx("currencyid")),
    initialsupply: mapAmount(obj["initialsupply"], ctx("initialsupply")),
    emitted: mapAmount(obj["emitted"], ctx("emitted")),
    supply: mapAmount(obj["supply"], ctx("supply")),
    reservecurrencies,
    currencies,
    primarycurrencyfees: mapAmountOptional(obj["primarycurrencyfees"], ctx("primarycurrencyfees")),
    primarycurrencyconversionfees: mapAmountOptional(
      obj["primarycurrencyconversionfees"],
      ctx("primarycurrencyconversionfees"),
    ),
    primarycurrencyout: mapAmountOptional(obj["primarycurrencyout"], ctx("primarycurrencyout"), { signed: true }),
    preconvertedout: mapAmountOptional(obj["preconvertedout"], ctx("preconvertedout")),
  });
}

export function mapCurrencyDefinition(raw: unknown, method: string, field = "(result)"): CurrencyDefinition {
  const obj = expectObject(raw, method);
  const ctx = (name: string): FieldContext => ({ method, field: `${field}.${name}` });
  const rawWeights = obj["weights"];
  const weights =
    rawWeights === undefined || rawWeights === null
      ? undefined
      : expectArray(rawWeights, method, `${field}.weights`).map((w, i) =>
          mapAmount(w, { method, field: `${field}.weights[${i}]` }),
        );
  const rawCurrencies = obj["currencies"];
  const currencies =
    rawCurrencies === undefined || rawCurrencies === null
      ? undefined
      : expectArray(rawCurrencies, method, `${field}.currencies`).map((c, i) =>
          mapString(c, { method, field: `${field}.currencies[${i}]` }),
        );
  return withPassthrough<CurrencyDefinition>(obj, {
    version: mapInt(obj["version"], ctx("version")),
    name: mapString(obj["name"], ctx("name")),
    fullyqualifiedname: mapStringOptional(obj["fullyqualifiedname"], ctx("fullyqualifiedname")),
    currencyid: mapString(obj["currencyid"], ctx("currencyid")),
    parent: mapStringOptional(obj["parent"], ctx("parent")),
    systemid: mapString(obj["systemid"], ctx("systemid")),
    options: mapIntOptional(obj["options"], ctx("options")),
    proofprotocol: mapIntOptional(obj["proofprotocol"], ctx("proofprotocol")),
    notarizationprotocol: mapIntOptional(obj["notarizationprotocol"], ctx("notarizationprotocol")),
    launchsystemid: mapStringOptional(obj["launchsystemid"], ctx("launchsystemid")),
    startblock: mapIntOptional(obj["startblock"], ctx("startblock")),
    endblock: mapIntOptional(obj["endblock"], ctx("endblock")),
    currencies,
    weights,
    initialsupply: mapAmountOptional(obj["initialsupply"], ctx("initialsupply")),
    idregistrationfees: mapAmountOptional(obj["idregistrationfees"], ctx("idregistrationfees")),
    idimportfees: mapAmountOptional(obj["idimportfees"], ctx("idimportfees")),
    idreferrallevels: mapIntOptional(obj["idreferrallevels"], ctx("idreferrallevels")),
    currencyregistrationfee: mapAmountOptional(obj["currencyregistrationfee"], ctx("currencyregistrationfee")),
    currencyimportfee: mapAmountOptional(obj["currencyimportfee"], ctx("currencyimportfee")),
    transactionexportfee: mapAmountOptional(obj["transactionexportfee"], ctx("transactionexportfee")),
    transactionimportfee: mapAmountOptional(obj["transactionimportfee"], ctx("transactionimportfee")),
    pbaassystemregistrationfee: mapAmountOptional(
      obj["pbaassystemregistrationfee"],
      ctx("pbaassystemregistrationfee"),
    ),
    gatewayconverterissuance: mapAmountOptional(obj["gatewayconverterissuance"], ctx("gatewayconverterissuance")),
    definitiontxid: mapStringOptional(obj["definitiontxid"], ctx("definitiontxid")),
    bestheight: mapIntOptional(obj["bestheight"], ctx("bestheight")),
    bestcurrencystate:
      obj["bestcurrencystate"] === undefined || obj["bestcurrencystate"] === null
        ? undefined
        : mapCurrencyState(obj["bestcurrencystate"], method, `${field}.bestcurrencystate`),
    lastconfirmedcurrencystate:
      obj["lastconfirmedcurrencystate"] === undefined || obj["lastconfirmedcurrencystate"] === null
        ? undefined
        : mapCurrencyState(obj["lastconfirmedcurrencystate"], method, `${field}.lastconfirmedcurrencystate`),
  });
}

export function mapConversionEstimate(raw: unknown): ConversionEstimate {
  const method = "estimateconversion";
  const obj = expectObject(raw, method);
  const ctx = (field: string): FieldContext => ({ method, field });
  return withPassthrough<ConversionEstimate>(obj, {
    estimatedcurrencyout: mapAmount(obj["estimatedcurrencyout"], ctx("estimatedcurrencyout")),
    netinputamount: mapAmountOptional(obj["netinputamount"], ctx("netinputamount")),
    inputcurrencyid: mapStringOptional(obj["inputcurrencyid"], ctx("inputcurrencyid")),
    outputcurrencyid: mapStringOptional(obj["outputcurrencyid"], ctx("outputcurrencyid")),
    estimatedcurrencystate:
      obj["estimatedcurrencystate"] === undefined || obj["estimatedcurrencystate"] === null
        ? undefined
        : mapCurrencyState(obj["estimatedcurrencystate"], method, "estimatedcurrencystate"),
  });
}

function looksLikeCurrencyDefinition(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "currencyid" in value &&
    "name" in value &&
    "version" in value
  );
}

export function mapCurrencyConverterEntry(raw: unknown, index: number): CurrencyConverterEntry {
  const method = "getcurrencyconverters";
  const obj = expectObject(raw, method);
  const out: Record<string, unknown> = {
    fullyqualifiedname: mapString(obj["fullyqualifiedname"], { method, field: `[${index}].fullyqualifiedname` }),
    height: mapIntOptional(obj["height"], { method, field: `[${index}].height` }),
  };
  if (out["height"] === undefined) delete out["height"];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "fullyqualifiedname" || key === "height") continue;
    // The converter's definition sits under its own currency-id key.
    out[key] = looksLikeCurrencyDefinition(value)
      ? mapCurrencyDefinition(value, method, `[${index}].${key}`)
      : toSafeNumbers(value);
  }
  return out as CurrencyConverterEntry;
}

/** Currency/DeFi family — definitions, states, conversions (T1) + marketplace & launch info (T2). */
export class CurrencyApi {
  constructor(private readonly transport: RpcTransport) {}

  // -------------------------------------------------------------------------
  // T1 — reads & conversion estimation

  /** Currency definition incl. last confirmed state. */
  async getCurrency(options: GetCurrencyOptions): Promise<CurrencyDefinition> {
    const params: unknown[] = [options.currency];
    if (options.height !== undefined) params.push(options.height);
    return mapCurrencyDefinition(await this.transport.request("getcurrency", params), "getcurrency");
  }

  /** Currency state snapshot(s) at a height or range. */
  async getCurrencyState(options: GetCurrencyStateOptions): Promise<CurrencyStateSnapshot[]> {
    const params: unknown[] = [options.currency];
    if (options.height !== undefined || options.conversionDataCurrency !== undefined) {
      // A skipped height slot must be null, not 0: the daemon treats null as
      // "current tip" (same as omitting) while 0 returns the GENESIS state —
      // verified live against VRSCTEST. Start-height slots elsewhere in this
      // file gap-fill with 0 because there 0 IS the daemon default.
      params.push(options.height ?? null);
    }
    if (options.conversionDataCurrency !== undefined) params.push(options.conversionDataCurrency);
    const method = "getcurrencystate";
    const result = expectArray(await this.transport.request(method, params), method);
    return result.map((item, i) => {
      const entry = expectObject(item, method);
      return withPassthrough<CurrencyStateSnapshot>(entry, {
        height: mapInt(entry["height"], { method, field: `[${i}].height` }),
        blocktime: mapIntOptional(entry["blocktime"], { method, field: `[${i}].blocktime` }),
        currencystate: mapCurrencyState(entry["currencystate"], method, `[${i}].currencystate`),
      });
    });
  }

  /** Currencies visible on this chain, filterable by launch state/system/converter reserves. */
  async listCurrencies(options?: ListCurrenciesOptions): Promise<ListCurrenciesEntry[]> {
    const params: unknown[] = [];
    const query = options?.query;
    if (query !== undefined || options?.startBlock !== undefined || options?.endBlock !== undefined) {
      const raw: Record<string, unknown> = {};
      if (query?.launchState !== undefined) raw["launchstate"] = query.launchState;
      if (query?.systemType !== undefined) raw["systemtype"] = query.systemType;
      if (query?.fromSystem !== undefined) raw["fromsystem"] = query.fromSystem;
      if (query?.converter !== undefined) raw["converter"] = query.converter;
      params.push(raw);
    }
    if (options?.startBlock !== undefined || options?.endBlock !== undefined) {
      params.push(options.startBlock ?? 0);
    }
    if (options?.endBlock !== undefined) params.push(options.endBlock);
    const method = "listcurrencies";
    const result = expectArray(await this.transport.request(method, params), method);
    return result.map((item, i) => {
      const entry = expectObject(item, method);
      return withPassthrough<ListCurrenciesEntry>(entry, {
        currencydefinition: mapCurrencyDefinition(entry["currencydefinition"], method, `[${i}].currencydefinition`),
        bestheight: mapIntOptional(entry["bestheight"], { method, field: `[${i}].bestheight` }),
        besttxid: mapStringOptional(entry["besttxid"], { method, field: `[${i}].besttxid` }),
        bestcurrencystate:
          entry["bestcurrencystate"] === undefined || entry["bestcurrencystate"] === null
            ? undefined
            : mapCurrencyState(entry["bestcurrencystate"], method, `[${i}].bestcurrencystate`),
        lastconfirmedheight: mapIntOptional(entry["lastconfirmedheight"], {
          method,
          field: `[${i}].lastconfirmedheight`,
        }),
        lastconfirmedcurrencystate:
          entry["lastconfirmedcurrencystate"] === undefined || entry["lastconfirmedcurrencystate"] === null
            ? undefined
            : mapCurrencyState(entry["lastconfirmedcurrencystate"], method, `[${i}].lastconfirmedcurrencystate`),
      });
    });
  }

  /** Fractional converters holding all given currencies as reserves. */
  async getCurrencyConverters(options: { currencies: string[] }): Promise<CurrencyConverterEntry[]> {
    // The daemon takes each currency name as its own positional param.
    const result = expectArray(
      await this.transport.request("getcurrencyconverters", options.currencies),
      "getcurrencyconverters",
    );
    return result.map((item, i) => mapCurrencyConverterEntry(item, i));
  }

  /** Estimate a conversion's output — amounts as 1e8-scaled bigint. */
  async estimateConversion(options: EstimateConversionOptions): Promise<ConversionEstimate> {
    const raw: Record<string, unknown> = {
      currency: options.currency,
      convertto: options.convertTo,
      amount: amountParam(options.amount),
    };
    if (options.via !== undefined) raw["via"] = options.via;
    if (options.preConvert !== undefined) raw["preconvert"] = options.preConvert;
    return mapConversionEstimate(await this.transport.request("estimateconversion", [raw]));
  }

  // -------------------------------------------------------------------------
  // T2 — marketplace & launch info (value fields as exact decimal strings)

  /** Post an offer (identity/currency swap). Daemon JSON passthrough. T2. */
  async makeOffer(options: {
    fromAddress: string;
    offer: Record<string, unknown>;
    returnTx?: boolean;
    /** Bigint sats. */
    feeAmount?: bigint;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.fromAddress, options.offer];
    if (options.returnTx !== undefined || options.feeAmount !== undefined) params.push(options.returnTx ?? false);
    if (options.feeAmount !== undefined) params.push(amountParam(options.feeAmount));
    return requestT2(this.transport, "makeoffer", params);
  }

  /** Accept an on-chain offer. Daemon JSON passthrough. T2. */
  async takeOffer(options: {
    fromAddress: string;
    offer: Record<string, unknown>;
    returnTx?: boolean;
    feeAmount?: bigint;
  }): Promise<unknown> {
    const params: unknown[] = [options.fromAddress, options.offer];
    if (options.returnTx !== undefined || options.feeAmount !== undefined) params.push(options.returnTx ?? false);
    if (options.feeAmount !== undefined) params.push(amountParam(options.feeAmount));
    return requestT2(this.transport, "takeoffer", params);
  }

  /** Open offers for/against a currency or identity. T2. */
  async getOffers(options: {
    currencyOrId: string;
    isCurrency?: boolean;
    withTx?: boolean;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.currencyOrId];
    if (options.isCurrency !== undefined || options.withTx !== undefined) params.push(options.isCurrency ?? false);
    if (options.withTx !== undefined) params.push(options.withTx);
    return requestT2(this.transport, "getoffers", params);
  }

  /** This wallet's open offers. T2. */
  async listOpenOffers(options?: { unexpired?: boolean; expired?: boolean }): Promise<unknown> {
    const params: unknown[] = [];
    if (options?.unexpired !== undefined || options?.expired !== undefined) params.push(options.unexpired ?? true);
    if (options?.expired !== undefined) params.push(options.expired);
    return requestT2(this.transport, "listopenoffers", params);
  }

  /** Close/cancel own offers. T2. */
  async closeOffers(options?: { offerTxids?: string[]; destinationAddress?: string }): Promise<unknown> {
    const params: unknown[] = [];
    if (options?.offerTxids !== undefined || options?.destinationAddress !== undefined) {
      params.push(options.offerTxids ?? []);
    }
    if (options?.destinationAddress !== undefined) params.push(options.destinationAddress);
    return requestT2(this.transport, "closeoffers", params);
  }

  /** Reserves held for a fractional/gateway currency. T2 — decimal strings. */
  async getReserveDeposits(options: { currency: string; returnUtxos?: boolean }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.currency];
    if (options.returnUtxos !== undefined) params.push(options.returnUtxos);
    return requestT2(this.transport, "getreservedeposits", params);
  }

  /** Launch definition + participation state of a currency. T2. */
  async getLaunchInfo(options: { currency: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getlaunchinfo", [options.currency]);
  }

  /** Currency state as of launch. T2. */
  async getInitialCurrencyState(options: { currency: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getinitialcurrencystate", [options.currency]);
  }

  // -------------------------------------------------------------------------
  // Cross-chain exports / imports / pending transfers (PBaaS). T2.

  /** Cross-chain exports to `chainName` in an optional height range. T2. */
  async getExports(options: {
    chainName: string;
    heightStart?: number;
    heightEnd?: number;
  }): Promise<unknown[]> {
    const params: unknown[] = [options.chainName];
    if (options.heightStart !== undefined || options.heightEnd !== undefined) {
      params.push(options.heightStart ?? 0);
    }
    if (options.heightEnd !== undefined) params.push(options.heightEnd);
    return requestT2(this.transport, "getexports", params);
  }

  /** Cross-chain imports from `chainName` in an optional height range. T2. */
  async getImports(options: {
    chainName: string;
    startHeight?: number;
    endHeight?: number;
  }): Promise<unknown[]> {
    const params: unknown[] = [options.chainName];
    if (options.startHeight !== undefined || options.endHeight !== undefined) {
      params.push(options.startHeight ?? 0);
    }
    if (options.endHeight !== undefined) params.push(options.endHeight);
    return requestT2(this.transport, "getimports", params);
  }

  /** Pending reserve transfers queued for `chainName`. T2. */
  async getPendingTransfers(options: { chainName: string }): Promise<unknown[]> {
    return requestT2(this.transport, "getpendingtransfers", [options.chainName]);
  }

  /**
   * Trust ratings this wallet keeps for currencies. T2. The daemon requires
   * the currency-array param — `[]` is sent when no filter is given (source
   * v1.2.17: `params.size() != 1` throws, mirroring `getidentitytrust`).
   * Daemon quirks, source- and live-verified on v1.2.x: the filter is never
   * read (all ratings would be returned regardless), and the reply is
   * always `null` — the handler builds its `{setratings,
   * currencytrustmode}` result on an uninitialized (non-object) UniValue,
   * so every pushKV is silently dropped. The declared shape is kept for
   * daemons that fix this.
   */
  async getCurrencyTrust(options?: { currencyIds?: string[] }): Promise<Record<string, unknown> | null> {
    return requestT2(this.transport, "getcurrencytrust", [options?.currencyIds ?? []]);
  }

  /**
   * Set/clear currency trust ratings (daemon JSON options, passthrough —
   * `clearall`, `setratings`, `removeratings`, `currencytrustmode`).
   * Daemon quirks (source v1.2.17): `setratings` is honored only as an
   * id→rating OBJECT map — the objarray shape shown in the daemon's own
   * help is silently skipped — and `currencytrustmode` is read but never
   * applied. The call returns success either way; do not assume the mode
   * changed.
   */
  async setCurrencyTrust(options: Record<string, unknown>): Promise<void> {
    await this.transport.request("setcurrencytrust", [options]);
  }
}
