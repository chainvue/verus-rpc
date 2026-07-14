import { toSafeNumbers } from "../lossless.js";
import { expectObject, mapInt, mapString, mapStringOptional, withPassthrough } from "../mapping.js";
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
  /** Address → amount (bigint sats) or currency-object output. */
  outputs: Record<string, unknown>[];
  inputs?: CreateRawTransactionInput[];
  locktime?: number;
  expiryHeight?: number;
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

/** Blockchain and general reads + raw-transaction chain. */
export class BlockchainApi {
  constructor(private readonly transport: RpcTransport) {}

  // -------------------------------------------------------------------------
  // T1 curated

  /** VDXF key id for a namespaced name. */
  async getVdxfId(options: { name: string; parent?: string }): Promise<GetVdxfIdResult> {
    const params: unknown[] = [options.name];
    if (options.parent !== undefined) params.push({ parent: options.parent });
    return mapGetVdxfId(await this.transport.request("getvdxfid", params));
  }

  /** Best-chain block count. */
  async getBlockCount(): Promise<number> {
    return mapInt(await this.transport.request("getblockcount", []), {
      method: "getblockcount",
      field: "(result)",
    });
  }

  /** Block hash at a height. */
  async getBlockHash(height: number): Promise<string> {
    return mapString(await this.transport.request("getblockhash", [height]), {
      method: "getblockhash",
      field: "(result)",
    });
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

  /** Block reward split at a height. T2 — decimal strings. */
  async getBlockSubsidy(options?: { height?: number }): Promise<Record<string, unknown>> {
    const params: unknown[] = options?.height === undefined ? [] : [options.height];
    return requestT2(this.transport, "getblocksubsidy", params);
  }

  /** Decoded raw transaction. `verbose` controls hex vs object. T2. */
  async getRawTransaction(options: { txid: string; verbose?: boolean }): Promise<unknown> {
    const params: unknown[] = [options.txid];
    if (options.verbose !== undefined) params.push(options.verbose ? 1 : 0);
    return requestT2(this.transport, "getrawtransaction", params);
  }

  /** UTXO details (null if spent/unknown). T2 — value as decimal string. */
  async getTxOut(options: {
    txid: string;
    vout: number;
    includeMempool?: boolean;
  }): Promise<Record<string, unknown> | null> {
    const params: unknown[] = [options.txid, options.vout];
    if (options.includeMempool !== undefined) params.push(options.includeMempool);
    const result = await requestT2<Record<string, unknown> | null>(this.transport, "gettxout", params);
    return result ?? null;
  }

  /**
   * Build an unsigned raw transaction. Amount outputs accept bigint sats and
   * are serialized losslessly. T2. Chain: createRawTransaction →
   * (fund)/signRawTransaction → sendRawTransaction.
   */
  async createRawTransaction(options: RawTransactionOptions): Promise<string> {
    const inputs = (options.inputs ?? []).map((input) => {
      const raw: Record<string, unknown> = { txid: input.txid, vout: input.vout };
      if (input.sequence !== undefined) raw["sequence"] = input.sequence;
      return raw;
    });
    const outputs = toSafeNumbers(options.outputs); // caller-provided; kept opaque
    const params: unknown[] = [inputs, outputs];
    if (options.locktime !== undefined || options.expiryHeight !== undefined) params.push(options.locktime ?? 0);
    if (options.expiryHeight !== undefined) params.push(options.expiryHeight);
    return requestT2(this.transport, "createrawtransaction", params);
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
  // Network / Util reads. T2.

  /** Connected-peer info. T2. */
  async getPeerInfo(): Promise<unknown[]> {
    return requestT2(this.transport, "getpeerinfo", []);
  }

  /** P2P/network summary. T2. */
  async getNetworkInfo(): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getnetworkinfo", []);
  }

  /** Validate an address / return its metadata. T2. */
  async validateAddress(options: { address: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "validateaddress", [options.address]);
  }

  /** Fee estimate (VRSC/kB) for a confirmation target. T2 — decimal string. */
  async estimateFee(options: { blocks: number }): Promise<string> {
    const result = await requestT2<unknown>(this.transport, "estimatefee", [options.blocks]);
    return typeof result === "string" ? result : String(result);
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
}
