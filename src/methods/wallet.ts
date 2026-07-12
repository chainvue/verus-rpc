import { formatAmount } from "../amount.js";
import { OperationFailedError, OperationTimeoutError, ResponseMappingError } from "../errors.js";
import { LosslessNumber, toSafeNumbers } from "../lossless.js";
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
} from "../mapping.js";
import type { RpcTransport } from "../transport.js";

export interface GetBalanceOptions {
  /** Only count transactions with at least this many confirmations. */
  minConf?: number;
  includeWatchOnly?: boolean;
}

export interface GetCurrencyBalanceOptions {
  /** Transparent address, identity (`name@`), or wildcard. */
  address: string;
  minConf?: number;
  /** Return currency names instead of i-addresses as keys. */
  friendlyNames?: boolean;
  includeShared?: boolean;
}

export interface GetTransactionOptions {
  txid: string;
  includeWatchOnly?: boolean;
}

export interface TransactionDetail {
  address?: string | undefined;
  /** "send" | "receive" | "generate" | "immature" | "orphan" */
  category: string;
  /** Signed value — negative for sends. Bigint sats. */
  amount: bigint;
  vout?: number | undefined;
  /** Signed value — negative. Bigint sats. */
  fee?: bigint | undefined;
  size?: number | undefined;
  [key: string]: unknown;
}

export interface GetTransactionResult {
  /** Signed net wallet effect — bigint sats. */
  amount: bigint;
  /** Signed fee (negative) — bigint sats. Present for sends. */
  fee?: bigint | undefined;
  confirmations: number;
  blockhash?: string | undefined;
  blockindex?: number | undefined;
  blocktime?: number | undefined;
  expiryheight?: number | undefined;
  txid: string;
  time: number;
  timereceived: number;
  details: TransactionDetail[];
  hex?: string | undefined;
  [key: string]: unknown;
}

export interface SendCurrencyOutput {
  /** Destination: transparent/z address or identity (`name@`). */
  address: string;
  /** Bigint sats — serialized as an exact JSON number for the daemon. */
  amount: bigint;
  /** Source currency; defaults to the chain's native currency. */
  currency?: string | undefined;
  /** Convert to this currency on the way (typed first-class in Etappe 4). */
  convertto?: string | undefined;
  /** Conversion routing via this (fractional) currency. */
  via?: string | undefined;
  exportto?: string | undefined;
  feecurrency?: string | undefined;
  /** Hex or text memo (z-address outputs only). */
  memo?: string | undefined;
  refundto?: string | undefined;
  preconvert?: boolean | undefined;
  burn?: boolean | undefined;
  mintnew?: boolean | undefined;
}

export interface SendCurrencyOptions {
  /** Source address, identity, or `"*"` for any wallet funds. */
  fromAddress: string;
  outputs: SendCurrencyOutput[];
  minConf?: number;
  /** Explicit fee — bigint sats. */
  feeAmount?: bigint;
}

export interface OperationError {
  code: number;
  message: string;
  [key: string]: unknown;
}

export interface OperationResult {
  txid?: string | undefined;
  [key: string]: unknown;
}

/** One entry of `z_getoperationstatus` — async wallet operation state. */
export interface OperationStatus {
  id: string;
  /** "queued" | "executing" | "success" | "failed" | "cancelled" */
  status: string;
  creation_time?: number | undefined;
  method?: string | undefined;
  /** Original call params, safe-number converted (amounts arrive as exact decimal strings). */
  params?: unknown;
  result?: OperationResult | undefined;
  error?: OperationError | undefined;
  [key: string]: unknown;
}

export interface GetOperationStatusOptions {
  /** Restrict to these opids; all known operations when omitted. */
  operationIds?: string[];
}

export interface SendCurrencyAndWaitOptions extends SendCurrencyOptions {
  /** Poll interval for z_getoperationstatus. Default 1s. */
  pollIntervalMs?: number;
  /** Deadline for the operation to reach a final state. Default 120s. */
  waitTimeoutMs?: number;
}

export interface SendCurrencyAndWaitResult {
  opid: string;
  txid: string;
}

export function mapGetTransaction(raw: unknown): GetTransactionResult {
  const method = "gettransaction";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field });
  const details = expectArray(obj["details"] ?? [], method, "details").map((item, i) => {
    const d = expectObject(item, method);
    const dctx = (field: string) => ({ method, field: `details[${i}].${field}` });
    return withPassthrough<TransactionDetail>(d, {
      address: mapStringOptional(d["address"], dctx("address")),
      category: mapString(d["category"], dctx("category")),
      amount: mapAmount(d["amount"], dctx("amount"), { signed: true }),
      vout: mapIntOptional(d["vout"], dctx("vout")),
      fee: mapAmountOptional(d["fee"], dctx("fee"), { signed: true }),
      size: mapIntOptional(d["size"], dctx("size")),
    });
  });
  return withPassthrough<GetTransactionResult>(obj, {
    amount: mapAmount(obj["amount"], ctx("amount"), { signed: true }),
    fee: mapAmountOptional(obj["fee"], ctx("fee"), { signed: true }),
    confirmations: mapInt(obj["confirmations"], ctx("confirmations")),
    blockhash: mapStringOptional(obj["blockhash"], ctx("blockhash")),
    blockindex: mapIntOptional(obj["blockindex"], ctx("blockindex")),
    blocktime: mapIntOptional(obj["blocktime"], ctx("blocktime")),
    expiryheight: mapIntOptional(obj["expiryheight"], ctx("expiryheight")),
    txid: mapString(obj["txid"], ctx("txid")),
    time: mapInt(obj["time"], ctx("time")),
    timereceived: mapInt(obj["timereceived"], ctx("timereceived")),
    details,
    hex: mapStringOptional(obj["hex"], ctx("hex")),
  });
}

export function mapCurrencyBalance(raw: unknown): Record<string, bigint> {
  const method = "getcurrencybalance";
  const obj = expectObject(raw, method);
  const balances: Record<string, bigint> = {};
  for (const [currency, value] of Object.entries(obj)) {
    balances[currency] = mapAmount(value, { method, field: currency });
  }
  return balances;
}

export function mapOperationStatus(raw: unknown, index: number): OperationStatus {
  const method = "z_getoperationstatus";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field: `[${index}].${field}` });
  const rawResult = obj["result"];
  const rawError = obj["error"];
  return withPassthrough<OperationStatus>(obj, {
    id: mapString(obj["id"], ctx("id")),
    status: mapString(obj["status"], ctx("status")),
    creation_time: mapIntOptional(obj["creation_time"], ctx("creation_time")),
    method: mapStringOptional(obj["method"], ctx("method")),
    params: obj["params"] === undefined ? undefined : toSafeNumbers(obj["params"]),
    result:
      rawResult === undefined || rawResult === null
        ? undefined
        : (toSafeNumbers(expectObject(rawResult, method)) as OperationResult),
    error:
      rawError === undefined || rawError === null
        ? undefined
        : mapOperationError(expectObject(rawError, method), ctx("error")),
  });
}

function mapOperationError(obj: Record<string, unknown>, ctx: { method: string; field: string }): OperationError {
  return withPassthrough<OperationError>(obj, {
    code: mapInt(obj["code"], { method: ctx.method, field: `${ctx.field}.code` }),
    message: mapString(obj["message"], { method: ctx.method, field: `${ctx.field}.message` }),
  });
}

function serializeOutput(output: SendCurrencyOutput): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    address: output.address,
    amount: new LosslessNumber(formatAmount(output.amount)),
  };
  if (output.currency !== undefined) raw["currency"] = output.currency;
  if (output.convertto !== undefined) raw["convertto"] = output.convertto;
  if (output.via !== undefined) raw["via"] = output.via;
  if (output.exportto !== undefined) raw["exportto"] = output.exportto;
  if (output.feecurrency !== undefined) raw["feecurrency"] = output.feecurrency;
  if (output.memo !== undefined) raw["memo"] = output.memo;
  if (output.refundto !== undefined) raw["refundto"] = output.refundto;
  if (output.preconvert !== undefined) raw["preconvert"] = output.preconvert;
  if (output.burn !== undefined) raw["burn"] = output.burn;
  if (output.mintnew !== undefined) raw["mintnew"] = output.mintnew;
  return raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wallet family — balances, transactions, sends, async operations. */
export class WalletApi {
  constructor(private readonly transport: RpcTransport) {}

  /** Confirmed native-currency wallet balance — bigint sats. */
  async getBalance(options?: GetBalanceOptions): Promise<bigint> {
    const params: unknown[] = [];
    if (options?.minConf !== undefined || options?.includeWatchOnly !== undefined) {
      // Positional daemon params: the deprecated account slot must be "*".
      params.push("*", options.minConf ?? 1);
      if (options.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    }
    return mapAmount(await this.transport.request("getbalance", params), {
      method: "getbalance",
      field: "(result)",
    });
  }

  /** Per-currency balances of one address/identity — bigint sats per currency. */
  async getCurrencyBalance(options: GetCurrencyBalanceOptions): Promise<Record<string, bigint>> {
    const params: unknown[] = [options.address];
    const needFriendly = options.friendlyNames !== undefined || options.includeShared !== undefined;
    if (options.minConf !== undefined || needFriendly) params.push(options.minConf ?? 1);
    if (needFriendly) params.push(options.friendlyNames ?? false);
    if (options.includeShared !== undefined) params.push(options.includeShared);
    return mapCurrencyBalance(await this.transport.request("getcurrencybalance", params));
  }

  /** Detailed wallet view of one transaction. */
  async getTransaction(options: GetTransactionOptions): Promise<GetTransactionResult> {
    const params: unknown[] = [options.txid];
    if (options.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    return mapGetTransaction(await this.transport.request("gettransaction", params));
  }

  /**
   * Send currency (async daemon operation). Returns the operation id —
   * use `getOperationStatus` or `sendCurrencyAndWait` for the txid.
   */
  async sendCurrency(options: SendCurrencyOptions): Promise<string> {
    const params: unknown[] = [options.fromAddress, options.outputs.map(serializeOutput)];
    if (options.minConf !== undefined || options.feeAmount !== undefined) {
      params.push(options.minConf ?? 1);
    }
    if (options.feeAmount !== undefined) {
      params.push(new LosslessNumber(formatAmount(options.feeAmount)));
    }
    const result = await this.transport.request("sendcurrency", params);
    return mapString(result, { method: "sendcurrency", field: "(result)" });
  }

  /** `z_getoperationstatus` — state of async wallet operations. */
  async getOperationStatus(options?: GetOperationStatusOptions): Promise<OperationStatus[]> {
    const params: unknown[] = options?.operationIds === undefined ? [] : [options.operationIds];
    const result = expectArray(await this.transport.request("z_getoperationstatus", params), "z_getoperationstatus");
    return result.map((item, i) => mapOperationStatus(item, i));
  }

  /**
   * `sendcurrency` + poll `z_getoperationstatus` until the operation reaches
   * a final state. Resolves with the txid on success; throws
   * `OperationFailedError` / `OperationTimeoutError` otherwise.
   */
  async sendCurrencyAndWait(options: SendCurrencyAndWaitOptions): Promise<SendCurrencyAndWaitResult> {
    const { pollIntervalMs, waitTimeoutMs, ...sendOptions } = options;
    const interval = pollIntervalMs ?? 1_000;
    const timeout = waitTimeoutMs ?? 120_000;
    const opid = await this.sendCurrency(sendOptions);
    const deadline = Date.now() + timeout;

    for (;;) {
      const statuses = await this.getOperationStatus({ operationIds: [opid] });
      const status = statuses.find((s) => s.id === opid);
      if (status !== undefined) {
        if (status.status === "success") {
          const txid = status.result?.txid;
          if (typeof txid !== "string") {
            throw new ResponseMappingError("z_getoperationstatus", "result.txid", "success without txid");
          }
          return { opid, txid };
        }
        if (status.status === "failed" || status.status === "cancelled") {
          throw new OperationFailedError(
            opid,
            status.status,
            status.error?.code,
            status.error?.message ?? "no error message",
          );
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new OperationTimeoutError(opid, timeout);
      }
      await sleep(Math.min(interval, remaining));
    }
  }
}
