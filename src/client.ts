import { toJsNumbers, toSafeNumbers } from "./lossless.js";
import { AddressIndexApi } from "./methods/addressindex.js";
import { BlockchainApi } from "./methods/blockchain.js";
import { ChainApi } from "./methods/chain.js";
import { CurrencyApi } from "./methods/currency.js";
import { IdentityApi } from "./methods/identity.js";
import { ShieldedApi } from "./methods/shielded.js";
import { WalletApi } from "./methods/wallet.js";
import { withResilience, type ResilienceConfig } from "./resilience.js";
import { DaemonTransport, type RpcTransport } from "./transport.js";

export interface VerusClientConfig {
  /**
   * RPC endpoint: a local daemon (`http://127.0.0.1:27486`) or a public
   * lite-wallet node (`https://api.verus.services`, `https://api.verustest.net`).
   */
  url?: string;
  /**
   * Basic-auth credentials for a daemon. Omit BOTH for unauthenticated
   * public nodes — those expose a whitelisted read+broadcast subset
   * (getaddressutxos, getaddressbalance, getidentity, getcurrency,
   * getrawtransaction, sendrawtransaction, …); wallet methods stay
   * unavailable there.
   */
  user?: string;
  pass?: string;
  /** Injectable for tests and exotic runtimes; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Plain per-request timeout (ms) of the default transport. Default 60s. */
  timeoutMs?: number;
  /**
   * Opt-in circuit breaker + policy timeout. Off by default. Also applies
   * when combined with a custom `transport` (the transport gets wrapped).
   */
  resilience?: ResilienceConfig;
  /**
   * Full transport override (tests, future GatewayTransport). Mutually
   * exclusive with the default-transport options (`url`, `user`, `pass`,
   * `fetchImpl`, `timeoutMs`) — combining them throws instead of silently
   * ignoring what you passed.
   */
  transport?: RpcTransport;
}

/**
 * The config keys that configure the built-in `DaemonTransport` and are
 * therefore mutually exclusive with an injected `transport`. The `Record`
 * shape makes the compiler enforce the list stays complete: adding a
 * default-transport option to `VerusClientConfig` without listing it here
 * (or excluding it below) is a type error.
 */
const IS_DEFAULT_TRANSPORT_OPTION: Record<Exclude<keyof VerusClientConfig, "transport" | "resilience">, true> = {
  url: true,
  user: true,
  pass: true,
  fetchImpl: true,
  timeoutMs: true,
};
const DEFAULT_TRANSPORT_OPTION_KEYS = Object.keys(IS_DEFAULT_TRANSPORT_OPTION) as (keyof typeof IS_DEFAULT_TRANSPORT_OPTION)[];

/**
 * How `call()` surfaces JSON numbers:
 *
 * - `"lossless"` (default): safe integers become `number`, everything else
 *   (fractional amounts, integers beyond 2^53) becomes an exact decimal
 *   `string`. No float64 rounding — safe for value fields.
 * - `"js"`: classic `JSON.parse` semantics, every number a float64 `number`.
 *   Explicit opt-in; unsafe for arithmetic on amounts.
 */
export type CallNumbersMode = "lossless" | "js";

export interface CallOptions {
  numbers?: CallNumbersMode;
  /**
   * Aborts the in-flight HTTP request. Surfaces as `TransportError` with
   * reason `"aborted"` — a deliberate cancel, never counted by the breaker.
   */
  signal?: AbortSignal;
}

/**
 * Typed client for the Verus daemon JSON-RPC interface.
 *
 * Curated (T1) methods live on the family namespaces (`client.chain`,
 * `client.wallet`, `client.identity`, …); `client.call()` reaches every
 * other daemon method untyped — nothing ever blocks on missing coverage.
 */
export class VerusClient {
  readonly chain: ChainApi;
  readonly wallet: WalletApi;
  readonly identity: IdentityApi;
  readonly currency: CurrencyApi;
  readonly shielded: ShieldedApi;
  readonly addressIndex: AddressIndexApi;
  readonly blockchain: BlockchainApi;

  private readonly transport: RpcTransport;

  constructor(config: VerusClientConfig) {
    let base: RpcTransport;
    if (config.transport !== undefined) {
      const conflicting = DEFAULT_TRANSPORT_OPTION_KEYS.filter((key) => config[key] !== undefined);
      if (conflicting.length > 0) {
        throw new TypeError(
          `VerusClient: default-transport option(s) ${conflicting.join(", ")} would be ignored when a transport is injected — pass one or the other`,
        );
      }
      base = config.transport;
    } else {
      if (config.url === undefined) {
        throw new TypeError("VerusClient: url is required (or pass a transport)");
      }
      if ((config.user === undefined) !== (config.pass === undefined)) {
        throw new TypeError("VerusClient: user and pass must be provided together (omit both for public nodes)");
      }
      base = new DaemonTransport({
        url: config.url,
        ...(config.user !== undefined ? { user: config.user } : {}),
        ...(config.pass !== undefined ? { pass: config.pass } : {}),
        ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
        ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      });
    }
    this.transport = config.resilience !== undefined ? withResilience(base, config.resilience) : base;
    this.chain = new ChainApi(this.transport);
    this.wallet = new WalletApi(this.transport);
    this.identity = new IdentityApi(this.transport);
    this.currency = new CurrencyApi(this.transport);
    this.shielded = new ShieldedApi(this.transport);
    this.addressIndex = new AddressIndexApi(this.transport);
    this.blockchain = new BlockchainApi(this.transport);
  }

  /**
   * Escape hatch: call any daemon RPC method with positional params.
   * Untyped by design — see `CallNumbersMode` for how numbers arrive.
   */
  async call(method: string, params: unknown[] = [], options?: CallOptions): Promise<unknown> {
    const raw = await this.transport.request(method, params, options?.signal);
    return options?.numbers === "js" ? toJsNumbers(raw) : toSafeNumbers(raw);
  }
}
