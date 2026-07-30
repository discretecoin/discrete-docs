# Wire format — Frozen Constants

> **DO NOT CHANGE any value in this file after the Discrete mainnet launch.**
> Every item below is consensus-critical: an independent implementation that
> disagrees on even one byte produces a different chain and cannot sync.
> Changes require a hard fork with a new domain tag or a bumped version byte.
>
> **One documented exception: `outContext` (§5).** Nodes never compute or
> validate `outContext` — it exists only so sender and receiver wallet
> software agree on the AEAD key for a given output. Consensus enforces the
> wire sizes it produces (`PQ_ENC_PAYLOAD_SIZE` etc., §2) and the fields that
> actually enter `txSigningDigest` (§6) and the nullifier, none of which
> `outContext`'s internal formula affects. Its derivation was therefore
> revised post-launch (`-v1` → `-v2`, see §5) as a wallet-software-only
> change — no hard fork, no genesis change, no wire-format change.

Each constant is pinned by `tests/test_pq_domains.cpp`.  CI will fail on any
edit to a constant or to that test file's expected values.

---

## 1. Transaction wire format

| Constant | Value | File |
|---|---|---|
| `TRANSACTION_VERSION_1` | `1` | `src/CryptoNoteConfig.h` |
| `TX_COINBASE` (txType) | `0x00` | `include/PqTxType.h` |
| `TX_PQ` (txType) | `0x01` | `include/PqTxType.h` |
| `0x02` (permanently reserved; no named constant; consensus rejects) | `0x02` | `include/PqTxType.h` |
| `TX_FREE_REG` (txType) | `0x03` | `include/PqTxType.h` |

---

## 2. PQ blob size constants (consensus-enforced)

| Constant | Value (bytes) | Meaning |
|---|---|---|
| `PQ_KEM_CIPHERTEXT_SIZE` | `1088` | ML-KEM-768 ciphertext |
| `PQ_ENC_PAYLOAD_SIZE` | `56` | ChaCha20-Poly1305(rho \|\| LE64(T)): 40 ct + 16 tag |
| `PQ_AUTH_PUB_SIZE` | `1952` | ML-DSA-65 public spend key |
| `PQ_RHO_SIZE` | `32` | per-output blinding value |
| `PQ_SIGNATURE_SIZE` | `3309` | ML-DSA-65 signature |

All defined in `include/CryptoNote.h`.

---

## 3. Domain-separation tags (ASCII, trailing NUL excluded)

All tags are in `src/crypto_pq/PqDerive.h` and `src/crypto_pq/PqSeed.h`.
The bytes hashed are the ASCII contents of the string **without** any trailing
NUL terminator.

### Transaction derivation (PqDerive.h)

| Constant | String (ASCII) | Len |
|---|---|---|
| `kDomainInputsHash` | `discrete-pq-inputs-hash-v1` | 26 |
| `kDomainOutContext` (legacy — receiver-side fallback only, §5) | `discrete-pq-out-context-v1` | 26 |
| `kDomainOutContextV2` (current) | `discrete-pq-out-context-v2` | 26 |
| `kDomainAeadKey` | `discrete-pq-aead-key-v1` | 23 |
| `kDomainSpendCommit` | `discrete-pq-spend-commit-v1` | 27 |
| `kDomainNullifier` | `discrete-pq-nullifier-v1` | 24 |
| `kDomainTxSign` | `discrete-pq-tx-sign-v1` | 22 |
| `kDomainCoinbaseRho` | `discrete-coinbase-rho-v1` | 24 |

### Seed / key derivation (PqSeed.h)

| Constant | String (ASCII) | Len |
|---|---|---|
| `kDomainViewRoot` | `discrete-pq-view-root-v1` | 24 |
| `kDomainSpendRoot` | `discrete-pq-spend-root-v1` | 25 |

### Free-registration proof of work (PqValidation.h)

| Constant | String (ASCII) | Len |
|---|---|---|
| `FREE_REG_POW_DOMAIN` | `discrete-pq-free-reg-pow-v1` | 27 |

The proof preimage is `domain || viewPub || spendPub || refBlockHash || LE64(nonce)`.
Both public keys are consensus-bound so a proof for one identity cannot be replayed
with different spend keys.

### DiscretePower (CryptoNoteFormatUtils.h)

| Constant | String (ASCII) | Len | SHAKE output |
|---|---|---:|---:|
| `DISCRETE_POWER_HEADER_DOMAIN` | `DiscretePower/v2/header` | 23 | 64 B (H) |
| `DISCRETE_POWER_MEMORY_DOMAIN` | `DiscretePower/v2/memory` | 23 | 32 B (P) |
| `DISCRETE_POWER_SIGN_DOMAIN` | `DiscretePower/v2/sign` | 21 | 64 B (m) |
| `DISCRETE_POWER_FINAL_DOMAIN` | `DiscretePower/v2/final` | 22 | 32 B (PoW) |

These tags define the SHAKE-256 transcript around the `yespower-discrete` memory-hard
core, into which the raw ML-DSA-65 signature tape is injected. All
`DiscretePower/v1/*` tags are retired. See the [DiscretePower specification](pow.md)
(revision D) for the normative composition and the [DiscretePower summary](pow.md).

### Reserved (Phase 2, must not be used by Phase 1 code)

| Constant | String (ASCII) | Len |
|---|---|---|
| `kReservedCtMask` | `discrete-pq-ct-mask-v1` | 22 |

---

## 4. AEAD instantiation (normative)

ChaCha20-Poly1305 IETF (RFC 8439), one output:

| Field | Size / value |
|---|---|
| Key | 32 bytes — `deriveAeadKey(ss, outContext)` |
| Nonce | 12 zero bytes (safe: key is unique per output) |
| AAD | 40 bytes: `outContext` (32) \|\| `LE64(amount)` (8) |
| Plaintext | 40 bytes: `rho` (32) \|\| `LE64(T)` (8) |
| Ciphertext | 40 bytes |
| Auth tag | 16 bytes |
| On-wire (`encPayload`) | 56 bytes = ciphertext \|\| tag |

`T` (subaddress index) is bound into the plaintext only (as of `outContext-v2`,
§5) — a tampered routing hint still breaks AEAD tag verification, because the
whole 40-byte plaintext is authenticated, but `T` no longer feeds the key
derivation itself.

---

## 5. outContext derivation formula

**Current (v2).** `outContext` does **not** depend on `T`. Output uniqueness
comes from `kemCt` (fresh per output — ML-KEM-768 encapsulation is
randomized) and `inputsHash`, never from `T`:

```
outContext = SHA3-256(
    kDomainOutContextV2        ||   // "discrete-pq-out-context-v2", 26 bytes
    inputsHash                 ||   // 32 bytes
    kemCt                      ||   // 1088 bytes
    LE32(outputIndex)              // 4 bytes
)
```

`T` travels only inside the AEAD plaintext (§4) and is read back after a
single decrypt — the receiver never enumerates candidate `T` values, so
recovery cost is O(1) regardless of how large or how many `T` values a wallet
has issued.

**Legacy (v1), receiver-side fallback only.** Every output minted before the
v2 activation used this formula, always at `subaddrIndexT = 0` (no nonzero-`T`
deposit was ever issued under it). Wallets try v2 first; if that AEAD decrypt
fails, they retry once under this formula at `T = 0` before concluding the
output isn't theirs. **New senders must never use this formula.**

```
legacyOutContextV1 = SHA3-256(
    kDomainOutContext          ||   // "discrete-pq-out-context-v1", 26 bytes
    inputsHash                 ||   // 32 bytes
    kemCt                      ||   // 1088 bytes
    LE32(outputIndex)          ||   // 4 bytes
    LE64(subaddrIndexT)            // 8 bytes
)
```

Wallet software (walletd, in practice — the exchange-facing surface that
issues deposit subaddresses) may additionally expose an off-by-default,
operator-triggered recovery mode that brute-forces this legacy formula across
a `T` window, in case an unupgraded or hand-rolled sender ever constructed a
legacy nonzero-`T` output. Nothing in consensus prevents that (§ header note
above), though none has ever been observed on Discrete's chain.

---

## 6. Signing digest formula

```
txSigningDigest = SHA3-256(
    kDomainTxSign              ||   // "discrete-pq-tx-sign-v1", 22 bytes
    version (1 byte)           ||   // TRANSACTION_VERSION_1 = 1
    txType  (1 byte)           ||
    LE64(unlockHeight)           ||
    LE32(#inputs)              ||
    for each input:
        prevTxid (32)          ||
        LE32(prevOutIndex)     ||
        authPub  (1952)        ||
        rhoReveal (32)         ||
    LE32(#outputs)             ||
    for each output:
        type (1 byte = 0x10)   ||
        LE64(amount)           ||
        LE64(unlockHeight)     ||   // added per-output spend lock
        kemCt (1088)           ||
        encPayload (56)        ||
        spendCommit (32)       ||
    LE32(extra_len)            ||
    extra                      ||
    LE64(fee)
)
```

---

## 7. On-chain TransactionOutput layout

Each `TransactionOutput` (`vout` entry) serializes as:

```
LE64(amount)                  ||
LE64(unlockHeight)            ||   // per-output spend lock (0 = none)
type (1 byte)                 ||   // variant tag — see below
<variant-specific payload>
```

Two output variants exist:

| Tag | Type | Payload |
|---|---|---|
| `0x10` | `PqOutput` (regular TX_PQ) | `kemCt (1088)` \|\| `encPayload (56)` \|\| `spendCommit (32)` = **1176 B** |
| `0x11` | `CoinbaseOutput` (TX_COINBASE) | `spendCommit (32)` = **32 B** |

`CoinbaseOutput` is used for all coinbase transactions (mined blocks and the genesis Treasury Reserve). It carries only the 32-byte spend commitment; there is no KEM ciphertext or encrypted payload because the recipient recovers ownership deterministically via `coinbaseRho` (§8). Savings per mined block: **1,144 B** (1,088 + 56).

`unlockHeight` is a consensus field: the output is unspendable until the chain
reaches that block height (`0` = no lock). It is per-output — distinct from the
per-tx `TransactionPrefix.unlockHeight` — so one transaction can time-lock some
outputs (a vesting payment, a genesis Treasury Reserve batch) while leaving others
(change) spendable. It is bound into `txSigningDigest` (§6) and the txid, so it is
not malleable. It is **not** part of `outContext` or the AEAD AAD (key derivation
and ownership are independent of the lock).

---

## 8. Coinbase recipient == block signer (identity-bound mining)

Every non-genesis block carries an ML-DSA-65 signature over the
DiscretePower message digest:

```
H = SHAKE256("DiscretePower/v2/header" || get_block_hashing_blob(b), 64)
m = SHAKE256("DiscretePower/v2/sign"   || H, 64)          // the signed message
```

It is verified against the producer spend pubkey in the coinbase `extra` (tag
`0x07`) — before any yespower-discrete work — and the same signature is the tape
injected into the memory-hard core (see the [DiscretePower specification](pow.md)).
There is no separate reward signature. Additionally, the **single**
coinbase `CoinbaseOutput` must pay that same identity:

```
rho_C        = SHA3-256(kDomainCoinbaseRho || signerSpendPub || LE32(height) || LE32(outputIndex))
require: coinbaseOutput.spendCommit == SHA3-256(kDomainSpendCommit || signerSpendPub || rho_C)
```

For normal mined blocks `outputIndex = 0` (single output). For the genesis
Treasury Reserve (height 0, 21 outputs to independent keys), `outputIndex = i`
for the `i`-th batch, ensuring each batch gets a unique `rho_C` even at the same
height. Wallets scan by trying `coinbaseRho(ownSpendPub, height, i)` for each
output index `i` — no KEM decapsulation, constant time per candidate.

`rho_C` is canonical (publicly recomputable from the signer pubkey + height +
outputIndex), so consensus enforces that the miner who *signs* the block is the
miner who gets *paid*. This blocks an unsigned worker from redirecting the reward,
but it does not by itself prove strong non-outsourceability: a custodial operator
can sign candidate nonces and distribute signed jobs. The coinbase is a single
undivided output (one signature, minimal size).
Genesis (height 0) is exempt from signature validation (trusted) and carries the
Treasury Reserve to 21 independent recipients. Enforced in
`Blockchain::validate_block_signature`; built by
`buildGenesisTreasuryReserveCoinbase`. Genesis also skips DiscretePower
validation and carries an all-zero signature placeholder solely to preserve the
block wire shape.

Because `rho_C` is **public** (unlike a normal output's secret random `rho`), the
nullifier binds the spent output's **outpoint** so the public value can't be
replayed into a colliding output:

```
nullifier = SHA3-256(kDomainNullifier || spendPub || rho || prevTxid || LE32(prevOutIndex))
```

Two outputs that share `(spendPub, rho)` therefore still get distinct nullifiers.
The outpoint is revealed in the spending `PqInput` regardless, so this adds no
leakage. Normal (non-coinbase) outputs keep a secret random `rho`, so their
recipient stays unlinkable until spend.

---

*(§§ renumbered as features were added.)*

---

*Last updated: 2026-06-14 (per-output unlockHeight added to the wire and
signing digest;*
