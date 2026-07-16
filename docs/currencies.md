# Currencies, conversion & marketplace

`client.currency`.

## Reads (T1)

```ts
await client.currency.getCurrency({ currency: "Bridge.vETH" });
await client.currency.getCurrencyState({ currency: "Bridge.vETH" });
await client.currency.listCurrencies({ query: { systemType: "pbaas" } });
await client.currency.getCurrencyConverters({ currencies: ["VRSC", "DAI.vETH"] });
```

Every 8-decimal value — supply, reserves, fees, conversion prices, **and**
reserve weights — is `bigint` scaled by 1e8, exactly as the daemon emits it.
Format for display with `formatAmount`.

`getCurrencyConverters` returns each converter's full definition under its
own currency-id key; the client detects that structurally and maps it as a
T1 `CurrencyDefinition`.

## Conversion estimation

```ts
const estimate = await client.currency.estimateConversion({
  currency: "VRSC",
  convertTo: "DAI.vETH",
  via: "Bridge.vETH",
  amount: parseAmount("1"),
});
estimate.estimatedcurrencyout;   // bigint (1e8-scaled)
```

## Marketplace (T2)

`makeOffer`, `takeOffer`, `getOffers`, `listOpenOffers`, `closeOffers` plus
`getReserveDeposits`, `getLaunchInfo`, `getInitialCurrencyState`. Offer/for
structures are deeply polymorphic (identity ↔ currency ↔ NFT), so these take
the daemon's offer JSON directly. `getOffers` needs `isCurrency: true` when
querying a currency rather than an identity.

## Not covered here

`definecurrency` (deep options), notarization/export/import internals stay in
the `call()` escape hatch (T3) until there is demand to curate them.
