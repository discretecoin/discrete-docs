# Discrete wallet behavior contract

The PQ wallet machinery **replaced** the pre-PQ Karbo/CryptoNote wallet rather than
extending it. This document is the checklist that converts "rediscover each behavior via
a bug" into "port each behavior deliberately." For every operation it states:

- **Reference behavior** — what the original CryptoNote/Karbo wallet did. The source of truth
  is the pre-PQ code in git history (before commit `b5833ae6`; a clean tree is
  `da185ed5`). When in doubt, read it: `git show da185ed5:src/Wallet/WalletGreen.cpp`.
- **Aggregated** / **Index** — behavior in each deposit mode (below).
- **Status** — ✅ covered by a named test · 🟡 implemented, only indirectly/​unit-tested ·
  ❌ gap (wrong or missing) · ⬜ not yet verified end-to-end.

The two deposit modes (`PqDepositScheme`):

| | **AggregatedMultikey** (default) | **SingleKeyIndex** (H-I-A-T-C) |
|---|---|---|
| Keys | one shared ML-KEM **view** key + a **per-deposit** ML-DSA spend key (`deriveDepositSpendKeys(seed, i)`) | **one** ML-KEM view + **one** ML-DSA spend key for everything |
| Deposit address | a PQ Bech32m address carrying the per-deposit spend pubkey | an **H-I-A-T-C account number** (base account H-I + subaddress index T) |
| On-chain registration | **not required** — a deposit address is self-contained | **once** — the wallet registers a single base account (H-I-A-C); H,I are that registration's (block height, tx index). Every deposit is then an **H-I-A-T-C subaddress** under it (issue freely, no per-deposit registration). |
| Output attribution on scan | match the recovered spend pubkey to the per-deposit pubkey | recover subaddress index **T** from the output by decapsulation |
| Spend authority for a deposit output | the **per-deposit** spend secret | the one spend secret (T is routing only) |

Everywhere an address is accepted, the same three selector forms are interchangeable
(commit `7792c1dd`): a raw PQ **address**, an **H-I-A-C / H-I-A-T-C** account
number, or a numeric **address index** (0 = primary, 1.. = deposit in issue order).

**Both modes are HD / single-mnemonic.** One 32-byte master seed (the mnemonic) derives
the shared ML-KEM view key, the primary ML-DSA spend key, and — under AggregatedMultikey
— every per-deposit spend key (`deriveDepositSpendKeys(seed, i)`). So a single mnemonic
restores the entire wallet (primary + all deposits) in either mode — but the deposit
**count** is not in the seed (it lives only in the wallet file), so a seed-only restore
must be told how many deposits to regenerate via **`restore-address-count`** (total
addresses incl. the primary). This is **required** to recover AggregatedMultikey deposit
funds: each deposit output commits to a distinct derived spend key, and the scanner only
recognizes an output whose key it has reserved (`generateNewWallet` now reserves
`restore-address-count − 1` deposits on restore — commit pending in this series).

**Discrete is HD-only:** the pre-PQ "independent spend keys" mode (each address
a standalone key with no mnemonic, backed up individually) is **not offered** — PQ secret
keys are multi-kilobyte (ML-DSA-65 secret ≈ 4 KB), so per-key backup is impractical, and
the HD deposit model already serves the exchange/many-address use case from one seed.
(The `--independent-addresses` flag has been **removed** (commit in this series): it was
ignored by `generateNewWallet` and `getAddressCount` = 1 + HD deposits. The leftover
multi-record `createAddressList` path is dead and still slated for removal.
`restore-address-count` is **kept and wired**, per above.)

---

## A. Identity & addresses

| Operation | Reference behavior | Aggregated | Index | Status |
|---|---|---|---|---|
| Primary identity | seed → spend/view keys | 32-byte `SeedMaster` → HKDF-SHA3-256 roots → `deriveSpendKeys`/`deriveViewKeys` | same | ✅ `PqDeriveTests`, `PqWalletSyncE2E` |
| `getAddresses` / `getAddressesCount` | primary + every subaddress | index 0 = primary PQ address; 1.. = deposit PQ addresses | index 0 = primary; 1.. = H-I-A-T-C numbers | 🟡 `PaymentGateTest.addressIndexAndAccountNumberSelectors` (1 deposit) |
| `createPqDepositAddress` | derive next subaddress | derive per-deposit spend key, return PQ address; **no registration needed** | return H-I-A-T-C; **requires confirmed registration** | ✅ Aggregated `AggregatedDepositReceivesAndSpends`; ✅ Index `IndexModeRegistersAndIssuesHITC` |
| `listPqDepositAddresses` | enumerate subaddresses | list issued deposits + indices | same (needs registration) | ⬜ |
| `getPqDepositScheme` | n/a | reports `aggregated-multikey` + count | reports `single-key-index` + count | ⬜ |
| `validateAddress` (RPC) | parse + report validity | accepts PQ address, H-I-A-C/H-I-A-T-C, or index | same | ✅ `addressIndexAndAccountNumberSelectors` |
| selector resolution | n/a | index/address/account-number → bucket | same | ✅ same test |

## B. Registration (PQ-specific)

| Operation | Aggregated | Index | Status |
|---|---|---|---|
| `registerPqAccount` (free, PoW) / `registerPqAccountPaid` (fee TX_PQ) | optional (only needed for a short account number for the **primary**) | **once** — register the base account (H-I-A-C); all deposits are H-I-A-T-C subaddresses under it | ✅ free path `PaymentGateTest.IndexModeRegistersAndIssuesHITC`; ⬜ paid |
| `getPqAccountStatus` | reports registered + H-I-A-C number once the reg tx confirms | same | ✅ `IndexModeRegistersAndIssuesHITC` |

## C. Receiving / balance

| Operation | Reference behavior | Aggregated | Index | Status |
|---|---|---|---|---|
| Output detection | scan with view key | shared view key decapsulates every owned output | one view key | ✅ `PqScanTests`, `PqWalletSyncE2E` |
| Bucket attribution | by subaddress | match per-deposit spend pubkey | recover subaddress **T** | ✅ Aggregated `AggregatedDepositReceivesAndSpends`; ✅ Index `SingleKeyIndexAttributesDepositsByT` |
| `getBalance` (global) | total / unlocked | `availableBalance` = spendable now; `lockedAmount` = pending + immature/timelocked | same | ✅ `PqWalletSyncE2E`, `PqConsumerTests` |
| `getBalance(address)` | per-subaddress actual + locked | same spendable/locked split for one bucket | same | ✅ Aggregated (funded) `AggregatedDepositReceivesAndSpends`; ⬜ Index |
| output spend-lock / coinbase maturity | locked until `minedMoneyUnlockWindow` | enforced via `unlockHeight` in `spendableInputs` + chain-context | same | ✅ mechanism `PqWalletIntegration.LockedOutputNotSpendableUntilUnlockHeight` |

## D. History

| Operation | Reference behavior | Aggregated | Index | Status |
|---|---|---|---|---|
| `getTransactions` / `…Hashes` / `getUnconfirmedTransactionHashes` | filter by address(es) + paymentId + block range | per-bucket filter; accepts PQ addr / account number / index | same | 🟡 filter tested with stubs + selectors; ⬜ deposit tx filter not E2E |
| per-address transfers | one `WalletTransfer` per owned address the tx touched | `transfersByDeposit` → primary + deposit transfers | same | 🟡 `WalletLedger`-level |
| `getTransaction(hash)` | tx detail | from the PQ ledger | same | ✅ `PqWalletSyncE2E` |

## E. Sending / spending

| Operation | Reference behavior | Aggregated | Index | Status |
|---|---|---|---|---|
| coin selection / fee / denominations | largest-first, two-pass fee, change | shared `buildPqSend` | same | ✅ `PqSenderTests` |
| **spend authority per input** | sign with the key the output committed to | **per-deposit** key for deposit inputs, primary for primary | the **one** key for all | ✅ `PqTxBuilder.PerInputDepositKeysPassConsensus`, `PqSender.AggregatedDepositInputSignedWithDepositKey` / `SingleKeyIndexUsesOneKeyForDeposits` |
| `sendTransaction` sources | restrict spend to given addresses | `sourceBuckets` filter | same | ✅ `PqSender.SourceBucketFilterRestrictsInputs` |
| **change destination** | explicit `changeAddress` (valid+ours) → sole address → sole source → else `CHANGE_ADDRESS_REQUIRED` | change re-scans into the chosen bucket (`pqChangeTemplate`) | same (T carried) | ✅ `PaymentGateTest.ChangeDestinationRuleMatchesCryptoNote`, `PqSender.ChangeRoutedToChangeDestination` |
| relay / reserve / rollback-on-fail | add-before-relay, delete-on-fail | `addUnconfirmedTransaction` then relay; rollback on relay error | same | ✅ `PqWalletIntegration.RelayFailureRollsBackReservation` |

## F. Keys / backup / signing

| Operation | Reference behavior | PQ behavior | Status |
|---|---|---|---|
| `getSpendkeys(address)` | per-address spend keypair | any of our addresses → the 32-byte master seed (id = hash(seed)) | ✅ `PaymentGateTest.getSpendKeysAcceptsOwnAddress` |
| `getViewKey` | view secret | not used by PQ (null); PQ tracking key is the audit credential | ✅ `MessageSigningMnemonicAndViewKeyShape` |
| `getMnemonicSeed` | per-address electrum words | single identity → master seed as electrum words (address ignored); round-trips to the seed | ✅ `MessageSigningMnemonicAndViewKeyShape` |
| `signMessage` / `verifyMessage` | **per-address** signature | ML-DSA; under AggregatedMultikey signs with the addressed deposit's OWN key (SingleKeyIndex/primary use the one key); empty selector = primary | ✅ `MessageSigningMnemonicAndViewKeyShape` (primary; caught+fixed a wrong-key bug) + `AggregatedPerSubaddressMessageSigning` (per-deposit) |

## G. Lifecycle / sync

| Operation | Reference behavior | PQ behavior | Status |
|---|---|---|---|
| save / load | persist + restore wallet | v9 container + persisted PQ ledger; balance/history restore without rescan | ✅ `PqWalletIntegration.BalanceSurvivesSaveAndReload` |
| reorg / detach | roll back balance + history | `WalletLedger::rollbackToHeight` on `onBlockchainDetach` | ✅ primary `ReorgDetachReversesCredit`; ✅ deposit `DepositCreditReversedOnReorg` |
| tracking / view-only | scan, refuse to spend | zero seed → scan via tracking key, `sendPqTransfer` throws | ✅ `PqWalletIntegration.TrackingWalletCannotSpend` |
| reset / rescan | re-scan from a height | re-derives the ledger | ✅ `PqWalletIntegration.ResetRescansLedger` |
| `getStatus` / `getBlockHashes` | node/sync status | pass-through | 🟡 low risk |
| mining keys from wallet | n/a | `MiningKeyLoader` reads the seed (both wallet formats) | ✅ `PqChainTests`, mining path |
| simplewallet (`WalletLegacy`) PQ identity | address + message signing | derives identity from the seed; signs ML-DSA verifying against its address | ✅ `WalletLegacySmoke.PqIdentityAndSigning` |
