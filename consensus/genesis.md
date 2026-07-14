# Discrete genesis

The pre-launch candidate genesis block is byte-for-byte consensus data. Every
node must agree on it. This document summarizes its public allocation, unlock
schedule, and pinned network identifiers.

## What genesis contains

The genesis coinbase carries the entire **Discrete Treasury Reserve** as
per-output-unlocked `CoinbaseOutput`s — one batch per recipient — in a single
transaction. This is possible because Discrete added a per-output `unlockHeight`
to the wire (see the [wire format](pq-wire-format.md)), so staggered unlock
times fit in one coinbase tx and `GENESIS_COINBASE_TX_HEX` remains the single
frozen artifact.

The genesis coinbase `extra` also carries a headline, embedded as a
`TX_EXTRA_NONCE` — Discrete's analogue of Bitcoin's *"The Times 03/Jan/2009
Chancellor on brink of second bailout for banks"*:

> Reuters 08/Jul/2026 — Crypto firms prepare defenses as quantum threat to encryption draws nearer

The candidate block timestamp was captured when this genesis was regenerated after
the headline. It is protocol metadata, not a publication-time or no-premine proof.
The headline and timestamp establish only that this candidate artifact was assembled
no earlier than the cited article; they do not prove when the network was publicly
announced or exclude private mining after that date.

### Monetary policy

- **Total initial emission target:** 21,000,000 XDS (the emission-curve ceiling).
- **Treasury Reserve:** 1,050,000 XDS — **5%** of the ceiling. The reserve counts
  *within* the cap (it reduces ongoing block reward; it is not minted on top).
- **No ICO. No private sale. No separate dev tax.** The reserve is a locked
  allocation that unlocks gradually.
- **Treasury use is limited to:** development, audits, infrastructure, listings,
  documentation, and grants.

### Unlock schedule

- **50,000 XDS per batch** (5,000,000 atoms at `CRYPTONOTE_DISPLAY_DECIMAL_POINT
  = 2`).
- **21 batches total** = 1,050,000 XDS.
- **Unlocked gradually over 5 years.** Batch *k* (1-based) unlocks at height
  `(k-1) × 87,600`. At a 90 s block target, 87,600 blocks ≈ one quarter, so one
  batch unlocks each quarter; the last unlocks at height 1,752,000 ≈ 5.0 years.
  Batch 1 (unlock height 0) is spendable from genesis.

| Batch | Amount (XDS) | Unlock height |
|------:|-------------:|--------------:|
| 1  | 50,000 | 0         |
| 2  | 50,000 | 87,600    |
| 3  | 50,000 | 175,200   |
| 4  | 50,000 | 262,800   |
| 5  | 50,000 | 350,400   |
| 6  | 50,000 | 438,000   |
| 7  | 50,000 | 525,600   |
| 8  | 50,000 | 613,200   |
| 9  | 50,000 | 700,800   |
| 10 | 50,000 | 788,400   |
| 11 | 50,000 | 876,000   |
| 12 | 50,000 | 963,600   |
| 13 | 50,000 | 1,051,200 |
| 14 | 50,000 | 1,138,800 |
| 15 | 50,000 | 1,226,400 |
| 16 | 50,000 | 1,314,000 |
| 17 | 50,000 | 1,401,600 |
| 18 | 50,000 | 1,489,200 |
| 19 | 50,000 | 1,576,800 |
| 20 | 50,000 | 1,664,400 |
| 21 | 50,000 | 1,752,000 |

**Genesis block timestamp:** 2026-07-13 02:39:16 UTC (`1783910356`).
The timestamp was captured at the requested regeneration step and is pinned as
`GENESIS_BLOCK_TIMESTAMP`; the Reuters 08/Jul/2026 headline remains the canonical
news anchor. Neither value is a proof of fair launch.

**Genesis block hash (mainnet):**
`3101b248ac612883c47b93fa6a4d9d34020ee2f7541ad17e73c42088748a5219`
(pinned by `tests/test_pq_genesis.cpp`).

## Genesis and DiscretePower

Genesis is the trusted network anchor, not a normally mined block. The node
skips both ML-DSA signature verification and DiscretePower validation at height
0. The serialized block carries a 3,309-byte all-zero `signature` placeholder so
it has the same wire shape as later blocks, but the block hashing blob and block
ID exclude that field.

Changing the non-genesis PoW algorithm therefore does **not** require genesis
regeneration: no DiscretePower result is stored in the block ID, and genesis has
no miner identity capable of signing for its 21 independent Treasury recipients.
Regenerating timestamp, nonce, or coinbase data would instead create a different
network anchor and require an intentional network reset plus updates to the
pinned genesis hash and every genesis-bound artifact. It provides no additional
PoW validation for height 0.
