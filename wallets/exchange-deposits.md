# Deposit integration

This page defines the production path from issuing a customer address to
creating one durable exchange credit.

```text
issue address -> persist assignment -> observe transfer -> wait for policy
      -> credit once -> rescan recent blocks -> reconcile reorgs
```

## Choose a deposit model

| Mode | `createDepositAddress` returns | First deposit | Restore requirement |
|---|---|---|---|
| `single-key-index` | H-I-A-T-C account number | `T=1` | Seed discovers current outContext-v2 funds at any `T`; preserve the issued cursor to prevent reuse |
| `aggregated-multikey` | Full PQ address | Deposit index `0` | Seed plus total issued address count is required for fund visibility |

Use `single-key-index` for a conventional exchange integration unless you
specifically require a derived spend key per deposit.

## Issue addresses safely

At startup:

1. Call `getDepositScheme` and require the configured scheme.
2. For `single-key-index`, require a registered and sufficiently final base
   account from `getAccountStatus`.
3. Reconcile the wallet registry with `listDepositAddressesPage`.
4. Stop issuance if the wallet registry and exchange database disagree.

For each customer or invoice:

1. Create the exchange database reservation.
2. Call `createDepositAddress` once.
3. Atomically store the returned `address`, returned `index`, customer/invoice
   id, scheme, and creation time.
4. Display the address only after the mapping is durable.

> **Permanent assignment**
>
> Never recycle or reassign an issued address. Closing an account does not stop
> its former owner from sending to that address later.

### Address indexes

There are two related numbers:

| Name | Meaning |
|---|---|
| Deposit index / `T` | Deposit bucket inside the PQ wallet and, in single-key-index mode, the `T` in H-I-A-T-C |
| Numeric address selector | Position accepted by RPC fields that allow a wallet address selector |

Selectors always include the primary wallet at `"0"`:

```text
selector "0" -> primary wallet address
selector "1" -> first issued deposit
selector "2" -> second issued deposit
```

In `single-key-index`, the first deposit has `T=1`. In
`aggregated-multikey`, the first returned deposit index is `0`, but its numeric
selector is still `"1"`. Prefer storing and querying the returned address string.

## Scanner state

Persist at least:

| State | Purpose |
|---|---|
| `last_scanned_height` | Highest completely processed height |
| `reorg_window` | Recent block range rescanned every cycle |
| `required_confirmations` | Exchange credit threshold |
| deposit address table | Permanent address-to-owner mapping |
| credits table | Unique key on `(transaction_hash, deposit_address)` |

## Polling loop

For each cycle:

1. Call `getStatus`.
2. Call global `getBalance` and read `scannedHeight`.
3. Calculate `daemon_tip_height = localDaemonBlockCount - 1`.
4. Calculate `safe_tip = min(daemon_tip_height, scannedHeight)`.
5. Calculate `from = max(0, last_scanned_height - reorg_window)`.
6. Page `getTransactions` from `from` through `safe_tip`.
7. Apply the credit filter below to every transaction transfer.
8. Advance `last_scanned_height` only after the complete page is stored.

Pause crediting if the daemon is stale, wallet scanning is behind, or the
operator's fork/finality policy is not satisfied.

## Credit filter

```text
transaction.state == 0                 # SUCCEEDED
transaction.isBase == false            # not coinbase
transaction.confirmations >= required_confirmations
transfer.type == 0                     # USUAL
transfer.amount > 0                    # incoming for this address
transfer.address is in the permanent deposit table
```

The transfer row is the attribution source. `transaction.amount` is the net
effect across the entire wallet and must not be used as a positive-value gate.
A hot-wallet self-transfer can produce:

```text
destination transfer.amount > 0
whole-wallet transaction.amount <= 0   # normally the fee is the net loss
```

Filtering on the wallet total would silently miss the deposit.

## Create one durable credit

Store:

```text
deposit_address = transfer.address
transaction_hash = transaction.transactionHash
amount = transfer.amount
block_height = transaction.blockIndex
block_hash = items[].blockHash
confirmations = transaction.confirmations
timestamp = transaction.timestamp
```

Enforce a unique key on `(transaction_hash, deposit_address)`. If the same key
ever appears with a different amount, stop and alert instead of overwriting it.

## Unconfirmed transactions

`getUnconfirmedTransactionHashes` is useful for operator visibility, not for
crediting. A mempool transaction can disappear or be replaced by a variant with
a different hash.

Treat a pre-confirmation hash as provisional. Credit against the hash returned
by `getTransactions` at the required confirmation threshold.

## Reorganizations

Always rescan recent blocks:

```text
from = max(0, last_scanned_height - max(reorg_window, required_confirmations + 5))
```

For an observed but uncredited transaction that disappears, mark it orphaned or
keep it pending according to policy. For already credited deposits, retain block
height and block hash so the finality window can be reconciled explicitly.

## Deposit implementation checklist

- [ ] Address assignment is durable before customer display.
- [ ] Issued addresses are never reused.
- [ ] Registry/database mismatch stops new issuance.
- [ ] The scanner uses wallet and daemon height gates.
- [ ] Crediting uses positive `transfers[]`, not whole-wallet amount.
- [ ] Credits are idempotent on `(transaction_hash, deposit_address)`.
- [ ] Recent blocks are rescanned and block hashes are retained.
- [ ] Mempool observation never creates a final credit.

Related: [walletd deposit addresses](walletd-deposit-addresses.md),
[Operations and recovery](exchange-operations.md), and
[Qualification checklist](exchange-qualification.md).
