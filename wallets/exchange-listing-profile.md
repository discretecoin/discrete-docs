# XDS exchange listing profile

Copy-ready network and wallet facts for an exchange listing review. For
implementation steps, start with [Exchange integration](walletd-exchange-guide.md).

## Asset identity

| Field | Value |
|---|---|
| Asset | Discrete |
| Ticker | `XDS` |
| Chain type | Native proof of work; not an EVM token or contract |
| Precision | 2 decimal places |
| Atomic unit | `1 XDS = 100 atoms` |
| RPC amount type | Integer atoms |
| Node | `discreted` |
| Service wallet | `walletd` (PaymentGate JSON-RPC) |

## Mainnet identity and endpoints

| Field | Value |
|---|---|
| P2P | TCP `9330` |
| Node RPC | HTTP `9331` |
| walletd RPC | HTTP `9335` |
| P2P network id | `f53566d4-4d36-350e-5251-04c338fad823` |
| Genesis block | `06c4df2cd46045b9fbc1664a10f1bdf0355f672c8349bbd29d671bf48e83d7bd` |
| Mainnet address | Extended Bech32m-derived `disc1...` |
| Testnet address | Extended Bech32m-derived `tdisc1...` |

## Deposit integration

| Field | Recommended value |
|---|---|
| Wallet mode | `single-key-index` |
| Customer address | Unique H-I-A-T-C account number |
| First issued deposit | `T=1`; `T=0` is the primary account |
| Attribution | Positive normal `transfers[]` row for a permanently assigned address |
| Idempotency key | `(transaction_hash, deposit_address)` |
| Payment ID | Not required; do not use for new integrations |
| Confirmations | Exchange policy; pause crediting on stale-tip or fork warnings |

## Withdrawal integration

| Field | Value |
|---|---|
| Submit method | `sendTransaction` |
| Fee | Integer atoms; `fee: 0` requests the current wallet minimum |
| Change | Explicit wallet-owned `changeAddress` recommended |
| Client idempotency key | Not available in the current API |
| Ambiguous timeout | Stop automation and reconcile; never retry blindly |

> **Current limitation**
>
> JSON-RPC `id` correlates a response but does not identify a durable wallet
> operation. A lost `sendTransaction` response can hide a transaction that was
> already relayed.

## Required listing package

Do not approve a listing from a loose executable or an undated screenshot.
Request all of the following for the exact release candidate:

- source revision and release identifier;
- SHA-256 of every distributed archive and binary;
- clean-host launch evidence for `discreted` and `walletd`;
- testnet deposit, withdrawal, restart, reorg-window, and restore evidence;
- documented confirmation, hot-wallet, backup, and incident policies; and
- named rollback/recovery procedure.

Use the [Qualification checklist](exchange-qualification.md) for the acceptance
run and evidence packet. Use the [walletd RPC reference](walletd-rpc.md) for the
complete method schema.
