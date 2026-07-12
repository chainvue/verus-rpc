import { formatAmount } from "../amount.js";
import { OperationFailedError, OperationTimeoutError } from "../errors.js";
import { LosslessNumber } from "../lossless.js";
import { expectArray, mapString, mapStringArray } from "../mapping.js";
import type { RpcTransport } from "../transport.js";
import { requestT2 } from "./t2.js";
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
  /** Raw sats where the daemon provides them. */
  amountZat?: number | undefined;
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

export interface WaitForOperationOptions {
  opid: string;
  /** Default 1s. */
  pollIntervalMs?: number;
  /** Default 120s. */
  waitTimeoutMs?: number;
}

function decimalString(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    return {
      ...raw,
      transparent: decimalString(raw["transparent"]),
      private: decimalString(raw["private"]),
      total: decimalString(raw["total"]),
    };
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
    return requestT2(this.transport, "z_listreceivedbyaddress", params);
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
    return requestT2(this.transport, "z_listunspent", params);
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
        amount: new LosslessNumber(formatAmount(entry.amount)),
      };
      if (entry.memo !== undefined) raw["memo"] = entry.memo;
      return raw;
    });
    const params: unknown[] = [options.fromAddress, amounts];
    if (options.minConf !== undefined || options.fee !== undefined) params.push(options.minConf ?? 1);
    if (options.fee !== undefined) params.push(new LosslessNumber(formatAmount(options.fee)));
    return mapString(await this.transport.request("z_sendmany", params), {
      method: "z_sendmany",
      field: "(result)",
    });
  }

  /** Poll `z_getoperationstatus` until the operation reaches a final state. */
  async waitForOperation(options: WaitForOperationOptions): Promise<OperationStatus> {
    const interval = options.pollIntervalMs ?? 1_000;
    const timeout = options.waitTimeoutMs ?? 120_000;
    const deadline = Date.now() + timeout;
    for (;;) {
      const raw = expectArray(
        await this.transport.request("z_getoperationstatus", [[options.opid]]),
        "z_getoperationstatus",
      );
      const status = raw.map((item, i) => mapOperationStatus(item, i)).find((s) => s.id === options.opid);
      if (status !== undefined) {
        if (status.status === "success") return status;
        if (status.status === "failed" || status.status === "cancelled") {
          throw new OperationFailedError(
            options.opid,
            status.status,
            status.error?.code,
            status.error?.message ?? "no error message",
          );
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new OperationTimeoutError(options.opid, timeout);
      await sleep(Math.min(interval, remaining));
    }
  }

  /** `zSendMany` + wait for the final state. Resolves with the txid. */
  async zSendManyAndWait(
    options: ZSendManyOptions & { pollIntervalMs?: number; waitTimeoutMs?: number },
  ): Promise<{ opid: string; txid: string }> {
    const { pollIntervalMs, waitTimeoutMs, ...sendOptions } = options;
    const opid = await this.zSendMany(sendOptions);
    const status = await this.waitForOperation({
      opid,
      ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
      ...(waitTimeoutMs !== undefined ? { waitTimeoutMs } : {}),
    });
    const txid = status.result?.txid;
    if (typeof txid !== "string") {
      throw new OperationFailedError(opid, status.status, undefined, "success without txid");
    }
    return { opid, txid };
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
      options.fee === undefined ? undefined : new LosslessNumber(formatAmount(options.fee)),
      options.transparentLimit,
      options.shieldedLimit,
      options.memo,
    ];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) {
      params.push(opts[i] ?? (i === 0 ? new LosslessNumber("0.0001") : i === 3 ? "" : 50));
    }
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
      params.push(options.fee === undefined ? new LosslessNumber("0.0001") : new LosslessNumber(formatAmount(options.fee)));
    }
    if (options.limit !== undefined) params.push(options.limit);
    return requestT2(this.transport, "z_shieldcoinbase", params);
  }

  /** Results of finished operations (removes them from daemon memory). T2. */
  async zGetOperationResult(options?: { operationIds?: string[] }): Promise<unknown[]> {
    const params: unknown[] = options?.operationIds === undefined ? [] : [options.operationIds];
    return requestT2(this.transport, "z_getoperationresult", params);
  }
}
