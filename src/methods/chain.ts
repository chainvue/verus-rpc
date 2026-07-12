import {
  expectObject,
  mapAmount,
  mapBoolean,
  mapFloat,
  mapInt,
  mapIntOptional,
  mapString,
  mapStringOptional,
  withPassthrough,
} from "../mapping.js";
import type { RpcTransport } from "../transport.js";

/**
 * `getinfo` — curated against verusd v1.2.17. Value fields (`paytxfee`,
 * `relayfee`) are bigint sats; unknown fields pass through with safe-number
 * conversion.
 */
export interface GetInfoResult {
  version: number;
  protocolversion: number;
  VRSCversion: string;
  chainid?: string | undefined;
  name?: string | undefined;
  blocks: number;
  longestchain: number;
  timeoffset?: number | undefined;
  connections: number;
  proxy?: string | undefined;
  difficulty: number;
  testnet: boolean;
  keypoololdest?: number | undefined;
  keypoolsize?: number | undefined;
  /** Wallet's transaction fee — bigint sats. */
  paytxfee: bigint;
  /** Minimum relay fee — bigint sats. */
  relayfee: bigint;
  errors: string;
  [key: string]: unknown;
}

export function mapGetInfo(raw: unknown): GetInfoResult {
  const method = "getinfo";
  const obj = expectObject(raw, method);
  const ctx = (field: string) => ({ method, field });
  return withPassthrough<GetInfoResult>(obj, {
    version: mapInt(obj["version"], ctx("version")),
    protocolversion: mapInt(obj["protocolversion"], ctx("protocolversion")),
    VRSCversion: mapString(obj["VRSCversion"], ctx("VRSCversion")),
    chainid: mapStringOptional(obj["chainid"], ctx("chainid")),
    name: mapStringOptional(obj["name"], ctx("name")),
    blocks: mapInt(obj["blocks"], ctx("blocks")),
    longestchain: mapInt(obj["longestchain"], ctx("longestchain")),
    timeoffset: mapIntOptional(obj["timeoffset"], ctx("timeoffset")),
    connections: mapInt(obj["connections"], ctx("connections")),
    proxy: mapStringOptional(obj["proxy"], ctx("proxy")),
    difficulty: mapFloat(obj["difficulty"], ctx("difficulty")),
    testnet: mapBoolean(obj["testnet"], ctx("testnet")),
    keypoololdest: mapIntOptional(obj["keypoololdest"], ctx("keypoololdest")),
    keypoolsize: mapIntOptional(obj["keypoolsize"], ctx("keypoolsize")),
    paytxfee: mapAmount(obj["paytxfee"], ctx("paytxfee")),
    relayfee: mapAmount(obj["relayfee"], ctx("relayfee")),
    errors: mapString(obj["errors"], ctx("errors")),
  });
}

/** Blockchain-family reads (T1 surface grows in later Etappen). */
export class ChainApi {
  constructor(private readonly transport: RpcTransport) {}

  /** Daemon/chain state. `VRSCversion` is the runtime daemon-version check. */
  async getInfo(): Promise<GetInfoResult> {
    return mapGetInfo(await this.transport.request("getinfo", []));
  }

  /** Height of the longest block chain the node sees. */
  async getBlockCount(): Promise<number> {
    return mapInt(await this.transport.request("getblockcount", []), {
      method: "getblockcount",
      field: "(result)",
    });
  }
}
