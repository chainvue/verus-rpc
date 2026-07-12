import { parseAmount } from "../amount.js";
import { isLosslessNumber } from "../lossless.js";
import {
  expectArray,
  expectObject,
  mapInt,
  mapIntOptional,
  mapSats,
  mapString,
  mapStringArray,
  withPassthrough,
  type FieldContext,
} from "../mapping.js";
import { ResponseMappingError } from "../errors.js";
import type { RpcTransport } from "../transport.js";

/**
 * Addressindex family (requires `-addressindex=1` on the daemon; the public
 * gateway exposes it too). Wire quirk, empirically recorded: `balance` /
 * `received` / `satoshis` are raw satoshi INTEGERS while `currencybalance` /
 * `currencyreceived` are 8-decimal values — both map to bigint sats here.
 */

export interface AddressBalanceResult {
  /** Native-currency balance — bigint sats (wire: satoshi integer). */
  balance: bigint;
  /** Total received — bigint sats (wire: satoshi integer). */
  received: bigint;
  /** Per-currency balances — bigint sats (wire: 8-decimal values). */
  currencybalance?: Record<string, bigint> | undefined;
  currencyreceived?: Record<string, bigint> | undefined;
  [key: string]: unknown;
}

export interface AddressUtxo {
  address: string;
  txid: string;
  outputIndex: number;
  script: string;
  /** Bigint sats (wire: satoshi integer). */
  satoshis: bigint;
  height?: number | undefined;
  [key: string]: unknown;
}

export interface AddressDelta {
  address: string;
  txid: string;
  /** Signed — bigint sats (wire: satoshi integer). */
  satoshis: bigint;
  index: number;
  blockindex?: number | undefined;
  height?: number | undefined;
  [key: string]: unknown;
}

export interface AddressRangeOptions {
  addresses: string[];
  /** Start block height. */
  start?: number;
  /** End block height. */
  end?: number;
}

function mapCurrencyAmounts(
  raw: unknown,
  method: string,
  field: string,
): Record<string, bigint> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const obj = expectObject(raw, method);
  const out: Record<string, bigint> = {};
  for (const [currency, value] of Object.entries(obj)) {
    const ctx: FieldContext = { method, field: `${field}.${currency}` };
    if (!isLosslessNumber(value)) {
      throw new ResponseMappingError(method, ctx.field, "expected a JSON number");
    }
    out[currency] = parseAmount(value.toString(), { allowNegative: true });
  }
  return out;
}

export function mapAddressBalance(raw: unknown): AddressBalanceResult {
  const method = "getaddressbalance";
  const obj = expectObject(raw, method);
  return withPassthrough<AddressBalanceResult>(obj, {
    balance: mapSats(obj["balance"], { method, field: "balance" }, { signed: true }),
    received: mapSats(obj["received"], { method, field: "received" }),
    currencybalance: mapCurrencyAmounts(obj["currencybalance"], method, "currencybalance"),
    currencyreceived: mapCurrencyAmounts(obj["currencyreceived"], method, "currencyreceived"),
  });
}

export function mapAddressUtxo(raw: unknown, index: number): AddressUtxo {
  const method = "getaddressutxos";
  const obj = expectObject(raw, method);
  const ctx = (field: string): FieldContext => ({ method, field: `[${index}].${field}` });
  return withPassthrough<AddressUtxo>(obj, {
    address: mapString(obj["address"], ctx("address")),
    txid: mapString(obj["txid"], ctx("txid")),
    outputIndex: mapInt(obj["outputIndex"], ctx("outputIndex")),
    script: mapString(obj["script"], ctx("script")),
    satoshis: mapSats(obj["satoshis"], ctx("satoshis")),
    height: mapIntOptional(obj["height"], ctx("height")),
  });
}

export function mapAddressDelta(raw: unknown, method: string, index: number): AddressDelta {
  const obj = expectObject(raw, method);
  const ctx = (field: string): FieldContext => ({ method, field: `[${index}].${field}` });
  return withPassthrough<AddressDelta>(obj, {
    address: mapString(obj["address"], ctx("address")),
    txid: mapString(obj["txid"], ctx("txid")),
    satoshis: mapSats(obj["satoshis"], ctx("satoshis"), { signed: true }),
    index: mapInt(obj["index"], ctx("index")),
    blockindex: mapIntOptional(obj["blockindex"], ctx("blockindex")),
    height: mapIntOptional(obj["height"], ctx("height")),
  });
}

/** Address index queries (transparent addresses, cross-wallet). */
export class AddressIndexApi {
  constructor(private readonly transport: RpcTransport) {}

  /** Balance/received of arbitrary transparent addresses — bigint sats. */
  async getAddressBalance(options: { addresses: string[] }): Promise<AddressBalanceResult> {
    return mapAddressBalance(await this.transport.request("getaddressbalance", [{ addresses: options.addresses }]));
  }

  /** Unspent outputs of arbitrary transparent addresses — bigint sats. */
  async getAddressUtxos(options: { addresses: string[] }): Promise<AddressUtxo[]> {
    const result = expectArray(
      await this.transport.request("getaddressutxos", [{ addresses: options.addresses }]),
      "getaddressutxos",
    );
    return result.map((item, i) => mapAddressUtxo(item, i));
  }

  /** Balance changes per address over a height range — signed bigint sats. */
  async getAddressDeltas(options: AddressRangeOptions): Promise<AddressDelta[]> {
    const query: Record<string, unknown> = { addresses: options.addresses };
    if (options.start !== undefined) query["start"] = options.start;
    if (options.end !== undefined) query["end"] = options.end;
    const result = expectArray(await this.transport.request("getaddressdeltas", [query]), "getaddressdeltas");
    return result.map((item, i) => mapAddressDelta(item, "getaddressdeltas", i));
  }

  /** Mempool deltas touching these addresses — signed bigint sats. */
  async getAddressMempool(options: { addresses: string[] }): Promise<AddressDelta[]> {
    const result = expectArray(
      await this.transport.request("getaddressmempool", [{ addresses: options.addresses }]),
      "getaddressmempool",
    );
    return result.map((item, i) => mapAddressDelta(item, "getaddressmempool", i));
  }

  /** Txids touching these addresses (optionally height-bounded). */
  async getAddressTxids(options: AddressRangeOptions): Promise<string[]> {
    const query: Record<string, unknown> = { addresses: options.addresses };
    if (options.start !== undefined) query["start"] = options.start;
    if (options.end !== undefined) query["end"] = options.end;
    return mapStringArray(await this.transport.request("getaddresstxids", [query]), {
      method: "getaddresstxids",
      field: "(result)",
    });
  }
}
