# Pending upgrade (unscheduled)

> **Not active.** Everything on this page is implemented in the reference node and
> wallets but has **no activation height**. Every node applies today's rules, and a
> transaction using anything below is invalid on the network today. Activating it is a
> hard fork; the height will be announced separately.

The upgrade bundles two changes that activate together, at
`parameters::PQ_TRANSCRIPT_V2_HEIGHT` (`PQ_GROUPED_AUTH_HEIGHT` is defined as the same
height and can never be earlier):

1. **Signing transcript v2.** Each input's signature binds the chain identity (the
   genesis block id) and the index of the input it authorizes, so a signature cannot be
   replayed on another network or moved to another input of the same transaction.
2. **Grouped input authorization.** An input can reuse the key, and the signature, of an
   earlier input of the same transaction instead of carrying its own.

The separate outContext-v2 delivery declaration (`TX_PQ_V2`) has its own height,
`PQ_DELIVERY_V2_HEIGHT`, also unscheduled.

## Why grouped authorization

Today every input carries its spend key (1,952 bytes) and an ML-DSA-65 signature (3,309
bytes): about 5.3 KB per input, even when thirty inputs are signed by the same key over the
same digest. A wallet that has received many small payments therefore pays a lot of block
space to spend them, and one transaction can carry at most 32 inputs, so a large payment
may need several transactions or a consolidation first.

With grouping, the second and later inputs under a key cost about 70 bytes each:

| Spending N outputs of one key | Today | Grouped |
|---|---|---|
| N = 2 | ~10.6 KB | ~5.4 KB |
| N = 32 | ~170 KB | ~7.5 KB |
| N = 256 | 8 transactions, ~1.36 MB | 1 transaction, ~23 KB |

Nothing new is revealed: inputs spending under the same key already show the same key on
the wire today.

## Rules

**Key-reference input** (wire tag `0x13`, a new form of the ordinary input):

```
prevTxid (32) || varint(prevOutIndex) || varint(keyRef) || rhoReveal (32)
```

- `keyRef` is the index of an **earlier** input of the same transaction that carries its
  key (tag `0x10`). A reference to itself, to a later input, or to another reference is
  malformed and does not parse. The value `0xFFFFFFFF` is reserved for "carries its own
  key" and is not valid in this form.
- The referenced input's key is this input's key for every purpose:
  `spend_commit(key, rho)` must open the output being spent, and the nullifier is computed
  exactly as for any input. An output therefore has one spent tag however it is spent, and
  a reference can only spend outputs that commit to that key.
- `pqSignatures` holds **one signature per key-carrying input**, in input order.
  Key-reference inputs have none.

**Signatures.** Each key-carrying input at index `i` signs

```
txSigningDigestV2(i) = SHA3-256(
    "discrete-pq-tx-sign-v2"      ||
    chainId (32)                  ||   // genesis block id
    <body>                        ||   // the v1 body, wire format §6, every input's key included
    LE32(keyRef_0) || … || LE32(keyRef_{n-1})   ||   // 0xFFFFFFFF = carries its own key
    LE32(i)
)
```

The body lists every input, references included, so one signature authorizes every input
that references it. Because every signature binds every input's `keyRef`, only the signer
decides each input's form: turning a key-carrying input into a reference, or the reverse,
invalidates every signature, so nobody else can re-encode a transaction into a different
id.

**Grouping is optional.** A transaction may still carry the same key on several inputs,
each signed. The reference wallets always group.

**Caps.** At most 32 key-carrying inputs (each brings a key and a signature), at most 256
inputs in total, and the transaction size cap (256 KiB) is unchanged.

**Before activation** a key-reference input is invalid, and a node refuses such a
transaction before reading any referenced transaction from its database.

## Wallet support

| Wallet | Status |
|---|---|
| simplewallet, greenwallet, walletd, desktop GUI | Build grouped transactions automatically once the height is reached; sends and consolidations then take up to 256 inputs |
| Web/mobile wallet | Recognizes key-reference inputs when scanning (needed both to see its own spends and to find payments in grouped transactions). Its transaction builder still signs transcript v1 and must move to v2 before activation; it may keep carrying every key |
| Explorers | Show "authorized by the key of input N" for references |

## Before an activation height can be chosen

1. **Worst-case validation time.** Each input requires reading the transaction that holds
   the output it spends, and today that read deserializes the whole transaction. A 1 MB
   block full of key references holds roughly 14,000 inputs (~70 bytes each) against
   roughly 190 today, and the block-size cap grows over time. Nodes now read each
   referenced transaction once per validated
   transaction and check spent outputs first, but the worst case has not been measured.
   An outpoint index (amount, commitment, lock height) would make each read constant-size.
2. **Cost of invalid transactions.** A transaction is rejected after its referenced
   outputs are read, and rejected transactions pay nothing. Spent outputs and
   not-yet-active references are now refused before any read, so only an attacker's own
   unspent outputs can be used, but a per-peer budget for wasted validation work (as
   already exists for free registrations) should exist before 256-input transactions do.
3. **Web wallet transcript v2** signing, as above.
4. **External review** of the version-2 transcript, including the key-reference binding.
