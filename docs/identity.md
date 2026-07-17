# Identity (VerusID)

`client.identity`. Reads are T1 (curated); signatures/trust are T2
(passthrough); lifecycle is T1 with a guided flow helper.

## Reads

```ts
await client.identity.getIdentity({ nameOrAddress: "name@" });
await client.identity.getIdentityContent({ nameOrAddress: "name@" });
await client.identity.getIdentityHistory({ nameOrAddress: "name@" });
await client.identity.listIdentities();                 // wallet's own
await client.identity.getIdentitiesWithAddress({ address: "R…" });
```

The index methods (`getIdentitiesWithAddress/-Revocation/-Recovery`) return
**flat** identity definitions, not `{ identity: … }` wrappers.

## Registration flow

Registration is a two-step commit/reveal. The helper runs both with a
confirmation wait in between:

```ts
const { commitment, registrationTxid } = await client.identity.registerIdentityFlow({
  name: "myname",
  controlAddress: "R…",         // single-sig identity controlled by this address
});
```

The `commitment` is returned even on later failure paths so a paid
commitment is never silently lost. Need custom authorities/multisig? Pass
`identity` overrides, or drive `registerNameCommitment` → `registerIdentity`
yourself.

## Lifecycle

```ts
await client.identity.updateIdentity({ identity: modified });
await client.identity.revokeIdentity({ nameOrId: "name@" });
await client.identity.recoverIdentity({ identity: recovered });
await client.identity.setIdentityTimelock({ nameOrId: "name@", setUnlockDelay: 20 });
```

`feeOffer` on any lifecycle method is `bigint` sats.

## Signatures & trust (T2)

`signData`, `signFile`/`verifyFile`, `verifyHash`, `verifySignature`,
`getIdentityTrust`/`setIdentityTrust` — daemon JSON in, daemon JSON out
(safe-number converted). When verifying identity signatures for
authentication, pass `checkLatest: true` so a revoked identity does not keep
verifying against its historical state.

**Daemon bug, v1.2.x** (source- and live-verified): `getIdentityTrust` always
answers `null` — the handler builds its `{setratings, identitytrustmode}`
result on an uninitialized `UniValue`, so every field is silently dropped.
Its id-array filter is never read either. The return type is therefore
`Record<string, unknown> | null`; the declared shape is kept for daemons that
fix it. `client.currency.getCurrencyTrust` has the identical bug.
