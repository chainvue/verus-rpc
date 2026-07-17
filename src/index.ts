// verus-rpc — the npm-published, precision-honest TypeScript client for
// talking to your own verusd. Every daemon RPC method is reachable; the common
// surface is curated with precise types.
//
// Invariant: no float ever crosses this API for a value field. Curated (T1)
// methods surface amounts as bigint satoshis; typed (T2) methods as exact
// decimal strings; `call()` is the always-available escape hatch that reaches
// every daemon method — typed or not — so coverage never blocks you.

export { amountParam, formatAmount, parseAmount, SATS_PER_COIN, type ParseAmountOptions } from "./amount.js";
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
  AddressIndexApi,
  mapAddressBalance,
  mapAddressDelta,
  mapAddressUtxo,
  type AddressBalanceResult,
  type AddressDelta,
  type AddressRangeOptions,
  type AddressUtxo,
  type SpentInfo,
} from "./methods/addressindex.js";
export {
  BlockchainApi,
  mapCoinSupply,
  mapGetTxOut,
  mapGetVdxfId,
  type CoinSupplyResult,
  type CreateRawTransactionInput,
  type GetTxOutResult,
  type GetVdxfIdResult,
  type RawTransactionOptions,
} from "./methods/blockchain.js";
export {
  ShieldedApi,
  type WaitForOperationOptions,
  type ZRescanOption,
  type ZReceivedEntry,
  type ZSendManyEntry,
  type ZSendManyOptions,
  type ZTotalBalanceResult,
  type ZUnspentEntry,
} from "./methods/shielded.js";
export {
  CurrencyApi,
  mapConversionEstimate,
  mapCurrencyConverterEntry,
  mapCurrencyDefinition,
  mapCurrencyState,
  type ConversionEstimate,
  type CurrencyConversionData,
  type CurrencyConverterEntry,
  type CurrencyDefinition,
  type CurrencyState,
  type CurrencyStateSnapshot,
  type EstimateConversionOptions,
  type GetCurrencyOptions,
  type GetCurrencyStateOptions,
  type ListCurrenciesEntry,
  type ListCurrenciesOptions,
  type ListCurrenciesQuery,
  type ReserveCurrencyState,
} from "./methods/currency.js";
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
