# DiscretePower: identity-bound post-quantum proof of work

Status: **DRAFT, revision D; implemented in the pre-launch reference
implementation.** This page is the consolidated overview and normative
specification. It replaces DiscretePower-1 and all earlier drafts of the
current design.

The implementation is `discrete_power_prove`, `discrete_power_verify`, and `get_block_longhash` in
`src/CryptoNoteCore/CryptoNoteFormatUtils.cpp`; the `yespower-discrete` core in
`src/crypto/yespower.c`; and block validation in
`src/CryptoNoteCore/Blockchain.cpp`.

Revision history:

- **rev A — four chained signatures:** rejected. It multiplied block signature
  weight and validation cost for only linear delegation friction.
- **rev B — pre-phase plus deterministic midpoint signature:** rejected. Its
  security claims depended on deterministic ML-DSA signing, which consensus
  cannot distinguish from hedged signing. An adversarial signer could generate
  multiple valid signatures for one message and amortize the pre-phase.
- **rev C — four unmodified yespower calls with signature chunks:** rejected.
  A pool could retain the signature and interactively relay four 64-byte
  yespower inputs and four 32-byte outputs. The construction did not enforce
  transfer of the full signature and multiplied runtime without increasing
  active memory.
- **rev D — this document:** one ML-DSA-65 signature and one modified
  yespower-derived execution. The canonical signature is injected directly
  into the evolving state throughout S-box generation, large-memory filling,
  and read/write mixing.

Supersedes the previous DiscretePower-1 construction and revisions A–C of this
specification.
Discrete has not launched; revision D replaces the previous construction in
place with no fork gating or compatibility path. All `DiscretePower/v1/*`
and obsolete revision-C transcript domains are retired.

## 1. Motivation

DiscretePower-1 signs every candidate with ML-DSA-65, hashes the 3,309-byte
signature to a short digest, and feeds that digest to yespower. This binds PoW
to the reward identity but permits cheap remote delegation: a pool can retain
the reward key, sign candidate headers, and transmit only a short digest to
workers.

Revision C attempted to make delegation carry the entire signature by splitting
it into four chunks consumed by four separate yespower calls. That argument
was incomplete. A pool could keep each chunk, receive the preceding yespower
output from a worker, and transmit only the next 64-byte yespower input. Four
stages created an interactive protocol, not a full-signature data requirement.

Revision D removes the fixed compression boundary. The raw canonical
ML-DSA-65 signature is padded to a 3,312-byte tape and consumed as 414
little-endian 64-bit words inside the yespower-derived memory loops. A tape word
is injected at each frozen memory-store or memory-index site defined in §6.4.
The tape cycles throughout the complete memory-hard execution, so a delegating key holder must
choose among:

1. transferring the signature tape, or an equivalent per-candidate
   representation, to the worker;
2. remaining involved as an interactive tape oracle throughout the execution;
3. computing substantially all of the memory-hard work itself.

The construction remains **identity-bound and delegation-hostile**, not
pool-proof. It does not prevent off-chain reward sharing, custodial mining,
local-key farms, or botnets using independent keys.

Block weight remains one ML-DSA-65 signature per block, identical to
DiscretePower-1.

## 2. Design goals

Revision D has the following goals:

- Bind every PoW candidate and coinbase reward to one ML-DSA-65 spend key.
- Require one valid ML-DSA signature for every explored candidate.
- Prevent hedged-signature grinding from reusing memory-hard work.
- Remove any consensus-defined 32-byte or 64-byte summary that substitutes for
  the signature before memory-hard execution.
- Make remote-key delegation carry approximately one canonical signature of
  candidate-specific data, or maintain fine-grained interaction throughout the
  memory-hard execution.
- Preserve stateless block validation and one-signature block weight.
- Remain practical on commodity x86-64 and ARM64 CPUs.

It does **not** claim:

- strong non-outsourceability in the Miller–Kosba–Katz–Shi sense;
- prevention of all pools or variance-sharing arrangements;
- botnet resistance;
- permanent ASIC or FPGA resistance;
- an information-theoretic 3,312-byte lower bound on every possible delegation
  protocol.

## 3. Primitives and notation

- `SHAKE256(m, n)` — SHAKE-256 with `n` output bytes.
- `Sign(sk, m)` / `Verify(pk, m, sig)` — ML-DSA-65. Hedged and deterministic
  signing are both valid; verification is identical. Canonical signature
  length is 3,309 bytes.
- `yespower-discrete(H, P, tape)` — the modified yespower-derived function defined
  in §6. It is based on yespower 1.0 but is a distinct consensus algorithm.
- `LE32(b)` / `LE64(b)` — little-endian decoding.
- `ROTL32(x, n)` — 32-bit left rotation.
- `||` — byte concatenation.
- `u32(x)` — `x` reduced modulo `2^32`.

All domain tags are the exact ASCII bytes shown, without a terminator. The
`/v2/` components are frozen transcript-version identifiers retained for
consensus compatibility; they are not part of the algorithm's public name.

## 4. Consensus constants

```text
DISCRETE_POWER_TRANSCRIPT_VERSION  = 2
DISCRETE_POWER_MLDSA_PARAMETER_SET = ML-DSA-65
DISCRETE_POWER_SIG_LEN             = 3309
DISCRETE_POWER_TAPE_LEN            = 3312
DISCRETE_POWER_TAPE_WORD_BYTES     = 8
DISCRETE_POWER_TAPE_WORDS          = 414
DISCRETE_POWER_WITNESS_LEN         = 32

DISCRETE_POWER_YESPOWER_VERSION    = YESPOWER_1_0
DISCRETE_POWER_N                   = 4096       // 16 MiB large V memory
DISCRETE_POWER_R                   = 32
MINIMUM_DIFFICULTY                 = 10000      // mainnet only; testnet has no floor

DISCRETE_POWER_PHASE_SBOX          = 0
DISCRETE_POWER_PHASE_FILL          = 1
DISCRETE_POWER_PHASE_RW            = 2
DISCRETE_POWER_PHASE_FINAL         = 3
```

`DISCRETE_POWER_N = 4096, DISCRETE_POWER_R = 32` is the revision-D draft parameter set. It allocates
`128 × r × N = 16,777,216` bytes for the large `V` array per active mining
thread, plus the ordinary yespower S-box and working state. Parameters MUST be
frozen before mainnet after the benchmark process in §12.

ML-DSA implementation constants MUST be compile-time checked against
`DISCRETE_POWER_SIG_LEN`.

## 5. Top-level construction

For a block candidate `B` and miner spend keypair `(sk, pk)`:

```text
blob = get_block_hashing_blob(B)

H = SHAKE256(
      "DiscretePower/v2/header" || blob,
      64)

P = SHAKE256(
      "DiscretePower/v2/memory",
      32)

m = SHAKE256(
      "DiscretePower/v2/sign" || H,
      64)

sig = Sign(sk, m)                         // exactly 3309 bytes

tape = sig || 0x80 || 0x00 || 0x00       // exactly 3312 bytes

y = yespower-discrete(
      input = H,
      personalization = P,
      tape = tape,
      N = DISCRETE_POWER_N,
      r = DISCRETE_POWER_R)

PoW = SHAKE256(
        "DiscretePower/v2/final" || H || y,
        32)

W = SHAKE256(
      "DiscretePower/v2/witness" || sig,
      32)

block_id = SHAKE256(
             "DiscretePower/v2/block-id" || encode_le64(len(blob)) || blob || W,
             32)

accept iff integer_le(PoW) < target
```

`integer_le` interprets the 32-byte PoW value using the chain's existing
canonical difficulty comparison convention. Implementations MUST not introduce
a second byte-order convention.

The 64-byte `H` and `m` avoid reducing ML-DSA-65 authentication to a 32-byte
application digest. The final PoW remains 32 bytes.

### 5.1 Signature-tape encoding

The canonical tape is formed directly from the canonical ML-DSA-65 signature:

```text
tape[0 .. 3308] = sig[0 .. 3308]
tape[3309]      = 0x80
tape[3310]      = 0x00
tape[3311]      = 0x00
```

The delimiter is fixed even though the signature length is already fixed. It
prevents accidental equivalence with zero-padding conventions if a future
implementation incorrectly treats the final partial word as variable-length.

The tape MUST NOT be replaced by:

- a hash of the complete signature;
- an XOF expansion seeded by a short signature digest;
- a post-absorption SHAKE/Keccak state supplied by a miner;
- a Merkle root with externally supplied leaves;
- any other short caller-provided summary.

The consensus implementation derives the tape locally from the verified block
signature.

### 5.2 Signing-mode indifference

Consensus does not require or detect deterministic ML-DSA signing. A hedged
signer may generate multiple valid signatures for the same `m`; a deterministic
signer normally varies the nonce and therefore `H` and `m`.

Every distinct valid signature produces a distinct tape and enters the
memory-hard state before the first S-box entry is stored. No memory-hard prefix
is reusable across signature variants. Only cheap header hashing, signature
verification setup, and yespower's initial PBKDF setup may be reused.

### 5.3 Presigning

A key holder MAY presign candidate headers or nonce ranges. Revision D does not
claim a latency wall or prohibit presigning. Every presigned candidate still
requires one signature and one candidate-specific tape. A new previous-block
hash or any coinbase/template change invalidates the signature because both are
inside `blob`.

## 6. `yespower-discrete`

`yespower-discrete` starts from yespower 1.0 with parameters `N = DISCRETE_POWER_N` and
`r = DISCRETE_POWER_R`. PBKDF, personalization handling, `blockmix_salsa`,
`blockmix_pwxform`, S-box dimensions, loop counts, and final HMAC-SHA256 remain
unchanged except for the injection points explicitly defined below.

Because its memory loops are modified, this algorithm MUST be named and exposed
as `yespower-discrete`; it MUST NOT be represented as ordinary or unmodified
yespower 1.0.

### 6.1 Canonical state-word access

The injection rule is specified over the logical little-endian 32-bit word
array `X[0 .. 32r-1]` before implementation-specific SIMD layout.

`GET(X, q)` returns logical word `q`.
`XOR(X, q, v)` replaces logical word `q` with `GET(X, q) XOR v`.

Reference and optimized implementations MAY keep SIMD-shuffled internal state,
but they MUST implement `GET` and `XOR` so the logical transcript matches this
specification exactly. No architecture-dependent reinterpretation is allowed.

### 6.2 Global injection counter

One unsigned 64-bit counter `ctr` is initialized to zero immediately before the
first S-box-generation `smix1` call. It is shared across all injection points
for one yespower-discrete execution and increments exactly once after each injection.
It is not reset between phases.

The tape word used at an injection point is:

```text
q  = ctr mod DISCRETE_POWER_TAPE_WORDS
lo = LE32(tape[8q + 0 .. 8q + 3])
hi = LE32(tape[8q + 4 .. 8q + 7])
```

The first 414 injection points therefore consume every tape byte exactly once.
Later points cycle through the tape again.

### 6.3 Injection function

For logical state `X`, yespower block parameter `r`, phase `phase`, phase-local
iteration `i`, tape `tape`, and global counter `ctr`:

```text
words = 32 * r                         // 32 for S-box phase, 1024 otherwise
mask  = words - 1                      // words is a power of two here

q  = ctr mod 414
lo = LE32(tape[8q + 0 .. 8q + 3])
hi = LE32(tape[8q + 4 .. 8q + 7])

phase_constant =
    0x243F6A88 when phase = DISCRETE_POWER_PHASE_SBOX
    0x85A308D3 when phase = DISCRETE_POWER_PHASE_FILL
    0x13198A2E when phase = DISCRETE_POWER_PHASE_RW
    0x03707344 when phase = DISCRETE_POWER_PHASE_FINAL

selector = u32(
    GET(X, 0)
    XOR ROTL32(GET(X, words / 2), 7)
    XOR ROTL32(GET(X, words - 1), 17)
    XOR u32(0x9E3779B9 * u32(ctr + 1))
    XOR u32(0x7F4A7C15 * u32(i + 1))
    XOR phase_constant)

lane0 = selector AND mask
delta = ((selector >> 16) AND mask) OR 1       // odd and non-zero
lane1 = (lane0 + delta) AND mask               // lane1 != lane0

XOR(X, lane0, lo)
XOR(X, lane1, hi)

ctr = ctr + 1
```

All arithmetic is unsigned and reduced modulo `2^32` where shown. Shifts and
rotations use 32-bit operands. `lane0` and `lane1` are logical state-word
indices, not raw SIMD-array indices.

The phase constants are fixed domain separators for the injection schedule.
They carry no independent cryptographic claim.

### 6.4 Injection points

The ordinary yespower 1.0 `smix` structure is retained:

```text
smix1(B, 1, Sbytes / 128, S, X, ctx)      // S-box generation
smix1(B, r, N, V, X, ctx)                 // large-memory fill
smix2(B, r, N, Nloop_rw, V, X, ctx)       // read/write mixing
smix2(B, r, N, Nloop_final, V, X, ctx)    // final 0-or-2 loop
```

Revision D inserts `discrete_power_inject` as follows.

#### S-box-generation `smix1`

For each iteration `i`, after `X` is available and before `V_i <- X`:

```text
discrete_power_inject(X, r=1, phase=DISCRETE_POWER_PHASE_SBOX, i, tape, ctr)
V_i <- X
... ordinary smix1 iteration continues ...
```

#### Large-memory-fill `smix1`

For each iteration `i`, before `V_i <- X` and before any state-dependent
`Wrap(Integerify(X), i)` operation:

```text
discrete_power_inject(X, r=DISCRETE_POWER_R, phase=DISCRETE_POWER_PHASE_FILL, i, tape, ctr)
V_i <- X
... ordinary smix1 iteration continues ...
```

#### Read/write `smix2`

For each iteration `i`, before `j <- Integerify(X) mod N`:

```text
discrete_power_inject(X, r=DISCRETE_POWER_R, phase=DISCRETE_POWER_PHASE_RW, i, tape, ctr)
j <- Integerify(X) mod N
... ordinary smix2 iteration continues ...
```

#### Final `smix2`

For each iteration `i`, before `j <- Integerify(X) mod N`:

```text
discrete_power_inject(X, r=DISCRETE_POWER_R, phase=DISCRETE_POWER_PHASE_FINAL, i, tape, ctr)
j <- Integerify(X) mod N
... ordinary smix2 iteration continues ...
```

If the ordinary yespower loop count makes the final phase zero iterations, no
final-phase injection occurs. Counter continuity remains unchanged.

### 6.5 Why injection continues through all phases

Injecting the signature only during an early prefix would permit a key holder
to compute that prefix and hand a checkpoint to the worker. Revision D cycles
the tape through S-box generation, the full `V` fill, and the data-dependent
read/write loops.

A worker that does not possess the tape cannot continue the specified execution
from an early checkpoint. A pool may still:

- send all 3,312 tape bytes;
- serve tape words interactively until the worker has cached the tape;
- transmit a larger equivalent internal state;
- perform the remaining memory-hard work itself.

The specification does not claim a formal lower bound against arbitrary future
compression. It does rule out the revision-C four-message relay and any
consensus-sanctioned short digest substitute.

## 7. Candidate space and grinding

The PoW value is a deterministic function of `(blob, sig)` after `sig` has been
created.

For a fixed header message `m`:

- a hedged signer may create a fresh valid `sig` and therefore a fresh tape;
- a deterministic signer normally changes the nonce, producing a fresh `H`,
  `m`, and `sig`.

In either case, each candidate costs:

```text
1 ML-DSA-65 signature
+ 1 complete yespower-discrete execution
+ SHAKE-256 transcript hashing
```

A new signature changes the state before the first S-box entry is stored and is
re-injected throughout the execution. Memory-hard work from a different
signature cannot be reused under the specified algorithm.

## 8. Block format, block identity, and reward binding

The block carries:

- `minerSpendPk` — the ML-DSA-65 public key in coinbase `extra`, as in
  DiscretePower-1;
- `signature` — exactly one canonical ML-DSA-65 signature of exactly
  `DISCRETE_POWER_SIG_LEN` bytes, serialized outside the hashing blob.

### 8.1 Hashing blob

`get_block_hashing_blob(B)` MUST include all consensus fields that determine the
candidate template, including:

- previous block hash;
- timestamp and difficulty-related header fields;
- nonce;
- transaction commitment / Merkle root;
- complete coinbase transaction commitment;
- `minerSpendPk` through the coinbase commitment.

It MUST exclude `signature` to avoid circular signing.

### 8.2 Block ID

The block ID commits to the randomized signature through a separable witness:

```text
W = SHAKE256("DiscretePower/v2/witness" || signature, 32)
block_id_v1 = SHAKE256(
                "DiscretePower/v2/block-id" ||
                encode_le64(len(get_block_hashing_blob(B))) ||
                get_block_hashing_blob(B) || W,
                32)
```

The ID is not the DiscretePower result and is not a hash of full block
serialization. It binds the unsigned candidate and the exact proof-bearing
signature without making signing circular: `signature` signs a message derived
from the unsigned blob, and the ID is computed afterward.

Two valid randomized signatures over the same hashing blob produce distinct
witnesses, distinct block IDs, and distinct PoW values (except with negligible
hash-collision probability). This eliminates same-ID proof aliasing while
preserving randomized signatures as independent mining attempts. A duplicate
lookup may skip validation only for the exact proof-bearing block ID already
stored. A different signature has a different ID and MUST be admitted or rejected
by independently verifying its signature, recomputing its memory-hard PoW, and
checking the target. Implementations MUST NOT cache a PoW verdict by unsigned
hashing blob alone.

The implementation derives `W` on demand and exposes it in block-detail RPC
responses. It does not currently persist `W` separately from `signature`.

### 8.3 Reward binding

There is no second reward signature. The PoW signature is the reward binding:

1. `signature` MUST verify against `minerSpendPk` over recomputed `m`;
2. the coinbase MUST contain exactly one reward output committed to the same
   `minerSpendPk` under the existing Discrete rule.

Changing the coinbase, reward key, transaction root, previous block hash, or
nonce changes `blob`, then `H` and `m`, and invalidates the signature.

Block signature weight remains 3,309 bytes per block. At a 90-second target,
this is approximately 1.16 GB decimal per year before serialization overhead.

## 9. Validation algorithm

Given block `B`, `minerSpendPk`, and `signature`:

```text
1. Reject unless signature length is exactly 3309 bytes.
2. Recompute blob, H, P, and m.
3. Compute W and the signature-bound block ID. Only an exact stored-ID match may
   return already-known; never deduplicate by blob alone.
4. Verify(minerSpendPk, m, signature).
   If verification fails: REJECT before any yespower-discrete work.
5. Reconstruct tape = signature || 0x80 || 0x00 || 0x00.
6. Run one complete yespower-discrete(H, P, tape) execution.
7. Compute PoW = SHAKE256("DiscretePower/v2/final" || H || y, 32).
8. Reject unless PoW satisfies the target.
9. Enforce the single coinbase output commitment to minerSpendPk.
```

The signature-first ordering cheaply rejects random malformed signatures.
It does not prevent an attacker from generating its own valid key and forcing
normal PoW validation work; ordinary peer admission, header-relay, duplicate,
and rate-limit protections remain necessary.

Validation is stateless with respect to chain history beyond the ordinary block
header and difficulty context. The PoW does not read a trailing blockchain
window, mutable cache, or reorg-sensitive record set.

## 10. Delegation cost model

### 10.1 Enforced properties

Against a remote key holder using the specified consensus algorithm:

- every candidate contains one valid ML-DSA-65 signature;
- every distinct signature creates a distinct tape;
- no memory-hard prefix is reusable across different signatures;
- a normal remote worker needs the 3,312-byte tape, or equivalent
  candidate-specific information, to execute independently;
- withholding the tape requires fine-grained interaction or local computation
  throughout the memory-hard phases;
- a 32-byte or 64-byte signature digest is insufficient.

### 10.2 Straightforward remote-key bandwidth

For aggregate candidate rate `A` candidates per second, transmitting the
canonical tape costs:

```text
pool egress = 3312 * A bytes/second
```

Examples:

```text
A = 100,000/s   -> 331.2 MB/s decimal
A = 1,000,000/s -> 3.312 GB/s decimal
```

A worker at `h` candidates per second receives:

```text
3312 * h bytes/second
```

This is a cost model, not a proof that no compressed or specialized protocol
can ever do better.

### 10.3 Interactive tape service

The pool may send 8-byte tape words as they are needed. The first 414 injection
points touch every word once. After receiving all words, the worker can cache
the entire tape; total useful payload is still 3,312 bytes per candidate.
Batching can hide latency, so revision D does not claim that interaction alone
prevents pooling.

### 10.4 Local-key mining

A farm, bot, or rented machine that holds its own reward key incurs no network
tape transfer and behaves like a solo miner. Consensus cannot determine whether
that machine is honestly owned, rented, compromised, or centrally controlled.

## 11. Security claims and non-claims

### 11.1 Claims

- **Reward-identity binding:** a valid block pays the ML-DSA identity that
  signed its hashing blob.
- **Per-candidate signer involvement:** every candidate includes a valid
  signature over the candidate header digest.
- **Mode-independent grinding cost:** deterministic and hedged signing both
  require a complete yespower-discrete execution per signature candidate.
- **No reusable memory-hard prefix:** signature injection begins before the
  first S-box entry is stored and continues through all memory phases.
- **Delegation data/interaction tax:** a remote worker requires the canonical
  tape or equivalent candidate-specific information throughout execution; no
  fixed short digest defined by consensus substitutes for it.
- **Tip and template binding:** previous block hash and coinbase commitment are
  inside the signed hashing blob.
- **One-signature block weight:** exactly one ML-DSA-65 signature is stored per
  block.

### 11.2 Non-claims

- **Not pool-proof:** a pool may build signing infrastructure and stream tapes.
- **Not strongly non-outsourceable:** a worker cannot redirect the signed
  coinbase to itself, and no PQ zero-knowledge theft mechanism is provided.
- **No botnet resistance:** per-bot keys avoid the central tape channel and are
  indistinguishable from many solo miners.
- **No permanent ASIC resistance:** yespower-discrete is a new yespower-derived
  algorithm whose CPU/GPU/FPGA/ASIC ratios require independent benchmarking.
- **No formal bandwidth lower bound:** the 3,312-byte figure describes the
  canonical tape and obvious equivalent protocols, not an information-theoretic
  theorem.
- **No automatic variance reduction:** miners still face solo-block variance;
  off-chain insurance and payout sharing cannot be prohibited by consensus.

### 11.3 New-algorithm risk

Modifying yespower's memory loops means revision D no longer inherits upstream
yespower test vectors or implementation assurance for the changed algorithm.
The unchanged components remain useful engineering foundations, but the new
injection schedule, optimized implementations, and hardware behavior require
independent review. Mainnet activation without cross-platform differential
testing and external cryptographic/PoW review is not recommended.

## 12. Parameter tuning and benchmark gate

Before mainnet freeze, benchmark at minimum:

```text
N=2048, r=32    // 8 MiB
N=4096, r=32    // 16 MiB, revision-D draft default
N=8192, r=32    // 32 MiB
```

Target systems:

- x86-64 without AVX2 reliance;
- x86-64 SSE2/AVX optimized builds;
- ARM64 desktop/server cores;
- representative integrated and discrete GPUs;
- at least one FPGA feasibility review if available.

Measure:

- ML-DSA sign and verify time;
- total candidate time;
- initial PBKDF time;
- S-box-generation time;
- large-memory-fill time;
- read/write-mix time;
- memory bandwidth and cache-miss behavior;
- scaling by physical core and SMT thread;
- reference versus optimized transcript equivalence;
- delegated bandwidth per unit of useful hash rate.

The final `N` should make signing a meaningful but non-dominant fraction of
solo mining, avoid excessive validation cost, and preserve useful commodity-CPU
participation. No parameter choice should be described as permanent ASIC
resistance.

## 13. Test plan

### 13.1 Known-answer transcript

Check in a frozen vector containing:

- hashing blob;
- `minerSpendPk`;
- canonical `signature`;
- `H`, `P`, and `m`;
- complete padded tape;
- yespower initial `B` digest;
- global counter and logical-X digest after injection points 1, 414, and 768;
- digest of the completed S-box;
- digest of `X` and `V` after large-memory fill;
- digest after read/write mixing;
- raw yespower-discrete output `y`;
- final `PoW`.

Large internal arrays may be represented by SHAKE-256 or SHA-256 digests in the
vector, but the digest algorithm and byte serialization MUST be specified and
frozen.

### 13.2 Reference/optimized differential tests

For many random `(H, tape)` pairs, assert byte-identical output between:

- the scalar/reference implementation;
- every enabled optimized x86-64 implementation;
- ARM64 implementation;
- debug and release builds.

The reference implementation is authoritative if an optimized path disagrees.

### 13.3 Prove/verify round trips

Generate multiple ML-DSA-65 keypairs and random block templates. Assert that:

- `discrete_power_prove` output verifies with `discrete_power_verify`;
- changing nonce, previous block hash, transaction root, coinbase, or miner key
  invalidates the original signature before yespower-discrete;
- two valid hedged signatures over the same `m` produce different tapes and
  different PoW transcripts.

### 13.4 Rejection and DoS ordering

Test distinct rejection reasons for:

- missing, truncated, or oversized signature;
- signature bit flip at the start, middle, and end;
- wrong public key;
- valid signature over a different `m`;
- coinbase committed to another key;
- PoW above target;
- malformed serialization;
- alternate signature over an already-seen unsigned candidate.

Instrument test builds to assert that signature-length and signature-verify
failures execute zero yespower-discrete calls.

### 13.5 Injection coverage

Instrument the custom yespower path to assert for one execution:

- global counter starts at zero and never resets between phases;
- the first 414 injections use tape words `0..413` exactly once;
- every phase uses the expected phase identifier;
- injections occur before every specified `V` store or memory index;
- logical lane indices are identical in reference and optimized builds.

An internal-only test may bypass ML-DSA verification, flip each tape word, and
confirm that the final output changes. This is a regression test, not a
cryptographic proof.

### 13.6 Serialization and block identity

Assert that:

- `signature` survives block serialize/deserialize byte-for-byte;
- it is included in full block serialization and excluded from the hashing blob,
  while its 32-byte witness is committed by the block-v1 ID;
- the witness derivation and block-ID derivation match pinned known-answer
  vectors;
- alternate valid signatures over the same blob produce distinct block IDs and
  different PoW values when the signer is randomized;
- accepting one signature does not mark an alternate signature as already
  existing, and a separately identified invalid variant still fails signature
  verification rather than reusing a header-only verdict.

### 13.7 Miner soak test

Run multi-thread mining with thread-local scratch allocation, repeated template
updates, nonce rollover, shutdown, and key zeroization. Confirm no per-attempt
heap allocation and no cross-thread tape or scratch-state reuse.

## 14. Pruning

The active implementation does not prune `signature`; every node retains the
full signature. It is required to validate every non-genesis DiscretePower
block. Genesis is the trusted network anchor: it carries a zero-filled signature
placeholder for wire-format consistency and is exempt from signature and PoW
validation.

The separable witness makes a future pruned-storage representation possible:
retaining `W` is sufficient to reconstruct the block ID after discarding
`signature`. It is not sufficient to re-verify the ML-DSA signature or the
signature-dependent PoW. The current database does not persist `W` as independent
block metadata, and the current wire format always requires the full 3,309-byte
signature.

A future pruning/checkpoint design therefore needs an explicit database
representation for `W`, a distinct pruned-block serving format, and a reviewed
trust/bootstrap policy defining who retains original signatures and how a
from-genesis validator obtains the required proof. Finality depth alone is not a
cryptographic authorization to discard historical work. Until that infrastructure
exists, retain every PoW signature.

## 15. Implementation cautions

- Do not call the modified function ordinary `yespower` in consensus-facing
  code or documentation.
- Do not inject a digest of `sig`; inject the canonical padded tape words.
- Do not derive the complete tape from a short XOF seed or expose a caller-
  supplied sponge state.
- Do not reset the injection counter between memory phases.
- Do not move injection after `V_i <- X` or after `j <- Integerify(X)`.
- Do not use raw SIMD-array indices as consensus lane indices.
- Do not permit architecture-specific lane ordering.
- Do not cache PoW solely by hashing blob. The block-v1 ID commits to the
  signature witness, and only an exact stored-ID match may be deduplicated.
- Verify ML-DSA before allocating or executing the large memory-hard path when
  validating untrusted blocks.
- Use disposable hot mining accounts and existing key locking/zeroization;
  do not expose a valuable long-term wallet key directly to high-frequency
  mining code.

## 16. Retired designs

- **DiscretePower-1:** signature compressed before the memory-hard core;
  identity-bound but cheap to delegate.
- **Revision A:** four stored signatures.
- **Revision B:** deterministic-signing consensus assumption and reusable
  pre-phase.
- **Revision C:** four unmodified yespower calls; vulnerable to interactive
  64-byte input relaying.
- **`dev/pow-window` trailing-window sampler:** separate research track;
  revision D remains stateless and does not depend on historical scratch data.

## Appendix A. Reference-implementation injection schedule (normative for Discrete)

Section 6.4 specifies injection relative to the idealized textbook `smix1`/`smix2`
loop shape (`V_i <- X`, `j <- Integerify(X)`). The Discrete reference implements
`yespower-discrete` by instrumenting the actual yespower 1.0 `smix1`/`smix2` in
`src/crypto/yespower.c` (guarded so plain `yespower` with a NULL tape is
byte-for-byte unchanged, which is a built-in differential anchor). The concrete,
frozen injection schedule is:

- The global counter `ctr` starts at 0 immediately before the S-box-generation
  `smix1` and is never reset; the phase-local iteration `i` restarts at 0 at the
  start of each of the three executed phases (`SBOX`, `FILL`, `RW`).
- **`smix1` (S-box generation and large-memory fill):** `discrete_power_inject` runs on the
  primary sequential input block-set of every `blockmix`/`blockmix_xor` in the
  fill, immediately **before** that mixing step consumes and rewrites the state
  into its `V` slot — i.e. before each `V`-store/state-defining step, never after.
- **`smix2` (read/write mixing):** `discrete_power_inject` runs on `X` immediately **before**
  each `blockmix_xor_save` whose `Integerify` return selects the next `V_j`.
- yespower 1.0 executes only the S-box, fill, and read/write phases; the
  `DISCRETE_POWER_PHASE_FINAL` loop has zero iterations and therefore never injects, exactly
  as §6.4 permits. Counter continuity is preserved regardless.
- `GET`/`XOR` address the logical little-endian 32-bit word array over the
  SIMD-shuffled `salsa20_blk_t` storage using the fixed inverse of
  `salsa20_simd_shuffle`, so the logical transcript is identical on every
  little-endian target (x86-64 scalar/SSE2/AVX and ARM64) without any
  architecture-specific reinterpretation.

Because a NULL/all-zero tape makes every injection a no-op, `yespower-discrete` with a
zero tape equals stock `yespower 1.0`; the test suite asserts this equivalence as
the anchor that the unmodified memory-hard machinery is preserved.
