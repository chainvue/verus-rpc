import { toSafeNumbers } from "../lossless.js";
import {
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

/** The identity object embedded in `getidentity` responses. */
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

export function mapGetIdentity(raw: unknown): GetIdentityResult {
  const method = "getidentity";
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

/** VerusID family — reads in Etappe 1, lifecycle follows in Etappe 3. */
export class IdentityApi {
  constructor(private readonly transport: RpcTransport) {}

  /** Look up a VerusID by `name@` or i-address. */
  async getIdentity(options: GetIdentityOptions): Promise<GetIdentityResult> {
    const params: unknown[] = [options.nameOrAddress];
    const needHeight = options.height !== undefined || options.txProof !== undefined || options.txProofHeight !== undefined;
    if (needHeight) params.push(options.height ?? 0);
    if (options.txProof !== undefined || options.txProofHeight !== undefined) params.push(options.txProof ?? false);
    if (options.txProofHeight !== undefined) params.push(options.txProofHeight);
    return mapGetIdentity(await this.transport.request("getidentity", params));
  }
}
