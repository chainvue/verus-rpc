import { amountParam } from "../amount.js";
import { LosslessNumber } from "../lossless.js";
import { expectArray, mapString, mapStringArray } from "../mapping.js";
import { toSafeNumbers } from "../lossless.js";
import type { RpcTransport } from "../transport.js";
import { pollOperation, requireTxid, throwIfAborted } from "./operations.js";
import { positionalTail } from "./params.js";
import { decimalString, decimalStringEntries, requestT2 } from "./t2.js";
import { mapOperationStatus, type OperationStatus } from "./wallet.js";

/**
 * Shielded (z_*) family — T2: typed, value fields as exact decimal strings.
 * Note: parts of the shielded surface are limited on VRSCTEST (memos/z-addrs
 * partially unsupported) — see per-method docs.
 */

export interface ZSendManyEntry {
  /** Transparent or shielded destination. */
  address: string;
  /** Bigint sats — serialized as an exact JSON number for the daemon. */
  amount: bigint;
  /** Hex-encoded memo (shielded outputs only). */
  memo?: string | undefined;
}

export interface ZSendManyOptions {
  /** Transparent or shielded source address. */
  fromAddress: string;
  amounts: ZSendManyEntry[];
  minConf?: number;
  /** Bigint sats. */
  fee?: bigint;
}

export interface ZReceivedEntry {
  txid: string;
  /** Exact decimal string. */
  amount: string;
  /**
   * Raw sats where the daemon provides them. `number` up to 2^53−1;
   * beyond that (PBaaS chains with supply > ~90M coins) the safe-number
   * conversion surfaces the exact value as a decimal string instead.
   */
  amountZat?: number | string | undefined;
  memo?: string | undefined;
  confirmations?: number | undefined;
  change?: boolean | undefined;
  outindex?: number | undefined;
  [key: string]: unknown;
}

export interface ZUnspentEntry {
  txid: string;
  outindex?: number | undefined;
  confirmations: number;
  spendable?: boolean | undefined;
  address: string;
  /** Exact decimal string. */
  amount: string;
  memo?: string | undefined;
  change?: boolean | undefined;
  [key: string]: unknown;
}

export interface ZTotalBalanceResult {
  /** Exact decimal strings. */
  transparent: string;
  private: string;
  total: string;
  [key: string]: unknown;
}

/** Rescan behavior for key / viewing-key imports. Daemon default: "whenkeyisnew". */
export type ZRescanOption = "yes" | "no" | "whenkeyisnew";

export interface WaitForOperationOptions {
  opid: string;
  /** Default 1s. */
  pollIntervalMs?: number;
  /** Default 120s. */
  waitTimeoutMs?: number;
  /**
   * Cancels the wait: aborts each in-flight poll request and interrupts the
   * inter-poll sleep, surfacing as `TransportError("aborted")`. The operation
   * still completes on the daemon — cancelling stops the polling only.
   */
  signal?: AbortSignal;
}

/** The daemon's default z-operation fee (0.0001), for gap-filled slots. */
function defaultZFee(): LosslessNumber {
  return new LosslessNumber("0.0001");
}

/** Shielded wallet surface (z_*). */
export class ShieldedApi {
  constructor(private readonly transport: RpcTransport) {}

  /** Balance of one (t- or z-) address. T2 — exact decimal string. */
  async zGetBalance(options: { address: string; minConf?: number }): Promise<string> {
    const params: unknown[] = [options.address];
    if (options.minConf !== undefined) params.push(options.minConf);
    return decimalString(await requestT2<unknown>(this.transport, "z_getbalance", params));
  }

  /** Transparent/private/total wallet balances. T2 — exact decimal strings. */
  async zGetTotalBalance(options?: { minConf?: number; includeWatchOnly?: boolean }): Promise<ZTotalBalanceResult> {
    const params: unknown[] = [];
    if (options?.minConf !== undefined || options?.includeWatchOnly !== undefined) {
      params.push(options.minConf ?? 1);
    }
    if (options?.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    const raw = await requestT2<Record<string, unknown>>(this.transport, "z_gettotalbalance", params);
    // Coerce only fields the daemon actually sent. `decimalString(undefined)`
    // would materialize the literal string "undefined" as a balance — the same
    // drift-hiding footgun `decimalStringEntries` guards against — so an absent
    // field stays absent and surfaces honestly.
    const out: ZTotalBalanceResult = { ...raw } as ZTotalBalanceResult;
    for (const field of ["transparent", "private", "total"] as const) {
      if (raw[field] !== undefined) out[field] = decimalString(raw[field]);
    }
    return out;
  }

  /** Shielded addresses of this wallet. */
  async zListAddresses(options?: { includeWatchOnly?: boolean }): Promise<string[]> {
    const params: unknown[] = options?.includeWatchOnly === undefined ? [] : [options.includeWatchOnly];
    return mapStringArray(await this.transport.request("z_listaddresses", params), {
      method: "z_listaddresses",
      field: "(result)",
    });
  }

  /** Amounts received by one shielded address. T2. */
  async zListReceivedByAddress(options: { address: string; minConf?: number }): Promise<ZReceivedEntry[]> {
    const params: unknown[] = [options.address];
    if (options.minConf !== undefined) params.push(options.minConf);
    const raw = await this.transport.request("z_listreceivedbyaddress", params);
    return decimalStringEntries<ZReceivedEntry>(toSafeNumbers(raw), "z_listreceivedbyaddress", "amount");
  }

  /** Unspent shielded notes. T2. */
  async zListUnspent(options?: {
    minConf?: number;
    maxConf?: number;
    includeWatchOnly?: boolean;
    addresses?: string[];
  }): Promise<ZUnspentEntry[]> {
    const params: unknown[] = [];
    const needMax =
      options?.maxConf !== undefined || options?.includeWatchOnly !== undefined || options?.addresses !== undefined;
    if (options?.minConf !== undefined || needMax) params.push(options.minConf ?? 1);
    if (needMax) params.push(options.maxConf ?? 9_999_999);
    if (options?.includeWatchOnly !== undefined || options?.addresses !== undefined) {
      params.push(options.includeWatchOnly ?? false);
    }
    if (options?.addresses !== undefined) params.push(options.addresses);
    const raw = await this.transport.request("z_listunspent", params);
    return decimalStringEntries<ZUnspentEntry>(toSafeNumbers(raw), "z_listunspent", "amount");
  }

  /** New shielded address. VRSCTEST note: sapling support may be limited. */
  async zGetNewAddress(options?: { type?: "sapling" | "sprout" }): Promise<string> {
    const params: unknown[] = options?.type === undefined ? [] : [options.type];
    return mapString(await this.transport.request("z_getnewaddress", params), {
      method: "z_getnewaddress",
      field: "(result)",
    });
  }

  /**
   * Shielded send (async daemon operation). Returns the opid — use
   * `waitForOperation` / `zSendManyAndWait` for the txid.
   */
  async zSendMany(options: ZSendManyOptions): Promise<string> {
    const amounts = options.amounts.map((entry) => {
      const raw: Record<string, unknown> = {
        address: entry.address,
        amount: amountParam(entry.amount),
      };
      if (entry.memo !== undefined) raw["memo"] = entry.memo;
      return raw;
    });
    const params: unknown[] = [options.fromAddress, amounts];
    if (options.minConf !== undefined || options.fee !== undefined) params.push(options.minConf ?? 1);
    if (options.fee !== undefined) params.push(amountParam(options.fee));
    return mapString(await this.transport.request("z_sendmany", params), {
      method: "z_sendmany",
      field: "(result)",
    });
  }

  /** Poll `z_getoperationstatus` until the operation reaches a final state. */
  async waitForOperation(options: WaitForOperationOptions): Promise<OperationStatus> {
    return pollOperation(
      async () => {
        const raw = expectArray(
          await this.transport.request("z_getoperationstatus", [[options.opid]], options.signal),
          "z_getoperationstatus",
        );
        return raw.map((item, i) => mapOperationStatus(item, i)).find((s) => s.id === options.opid);
      },
      options.opid,
      { intervalMs: options.pollIntervalMs ?? 1_000, timeoutMs: options.waitTimeoutMs ?? 120_000 },
      options.signal,
    );
  }

  /**
   * `zSendMany` + wait for the final state. Resolves with the txid. A
   * "success" status missing `result.txid` throws `ResponseMappingError` —
   * the send completed, only the response shape drifted; never retry it.
   */
  async zSendManyAndWait(
    options: ZSendManyOptions & { pollIntervalMs?: number; waitTimeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ opid: string; txid: string }> {
    const { pollIntervalMs, waitTimeoutMs, signal, ...sendOptions } = options;
    throwIfAborted(signal, "zSendManyAndWait");
    const opid = await this.zSendMany(sendOptions);
    const status = await this.waitForOperation({
      opid,
      ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
      ...(waitTimeoutMs !== undefined ? { waitTimeoutMs } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
    return { opid, txid: requireTxid(status) };
  }

  /** Detailed shielded view of a transaction. T2. */
  async zViewTransaction(options: { txid: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "z_viewtransaction", [options.txid]);
  }

  /** Merge UTXOs/notes to one address (async operation inside the result). T2. */
  async zMergeToAddress(options: {
    fromAddresses: string[];
    toAddress: string;
    fee?: bigint;
    transparentLimit?: number;
    shieldedLimit?: number;
    memo?: string;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.fromAddresses, options.toAddress];
    const opts: unknown[] = [
      options.fee === undefined ? undefined : amountParam(options.fee),
      options.transparentLimit,
      options.shieldedLimit,
      options.memo,
    ];
    // Gap-fill skipped middle slots with the daemon's own defaults: fee
    // 0.0001, transparent limit 50, shielded limit 200 (the sapling default —
    // sprout notes default to 20 on a bare daemon call; set `shieldedLimit`
    // explicitly if you merge sprout notes).
    const defaults: unknown[] = [defaultZFee(), 50, 200, ""];
    params.push(...positionalTail(opts, defaults));
    return requestT2(this.transport, "z_mergetoaddress", params);
  }

  /** Shield coinbase UTXOs to a z-address (async operation inside the result). T2. */
  async zShieldCoinbase(options: {
    fromAddress: string;
    toAddress: string;
    fee?: bigint;
    limit?: number;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.fromAddress, options.toAddress];
    if (options.fee !== undefined || options.limit !== undefined) {
      params.push(options.fee === undefined ? defaultZFee() : amountParam(options.fee));
    }
    if (options.limit !== undefined) params.push(options.limit);
    return requestT2(this.transport, "z_shieldcoinbase", params);
  }

  /** Results of finished operations (removes them from daemon memory). T2. */
  async zGetOperationResult(options?: { operationIds?: string[] }): Promise<unknown[]> {
    const params: unknown[] = options?.operationIds === undefined ? [] : [options.operationIds];
    return requestT2(this.transport, "z_getoperationresult", params);
  }

  /**
   * All known async-operation ids, optionally filtered by status
   * (`queued` | `executing` | `success` | `failed` | `cancelled`). T2.
   */
  async zListOperationIds(options?: { status?: string }): Promise<string[]> {
    const params: unknown[] = options?.status === undefined ? [] : [options.status];
    return mapStringArray(await this.transport.request("z_listoperationids", params), {
      method: "z_listoperationids",
      field: "(result)",
    });
  }

  /**
   * SECRET: export the spending key for a shielded address. Do not log the
   * result. `outputAsHex` returns the raw hex form instead of the bech32 key.
   */
  async zExportKey(options: { zaddr: string; outputAsHex?: boolean }): Promise<string> {
    const params: unknown[] = [options.zaddr];
    if (options.outputAsHex !== undefined) params.push(options.outputAsHex);
    return mapString(await this.transport.request("z_exportkey", params), {
      method: "z_exportkey",
      field: "(result)",
    });
  }

  /**
   * SECRET (key): import a shielded spending key into the wallet. Do not log
   * the key. `rescan` controls history rescanning (`whenkeyisnew` default).
   */
  async zImportKey(options: {
    zkey: string;
    rescan?: ZRescanOption;
    startHeight?: number;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.zkey];
    if (options.rescan !== undefined || options.startHeight !== undefined) {
      params.push(options.rescan ?? "whenkeyisnew");
    }
    if (options.startHeight !== undefined) params.push(options.startHeight);
    return requestT2(this.transport, "z_importkey", params);
  }

  /**
   * Validate a shielded address (sprout/sapling type, `ismine`). Works
   * without wallet access. T2.
   */
  async zValidateAddress(options: { address: string }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "z_validateaddress", [options.address]);
  }

  /**
   * SECRET (view capability): export the viewing key for a shielded
   * address. Do not log the result — it reveals all incoming transactions
   * of the address.
   */
  async zExportViewingKey(options: { zaddr: string }): Promise<string> {
    return mapString(await this.transport.request("z_exportviewingkey", [options.zaddr]), {
      method: "z_exportviewingkey",
      field: "(result)",
    });
  }

  /**
   * Import a viewing key (watch-only shielded address). Returns the address
   * type + address. `rescan` controls history rescanning (`whenkeyisnew`
   * daemon default).
   */
  async zImportViewingKey(options: {
    viewingKey: string;
    rescan?: ZRescanOption;
    startHeight?: number;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.viewingKey];
    if (options.rescan !== undefined || options.startHeight !== undefined) {
      params.push(options.rescan ?? "whenkeyisnew");
    }
    if (options.startHeight !== undefined) params.push(options.startHeight);
    return requestT2(this.transport, "z_importviewingkey", params);
  }

  /**
   * SECRET (all keys): dump the full wallet — transparent AND shielded keys
   * — to a file under the daemon's `-exportdir`, on the NODE's filesystem.
   * Returns the full path there. CAUTION `omitEmptyTAddresses` (source
   * v1.2.17): it omits KEYED transparent addresses that merely have no
   * indexed UTXOs / IDs / history — their private keys are then MISSING
   * from the backup. The daemon's own help warns not to use it unless every
   * address of interest is known to be included.
   */
  async zExportWallet(options: { filename: string; omitEmptyTAddresses?: boolean }): Promise<string> {
    const params: unknown[] = [options.filename];
    if (options.omitEmptyTAddresses !== undefined) params.push(options.omitEmptyTAddresses);
    return mapString(await this.transport.request("z_exportwallet", params), {
      method: "z_exportwallet",
      field: "(result)",
    });
  }

  /**
   * Import a `zExportWallet` dump from the NODE's filesystem (transparent
   * and shielded keys; triggers a rescan). Void.
   */
  async zImportWallet(options: { filename: string }): Promise<void> {
    await this.transport.request("z_importwallet", [options.filename]);
  }
}
