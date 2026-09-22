# walletd PQ Deposit Addresses

`walletd` creates one PQ master identity from a mnemonic seed. Deposit addresses
are deterministic children of that seed. The restore role of the issued-address
count depends on the deposit scheme; it is not the same for
`aggregated-multikey` and `single-key-index`.

For the full exchange workflow, mode selection, and H-I-A-T-C guidance, see
the [walletd exchange integration guide](walletd-exchange-guide.md). For H-I-A-C
and H-I-A-T-C checksum semantics, reorganization risk, and confirmation policy,
see the [account-number guide](account-numbers.md).

## Creating a Container

```bash
walletd --generate-container --container-file exchange.wallet --container-password "password"
```

The primary address is index `0`. Each `createDepositAddress` call reserves the
next deposit index.

## Restoring Deposits

The seed does not store how many deposit addresses were issued.

### Aggregated multikey

Each deposit uses a derived spend key. The scanner must regenerate every issued
key, so `--restore-address-count` is required for fund visibility. Pass the total
address count: the primary address plus all deposit addresses that may have
received funds.

```bash
walletd --generate-container \
  --container-file restored.wallet \
  --container-password "password" \
  --mnemonic-seed "25 word seed ..." \
  --restore-address-count 100
```

`--scan-height` can be combined with restore to avoid scanning earlier blocks.

### Single key index

All deposits share one spend key and carry `T` in the encrypted output context.
With current outContext-v2 outputs, the mnemonic is sufficient to recover funds
sent to any `T`; `--restore-address-count` is not required for visibility.

The issued-address cursor is still operationally critical. Restore it from the
wallet container or the exchange's permanent address table before issuing new
addresses, otherwise `createDepositAddress` can reuse a `T` previously assigned
to a customer. Never reassign an old H-I-A-T-C address to someone else.

## Deposit Schemes

`AggregatedMultikey` is the default. It uses one ML-KEM view key and a derived
ML-DSA spend key per deposit address. Spending a deposit output requires the
matching derived spend key.

`SingleKeyIndex` uses one spend key and routes deposits by account-number index.
It requires account registration before deposit subaddresses can be issued.

## Exchange Backup Checklist

Back up the container file, container password, mnemonic seed, deposit scheme,
and highest issued address count. For `aggregated-multikey`, the count is needed
to recover deposit visibility. For `single-key-index`, it preserves issuance
continuity and prevents address reuse even though current outputs remain
discoverable from the seed alone.
