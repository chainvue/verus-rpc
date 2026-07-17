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

## Currency trust (T2)

```ts
await client.currency.getCurrencyTrust();                       // → null on v1.2.x, see below
await client.currency.setCurrencyTrust({ currencytrustmode: 1 });
```

The wallet's per-currency trust ratings — the twin of
`getIdentityTrust`/`setIdentityTrust` in [`identity.md`](./identity.md), and
it carries the same daemon bugs (source-verified against v1.2.17):

- `getCurrencyTrust` **always returns `null`** (result built on an
  uninitialized `UniValue`), and its `currencyIds` filter is never read.
  Typed `Record<string, unknown> | null` accordingly.
- `setCurrencyTrust` honours `setratings` **only as an id→rating object map**
  — the objarray shape in the daemon's own help text is silently skipped —
  and it reads `currencytrustmode` without ever applying it. The call returns
  success either way, so **do not assume the mode changed.**
