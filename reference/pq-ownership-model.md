# Post-quantum ownership and authorization

Discrete separates output detection from spend authorization with two independent, deterministic post-quantum keypairs.

| Role | Primitive | Purpose |
|---|---|---|
| View key | ML-KEM-768 | Detect and decrypt outputs addressed to the wallet |
| Spend key | ML-DSA-65 | Authorize spends and messages |

Both keypairs derive from the wallet seed. The public address contains the ML-KEM view public key and the ML-DSA spend public key; neither secret key is published.

## Output ownership

For each output, the sender chooses a fresh random `rho` and commits the output to the recipient's long-term spend public key:

```text
spend_commit = SHA3-256(
  "discrete-pq-spend-commit-v1" || spend_pub || rho
)
```

The sender can calculate this commitment from public address data, but cannot authorize a spend because it does not know `spend_sk`.

The output's ML-KEM ciphertext and authenticated encrypted payload deliver `rho` to the recipient's view key. A wallet recognizes an output only when decapsulation, authenticated decryption, and the spend commitment all agree.

## Spend authorization

To spend an owned output, the wallet reveals `spend_pub` and `rho`, then signs the transaction digest with the corresponding ML-DSA-65 secret key. Consensus verifies both:

1. `spend_commit` recomputes correctly from `spend_pub` and `rho`;
2. the ML-DSA signature verifies under `spend_pub`.

Knowing the view secret or having created the original payment is insufficient to spend. Spend authority rests solely on `spend_sk`.

## Double-spend prevention

Each consumed output publishes a deterministic nullifier:

```text
nullifier = SHA3-256(
  "discrete-pq-nullifier-v1" || spend_pub || rho
)
```

Because `rho` is unique per output, one long-term spend key still produces distinct nullifiers. Consensus rejects reuse of a nullifier.

## Tracking wallets

A tracking wallet holds `view_sk` and `spend_pub`, but not `spend_sk`. It can:

- detect incoming outputs;
- read their current public amounts;
- recompute ownership commitments and nullifiers;
- observe when owned outputs are spent.

It cannot create a valid spend signature. See [PQ wallet capabilities](../wallets/pq-wallet-capabilities.md) for the complete capability matrix.

## Privacy properties

- Unspent outputs expose only `spend_commit`; `rho` remains encrypted.
- Observers without `view_sk` cannot link unspent outputs to an address.
- A spend reveals `spend_pub` and `rho`, so spends made by one long-term identity are publicly linkable in the current plain-amount design.
- Tracking-key disclosure intentionally reveals wallet activity to the tracking-key holder.

These are the current Phase 1 properties. They must not be assumed to provide confidential amounts or unlinkable spends.
