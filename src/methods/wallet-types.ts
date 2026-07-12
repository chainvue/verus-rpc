/**
 * Wallet-family types beyond the Etappe-1 core: T1 curated shapes (bigint
 * sats) and T2 typed shapes (value fields as exact decimal strings).
 */

// ---------------------------------------------------------------------------
// T1 — curated

export interface ListUnspentOptions {
  minConf?: number;
  maxConf?: number;
  /** Restrict to these transparent addresses. */
  addresses?: string[];
}

export interface UnspentOutput {
  txid: string;
  vout: number;
  address?: string | undefined;
  scriptPubKey?: string | undefined;
  /** Bigint sats. */
  amount: bigint;
  confirmations: number;
  generated?: boolean | undefined;
  spendable?: boolean | undefined;
  redeemScript?: string | undefined;
  [key: string]: unknown;
}

export interface ListTransactionsOptions {
  /** Number of entries (default 10). */
  count?: number;
  /** Skip this many entries. */
  from?: number;
  includeWatchOnly?: boolean;
}

export interface ListedTransaction {
  address?: string | undefined;
  /** "send" | "receive" | "generate" | "immature" | "orphan" | "move" */
  category: string;
  /** Signed — negative for sends. Bigint sats. */
  amount: bigint;
  vout?: number | undefined;
  /** Signed (negative). Bigint sats. */
  fee?: bigint | undefined;
  confirmations?: number | undefined;
  blockhash?: string | undefined;
  blockindex?: number | undefined;
  blocktime?: number | undefined;
  txid?: string | undefined;
  time: number;
  timereceived?: number | undefined;
  comment?: string | undefined;
  size?: number | undefined;
  [key: string]: unknown;
}

export interface SendManyOptions {
  /** Destination → bigint sats. */
  amounts: Record<string, bigint>;
  minConf?: number;
  comment?: string;
  /** Fee is subtracted from these destination addresses. */
  subtractFeeFrom?: string[];
}

export interface GetWalletInfoResult {
  walletversion: number;
  /** Confirmed balance — bigint sats. */
  balance: bigint;
  /** Unconfirmed balance — bigint sats. */
  unconfirmed_balance: bigint;
  /** Immature (coinbase/stake) balance — bigint sats. */
  immature_balance: bigint;
  txcount: number;
  keypoololdest?: number | undefined;
  keypoolsize?: number | undefined;
  /** Unix time until which the wallet is unlocked, 0 = locked. */
  unlocked_until?: number | undefined;
  /** Wallet transaction fee — bigint sats. */
  paytxfee?: bigint | undefined;
  seedfp?: string | undefined;
  [key: string]: unknown;
}

/** One address of a grouping: address, balance, optional legacy account. */
export interface GroupedAddress {
  address: string;
  /** Bigint sats. */
  amount: bigint;
  account?: string | undefined;
}

export interface SignMessageOptions {
  /** Transparent address or identity (`name@`) whose key signs. */
  signer: string;
  message: string;
  /** Existing signature to extend (multisig identities). */
  currentSignature?: string;
}

export interface SignMessageResult {
  /** Hash of the signed message. */
  hash: string;
  /** Base64 signature. */
  signature: string;
  [key: string]: unknown;
}

export interface VerifyMessageOptions {
  /** Transparent address or identity (`name@`) that signed. */
  signer: string;
  /** Base64 signature. */
  signature: string;
  message: string;
  /**
   * Verify against the LATEST identity state instead of the state at
   * signing height. Strongly recommended (`true`) when verifying identity
   * signatures for authentication/freshness — a revoked identity keeps
   * verifying historically otherwise (v402 lesson). Daemon default: false.
   */
  checkLatest?: boolean;
}

// ---------------------------------------------------------------------------
// T2 — typed, value fields as exact decimal strings

/**
 * Accounts-era methods are deprecated upstream (Bitcoin heritage); typed
 * here for completeness, documented as legacy. Prefer identities/addresses.
 */
export interface ReceivedByAddressEntry {
  address: string;
  account?: string | undefined;
  /** Exact decimal string. */
  amount: string;
  confirmations: number;
  txids?: string[] | undefined;
  [key: string]: unknown;
}

export interface ListReceivedOptions {
  minConf?: number;
  includeEmpty?: boolean;
  includeWatchOnly?: boolean;
}

export interface ImportPrivKeyOptions {
  /** WIF private key. NEVER logged, never fixture-recorded with real material. */
  privateKey: string;
  label?: string;
  /** Rescan the chain for transactions (slow). Daemon default: true. */
  rescan?: boolean;
}

export interface ImportAddressOptions {
  /** Address or script (hex) to watch. */
  address: string;
  label?: string;
  rescan?: boolean;
}
