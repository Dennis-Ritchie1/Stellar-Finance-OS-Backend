# @finance-os/stellar

Stellar helpers shared by the API, indexer and worker. Public keys only. Nothing here
signs, stores or accepts a secret key (AGENTS.md #1).

| Module     | What it does                                                                       |
| ---------- | ---------------------------------------------------------------------------------- |
| `address/` | Checksum validation; muxed `M...` derive/decode (README §5.1)                      |
| `asset/`   | `AssetRef` ↔ SDK `Asset`; equality includes the issuer                             |
| `memo/`    | Memo validation (28-byte text, uint64 id, 32-byte hash); invoice memo fallback     |
| `tx/`      | `buildPaymentTransaction` (unsigned XDR) and `verifySignedPayment` (README §7)     |
| `horizon/` | `HorizonClient` (sequence, balances, submit) and `HorizonPaymentSource`            |
| `wallet/`  | SEP-53 signed-message verification for wallet linking                              |

## Signed XDR verification

`verifySignedPayment(xdr, intent, { networkPassphrase, expectedHash })` rejects the
signed transaction unless:

- it is the exact transaction we built (`expectedHash`; signatures don't change the hash),
- it has a single `payment` op with the approved destination, asset (code **and**
  issuer), amount and memo, from the approved source,
- at least one signature verifies against an allowed signer for **this** network's
  passphrase. A mainnet-signed copy of the same body fails here.

## Data source

`PaymentSource` hides whether payments come from Horizon, Stellar RPC or a third-party
indexer (README §6). `HorizonPaymentSource` handles streamed payments one at a time, in
order, and stops at the first failure, so a persisted cursor never skips a payment.
`account_merge` amounts are read from the operation's effects. Claimable-balance claims
aren't returned by the payments endpoint and aren't indexed yet.
