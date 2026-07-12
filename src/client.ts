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
  /** Daemon RPC endpoint, e.g. `http://127.0.0.1:27486`. */
  url?: string;
  user?: string;
  pass?: string;
  /** Injectable for tests and exotic runtimes; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Plain per-request timeout (ms) of the default transport. Default 60s. */
  timeoutMs?: number;
  /** Opt-in circuit breaker + policy timeout. Off by default. */
  resilience?: ResilienceConfig;
  /** Full transport override (tests, future GatewayTransport). */
  transport?: RpcTransport;
}

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
    if (config.transport !== undefined) {
      this.transport = config.transport;
    } else {
      if (config.url === undefined || config.user === undefined || config.pass === undefined) {
        throw new TypeError("VerusClient: url, user and pass are required (or pass a transport)");
      }
      const daemon = new DaemonTransport({
        url: config.url,
        user: config.user,
        pass: config.pass,
        ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
        ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      });
      this.transport = config.resilience !== undefined ? withResilience(daemon, config.resilience) : daemon;
    }
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
    const raw = await this.transport.request(method, params);
    return options?.numbers === "js" ? toJsNumbers(raw) : toSafeNumbers(raw);
  }
}
