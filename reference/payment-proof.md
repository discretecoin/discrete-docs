# Payment proofs

Discrete creates a payment proof for each recipient when a wallet sends a PQ
transaction. The payer can share this off-chain receipt when a payment needs to
be confirmed or investigated.

## What a proof shows

A valid proof is bound to one network and transaction. For its listed outputs,
it verifies the recipient's ML-DSA spend authority and totals the public on-chain
amounts. Read the result as **at least this amount was paid to this spend
authority in this transaction**, because a proof can omit outputs but cannot add
outputs belonging to another spend authority.

A payment proof does not prove that:

- the recipient wallet detected or decrypted the payment;
- the output was delivered to the recipient's ML-KEM view key; or
- a particular SingleKeyIndex deposit index `T` was used.

Exchanges should continue to confirm deposits by scanning with their view key.
A payment proof is supporting evidence for a disputed or missed payment, not a
replacement for normal wallet scanning.

## Using simplewallet

After `transfer`, `simplewallet` prints the transaction ID and the newly created
proof. The proof is also recorded in the wallet's sent-payment metadata.

List the locally stored recipient rows for a transaction:

```text
payment_proof <txid>
```

Export every recipient row, or only one row by its displayed index:

```text
export_payment_proof <txid> <path>
export_payment_proof <txid> <recipient-index> <path>
```

Import a record supplied by someone else:

```text
import_payment_proof <path>
```

Import fetches the referenced transaction, verifies the record, and stores it in
the current wallet cache. There is no separate verify-only command, so delete the
imported record afterward if it is not needed:

```text
delete_payment_proof <txid> [recipient-index]
```

Deletion requires typing `DELETE` at the confirmation prompt.

## Using walletd

| Method | Purpose |
|---|---|
| `sendTransaction` | Returns one proof per transfer in `paymentProofs` and records the recipient rows in the wallet. |
| `getPaymentProofs` | Returns stored `address`, `amount`, `proof`, and transaction `state` rows for a `transactionHash`. |
| `exportPaymentProof` | Returns a portable `recordHex`; set `recipientIndex` to export one row. |
| `importPaymentProof` | Verifies a `recordHex`, stores it, and returns its `transactionHash`. |
| `deletePaymentProof` | Deletes all rows or one `recipientIndex`; `confirm` must be `true`. |
| `save` | Writes the current wallet state, including payment-proof metadata, to the wallet file. |

`importPaymentProof` also serves as walletd's verifier. It stores a valid record,
so use `deletePaymentProof` afterward if the wallet should not retain it.

## Storage and backups

Payment proofs are ordinary sent-payment metadata in the wallet's standard
encrypted cache. They are written to the wallet file by the normal save path.

After sending, importing, or deleting a proof, save the wallet. A clean
`simplewallet` exit and a normal walletd shutdown also save it. A crash before
the next save can lose the latest in-memory changes.

The proof witness is not stored on-chain and is not derived from the mnemonic.
A cache reset or mnemonic-only restore therefore cannot reconstruct it. A wallet
backup made after saving includes the cached proofs; for important records, keep
an explicit export with the backup as well.

Share proofs only when needed. A proof links its covered outputs and public
amounts to a recipient spend authority.
