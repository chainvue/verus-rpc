import { amountParam } from "../amount.js";
import { toSafeNumbers } from "../lossless.js";
import {
  expectArray,
  expectObject,
  mapAmount,
  mapAmountOptional,
  mapBoolean,
  mapBooleanOptional,
  mapInt,
  mapIntOptional,
  mapString,
  mapStringOptional,
  withPassthrough,
} from "../mapping.js";
import type { RpcTransport } from "../transport.js";
import { pollOperation, requireTxid } from "./operations.js";
import { decimalString, decimalStringEntries, requestT2 } from "./t2.js";
import type {
  GetWalletInfoResult,
  GroupedAddress,
  ImportAddressOptions,
  ImportPrivKeyOptions,
  ListReceivedOptions,
  ListTransactionsOptions,
  ListUnspentOptions,
  ListedTransaction,
  ReceivedByAddressEntry,
  SendManyOptions,
  SignMessageOptions,
  SignMessageResult,
  UnspentOutput,
  VerifyMessageOptions,
} from "./wallet-types.js";

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
  /** Convert to this currency on the way. */
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

export function mapUnspentOutput(raw: unknown, index: number): UnspentOutput {
  const method = "listunspent";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field: `[${index}].${field}` });
  return withPassthrough<UnspentOutput>(obj, {
    txid: mapString(obj["txid"], ctx("txid")),
    vout: mapInt(obj["vout"], ctx("vout")),
    address: mapStringOptional(obj["address"], ctx("address")),
    scriptPubKey: mapStringOptional(obj["scriptPubKey"], ctx("scriptPubKey")),
    amount: mapAmount(obj["amount"], ctx("amount")),
    confirmations: mapInt(obj["confirmations"], ctx("confirmations")),
    generated: mapBooleanOptional(obj["generated"], ctx("generated")),
    spendable: mapBooleanOptional(obj["spendable"], ctx("spendable")),
    redeemScript: mapStringOptional(obj["redeemScript"], ctx("redeemScript")),
  });
}

export function mapListedTransaction(raw: unknown, index: number): ListedTransaction {
  const method = "listtransactions";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field: `[${index}].${field}` });
  return withPassthrough<ListedTransaction>(obj, {
    address: mapStringOptional(obj["address"], ctx("address")),
    category: mapString(obj["category"], ctx("category")),
    amount: mapAmount(obj["amount"], ctx("amount"), { signed: true }),
    vout: mapIntOptional(obj["vout"], ctx("vout")),
    fee: mapAmountOptional(obj["fee"], ctx("fee"), { signed: true }),
    confirmations: mapIntOptional(obj["confirmations"], ctx("confirmations")),
    blockhash: mapStringOptional(obj["blockhash"], ctx("blockhash")),
    blockindex: mapIntOptional(obj["blockindex"], ctx("blockindex")),
    blocktime: mapIntOptional(obj["blocktime"], ctx("blocktime")),
    txid: mapStringOptional(obj["txid"], ctx("txid")),
    time: mapInt(obj["time"], ctx("time")),
    timereceived: mapIntOptional(obj["timereceived"], ctx("timereceived")),
    comment: mapStringOptional(obj["comment"], ctx("comment")),
    size: mapIntOptional(obj["size"], ctx("size")),
  });
}

export function mapGetWalletInfo(raw: unknown): GetWalletInfoResult {
  const method = "getwalletinfo";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field });
  return withPassthrough<GetWalletInfoResult>(obj, {
    walletversion: mapInt(obj["walletversion"], ctx("walletversion")),
    balance: mapAmount(obj["balance"], ctx("balance")),
    unconfirmed_balance: mapAmount(obj["unconfirmed_balance"], ctx("unconfirmed_balance")),
    immature_balance: mapAmount(obj["immature_balance"], ctx("immature_balance")),
    txcount: mapInt(obj["txcount"], ctx("txcount")),
    keypoololdest: mapIntOptional(obj["keypoololdest"], ctx("keypoololdest")),
    keypoolsize: mapIntOptional(obj["keypoolsize"], ctx("keypoolsize")),
    unlocked_until: mapIntOptional(obj["unlocked_until"], ctx("unlocked_until")),
    paytxfee: mapAmountOptional(obj["paytxfee"], ctx("paytxfee")),
    seedfp: mapStringOptional(obj["seedfp"], ctx("seedfp")),
  });
}

export function mapAddressGroupings(raw: unknown): GroupedAddress[][] {
  const method = "listaddressgroupings";
  return expectArray(raw, method).map((group, g) =>
    expectArray(group, method, `[${g}]`).map((entry, e) => {
      const tuple = expectArray(entry, method, `[${g}][${e}]`);
      const address = mapString(tuple[0], { method, field: `[${g}][${e}][0]` });
      const amount = mapAmount(tuple[1], { method, field: `[${g}][${e}][1]` });
      const account = mapStringOptional(tuple[2], { method, field: `[${g}][${e}][2]` });
      return account === undefined ? { address, amount } : { address, amount, account };
    }),
  );
}

export function mapSignMessage(raw: unknown): SignMessageResult {
  const method = "signmessage";
  const obj = expectObject(raw, method);
  return withPassthrough<SignMessageResult>(obj, {
    hash: mapString(obj["hash"], { method, field: "hash" }),
    signature: mapString(obj["signature"], { method, field: "signature" }),
  });
}

function serializeOutput(output: SendCurrencyOutput): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    address: output.address,
    amount: amountParam(output.amount),
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
      params.push(amountParam(options.feeAmount));
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
   * `OperationFailedError` / `OperationTimeoutError` otherwise. A "success"
   * status missing `result.txid` throws `ResponseMappingError` — the send
   * completed, only the response shape drifted; never retry it.
   */
  async sendCurrencyAndWait(options: SendCurrencyAndWaitOptions): Promise<SendCurrencyAndWaitResult> {
    const { pollIntervalMs, waitTimeoutMs, ...sendOptions } = options;
    const opid = await this.sendCurrency(sendOptions);
    const status = await pollOperation(
      async () => (await this.getOperationStatus({ operationIds: [opid] })).find((s) => s.id === opid),
      opid,
      { intervalMs: pollIntervalMs ?? 1_000, timeoutMs: waitTimeoutMs ?? 120_000 },
    );
    return { opid, txid: requireTxid(status) };
  }

  // -------------------------------------------------------------------------
  // T1 — wallet family (Etappe 2)

  /** Unspent transparent outputs — amounts as bigint sats. */
  async listUnspent(options?: ListUnspentOptions): Promise<UnspentOutput[]> {
    const params: unknown[] = [];
    const needMax = options?.maxConf !== undefined || options?.addresses !== undefined;
    if (options?.minConf !== undefined || needMax) params.push(options.minConf ?? 1);
    if (needMax) params.push(options.maxConf ?? 9_999_999);
    if (options?.addresses !== undefined) params.push(options.addresses);
    const result = expectArray(await this.transport.request("listunspent", params), "listunspent");
    return result.map((item, i) => mapUnspentOutput(item, i));
  }

  /** Most recent wallet transactions — amounts as bigint sats. */
  async listTransactions(options?: ListTransactionsOptions): Promise<ListedTransaction[]> {
    const params: unknown[] = [];
    const needFrom = options?.from !== undefined || options?.includeWatchOnly !== undefined;
    if (options?.count !== undefined || needFrom) {
      // Positional daemon params: the deprecated account slot must be "*".
      params.push("*", options.count ?? 10);
    }
    if (needFrom) params.push(options.from ?? 0);
    if (options?.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    const result = expectArray(await this.transport.request("listtransactions", params), "listtransactions");
    return result.map((item, i) => mapListedTransaction(item, i));
  }

  /** Send to multiple transparent recipients in one transaction. Returns the txid. */
  async sendMany(options: SendManyOptions): Promise<string> {
    const amounts: Record<string, unknown> = {};
    for (const [address, sats] of Object.entries(options.amounts)) {
      amounts[address] = amountParam(sats);
    }
    // Positional: the deprecated account slot must be "".
    const params: unknown[] = ["", amounts];
    const needComment = options.comment !== undefined || options.subtractFeeFrom !== undefined;
    if (options.minConf !== undefined || needComment) params.push(options.minConf ?? 1);
    if (needComment) params.push(options.comment ?? "");
    if (options.subtractFeeFrom !== undefined) params.push(options.subtractFeeFrom);
    return mapString(await this.transport.request("sendmany", params), { method: "sendmany", field: "(result)" });
  }

  /** New transparent receiving address. */
  async getNewAddress(): Promise<string> {
    return mapString(await this.transport.request("getnewaddress", []), {
      method: "getnewaddress",
      field: "(result)",
    });
  }

  /** New transparent change address. */
  async getRawChangeAddress(): Promise<string> {
    return mapString(await this.transport.request("getrawchangeaddress", []), {
      method: "getrawchangeaddress",
      field: "(result)",
    });
  }

  /** Wallet state — balances as bigint sats. */
  async getWalletInfo(): Promise<GetWalletInfoResult> {
    return mapGetWalletInfo(await this.transport.request("getwalletinfo", []));
  }

  /** Unconfirmed native-currency balance — bigint sats. */
  async getUnconfirmedBalance(): Promise<bigint> {
    return mapAmount(await this.transport.request("getunconfirmedbalance", []), {
      method: "getunconfirmedbalance",
      field: "(result)",
    });
  }

  /** Address clusters with common ownership — amounts as bigint sats. */
  async listAddressGroupings(): Promise<GroupedAddress[][]> {
    return mapAddressGroupings(await this.transport.request("listaddressgroupings", []));
  }

  /** Sign a message with an address key or identity. */
  async signMessage(options: SignMessageOptions): Promise<SignMessageResult> {
    const params: unknown[] = [options.signer, options.message];
    if (options.currentSignature !== undefined) params.push(options.currentSignature);
    return mapSignMessage(await this.transport.request("signmessage", params));
  }

  /**
   * Verify a message signature. For identity signers, set
   * `checkLatest: true` unless you specifically need historical validity —
   * see `VerifyMessageOptions`.
   */
  async verifyMessage(options: VerifyMessageOptions): Promise<boolean> {
    const params: unknown[] = [options.signer, options.signature, options.message];
    if (options.checkLatest !== undefined) params.push(options.checkLatest);
    return mapBoolean(await this.transport.request("verifymessage", params), {
      method: "verifymessage",
      field: "(result)",
    });
  }

  // -------------------------------------------------------------------------
  // T2 — typed (value fields as exact decimal strings)

  /** Received totals per address. T2 — amounts as exact decimal strings. */
  async listReceivedByAddress(options?: ListReceivedOptions): Promise<ReceivedByAddressEntry[]> {
    const params: unknown[] = [];
    const needEmpty = options?.includeEmpty !== undefined || options?.includeWatchOnly !== undefined;
    if (options?.minConf !== undefined || needEmpty) params.push(options.minConf ?? 1);
    if (needEmpty) params.push(options.includeEmpty ?? false);
    if (options?.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    const raw = await this.transport.request("listreceivedbyaddress", params);
    return decimalStringEntries<ReceivedByAddressEntry>(toSafeNumbers(raw), "listreceivedbyaddress", "amount");
  }

  /** Total received by one address. T2 — exact decimal string. */
  async getReceivedByAddress(options: { address: string; minConf?: number }): Promise<string> {
    const params: unknown[] = [options.address];
    if (options.minConf !== undefined) params.push(options.minConf);
    const result = await requestT2<string | number>(this.transport, "getreceivedbyaddress", params);
    return decimalString(result);
  }

  /**
   * LEGACY (accounts era, deprecated upstream): balances per account label.
   * T2 — amounts as exact decimal strings. Prefer identities/addresses.
   */
  async listAccounts(options?: { minConf?: number; includeWatchOnly?: boolean }): Promise<Record<string, string>> {
    const params: unknown[] = [];
    if (options?.minConf !== undefined || options?.includeWatchOnly !== undefined) {
      params.push(options.minConf ?? 1);
    }
    if (options?.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    const raw = await requestT2<Record<string, string | number>>(this.transport, "listaccounts", params);
    const out: Record<string, string> = {};
    for (const [account, amount] of Object.entries(raw)) out[account] = decimalString(amount);
    return out;
  }

  // -------------------------------------------------------------------------
  // T2 — key material & backups. NEVER logged, never fixture-recorded with
  // real key material (mock-only tests). Handle results as secrets.

  /** Import a WIF private key into the wallet. Slow when rescanning. */
  async importPrivKey(options: ImportPrivKeyOptions): Promise<void> {
    const params: unknown[] = [options.privateKey];
    if (options.label !== undefined || options.rescan !== undefined) params.push(options.label ?? "");
    if (options.rescan !== undefined) params.push(options.rescan);
    await this.transport.request("importprivkey", params);
  }

  /** Watch an address or script without its key. */
  async importAddress(options: ImportAddressOptions): Promise<void> {
    const params: unknown[] = [options.address];
    if (options.label !== undefined || options.rescan !== undefined) params.push(options.label ?? "");
    if (options.rescan !== undefined) params.push(options.rescan);
    await this.transport.request("importaddress", params);
  }

  /** Import keys from a `dumpwallet` file (server-side path). */
  async importWallet(options: { filename: string }): Promise<void> {
    await this.transport.request("importwallet", [options.filename]);
  }

  /** SECRET: WIF private key for an address. Do not log the result. */
  async dumpPrivKey(options: { address: string }): Promise<string> {
    return mapString(await this.transport.request("dumpprivkey", [options.address]), {
      method: "dumpprivkey",
      field: "(result)",
    });
  }

  /** Dump all wallet keys to a server-side file. Returns the full path. */
  async dumpWallet(options: { filename: string }): Promise<string> {
    const result = await this.transport.request("dumpwallet", [options.filename]);
    // Older daemons return the path as a plain string, newer as {filename}.
    if (typeof result === "string") return result;
    const obj = expectObject(result, "dumpwallet");
    return mapString(obj["filename"], { method: "dumpwallet", field: "filename" });
  }

  /** Copy wallet.dat to a server-side destination. Returns the full path. */
  async backupWallet(options: { destination: string }): Promise<string> {
    return mapString(await this.transport.request("backupwallet", [options.destination]), {
      method: "backupwallet",
      field: "(result)",
    });
  }

  // -------------------------------------------------------------------------
  // Wallet reads + output locks (coverage expansion). T2.

  /**
   * Transactions since a block (wallet sync). All params optional. T2 —
   * amount fields surface as exact decimal strings.
   */
  async listSinceBlock(options?: {
    blockHash?: string;
    targetConfirmations?: number;
    includeWatchOnly?: boolean;
  }): Promise<Record<string, unknown>> {
    const params: unknown[] = [];
    const needConf = options?.targetConfirmations !== undefined || options?.includeWatchOnly !== undefined;
    if (options?.blockHash !== undefined || needConf) params.push(options?.blockHash ?? "");
    if (needConf) params.push(options?.targetConfirmations ?? 1);
    if (options?.includeWatchOnly !== undefined) params.push(options.includeWatchOnly);
    return requestT2(this.transport, "listsinceblock", params);
  }

  /**
   * Lock or unlock unspent outputs so they are (not) used by automatic
   * coin selection. Returns whether the update succeeded.
   */
  async lockUnspent(options: {
    unlock: boolean;
    outputs?: { txid: string; vout: number }[];
  }): Promise<boolean> {
    const params: unknown[] = [options.unlock];
    if (options.outputs !== undefined) {
      params.push(options.outputs.map((o) => ({ txid: o.txid, vout: o.vout })));
    }
    return mapBoolean(await this.transport.request("lockunspent", params), {
      method: "lockunspent",
      field: "(result)",
    });
  }

  /** Currently locked (reserved-from-selection) outputs. T2. */
  async listLockUnspent(): Promise<unknown[]> {
    return requestT2(this.transport, "listlockunspent", []);
  }

  // -------------------------------------------------------------------------
  // Spends. T1 — amounts are bigint sats, encoded losslessly (never a float).

  /**
   * Send `amount` (bigint sats) to a transparent address via the daemon
   * wallet. Returns the txid. The daemon holds and uses the keys; no key
   * material crosses this API.
   */
  async sendToAddress(options: {
    address: string;
    amount: bigint;
    comment?: string;
    commentTo?: string;
    subtractFeeFromAmount?: boolean;
  }): Promise<string> {
    const params: unknown[] = [options.address, amountParam(options.amount)];
    // Positional daemon params: comment / comment-to / subtractfee.
    const needCommentTo = options.commentTo !== undefined || options.subtractFeeFromAmount !== undefined;
    const needComment = options.comment !== undefined || needCommentTo;
    if (needComment) params.push(options.comment ?? "");
    if (needCommentTo) params.push(options.commentTo ?? "");
    if (options.subtractFeeFromAmount !== undefined) params.push(options.subtractFeeFromAmount);
    return mapString(await this.transport.request("sendtoaddress", params), {
      method: "sendtoaddress",
      field: "(result)",
    });
  }

  /**
   * Send `amount` (bigint sats) from a (legacy) account to a transparent
   * address. Returns the txid. `fromAccount` defaults to the "" account.
   */
  async sendFrom(options: {
    toAddress: string;
    amount: bigint;
    fromAccount?: string;
    minConf?: number;
    comment?: string;
    commentTo?: string;
  }): Promise<string> {
    const params: unknown[] = [
      options.fromAccount ?? "",
      options.toAddress,
      amountParam(options.amount),
    ];
    const needCommentTo = options.commentTo !== undefined;
    const needComment = options.comment !== undefined || needCommentTo;
    const needMinConf = options.minConf !== undefined || needComment;
    if (needMinConf) params.push(options.minConf ?? 1);
    if (needComment) params.push(options.comment ?? "");
    if (needCommentTo) params.push(options.commentTo ?? "");
    return mapString(await this.transport.request("sendfrom", params), {
      method: "sendfrom",
      field: "(result)",
    });
  }

  /**
   * Set the wallet's per-kB transaction fee (bigint sats). Returns whether
   * the update succeeded.
   */
  async setTxFee(options: { amount: bigint }): Promise<boolean> {
    return mapBoolean(
      await this.transport.request("settxfee", [amountParam(options.amount)]),
      { method: "settxfee", field: "(result)" },
    );
  }

  // -------------------------------------------------------------------------
  // Wallet encryption / unlock. Key-bearing: the passphrase is used once and
  // never returned. Do not log arguments.

  /**
   * SECRET (passphrase): unlock the encrypted wallet for `timeout` seconds so
   * spends can be signed. Do not log the passphrase.
   */
  async walletPassphrase(options: { passphrase: string; timeout: number }): Promise<void> {
    await this.transport.request("walletpassphrase", [options.passphrase, options.timeout]);
  }

  /** Re-lock the wallet immediately (drops the cached passphrase). */
  async walletLock(): Promise<void> {
    await this.transport.request("walletlock", []);
  }

  /**
   * SECRET (passphrase): change the wallet passphrase. Do not log arguments.
   */
  async walletPassphraseChange(options: { oldPassphrase: string; newPassphrase: string }): Promise<void> {
    await this.transport.request("walletpassphrasechange", [options.oldPassphrase, options.newPassphrase]);
  }

  /**
   * SECRET (passphrase): encrypt a previously-unencrypted wallet. Returns the
   * daemon's advisory message (a restart is typically required). Do not log
   * the passphrase.
   */
  async encryptWallet(options: { passphrase: string }): Promise<string> {
    return mapString(await this.transport.request("encryptwallet", [options.passphrase]), {
      method: "encryptwallet",
      field: "(result)",
    });
  }
}
