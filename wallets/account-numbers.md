# Account numbers (H-I-C and H-I-T-C)

Discrete account numbers are short, checksummed references to a post-quantum
identity registered on chain. They complement full PQ Bech32m addresses; they do
not replace them.

> **Safety summary:** a valid check character proves only that the text was
> entered consistently. Treat a newly mined account number as provisional until
> its registration is at least 10 blocks behind the tip. For high-value use,
> allow 20–60 confirmations, compare resolution through independent nodes, and
> verify the resolved full PQ address or key fingerprint through a trusted
> channel.

## Formats

| Format | Meaning |
|---|---|
| `H-I-C` | Base account number. Payments use the registered identity with subaddress index `T = 0`. |
| `H-I-T-C` | Deposit subaddress used by the `single-key-index` wallet scheme. It resolves the same base identity and adds deposit index `T`. |

The fields are:

- `H` — block height containing the registration transaction.
- `I` — non-coinbase transaction position inside that block.
- `T` — 32-bit deposit index. It is routing and attribution metadata, not a
  separate spend key.
- `C` — Luhn mod-36 check character over the concatenated decimal digits. For
  `H-I-C` it covers `H || I`; for `H-I-T-C` it covers `H || I || T`.

The parser requires the exact field count, so a missing or extra field is
rejected rather than silently reinterpreted. The check character catches common
transcription errors, including a changed `T`, but it does not authenticate the
recipient or prove that a registration is final.

Account numbers also contain no network discriminator. The same text can parse
on mainnet or testnet and resolve against different histories. A full PQ address
has a network-specific Bech32m HRP; an account number relies on the wallet and
node already being connected to the intended network.

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
2. Reads block `H` from its node's current main chain.
3. Reads transaction position `I` and requires a PQ registration there.
4. Uses the registered view and spend public keys.
5. Applies `T` when the input was an H-I-T-C deposit number.

This lookup is why a syntactically valid number can still fail to resolve. It
may refer to the wrong network, a block the node does not have, a non-registration
transaction, or a registration removed by a reorganization. Offline validation
can check the format and checksum only; sending requires a synced node.

For H-I-T-C, every `T` shares the base registration's view and spend keys.
Changing `T` changes deposit attribution and output derivation, but it does not
provide per-deposit spend-key isolation. The
[`aggregated-multikey`](walletd-exchange-guide.md#the-two-deposit-modes) scheme
uses full PQ addresses when that isolation is required.

## Reorganization Risk

An account number identifies a **position in one chain history**, not a
cryptographic commitment to one block hash. During a shallow reorganization,
the block at height `H` can be replaced. Position `(H, I)` on the adopted branch
may then:

- contain the original registration again;
- contain no registration, so the account number stops resolving; or
- contain a different registration, so the same text resolves to different
  public keys.

The node removes orphaned registry entries during rollback and indexes the
registration on the adopted branch. This is intended consensus behavior, not a
checksum or database failure.

Discrete limits ordinary reorganization with node-local first-seen finality:
each node refuses a competing branch whose fork is more than
`CRYPTONOTE_FINALITY_DEPTH = 10` blocks behind its accepted tip. This greatly
narrows the normal replacement window, but it is **local and
history-relative**, not a globally objective certificate. Nodes separated by a
partition, an eclipsed node, and a newly syncing node can temporarily disagree
about history. See [Mining security](../consensus/mining-security.md) and
[Finality recovery](../operators/finality-recovery.md).

## Finality Recommendations

Use registration depth, not the fact that `getAccountStatus` returned
`registered: true`, as the safety boundary:

```text
registration_depth = current_tip_height - H
```

| Situation | Recommended policy |
|---|---|
| Registration just mined | Provisional. Do not publish the H-I-C or issue H-I-T-C numbers to users yet. |
| Ordinary wallet use | Require `registration_depth >= 10` on a synced, well-connected node. |
| High-value transfer or public payment service | Allow 20–60 confirmations, resolve through at least two independently operated nodes, and compare the resolved PQ address or key fingerprint with a trusted copy. |
| Nodes disagree, tip is stale, or `finality_fork_warning` is set | Do not send, credit deposits, or publish new account numbers. Pause until the majority history is established and the node is recovered. |

Some APIs count the inclusion block as confirmation 1. Avoid an off-by-one
policy by checking that the registration block is actually at least 10 blocks
behind the current tip. Waiting 20–60 confirmations adds time for independent
observation and operational detection; it does not turn local first-seen
finality into a global certificate.

### For account owners

- Prefer one established H-I-C instead of repeatedly registering or replacing
  published identifiers.
- Publish a full PQ address or key fingerprint alongside the account number for
  high-value or long-lived use.
- In `single-key-index` mode, H-I-T-C numbers may be generated as soon as the
  base registration appears, but do not distribute them until the base
  registration meets your finality policy.
- After a node recovery or wallet rescan, confirm that the account number still
  resolves to your wallet before accepting new payments to it.

### For senders

- Validate the checksum and confirm the intended network.
- Resolve at send time instead of trusting an old unauthenticated lookup.
- For a high-value payment, compare the resolved full address or key fingerprint
  with a value obtained through a separate trusted channel.
- Treat a sudden resolution change as a stop condition, not an automatic address
  update.

### For exchanges and services

- Store `H`, `I`, the registration block hash, registration transaction hash,
  resolved-key fingerprint, and current confirmation state.
- Cache a mapping only together with its block hash. Re-resolve it if that hash
  is no longer canonical.
- Rescan at least the recent finality window after reconnects and detach events.
- Compare tips and resolution results across independent nodes; do not place all
  of them behind the same network path or provider.
- Alert on `finality_fork_warning` and pause deposits and withdrawals until the
  node follows the confirmed majority history.

## Fraud considerations

Replacing a fresh registration requires influencing transaction ordering on a
competing branch and getting that branch adopted. The opportunity is
time-limited, computationally costly, and detectable when applications retain
the original block hash and compare independent nodes. The confirmation and
verification policy above is designed to close this window before a number is
treated as stable.

The checksum does not prevent phishing, a malicious node from reporting a false
mapping, or a user from publishing the wrong but internally valid number. For
that reason, high-value workflows must authenticate the resolved keys, not just
the account-number text.

## Advantages and limitations

Advantages:

- short, structured identifiers with typo detection;
- deterministic, on-chain resolution with no naming authority;
- one base registration can support many H-I-T-C deposit numbers; and
- no per-deposit registration for `single-key-index` wallets.

Limitations:

- not instantly final;
- requires a synced chain lookup to obtain recipient keys;
- numeric only, with no name semantics;
- no embedded network identifier;
- a stable public alias can be correlated when shared repeatedly; and
- H-I-T-C deposits share one spend authority and provide no per-deposit key
  isolation.

## Lineage

Discrete inherited the H-I-C usability model from Karbo and extends it with the
H-I-T-C deposit index, post-quantum registration keys, first-registration-wins
consensus, and the local depth-10 finality rule. The reorganization and
confirmation guidance here is adapted from the
[Karbo account-number guide](https://github.com/seredat/karbowanec/wiki/Karbo-Account-Numbers-(H%E2%80%93I%E2%80%93C))
and reconciled with Discrete's implementation.
