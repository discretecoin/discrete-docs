# Exchange qualification checklist

Run this checklist against the exact release candidate and integration build you
intend to deploy. Record evidence; do not convert a source review, compilation,
or unit-test result into a production claim.

## Gate 1: release artifact

Do not treat an executable copied from a compiler build directory as a portable
release.

- [ ] Record the source revision and release identifier.
- [ ] Record SHA-256 for every archive and binary.
- [ ] Extract into a clean directory on a clean host or VM.
- [ ] Run `discreted --version` and `walletd --version` there.
- [ ] Reject any package with a missing DLL/shared library or a dependency that
      is satisfied only by the build machine's global environment.
- [ ] Start both processes with throwaway testnet data and stop them cleanly.
- [ ] Confirm the package contains no wallet, seed, key, blockchain database, or
      operator configuration.

Passing a build or unit suite does not prove that the distributed package is
complete. Clean-host launch is a separate release gate.

## Gate 2: startup and identity

- [ ] Pin expected node/wallet hashes outside walletd.
- [ ] Pin the expected P2P network id and genesis block.
- [ ] Pass every [startup gate](exchange-operations.md#startup-gate) check.
- [ ] Confirm the configured deposit scheme and address registry.
- [ ] Confirm customer traffic remains disabled when any gate fails.

## Gate 3: deposits

Use synthetic wallets and testnet funds.

1. Register the single-key-index base account and wait for policy finality.
2. Create two deposit addresses and confirm the first is `T=1`.
3. Persist both address/index mappings before displaying them.
4. Pay the first address from an external wallet.
5. Poll `getTransactions`, wait for confirmations, and credit exactly once using
   `(transaction_hash, deposit_address)`.
6. Restart the scanner and rescan the reorg window; confirm no duplicate credit.
7. Transfer from the exchange wallet into its own second deposit address. Confirm
   that positive `transfer.amount` is credited even when whole-wallet
   `transaction.amount` is zero or negative because of the fee.
8. Restart walletd, traverse the issued registry, and confirm no address or `T`
   was reused.

## Gate 4: withdrawals

1. Submit a normal withdrawal and atomically store the returned hash.
2. Follow it through the configured confirmation threshold.
3. Exercise invalid destination, insufficient funds, missing change address, and
   an out-of-sync wallet. Each must fail closed without advancing accounting.
4. Through a controlled proxy/client test, forward a withdrawal request and drop
   the HTTP response.
5. Confirm the backend enters `submission_unknown`, keeps the operation locked,
   and does not automatically call `sendTransaction` again.
6. Reconcile the ambiguous case through the documented operator path.

## Gate 5: backup and recovery

1. Restore the backup into a separate test environment.
2. Verify primary account, scheme, and chain identity.
3. Rescan and confirm known deposit visibility.
4. Reconcile the permanent address table.
5. Issue the next test address and prove the cursor did not reuse an old index.
6. Confirm the restore did not contact or modify production infrastructure.

## Evidence packet

Retain:

| Evidence | Required detail |
|---|---|
| Build identity | Source revision, release id, archive/binary SHA-256 |
| Environment | OS, architecture, clean-host/VM image identity |
| Requests and responses | Sanitized fixtures for every acceptance case |
| Chain evidence | Network id, genesis, transaction hashes, block heights/hashes |
| Timing | Observation and confirmation timestamps |
| Accounting | State transitions and idempotency results |
| Recovery | Backup inputs, restore commands, reconciliation output |
| Exceptions | Every failed gate, owner, disposition, and retest |

## Approval boundary

| Result | Meaning |
|---|---|
| All gates passed on the exact candidate | Eligible for the exchange's own security and release approval |
| Documentation checks only | Integration design reviewed; runtime unqualified |
| Local wallet/node test only | Local behavior observed; package and production unqualified |
| Missing ambiguous-response test | Withdrawal automation unqualified |
| Missing restore rehearsal | Recovery unqualified |

A production listing must not rely on an undated screenshot, a different Core
revision, or an artifact that worked only on the build machine.
