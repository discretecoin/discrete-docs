# Exchange operations and recovery

Use these gates before enabling deposits or withdrawals and after every restart,
restore, binary change, node change, or incident.

## Startup gate

| Check | Evidence | Required result |
|---|---|---|
| Release identity | External deployment manifest | Expected binary versions and SHA-256 hashes |
| Wallet status | `getStatus` | Non-empty `lastBlockHash`, connected daemon, acceptable peers and height lag |
| Scanner status | Global `getBalance` | `scannedHeight` caught up to the safe daemon tip |
| Deposit mode | `getDepositScheme` | Expected `scheme`, `tracking`, and plausible `depositCount` |
| Account registration | `getAccountStatus` | Expected registered account and required finality for single-key-index |
| Address registry | `listDepositAddressesPage` | Wallet registry matches the exchange database |

Do not enable customer traffic until every row passes. `getStatus.version`
identifies the walletd build, but the response does not identify the node's
genesis block or P2P network id; pin those outside walletd.

## Service health signals

Monitor at least:

| Signal | Why it matters |
|---|---|
| `blockCount`, `knownBlockCount`, `localDaemonBlockCount` | Detect node/wallet lag |
| `getBalance.scannedHeight` | Detect wallet scanner lag |
| `peerCount` | Detect node isolation |
| `lastBlockHash` | Detect missing wallet chain state |
| `minimalFee` | Observe the node fee floor |
| issued registry count | Detect wallet/database drift |
| oldest pending deposit/withdrawal | Detect stuck accounting flows |
| count of `submission_unknown` | Force operator reconciliation instead of retry loops |

Pause crediting or withdrawals when health signals fall outside the exchange's
documented tolerance. A running process or HTTP `200` is not sufficient health
evidence.

## Registry reconciliation

For a large single-key-index registry:

1. Read `accountNumber` from `getAccountStatus`.
2. Read `depositCount` from `getDepositScheme`.
3. Page `listDepositAddressesPage` with both values supplied as expectations.
4. Require indices to continue from `T=1` without gaps or duplicates.
5. Stop issuance and investigate if `WRONG_PARAMETERS` reports that the expected
   account or count changed during traversal.

Restart the traversal from offset `0` after refreshing both expected values. Do
not treat an unregistered account as an empty registry.

## Backup and restore

Back up:

- encrypted wallet container;
- password or approved password-escrow material;
- mnemonic seed;
- deposit scheme;
- current issued-address registry and `depositCount`;
- exchange address-to-owner mapping; and
- last completely processed block height plus credit records.

The seed restores key material, but it does not encode how many addresses were
issued. The effect differs by scheme.

### Aggregated multikey

Every deposit has a derived spend key. The scanner must regenerate every key that
may own funds. Restore the total address count, including the primary address:

```text
restore-address-count = depositCount + 1
```

Example:

```bash
walletd --generate-container \
  --container-file restored.wallet \
  --container-password "$WALLET_PASSWORD" \
  --mnemonic-seed "<mnemonic>" \
  --restore-address-count 101 \
  --aggregated-multikey
```

Too small a count makes higher-index deposit funds invisible until the missing
keys are regenerated and the wallet is rescanned.

### Single key index

Current outContext-v2 outputs carry `T` in their encrypted context. The mnemonic
can discover funds sent to any `T` without enumerating an issued range:

```bash
walletd --generate-container \
  --container-file restored.wallet \
  --container-password "$WALLET_PASSWORD" \
  --mnemonic-seed "<mnemonic>" \
  --single-key-index
```

The issued registry still matters operationally. Restore the last issued cursor
before creating new addresses so walletd does not reuse a `T` already assigned
to a customer.

For explicitly suspected pre-outContext-v2 deposits at nonzero `T`, use the
off-by-default legacy recovery procedure documented in
[wallet behavior](wallet-behavior.md). Do not enable broad legacy scans as normal
operation.

## Restore acceptance

Restore into a separate environment and prove all of the following before the
backup is considered usable:

- expected primary account and deposit scheme;
- wallet scan reaches the intended chain tip;
- known historical deposit balances and transactions are visible;
- permanent address mappings reconcile;
- the next issued address does not reuse an earlier index; and
- no production RPC endpoint, key, database, or process was modified.

## Security boundary

- Bind walletd to localhost or a private service network.
- Use RPC authentication outside a single trusted local process boundary.
- Put TLS and network access control in a reverse proxy or private service mesh.
- Treat `getMnemonicSeed` and `getSpendKeys` as sensitive administrative calls.
- Keep hot-wallet balances limited and sweep under explicit policy.
- Remember that one single-key-index spend key controls all deposit buckets.
- Remember that the aggregated-multikey mnemonic derives every deposit spend key.

Payment proofs are a support/audit aid, not the normal deposit-crediting path.
See [payment-proof reference](../reference/payment-proof.md) for their exact
spend-authority boundary.

## Incident mode

When wallet/node identity, synchronization, registry, or accounting evidence is
uncertain:

1. stop new address issuance;
2. pause automated credits and withdrawals at the narrowest safe boundary;
3. preserve logs, hashes, heights, wallet history, and deployment identity;
4. reconcile before restarting automation; and
5. rerun the startup gate after corrective action.

Related: [Deposit integration](exchange-deposits.md),
[Withdrawal integration](exchange-withdrawals.md), and
[Qualification checklist](exchange-qualification.md).
