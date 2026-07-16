import { formatAmount } from "../amount.js";
import { OperationTimeoutError, RpcErrorCode, VerusRpcError } from "../errors.js";
import { LosslessNumber, toSafeNumbers } from "../lossless.js";
import {
  expectArray,
  expectObject,
  mapBooleanOptional,
  mapInt,
  mapIntOptional,
  mapString,
  mapStringArray,
  mapStringOptional,
  withPassthrough,
} from "../mapping.js";
import type { RpcTransport } from "../transport.js";
import { requestT2 } from "./t2.js";
import { mapGetTransaction } from "./wallet.js";

/** The identity object embedded in `getidentity`-style responses. */
export interface IdentityDefinition {
  version: number;
  flags: number;
  primaryaddresses: string[];
  minimumsignatures: number;
  name: string;
  identityaddress: string;
  parent: string;
  systemid: string;
  contentmap?: Record<string, unknown> | undefined;
  contentmultimap?: Record<string, unknown> | undefined;
  revocationauthority: string;
  recoveryauthority: string;
  privateaddress?: string | undefined;
  timelock?: number | undefined;
  [key: string]: unknown;
}

export interface GetIdentityResult {
  fullyqualifiedname?: string | undefined;
  friendlyname?: string | undefined;
  identity: IdentityDefinition;
  /** "active" | "revoked" — daemon-reported lifecycle state. */
  status?: string | undefined;
  canspendfor?: boolean | undefined;
  cansignfor?: boolean | undefined;
  blockheight?: number | undefined;
  txid?: string | undefined;
  vout?: number | undefined;
  [key: string]: unknown;
}

export interface GetIdentityOptions {
  /** `name@` or i-address. */
  nameOrAddress: string;
  /** Return the identity as of this height (default: current). */
  height?: number;
  /** Include a transaction proof. */
  txProof?: boolean;
  /** Height for which to return the proof. */
  txProofHeight?: number;
}

export interface GetIdentityContentOptions {
  nameOrAddress: string;
  heightStart?: number;
  heightEnd?: number;
  txProofs?: boolean;
  txProofHeight?: number;
  /** Restrict contentmultimap to this VDXF key. */
  vdxfKey?: string;
}

export interface GetIdentityHistoryOptions {
  nameOrAddress: string;
  heightStart?: number;
  heightEnd?: number;
  txProofs?: boolean;
  txProofHeight?: number;
}

export interface IdentityHistoryEntry {
  blockhash?: string | undefined;
  height: number;
  /** Raw outpoint info (txid/voutnum) — passthrough. */
  output?: unknown;
  identity: IdentityDefinition;
  [key: string]: unknown;
}

export interface GetIdentityHistoryResult {
  fullyqualifiedname?: string | undefined;
  friendlyname?: string | undefined;
  status?: string | undefined;
  canspendfor?: boolean | undefined;
  cansignfor?: boolean | undefined;
  blockheight?: number | undefined;
  history: IdentityHistoryEntry[];
  [key: string]: unknown;
}

export interface ListIdentitiesOptions {
  includeCanSpend?: boolean;
  includeCanSign?: boolean;
  includeWatchOnly?: boolean;
}

/** Query object for the getidentitieswith* index methods. */
export interface IdentitiesByAddressQuery {
  address: string;
  fromHeight?: number;
  toHeight?: number;
  /** Only identities whose defining output is unspent. */
  unspent?: boolean;
}

export interface IdentitiesByAuthorityQuery {
  identityId: string;
  fromHeight?: number;
  toHeight?: number;
  unspent?: boolean;
}

/**
 * Flat identity entry returned by the getidentitieswith* index methods —
 * the definition itself, not wrapped in `{identity: …}`.
 */
export type IndexedIdentity = IdentityDefinition;

/**
 * Identity JSON accepted by register/update/recover — daemon field names.
 * Optionals include `| undefined` so a getidentity result's `.identity`
 * (an `IdentityDefinition`) can be passed straight back for the natural
 * "read → modify → write" round-trip under exactOptionalPropertyTypes.
 * contentmap values are hex strings on the wire.
 */
export interface IdentitySpec {
  name: string;
  parent?: string | undefined;
  primaryaddresses?: string[] | undefined;
  minimumsignatures?: number | undefined;
  revocationauthority?: string | undefined;
  recoveryauthority?: string | undefined;
  privateaddress?: string | undefined;
  contentmap?: Record<string, unknown> | undefined;
  contentmultimap?: Record<string, unknown> | undefined;
  timelock?: number | undefined;
  version?: number | undefined;
  flags?: number | undefined;
  [key: string]: unknown;
}

export interface RegisterNameCommitmentOptions {
  /** Name to commit, without parent suffix (`"myname"`). */
  name: string;
  /** Transparent address that controls the commitment. */
  controlAddress: string;
  /** Identity that referred the registration (fee discount). */
  referralIdentity?: string;
  /** Parent name/currency for sub-ID registration (default: current chain). */
  parent?: string;
  /** Address/identity that funds the commitment. */
  sourceOfFunds?: string;
}

export interface NameReservation {
  name: string;
  salt: string;
  version?: number | undefined;
  referral?: string | undefined;
  parent?: string | undefined;
  nameid?: string | undefined;
  [key: string]: unknown;
}

export interface NameCommitmentResult {
  txid: string;
  namereservation: NameReservation;
  [key: string]: unknown;
}

export interface RegisterIdentityOptions {
  /** Commitment txid from `registerNameCommitment`. */
  txid: string;
  /** Reservation from `registerNameCommitment`, verbatim. */
  namereservation: NameReservation;
  identity: IdentitySpec;
  /** Return the raw tx hex instead of broadcasting. */
  returnTx?: boolean;
  /** Registration fee offer — bigint sats. */
  feeOffer?: bigint;
  sourceOfFunds?: string;
}

export interface UpdateIdentityOptions {
  /** Full identity JSON (typically a modified `getidentity` result's `identity`). */
  identity: IdentitySpec;
  returnTx?: boolean;
  /** Sub-ID on a token-managed currency. */
  tokenUpdate?: boolean;
  feeOffer?: bigint;
  sourceOfFunds?: string;
}

export interface RevokeIdentityOptions {
  nameOrId: string;
  returnTx?: boolean;
  tokenRevoke?: boolean;
  feeOffer?: bigint;
  sourceOfFunds?: string;
}

export interface RecoverIdentityOptions {
  /** New identity JSON signed by the recovery authority. */
  identity: IdentitySpec;
  returnTx?: boolean;
  tokenRecover?: boolean;
  feeOffer?: bigint;
  sourceOfFunds?: string;
}

export interface SetIdentityTimelockOptions {
  nameOrId: string;
  /** Absolute block height to unlock at… */
  unlockAtBlock?: number;
  /** …or a delay (blocks) applied when unlock is requested. */
  setUnlockDelay?: number;
  returnTx?: boolean;
  feeOffer?: bigint;
  sourceOfFunds?: string;
}

export interface RegisterIdentityFlowOptions {
  name: string;
  controlAddress: string;
  referralIdentity?: string;
  parent?: string;
  /** Overrides for the registered identity (defaults derive from name/controlAddress). */
  identity?: Partial<IdentitySpec>;
  feeOffer?: bigint;
  sourceOfFunds?: string;
  /** Poll interval while waiting for the commitment to confirm. Default 5s. */
  pollIntervalMs?: number;
  /** Deadline for the commitment confirmation. Default 10 min. */
  confirmationTimeoutMs?: number;
}

export interface RegisterIdentityFlowResult {
  commitment: NameCommitmentResult;
  registrationTxid: string;
}

export interface SignFileOptions {
  signer: string;
  /** Server-side file path. */
  filename: string;
  currentSignature?: string;
}

export function mapIdentityDefinition(raw: unknown, method: string, field: string): IdentityDefinition {
  const obj = expectObject(raw, method);
  const ctx = (name: string) => ({ method, field: `${field}.${name}` });
  return withPassthrough<IdentityDefinition>(obj, {
    version: mapInt(obj["version"], ctx("version")),
    flags: mapInt(obj["flags"], ctx("flags")),
    primaryaddresses: mapStringArray(obj["primaryaddresses"], ctx("primaryaddresses")),
    minimumsignatures: mapInt(obj["minimumsignatures"], ctx("minimumsignatures")),
    name: mapString(obj["name"], ctx("name")),
    identityaddress: mapString(obj["identityaddress"], ctx("identityaddress")),
    parent: mapString(obj["parent"], ctx("parent")),
    systemid: mapString(obj["systemid"], ctx("systemid")),
    contentmap:
      obj["contentmap"] === undefined || obj["contentmap"] === null
        ? undefined
        : (toSafeNumbers(expectObject(obj["contentmap"], method)) as Record<string, unknown>),
    contentmultimap:
      obj["contentmultimap"] === undefined || obj["contentmultimap"] === null
        ? undefined
        : (toSafeNumbers(expectObject(obj["contentmultimap"], method)) as Record<string, unknown>),
    revocationauthority: mapString(obj["revocationauthority"], ctx("revocationauthority")),
    recoveryauthority: mapString(obj["recoveryauthority"], ctx("recoveryauthority")),
    privateaddress: mapStringOptional(obj["privateaddress"], ctx("privateaddress")),
    timelock: mapIntOptional(obj["timelock"], ctx("timelock")),
  });
}

export function mapIdentityResult(raw: unknown, method = "getidentity"): GetIdentityResult {
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field });
  return withPassthrough<GetIdentityResult>(obj, {
    fullyqualifiedname: mapStringOptional(obj["fullyqualifiedname"], ctx("fullyqualifiedname")),
    friendlyname: mapStringOptional(obj["friendlyname"], ctx("friendlyname")),
    identity: mapIdentityDefinition(obj["identity"], method, "identity"),
    status: mapStringOptional(obj["status"], ctx("status")),
    canspendfor: mapBooleanOptional(obj["canspendfor"], ctx("canspendfor")),
    cansignfor: mapBooleanOptional(obj["cansignfor"], ctx("cansignfor")),
    blockheight: mapIntOptional(obj["blockheight"], ctx("blockheight")),
    txid: mapStringOptional(obj["txid"], ctx("txid")),
    vout: mapIntOptional(obj["vout"], ctx("vout")),
  });
}

/** Back-compat alias for the Etappe-1 export name. */
export const mapGetIdentity = mapIdentityResult;

export function mapIdentityHistory(raw: unknown): GetIdentityHistoryResult {
  const method = "getidentityhistory";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field });
  const history = expectArray(obj["history"] ?? [], method, "history").map((item, i) => {
    const entry = expectObject(item, method);
    const ectx = (field: string) => ({ method, field: `history[${i}].${field}` });
    return withPassthrough<IdentityHistoryEntry>(entry, {
      blockhash: mapStringOptional(entry["blockhash"], ectx("blockhash")),
      height: mapInt(entry["height"], ectx("height")),
      output: entry["output"] === undefined ? undefined : toSafeNumbers(entry["output"]),
      identity: mapIdentityDefinition(entry["identity"], method, `history[${i}].identity`),
    });
  });
  return withPassthrough<GetIdentityHistoryResult>(obj, {
    fullyqualifiedname: mapStringOptional(obj["fullyqualifiedname"], ctx("fullyqualifiedname")),
    friendlyname: mapStringOptional(obj["friendlyname"], ctx("friendlyname")),
    status: mapStringOptional(obj["status"], ctx("status")),
    canspendfor: mapBooleanOptional(obj["canspendfor"], ctx("canspendfor")),
    cansignfor: mapBooleanOptional(obj["cansignfor"], ctx("cansignfor")),
    blockheight: mapIntOptional(obj["blockheight"], ctx("blockheight")),
    history,
  });
}

export function mapNameCommitment(raw: unknown): NameCommitmentResult {
  const method = "registernamecommitment";
  const obj = expectObject(raw, method);
  const reservation = expectObject(obj["namereservation"], method);
  const rctx = (field: string) => ({ method, field: `namereservation.${field}` });
  return withPassthrough<NameCommitmentResult>(obj, {
    txid: mapString(obj["txid"], { method, field: "txid" }),
    namereservation: withPassthrough<NameReservation>(reservation, {
      name: mapString(reservation["name"], rctx("name")),
      salt: mapString(reservation["salt"], rctx("salt")),
      version: mapIntOptional(reservation["version"], rctx("version")),
      referral: mapStringOptional(reservation["referral"], rctx("referral")),
      parent: mapStringOptional(reservation["parent"], rctx("parent")),
      nameid: mapStringOptional(reservation["nameid"], rctx("nameid")),
    }),
  });
}

function feeParam(sats: bigint): LosslessNumber {
  return new LosslessNumber(formatAmount(sats));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** VerusID family — reads, lifecycle, and the guided registration flow. */
export class IdentityApi {
  constructor(private readonly transport: RpcTransport) {}

  // -------------------------------------------------------------------------
  // T1 — reads

  /** Look up a VerusID by `name@` or i-address. */
  async getIdentity(options: GetIdentityOptions): Promise<GetIdentityResult> {
    const params: unknown[] = [options.nameOrAddress];
    const needHeight =
      options.height !== undefined || options.txProof !== undefined || options.txProofHeight !== undefined;
    if (needHeight) params.push(options.height ?? 0);
    if (options.txProof !== undefined || options.txProofHeight !== undefined) params.push(options.txProof ?? false);
    if (options.txProofHeight !== undefined) params.push(options.txProofHeight);
    return mapIdentityResult(await this.transport.request("getidentity", params));
  }

  /** Identity incl. aggregated contentmultimap over a height range. */
  async getIdentityContent(options: GetIdentityContentOptions): Promise<GetIdentityResult> {
    const params: unknown[] = [options.nameOrAddress];
    const opts = [options.heightStart, options.heightEnd, options.txProofs, options.txProofHeight, options.vdxfKey];
    const defaults: unknown[] = [0, 0, false, 0, null];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? defaults[i]);
    return mapIdentityResult(await this.transport.request("getidentitycontent", params), "getidentitycontent");
  }

  /** Every historical state of an identity. */
  async getIdentityHistory(options: GetIdentityHistoryOptions): Promise<GetIdentityHistoryResult> {
    const params: unknown[] = [options.nameOrAddress];
    const opts = [options.heightStart, options.heightEnd, options.txProofs, options.txProofHeight];
    const defaults: unknown[] = [0, 0, false, 0];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? defaults[i]);
    return mapIdentityHistory(await this.transport.request("getidentityhistory", params));
  }

  /** Identities this wallet can spend/sign for. */
  async listIdentities(options?: ListIdentitiesOptions): Promise<GetIdentityResult[]> {
    const params: unknown[] = [];
    const opts = [options?.includeCanSpend, options?.includeCanSign, options?.includeWatchOnly];
    const defaults: unknown[] = [true, true, false];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? defaults[i]);
    const result = expectArray(await this.transport.request("listidentities", params), "listidentities");
    return result.map((item) => mapIdentityResult(item, "listidentities"));
  }

  /** Identities containing an address in their primary addresses (index query). */
  async getIdentitiesWithAddress(query: IdentitiesByAddressQuery): Promise<IndexedIdentity[]> {
    const raw: Record<string, unknown> = { address: query.address };
    if (query.fromHeight !== undefined) raw["fromheight"] = query.fromHeight;
    if (query.toHeight !== undefined) raw["toheight"] = query.toHeight;
    if (query.unspent !== undefined) raw["unspent"] = query.unspent;
    const result = expectArray(await this.transport.request("getidentitieswithaddress", [raw]), "getidentitieswithaddress");
    return result.map((item, i) => mapIdentityDefinition(item, "getidentitieswithaddress", `[${i}]`));
  }

  /** Identities that name this identity as revocation authority. */
  async getIdentitiesWithRevocation(query: IdentitiesByAuthorityQuery): Promise<IndexedIdentity[]> {
    return this.identitiesByAuthority("getidentitieswithrevocation", query);
  }

  /** Identities that name this identity as recovery authority. */
  async getIdentitiesWithRecovery(query: IdentitiesByAuthorityQuery): Promise<IndexedIdentity[]> {
    return this.identitiesByAuthority("getidentitieswithrecovery", query);
  }

  private async identitiesByAuthority(method: string, query: IdentitiesByAuthorityQuery): Promise<IndexedIdentity[]> {
    const raw: Record<string, unknown> = { identityid: query.identityId };
    if (query.fromHeight !== undefined) raw["fromheight"] = query.fromHeight;
    if (query.toHeight !== undefined) raw["toheight"] = query.toHeight;
    if (query.unspent !== undefined) raw["unspent"] = query.unspent;
    const result = expectArray(await this.transport.request(method, [raw]), method);
    return result.map((item, i) => mapIdentityDefinition(item, method, `[${i}]`));
  }

  // -------------------------------------------------------------------------
  // T1 — lifecycle

  /** Step 1 of registration: commit to a name. Keep the result — it is required for step 2. */
  async registerNameCommitment(options: RegisterNameCommitmentOptions): Promise<NameCommitmentResult> {
    const params: unknown[] = [options.name, options.controlAddress];
    const opts = [options.referralIdentity, options.parent, options.sourceOfFunds];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    // Skipped middle positions are sent as JSON null (daemon treats null as "not provided").
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? null);
    return mapNameCommitment(await this.transport.request("registernamecommitment", params));
  }

  /** Step 2 of registration: register the identity for a confirmed commitment. Returns the txid. */
  async registerIdentity(options: RegisterIdentityOptions): Promise<string> {
    const first = {
      txid: options.txid,
      namereservation: options.namereservation,
      identity: options.identity,
    };
    const params: unknown[] = [first];
    const opts: unknown[] = [
      options.returnTx,
      options.feeOffer === undefined ? undefined : feeParam(options.feeOffer),
      options.sourceOfFunds,
    ];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? (i === 0 ? false : null));
    return mapString(await this.transport.request("registeridentity", params), {
      method: "registeridentity",
      field: "(result)",
    });
  }

  /** Update an identity (addresses, authorities, content, …). Returns the txid. */
  async updateIdentity(options: UpdateIdentityOptions): Promise<string> {
    return this.lifecycleCall("updateidentity", options.identity, options.returnTx, options.tokenUpdate, options.feeOffer, options.sourceOfFunds);
  }

  /** Revoke an identity — only its recovery authority can recover it. Returns the txid. */
  async revokeIdentity(options: RevokeIdentityOptions): Promise<string> {
    return this.lifecycleCall("revokeidentity", options.nameOrId, options.returnTx, options.tokenRevoke, options.feeOffer, options.sourceOfFunds);
  }

  /** Recover a revoked identity (signed by the recovery authority). Returns the txid. */
  async recoverIdentity(options: RecoverIdentityOptions): Promise<string> {
    return this.lifecycleCall("recoveridentity", options.identity, options.returnTx, options.tokenRecover, options.feeOffer, options.sourceOfFunds);
  }

  /** Timelock an identity (absolute unlock height or unlock delay). Returns the txid. */
  async setIdentityTimelock(options: SetIdentityTimelockOptions): Promise<string> {
    if ((options.unlockAtBlock === undefined) === (options.setUnlockDelay === undefined)) {
      throw new TypeError("setIdentityTimelock: exactly one of unlockAtBlock / setUnlockDelay is required");
    }
    const lockSpec =
      options.unlockAtBlock !== undefined
        ? { unlockatblock: options.unlockAtBlock }
        : { setunlockdelay: options.setUnlockDelay };
    const params: unknown[] = [options.nameOrId, lockSpec];
    const opts: unknown[] = [
      options.returnTx,
      options.feeOffer === undefined ? undefined : feeParam(options.feeOffer),
      options.sourceOfFunds,
    ];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? (i === 0 ? false : null));
    return mapString(await this.transport.request("setidentitytimelock", params), {
      method: "setidentitytimelock",
      field: "(result)",
    });
  }

  private async lifecycleCall(
    method: string,
    first: unknown,
    returnTx: boolean | undefined,
    tokenFlag: boolean | undefined,
    feeOffer: bigint | undefined,
    sourceOfFunds: string | undefined,
  ): Promise<string> {
    const params: unknown[] = [first];
    const opts: unknown[] = [returnTx, tokenFlag, feeOffer === undefined ? undefined : feeParam(feeOffer), sourceOfFunds];
    const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
    for (let i = 0; i <= lastSet; i++) params.push(opts[i] ?? (i <= 1 ? false : null));
    return mapString(await this.transport.request(method, params), { method, field: "(result)" });
  }

  /**
   * Guided registration: commitment → wait for confirmation → register.
   * Defaults: single-sig identity controlled by `controlAddress`.
   * Throws `OperationTimeoutError` if the commitment does not confirm in time.
   */
  async registerIdentityFlow(options: RegisterIdentityFlowOptions): Promise<RegisterIdentityFlowResult> {
    const interval = options.pollIntervalMs ?? 5_000;
    const timeout = options.confirmationTimeoutMs ?? 600_000;

    const commitment = await this.registerNameCommitment({
      name: options.name,
      controlAddress: options.controlAddress,
      ...(options.referralIdentity !== undefined ? { referralIdentity: options.referralIdentity } : {}),
      ...(options.parent !== undefined ? { parent: options.parent } : {}),
      ...(options.sourceOfFunds !== undefined ? { sourceOfFunds: options.sourceOfFunds } : {}),
    });

    const deadline = Date.now() + timeout;
    for (;;) {
      let confirmed = false;
      try {
        const tx = mapGetTransaction(await this.transport.request("gettransaction", [commitment.txid]));
        confirmed = tx.confirmations >= 1;
      } catch (err) {
        // Right after broadcast the commitment tx is not yet in the wallet, so
        // the daemon answers -5 (invalid/non-wallet txid). Treat that as "not
        // confirmed yet" and keep polling; rethrow anything else.
        if (!(err instanceof VerusRpcError && err.code === RpcErrorCode.RPC_INVALID_ADDRESS_OR_KEY)) {
          throw err;
        }
      }
      if (confirmed) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new OperationTimeoutError(commitment.txid, timeout);
      }
      await sleep(Math.min(interval, remaining));
    }

    const registrationTxid = await this.registerIdentity({
      txid: commitment.txid,
      namereservation: commitment.namereservation,
      identity: {
        name: options.name,
        primaryaddresses: [options.controlAddress],
        minimumsignatures: 1,
        ...options.identity,
      },
      ...(options.feeOffer !== undefined ? { feeOffer: options.feeOffer } : {}),
      ...(options.sourceOfFunds !== undefined ? { sourceOfFunds: options.sourceOfFunds } : {}),
    });

    return { commitment, registrationTxid };
  }

  // -------------------------------------------------------------------------
  // T2 — signatures, trust, data

  /** Sign structured data/messages/hashes (daemon JSON options, passthrough). T2. */
  async signData(options: Record<string, unknown>): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "signdata", [options]);
  }

  /** Sign a server-side file with an address or identity key. T2. */
  async signFile(options: SignFileOptions): Promise<Record<string, unknown>> {
    const params: unknown[] = [options.signer, options.filename];
    if (options.currentSignature !== undefined) params.push(options.currentSignature);
    return requestT2(this.transport, "signfile", params);
  }

  /** Verify a file signature. T2. */
  async verifyFile(options: {
    signer: string;
    signature: string;
    filename: string;
    checkLatest?: boolean;
  }): Promise<boolean> {
    const params: unknown[] = [options.signer, options.signature, options.filename];
    if (options.checkLatest !== undefined) params.push(options.checkLatest);
    return requestT2(this.transport, "verifyfile", params);
  }

  /** Verify a hash signature. T2. */
  async verifyHash(options: {
    signer: string;
    signature: string;
    hash: string;
    checkLatest?: boolean;
  }): Promise<boolean> {
    const params: unknown[] = [options.signer, options.signature, options.hash];
    if (options.checkLatest !== undefined) params.push(options.checkLatest);
    return requestT2(this.transport, "verifyhash", params);
  }

  /** Verify structured-data signatures (daemon JSON options, passthrough). T2. */
  async verifySignature(options: Record<string, unknown>): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "verifysignature", [options]);
  }

  /**
   * Trust ratings this wallet keeps for identities. T2. The daemon requires
   * the id-array param — `[]` is sent when no filter is given. Note: current
   * daemons (v1.2.x) return ALL ratings regardless of the filter.
   */
  async getIdentityTrust(options?: { identityIds?: string[] }): Promise<Record<string, unknown>> {
    return requestT2(this.transport, "getidentitytrust", [options?.identityIds ?? []]);
  }

  /** Set/clear wallet-local identity trust ratings (daemon JSON options). T2. */
  async setIdentityTrust(options: Record<string, unknown>): Promise<void> {
    await this.transport.request("setidentitytrust", [options]);
  }
}
