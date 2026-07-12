// verus-rpc — the npm-published, full-coverage, precision-honest TypeScript
// client for talking to your own verusd.
//
// Invariant: no float ever crosses this API for a value field. Curated (T1)
// methods surface amounts as bigint satoshis; typed (T2) methods as exact
// decimal strings; `call()` is the always-available escape hatch.

export { formatAmount, parseAmount, SATS_PER_COIN, type ParseAmountOptions } from "./amount.js";
export {
  OperationFailedError,
  OperationTimeoutError,
  ResponseMappingError,
  RpcErrorCode,
  TransportError,
  VerusRpcError,
  type TransportFailureReason,
} from "./errors.js";
export { isLosslessNumber, LosslessNumber, toJsNumbers, toSafeNumbers } from "./lossless.js";
export { DaemonTransport, type DaemonTransportConfig, type RpcTransport } from "./transport.js";
export { withResilience, type ResilienceConfig } from "./resilience.js";
export { MockTransport } from "./mock.js";
export {
  VerusClient,
  type CallNumbersMode,
  type CallOptions,
  type VerusClientConfig,
} from "./client.js";

export { ChainApi, mapGetInfo, type GetInfoResult } from "./methods/chain.js";
export {
  IdentityApi,
  mapGetIdentity,
  mapIdentityDefinition,
  mapIdentityHistory,
  mapIdentityResult,
  mapNameCommitment,
  type GetIdentityContentOptions,
  type GetIdentityHistoryOptions,
  type GetIdentityHistoryResult,
  type GetIdentityOptions,
  type GetIdentityResult,
  type IdentitiesByAddressQuery,
  type IdentitiesByAuthorityQuery,
  type IdentityDefinition,
  type IdentityHistoryEntry,
  type IdentitySpec,
  type IndexedIdentity,
  type ListIdentitiesOptions,
  type NameCommitmentResult,
  type NameReservation,
  type RecoverIdentityOptions,
  type RegisterIdentityFlowOptions,
  type RegisterIdentityFlowResult,
  type RegisterIdentityOptions,
  type RegisterNameCommitmentOptions,
  type RevokeIdentityOptions,
  type SetIdentityTimelockOptions,
  type SignFileOptions,
  type UpdateIdentityOptions,
} from "./methods/identity.js";
export type {
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
} from "./methods/wallet-types.js";
export {
  WalletApi,
  mapAddressGroupings,
  mapCurrencyBalance,
  mapGetTransaction,
  mapGetWalletInfo,
  mapListedTransaction,
  mapOperationStatus,
  mapSignMessage,
  mapUnspentOutput,
  type GetBalanceOptions,
  type GetCurrencyBalanceOptions,
  type GetOperationStatusOptions,
  type GetTransactionOptions,
  type GetTransactionResult,
  type OperationError,
  type OperationResult,
  type OperationStatus,
  type SendCurrencyAndWaitOptions,
  type SendCurrencyAndWaitResult,
  type SendCurrencyOptions,
  type SendCurrencyOutput,
  type TransactionDetail,
} from "./methods/wallet.js";
