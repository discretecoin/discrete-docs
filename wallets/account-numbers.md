# Account numbers (H-I-A-C and H-I-A-T-C)

Discrete account numbers are short, checksummed references to a post-quantum
identity registered on chain. They complement full PQ Bech32m addresses; they do
not replace them.

> **Safety summary:** the account number embeds a short fingerprint (`A`) of the
> registered keys, and a conforming paying wallet refuses the number unless the on-chain keys
> reproduce that fingerprint. This turns a reorg- or node-induced key substitution
> from a silent mis-send into a hard refusal. Nodes also only resolve a
> registration once it is past first-seen finality (`CRYPTONOTE_FINALITY_DEPTH = 10`),
> so a fresh registration is not payable by others until it is final. For very
> high-value use, still compare the resolved full PQ address through a trusted
> channel — `A` is 20 bits, decisive against accidents but not a substitute for
> the full address against a determined adversary.

## Formats

| Format | Meaning |
|---|---|
| `H-I-A-C` | Base account number. Payments use the registered identity with subaddress index `T = 0`. |
| `H-I-A-T-C` | Deposit subaddress used by the `single-key-index` wallet scheme. It resolves the same base identity and adds deposit index `T`. |

Example: `4821-7-KQ9D-X` (base) and `4821-7-KQ9D-3-X` (deposit index 3).

The fields are:

- `H` — block height containing the registration transaction (decimal).
- `I` — non-coinbase transaction position inside that block (decimal).
- `A` — a 20-bit fingerprint of the registered public keys, encoded as four
  Crockford Base32 characters. This is the reorg/substitution **failsafe** (see
  below).
- `T` — 32-bit deposit index (decimal), present only in the deposit form. It is
  routing and attribution metadata, not a separate spend key.
- `C` — one Crockford Base32 check character (Luhn mod-32) over the symbols of the
  preceding fields: `H || I || A` for the base form, `H || I || A || T` for the
  deposit form.

The whole number uses only Crockford Base32 symbols — digits plus letters,
excluding the ambiguous `I`, `L`, `O`, `U` — so `0`/`O` and `1`/`I`/`L` can never
be confused. Decoding is lenient (`O` → `0`, `I`/`L` → `1`, case-insensitive), and
`A` and `C` are canonicalized on parse. The parser requires the exact field count,
so the base and deposit forms never alias, and a missing or extra field is
rejected rather than silently reinterpreted.

## The fingerprint `A` (the failsafe)

`(H, I)` on its own is only a *pointer* into chain state. Without more, a chain
reorganization that repoints `(H, I)` to a different registration would silently
change who a payment resolves to, and the check character — which covers only the
displayed digits — could not detect it. `A` closes that gap by binding the number
to the actual keys.

`A` is derived as:

```text
preimage = "DISCRETE-ACCT-FP-v1" || net_byte || spendPub || viewPub
net_byte = 0x00 mainnet, 0x01 testnet
spendPub = ML-DSA-65 public key (1952 bytes)
viewPub  = ML-KEM-768 public key (1184 bytes)
digest   = SHA3-256(preimage)                                  (FIPS 202)
fp20     = (digest[0] << 12) | (digest[1] << 4) | (digest[2] >> 4)   (top 20 bits)
A        = Crockford-Base32(fp20)                              (4 characters)
```

When a conforming wallet resolves an account number it recomputes `A` from the keys the node
returned and **refuses the number unless it matches** the `A` the payer holds.
Two consequences:

- A reorg (or any other change) that repoints `(H, I)` to different keys is caught
  — the payment is refused instead of silently going to a stranger.
- A dishonest node cannot steer a payment: if it returns the wrong keys, they will
  not reproduce the fingerprint the payer typed, and the wallet rejects the answer.

Because `net_byte` is part of the preimage, `A` also acts as a network
discriminator: a mainnet number pasted into a testnet wallet (or vice versa)
fails the fingerprint check and is refused.

The deliberate limit: `A` is 20 bits. It is decisive against accidental or
reorg-induced mismatch (a random collision is about 1 in 1,048,576), but it is
only a speed bump against an adversary who grinds a key pair to a chosen `A`. The
real barrier against a *targeted* substitution is first-seen finality (below), not
`A`'s length — so do not lengthen `A` expecting adversarial resistance, and for
very high-value transfers still verify the full PQ address out of band.

## Registration and resolution

A registration transaction publishes the wallet's ML-KEM view public key and
ML-DSA spend public key. Discrete accepts either:

- free registration backed by the registration anti-spam proof of work; or
- paid registration carried by a normal PQ transaction.

Registration is **first-registration-wins per PQ identity** on the current
canonical chain. A second registration of the same identity is invalid. If the
first registration is detached by a reorganization, its registry entry is
rolled back and the identity can register again at a different position.

To resolve an account number, a wallet or service:

1. Parses the fields and checks `C`.
2. Asks its node to resolve `(H, I)`. The node returns the registered keys **only
   if the registration is past finality** (buried more than
   `CRYPTONOTE_FINALITY_DEPTH = 10` blocks); otherwise it reports the account as
   not resolvable yet.
3. Recomputes `A` from the returned keys and refuses the number on a mismatch.
4. Uses the registered view and spend public keys, applying `T` for a deposit
   number.

These are separate validation states. Passing the local parser proves only that
the field count, ranges, alphabet, and check character are valid. A successful
`resolveaccountnumber` lookup proves that the node currently has a final
registration at `(H, I)`. The number is safe to pay only after the client has also
compared its parsed `A` with the fingerprint of the returned keys.

The daemon's `resolveaccountnumber` RPC accepts `(H, I)`, not the complete account
number. It returns the resolved keys and a canonical `account_number` reconstructed
from them. RPC clients must parse that returned number and require its `A` to equal
the `A` supplied by the user. A missing, malformed, or mismatching returned
`account_number` is a hard failure; clients must not accept the keys merely because
`found` is true. In-process clients that receive only the keys must recompute
`pqAccountFingerprint()` locally and perform the same comparison.

An owner can obtain and display *their own* number as soon as the registration is
confirmed — that path renders the number from the owner's own keys and is not
finality-gated. But **others cannot pay it until it is final**, because their
resolution goes through step 2.

This lookup is why a syntactically valid number can still fail to resolve. It may
refer to a block the node does not have, a non-registration transaction, a
registration removed by a reorganization, or one that is not yet final. Offline
validation can check the format and checksum only; sending requires a synced node.

For H-I-A-T-C, every `T` shares the base registration's view and spend keys, so
`A` is the same across all deposits of one account. Changing `T` changes deposit
attribution and output derivation, but it does not provide per-deposit spend-key
isolation. The
[`aggregated-multikey`](walletd-exchange-guide.md#the-two-deposit-modes) scheme
uses full PQ addresses when that isolation is required.

## Reorganization behavior

An account number identifies a **position in one chain history** plus a key
fingerprint. During a shallow reorganization the block at height `H` can be
replaced, and position `(H, I)` on the adopted branch may then:

- contain the original registration again — the number keeps working;
- contain no registration — the number stops resolving; or
- contain a *different* registration — the fingerprint `A` no longer matches, so
  the paying wallet refuses the number instead of paying the new keys.

The node removes orphaned registry entries during rollback and indexes the
registration on the adopted branch. This is intended consensus behavior, not a
checksum or database failure.

Two independent mechanisms now protect a payment:

- **Prevention — finality-gated resolution.** A node refuses to resolve a
  registration until it is more than `CRYPTONOTE_FINALITY_DEPTH = 10` blocks
  behind its accepted tip. A fresh `(H, I)` cannot be paid while it is still
  reorg-eligible. First-seen finality also makes each node reject a competing
  branch whose fork is deeper than that bound.
- **Detection — the fingerprint `A`.** If a substitution ever does occur (for
  example, near a partition or on an eclipsed/newly-syncing node that temporarily
  disagrees about history), the resolved keys will not reproduce `A`, and the
  payment is refused rather than sent to the wrong recipient.

First-seen finality is **local and history-relative**, not a globally objective
certificate. Nodes separated by a partition, an eclipsed node, and a newly syncing
node can temporarily disagree about history. See
[Mining security](../consensus/mining-security.md) and
[Finality recovery](../operators/finality-recovery.md).

## Finality recommendations

Resolution is already finality-gated, so ordinary sends cannot land on a
pre-final registration. Use registration depth as the boundary for *publishing*
and for high-value policy:

```text
registration_depth = current_tip_height - H
```

| Situation | Recommended policy |
|---|---|
| Registration just mined | Provisional. You may read your own number, but it is not payable by others until it is final. Do not distribute it yet. |
| Ordinary wallet use | The node enforces `registration_depth > 10` before resolving; a synced, well-connected node is sufficient. |
| High-value transfer or public payment service | Allow 20–60 confirmations, resolve through at least two independently operated nodes, and compare the resolved PQ address (or `A`) with a trusted copy. |
| Nodes disagree, tip is stale, or `finality_fork_warning` is set | Do not send, credit deposits, or publish new account numbers. Pause until the majority history is established and the node is recovered. |

Waiting beyond the enforced 10 blocks adds time for independent observation and
operational detection; it does not turn local first-seen finality into a global
certificate.

### For account owners

- Prefer one established H-I-A-C instead of repeatedly registering or replacing
  published identifiers.
- Publish a full PQ address alongside the account number for high-value or
  long-lived use.
- In `single-key-index` mode, H-I-A-T-C numbers may be read as soon as the base
  registration appears, but they are not payable by others until the base
  registration is final.
- After a node recovery or wallet rescan, confirm that the account number still
  resolves to your wallet before accepting new payments to it.

### For senders

- Validate the checksum; the wallet also confirms the network via `A`.
- Resolve at send time instead of trusting an old lookup. The wallet refuses the
  number if the resolved keys do not match `A`.
- For a high-value payment, compare the resolved full address (or `A`) with a
  value obtained through a separate trusted channel.
- Treat a "fingerprint mismatch" or "not yet resolvable" result as a stop
  condition, not an automatic address update.

### For exchanges and services

- Store `H`, `I`, `A`, the registration block hash, registration transaction
  hash, resolved-key fingerprint, and current confirmation state.
- Cache a mapping only together with its block hash. Re-resolve it if that hash
  is no longer canonical.
- Rescan at least the recent finality window after reconnects and detach events.
- Compare tips and resolution results across independent nodes; do not place all
  of them behind the same network path or provider.
- Alert on `finality_fork_warning` and pause deposits and withdrawals until the
  node follows the confirmed majority history.

## Fraud considerations

Replacing a fresh registration requires influencing transaction ordering on a
competing branch, getting that branch adopted past the finality bound, **and**
grinding a colliding key pair so the substituted registration reproduces the
victim's `A`. The finality gate closes the ordinary opportunity; the fingerprint
closes the silent-substitution failure mode even when nodes temporarily disagree.

`A` does not prevent phishing or a user publishing the wrong-but-internally-valid
number: an attacker who simply hands you *their own* valid number (with their own
matching `A`) is a different threat, addressed by using the full PQ address,
address books, and out-of-band verification — not by the fingerprint. For that
reason, high-value workflows should still authenticate the resolved keys.

## Advantages and limitations

Advantages:

- short, structured identifiers with typo detection;
- a key fingerprint that refuses reorg/substitution and dishonest-node answers;
- finality-gated resolution, so a number is only payable once it is stable;
- deterministic, on-chain resolution with no naming authority;
- one base registration can support many H-I-A-T-C deposit numbers; and
- no per-deposit registration for `single-key-index` wallets.

## Implementation conformance checklist

Every implementation that accepts or displays account numbers should satisfy the
same contract:

- parse exactly `H-I-A-C` or `H-I-A-T-C`, with `A` exactly four Crockford Base32
  symbols and all numeric fields in the unsigned 32-bit range;
- calculate `C` with Crockford Luhn mod-32 over the canonical symbol sequence;
- resolve only registrations more than 10 blocks behind the accepted chain tip;
- recompute and compare `A` before reporting a number as resolved, converting it
  to a full address, saving it in an address book, or constructing a payment;
- preserve `T` through resolution and transaction construction; and
- test fingerprint mismatch, the finality boundary, both field counts, ambiguous
  input aliases, and cross-network fingerprints.

Generated runtime bundles and their source modules must be updated together. A
client built from an older `H-I-C`/base-36 formatter is not wire-compatible with
this format even if another checked-in bundle already understands `H-I-A-C`.

Limitations:

- not payable by others until the registration is final (~10 blocks);
- requires a synced chain lookup to obtain recipient keys;
- `A` is 20 bits — a failsafe against accidents, not a full-strength commitment;
- a stable public alias can be correlated when shared repeatedly; and
- H-I-A-T-C deposits share one spend authority and provide no per-deposit key
  isolation.

## Lineage

Discrete inherited the account-number usability model from Karbo and extends it
with the H-I-A-T-C deposit index, post-quantum registration keys, the key
fingerprint `A`, first-registration-wins consensus, and finality-gated resolution
under the local depth-10 finality rule. The reorganization and confirmation
guidance here is adapted from the
[Karbo account-number guide](https://github.com/seredat/karbowanec/wiki/Karbo-Account-Numbers-(H%E2%80%93I%E2%80%93C))
and reconciled with Discrete's implementation.
