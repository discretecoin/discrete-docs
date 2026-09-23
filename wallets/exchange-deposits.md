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

## H-I-A-T-C resolver boundary

An H-I-A-T-C number carries registration coordinates, a deposit index `T`, a
check character, and a 20-bit key fingerprint `A`. It does not carry the
recipient's full public keys. `walletd` therefore relies on its connected daemon
to resolve the base registration before it can publish or pay an account number.

Treat `A` as an accidental-mismatch and reorganization failsafe, not as
authentication of an arbitrary resolver. Run `walletd` against the exchange's
own synced `discreted`. If an externally operated daemon is unavoidable, it must
be an endpoint the operator has explicitly approved under the wallet's resolver
trust policy. A trust failure is a stop condition: do not suppress
`UNTRUSTED_DAEMON`, substitute newly returned keys, or switch silently to another
resolver.

See [Account numbers](account-numbers.md#resolver-trust) for the complete trust
model. A full PQ address does not need account-number resolution, but it is not a
drop-in replacement for an H-I-A-T-C deposit because it does not preserve the
same `T` routing identity.

## Issue addresses safely

At startup:

1. Call `getDepositScheme` and require the configured scheme.
2. For `single-key-index`, require a registered and sufficiently final base
   account from `getAccountStatus`.
3. Reconcile the wallet registry with `listDepositAddressesPage`.
4. Stop issuance if the wallet registry and exchange database disagree.

For each customer or invoice:

1. Acquire one exclusive address-issuance lock for the wallet.
2. Create the exchange database reservation and store the current
   `accountNumber` and `depositCount` with it.
3. Call `createDepositAddress` once.
4. Atomically store the returned `address`, returned `index`, customer/invoice
   id, scheme, and creation time.
5. Display the address only after the mapping is durable, then release the lock.

### Ambiguous `createDepositAddress` response

A timeout, disconnect, malformed body, or truncated response is ambiguous. The
request may have reserved and saved a new address even though the caller did not
receive it. Enter `issuance_unknown`, keep the original database reservation and
exclusive issuance lock, and do not call `createDepositAddress` again yet.

After proving the original request is no longer in flight, reconcile against the
same walletd instance:

1. Read the current `accountNumber` and `depositCount`.
2. Traverse `listDepositAddressesPage` with those values fixed for the traversal.
3. Compare the result with the registry snapshot stored before the call.
4. If the registry is unchanged, record that no address was issued before an
   operator-approved retry of the same reservation.
5. If exactly one new address exists and exclusive issuance proves no other
   request could have created it, bind that address and `T` to the original
   reservation.
6. If ownership cannot be proved, permanently quarantine every unexplained new
   address. Never display, delete, recycle, or assign it to another customer.
7. If the account identity changed, more than one address appeared, or the
   registry cannot be read consistently, keep issuance stopped and enter incident
   handling.

This is an address-allocation reconciliation rule, not a general retry promise.
The current API has no caller-supplied idempotency key for address issuance.

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
- [ ] H-I-A-T-C publication and resolution use the intended trusted daemon.
- [ ] Ambiguous address issuance enters `issuance_unknown` and never blind-retries.
- [ ] Every unexplained issued address is permanently quarantined.
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
