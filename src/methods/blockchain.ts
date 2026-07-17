import { amountParam } from "../amount.js";
import { RpcErrorCode, VerusRpcError } from "../errors.js";
import { isLosslessNumber } from "../lossless.js";
import {
  expectObject,
  mapAmount,
  mapAmountOptional,
  mapBoolean,
  mapInt,
  mapString,
  mapStringOptional,
  withPassthrough,
  type FieldContext,
} from "../mapping.js";
import type { RpcTransport } from "../transport.js";
import { requestT2 } from "./t2.js";

/**
 * Blockchain / Rawtransactions / Network / Util reads and the raw-tx build
 * chain. Mostly T2 (typed, decimal-string value fields); a couple of
 * high-value reads (getblock header, getvdxfid) are curated T1.
 */

export interface GetVdxfIdResult {
  /** The i-address form of the VDXF key. */
  vdxfid?: string | undefined;
  hash160result: string;
  qualifiedname: { name: string; namespace?: string | undefined };
  [key: string]: unknown;
}

export interface CreateRawTransactionInput {
  txid: string;
  vout: number;
  sequence?: number;
}

export interface RawTransactionOptions {
  /**
   * ONE object mapping address → amount (the daemon's positional shape —
   * not an array). `bigint` values are sats and serialize as the daemon's
   * 8-decimal coin notation; everything else passes through opaquely.
   */
  outputs: Record<string, unknown>;
  inputs?: CreateRawTransactionInput[];
  locktime?: number;
  expiryHeight?: number;
}

/**
 * Deep-convert `bigint` sats anywhere in a caller-provided outputs tree to
 * exact 8-decimal coin notation — the daemon reads createrawtransaction
 * amounts in coins, so a bare bigint would be off by 1e8.
 */
function serializeOutputAmounts(tree: unknown): unknown {
  if (typeof tree === "bigint") return amountParam(tree);
  if (Array.isArray(tree)) return tree.map(serializeOutputAmounts);
  if (tree !== null && typeof tree === "object" && !isLosslessNumber(tree)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tree)) out[key] = serializeOutputAmounts(value);
    return out;
  }
  return tree;
}

export function mapGetVdxfId(raw: unknown): GetVdxfIdResult {
  const method = "getvdxfid";
  const obj = expectObject(raw, method);
  const qn = expectObject(obj["qualifiedname"], method);
  return withPassthrough<GetVdxfIdResult>(obj, {
    vdxfid: mapStringOptional(obj["vdxfid"], { method, field: "vdxfid" }),
    hash160result: mapString(obj["hash160result"], { method, field: "hash160result" }),
    qualifiedname: {
      name: mapString(qn["name"], { method, field: "qualifiedname.name" }),
      namespace: mapStringOptional(qn["namespace"], { method, field: "qualifiedname.namespace" }),
    },
  });
}

/** Result of `coinsupply` — all pool sizes as bigint sats. */
export interface CoinSupplyResult {
  /** Native coin symbol (e.g. "VRSC", "VRSCTEST"). */
  coin: string;
  height: number;
  /** Transparent pool — bigint sats. */
  supply: bigint;
  /** Mined but not yet spendable — bigint sats. */
  immature: bigint;
  /** Shielded pool — bigint sats. */
  zfunds: bigint;
  /** supply + zfunds — bigint sats. */
  total: bigint;
  [key: string]: unknown;
}

export function mapCoinSupply(raw: unknown): CoinSupplyResult {
  const method = "coinsupply";
  const obj = expectObject(raw, method);
  // The daemon reports failures in-band on a success envelope
  // ({"error": "invalid height"}) — never as a JSON-RPC error body.
  const inBandError = obj["error"];
  if (inBandError !== undefined && inBandError !== null) {
    throw new VerusRpcError(
      method,
      RpcErrorCode.RPC_NO_CODE,
      typeof inBandError === "string" ? inBandError : JSON.stringify(inBandError),
    );
  }
  const ctx = (field: string): FieldContext => ({ method, field });
  return withPassthrough(obj, {
    coin: mapString(obj["coin"], ctx("coin")),
    height: mapInt(obj["height"], ctx("height")),
    supply: mapAmount(obj["supply"], ctx("supply")),
    immature: mapAmount(obj["immature"], ctx("immature")),
    zfunds: mapAmount(obj["zfunds"], ctx("zfunds")),
    total: mapAmount(obj["total"], ctx("total")),
  });
}

/** Result of `gettxout` — one unspent output. */
export interface GetTxOutResult {
  /** Hash of the block this view is against. */
  bestblock: string;
  /** 0 while the output is only in the mempool. */
  confirmations: number;
  /** Output value — bigint sats. */
  value: bigint;
  /**
   * Komodo-heritage accrued interest — bigint sats. The daemon pushes this
   * field only when it is non-zero, and its own help text does not document
   * it (verified against v1.2.17 source).
   */
  interest?: bigint | undefined;
  coinbase: boolean;
  [key: string]: unknown;
}

export function mapGetTxOut(raw: unknown): GetTxOutResult {
  const method = "gettxout";
  const obj = expectObject(raw, method);
  const ctx = (field: string): FieldContext => ({ method, field });
  return withPassthrough<GetTxOutResult>(obj, {
    bestblock: mapString(obj["bestblock"], ctx("bestblock")),
    confirmations: mapInt(obj["confirmations"], ctx("confirmations")),
    value: mapAmount(obj["value"], ctx("value")),
    interest: mapAmountOptional(obj["interest"], ctx("interest")),
    coinbase: mapBoolean(obj["coinbase"], ctx("coinbase")),
  });
}

/** Result of `getblocksubsidy` — the block reward at a height. */
export interface GetBlockSubsidyResult {
  /** Miner reward — bigint sats. */
  miner: bigint;
  [key: string]: unknown;
}

export function mapGetBlockSubsidy(raw: unknown): GetBlockSubsidyResult {
  const method = "getblocksubsidy";
  const obj = expectObject(raw, method);
  const ctx = (field: string): FieldContext => ({ method, field });
  // The daemon (source v1.2.17, live-checked against 2.0.7) returns only
  // `miner`; any PBaaS reward-split fields a newer daemon adds pass through.
  return withPassthrough<GetBlockSubsidyResult>(obj, {
    miner: mapAmount(obj["miner"], ctx("miner")),
  });
}

/** Result of `getnetworkinfo` — P2P/network state. */
export interface GetNetworkInfoResult {
  /** Server build id. */
  version: number;
  /** Subversion string, e.g. "/MagicBean:2.0.7-3/". */
  subversion: string;
  protocolversion: number;
  /** Offered service flags as a 16-char hex string (not a number). */
  localservices: string;
  timeoffset: number;
  connections: number;
  /**
   * Minimum relay fee (per kB) — bigint sats. The same daemon field as
   * `chain.getInfo().relayfee`; read through either, it is now bigint.
   */
  relayfee: bigint;
  warnings: string;
  /**
   * `networks` and `localaddresses` are nested arrays whose element shape
   * varies by daemon version (2.0.7 adds `proxy_randomize_credentials` to
   * each network) — they pass through untyped under the index signature.
   */
  [key: string]: unknown;
}

export function mapGetNetworkInfo(raw: unknown): GetNetworkInfoResult {
  const method = "getnetworkinfo";
  const obj = expectObject(raw, method);
  const ctx = (field: string): FieldContext => ({ method, field });
  return withPassthrough<GetNetworkInfoResult>(obj, {
    version: mapInt(obj["version"], ctx("version")),
    subversion: mapString(obj["subversion"], ctx("subversion")),
    protocolversion: mapInt(obj["protocolversion"], ctx("protocolversion")),
    localservices: mapString(obj["localservices"], ctx("localservices")),
    timeoffset: mapInt(obj["timeoffset"], ctx("timeoffset")),
    connections: mapInt(obj["connections"], ctx("connections")),
    relayfee: mapAmount(obj["relayfee"], ctx("relayfee")),
    warnings: mapString(obj["warnings"], ctx("warnings")),
  });
}

/** Blockchain and general reads + raw-transaction chain. */
export class BlockchainApi {
  constructor(private readonly transport: RpcTransport) {}

  // -------------------------------------------------------------------------
  // T1 curated

  /**
   * VDXF key id for a namespaced name. The optional qualifiers match the
   * daemon's second param exactly (`vdxfkey` / `uint256` / `indexnum`) —
   * unknown keys would be silently ignored and yield the wrong id.
   */
  async getVdxfId(options: {
    name: string;
    /** VDXF key or i-address to combine via hash. */
    vdxfKey?: string;
    /** 32-byte hex hash to combine. */
    uint256?: string;
    /** int32 index number to combine. */
    indexNum?: number;
  }): Promise<GetVdxfIdResult> {
    const params: unknown[] = [options.name];
    const qualifiers: Record<string, unknown> = {};
    if (options.vdxfKey !== undefined) qualifiers["vdxfkey"] = options.vdxfKey;
    if (options.uint256 !== undefined) qualifiers["uint256"] = options.uint256;
    if (options.indexNum !== undefined) qualifiers["indexnum"] = options.indexNum;
    if (Object.keys(qualifiers).length > 0) params.push(qualifiers);
    return mapGetVdxfId(await this.transport.request("getvdxfid", params));
  }

  // getblockcount lives on ChainApi (client.chain.getBlockCount) — it was
  // duplicated here until 0.5.0; one public entry point per RPC.

  /** Block hash at a height. */
  async getBlockHash(height: number): Promise<string> {
    return mapString(await this.transport.request("getblockhash", [height]), {
      method: "getblockhash",
      field: "(result)",
    });
  }

  /**
   * Block reward at a height (default: current tip). T1 — `miner` is bigint
   * sats. The daemon returns only `miner`; PBaaS reward-split fields from a
   * newer daemon pass through untyped.
   */
  async getBlockSubsidy(options?: { height?: number }): Promise<GetBlockSubsidyResult> {
    const params: unknown[] = options?.height === undefined ? [] : [options.height];
    return mapGetBlockSubsidy(await this.transport.request("getblocksubsidy", params));
  }

  // -------------------------------------------------------------------------
  // T2 typed (value fields as exact decimal strings)

  /**
   * Block by hash or height. `verbosity`: 0 = hex, 1 = header+txids
   * (default), 2 = full tx detail. Heights are passed as strings (daemon
   * requirement). T2.
   */
  async getBlock(options: { hashOrHeight: string | number; verbosity?: 0 | 1 | 2 }): Promise<unknown> {
    const params: unknown[] = [String(options.hashOrHeight)];
    if (options.verbosity !== undefined) params.push(options.verbosity);
    return requestT2(this.transport, "getblock", params);
  }

  /** Chain state summary. T2. */
  async getBlockchainInfo(): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getblockchaininfo", []);
  }

  /** Node/mempool/chain info. T2. */
  async getMiningInfo(): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getmininginfo", []);
  }

  /** Decoded raw transaction. `verbose` controls hex vs object. T2. */
  async getRawTransaction(options: { txid: string; verbose?: boolean }): Promise<unknown> {
    const params: unknown[] = [options.txid];
    if (options.verbose !== undefined) params.push(options.verbose ? 1 : 0);
    return requestT2(this.transport, "getrawtransaction", params);
  }

  /**
   * One unspent output's detail, or `null` when it is spent or unknown. T1 —
   * `value` is bigint sats, matching `listUnspent().amount` and
   * `getAddressUtxos().satoshis`; the same output read through any of the
   * three now gives the same type.
   */
  async getTxOut(options: {
    txid: string;
    vout: number;
    includeMempool?: boolean;
  }): Promise<GetTxOutResult | null> {
    const params: unknown[] = [options.txid, options.vout];
    if (options.includeMempool !== undefined) params.push(options.includeMempool);
    const raw = await this.transport.request("gettxout", params);
    // The daemon answers a bare null for spent/unknown outputs — short-circuit
    // before mapping, or expectObject would turn "unspent? no" into an error.
    return raw === null || raw === undefined ? null : mapGetTxOut(raw);
  }

  /**
   * Build an unsigned raw transaction. `outputs` is one address → amount
   * object; bigint amounts are sats, serialized losslessly as 8-decimal
   * coins. Returns the tx hex. Chain: createRawTransaction →
   * (fund)/signRawTransaction → sendRawTransaction.
   */
  async createRawTransaction(options: RawTransactionOptions): Promise<string> {
    const inputs = (options.inputs ?? []).map((input) => {
      const raw: Record<string, unknown> = { txid: input.txid, vout: input.vout };
      if (input.sequence !== undefined) raw["sequence"] = input.sequence;
      return raw;
    });
    const params: unknown[] = [inputs, serializeOutputAmounts(options.outputs)];
    if (options.locktime !== undefined || options.expiryHeight !== undefined) params.push(options.locktime ?? 0);
    if (options.expiryHeight !== undefined) params.push(options.expiryHeight);
    return mapString(await this.transport.request("createrawtransaction", params), {
      method: "createrawtransaction",
      field: "(result)",
    });
  }

  /** Sign a raw transaction with wallet keys. T2 — `{hex, complete}`. */
  async signRawTransaction(options: { hex: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "signrawtransaction", [options.hex]);
  }

  /** Broadcast a signed raw transaction. Returns the txid. T2. */
  async sendRawTransaction(options: { hex: string; allowHighFees?: boolean }): Promise<string> {
    const params: unknown[] = [options.hex];
    if (options.allowHighFees !== undefined) params.push(options.allowHighFees);
    return mapString(await this.transport.request("sendrawtransaction", params), {
      method: "sendrawtransaction",
      field: "(result)",
    });
  }

  // -------------------------------------------------------------------------
  // Network / Util reads. Mostly T2; getNetworkInfo is curated T1.

  /** Connected-peer info. T2. */
  async getPeerInfo(): Promise<unknown[]> {
    return requestT2(this.transport, "getpeerinfo", []);
  }

  /**
   * P2P/network summary. T1 — `relayfee` is bigint sats, the same daemon
   * field as `client.chain.getInfo().relayfee`; reading it through either now
   * gives the same type. `networks`/`localaddresses` pass through untyped.
   */
  async getNetworkInfo(): Promise<GetNetworkInfoResult> {
    return mapGetNetworkInfo(await this.transport.request("getnetworkinfo", []));
  }

  /** Validate an address / return its metadata. T2. */
  async validateAddress(options: { address: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "validateaddress", [options.address]);
  }

  /**
   * Fee estimate (VRSC/kB) for a confirmation target. T2 — decimal string,
   * or `null` when the daemon has insufficient data (its `-1` sentinel).
   */
  async estimateFee(options: { blocks: number }): Promise<string | null> {
    const result = await requestT2<unknown>(this.transport, "estimatefee", [options.blocks]);
    const text = typeof result === "string" ? result : String(result);
    // The daemon signals "insufficient data" with a literal -1, but its exact
    // wire form ("-1" vs "-1.00000000") is a formatting detail; a real
    // fee-per-kB is never negative, so any negative result is the sentinel.
    return text.startsWith("-") ? null : text;
  }

  // -------------------------------------------------------------------------
  // Additional blockchain / rawtransaction reads (coverage expansion).
  // All read-only; no money leaves the wallet through these.

  /** Best-chain tip hash. T1. */
  async getBestBlockHash(): Promise<string> {
    return mapString(await this.transport.request("getbestblockhash", []), {
      method: "getbestblockhash",
      field: "(result)",
    });
  }

  /**
   * Block header. `verbose` (default true) → object; false → raw hex string.
   * T2.
   */
  async getBlockHeader(options: {
    hash: string;
    verbose?: boolean;
  }): Promise<Record<string, unknown> | string> {
    const params: unknown[] = [options.hash];
    if (options.verbose !== undefined) params.push(options.verbose);
    return requestT2(this.transport, "getblockheader", params);
  }

  /**
   * Mempool contents. `verbose` false (default) → array of txids; true →
   * object keyed by txid with fee/size detail. T2.
   */
  async getRawMempool(options?: {
    verbose?: boolean;
  }): Promise<string[] | Record<string, unknown>> {
    const params: unknown[] = options?.verbose === undefined ? [] : [options.verbose];
    return requestT2(this.transport, "getrawmempool", params);
  }

  /** Mempool size/usage summary. T2. */
  async getMempoolInfo(): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getmempoolinfo", []);
  }

  /** Known chain tips (active + orphaned branches). T2. */
  async getChainTips(): Promise<unknown[]> {
    return requestT2(this.transport, "getchaintips", []);
  }

  /** Proof-of-work difficulty. T2 — non-integer value surfaces as a string. */
  async getDifficulty(): Promise<number | string> {
    return requestT2(this.transport, "getdifficulty", []);
  }

  /** Decode a raw transaction hex into its JSON object. T2. */
  async decodeRawTransaction(options: { hex: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "decoderawtransaction", [options.hex]);
  }

  /** Decode a hex script into its assembly + addresses. T2. */
  async decodeScript(options: { hex: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "decodescript", [options.hex]);
  }

  /**
   * Coin supply at `height` (default: current tip). T1 — supply values are
   * bigint sats; chain-total magnitudes are exactly where float64 loses
   * satoshi precision. Daemon contract (source v1.2.17): the height is read
   * with `uni_get_str`, so it goes on the wire as a string — a raw JSON
   * number reads as "" → height 0 → the in-band "invalid height" error.
   * Failures arrive in-band (`{"error": ...}` on a success envelope) and
   * surface as `VerusRpcError` with code `RPC_NO_CODE`. Verified live:
   * near-tip heights on a mature chain can take the daemon MINUTES to
   * answer — pass a `timeoutMs` sized for that.
   */
  async coinSupply(options?: { height?: number }): Promise<CoinSupplyResult> {
    const height = options?.height;
    if (height !== undefined && (!Number.isSafeInteger(height) || height < 0)) {
      // The daemon parses the string with atoi — "1e+21" would silently
      // become height 1, "420.7" would truncate. Refuse instead.
      throw new RangeError(`coinsupply: height must be a non-negative integer, got ${String(height)}`);
    }
    const params: unknown[] = height === undefined ? [] : [String(height)];
    return mapCoinSupply(await this.transport.request("coinsupply", params));
  }

  /**
   * Re-verify the local block database. Expensive — the daemon holds its
   * main lock for the duration. `checkLevel` 0-4, `numBlocks` (0 = all);
   * omitted entirely, the node uses its own `-checklevel`/`-checkblocks`
   * (3/288 unless configured). Params are positional, so passing
   * `numBlocks` without `checkLevel` sends the compiled-in default 3 —
   * OVERRIDING a `-checklevel` the node was started with; pass both to be
   * explicit. T1 boolean.
   */
  async verifyChain(options?: { checkLevel?: number; numBlocks?: number }): Promise<boolean> {
    const params: unknown[] = [];
    if (options?.checkLevel !== undefined || options?.numBlocks !== undefined) {
      params.push(options?.checkLevel ?? 3);
    }
    if (options?.numBlocks !== undefined) params.push(options.numBlocks);
    return mapBoolean(await this.transport.request("verifychain", params), {
      method: "verifychain",
      field: "(result)",
    });
  }
}
