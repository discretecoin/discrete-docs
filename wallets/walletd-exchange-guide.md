# Exchange integration

This is the starting point for adding XDS deposits and withdrawals to an
exchange or custodial service.

> **Recommended setup**
>
> Run one private `walletd` connected to your own synced `discreted`, create a
> **single-key-index** wallet, and assign one permanent H-I-A-T-C deposit
> address to each customer or invoice.

## Choose your task

<div class="docs-grid docs-grid--compact">
  <a class="docs-card" href="#/wallets/exchange-listing-profile">
    <span class="docs-card__index">01 / LIST</span>
    <h2>Listing facts</h2>
    <p>Copy-ready asset, network, deposit, and withdrawal parameters.</p>
  </a>
  <a class="docs-card" href="#/wallets/exchange-quickstart">
    <span class="docs-card__index">02 / PROVE</span>
    <h2>Integration quickstart</h2>
    <p>Complete one testnet deposit and withdrawal loop.</p>
  </a>
  <a class="docs-card" href="#/wallets/exchange-deposits">
    <span class="docs-card__index">03 / RECEIVE</span>
    <h2>Deposits</h2>
    <p>Issue permanent addresses, scan safely, and credit exactly once.</p>
  </a>
  <a class="docs-card" href="#/wallets/exchange-withdrawals">
    <span class="docs-card__index">04 / SEND</span>
    <h2>Withdrawals</h2>
    <p>Use a durable state machine and contain ambiguous responses.</p>
  </a>
  <a class="docs-card" href="#/wallets/exchange-operations">
    <span class="docs-card__index">05 / OPERATE</span>
    <h2>Operations and recovery</h2>
    <p>Gate startup, monitor health, reconcile, back up, and restore.</p>
  </a>
  <a class="docs-card" href="#/wallets/exchange-qualification">
    <span class="docs-card__index">06 / APPROVE</span>
    <h2>Qualification</h2>
    <p>Test the exact release candidate and retain auditable evidence.</p>
  </a>
</div>

Need individual method schemas? Use the [walletd RPC reference](walletd-rpc.md).

## Integration at a glance

```text
customer / exchange backend
          |
          | JSON-RPC over a private authenticated connection
          v
       walletd  -------- encrypted wallet container + issued-address registry
          |
          | node RPC
          v
      discreted -------- Discrete peer-to-peer network
```

The exchange backend owns customer mapping, accounting, confirmation policy,
withdrawal state, and operator approval. `walletd` owns keys, address issuance,
transaction construction, wallet scanning, and wallet history.

## Safe default

| Decision | Recommended value |
|---|---|
| Deposit scheme | `single-key-index` |
| Customer identifier | One permanent H-I-A-T-C address per customer or invoice |
| Payment ID | Do not use for new integrations |
| Credit source | Positive normal `transfers[]` row for a known deposit address |
| Credit identity | Unique `(transaction_hash, deposit_address)` |
| Withdrawal change | Explicit wallet-owned `changeAddress`, normally `"0"` |
| Ambiguous withdrawal response | Enter `submission_unknown`; never auto-retry |
| RPC exposure | Localhost or private service network only |

## Build in this order

1. **Qualify the package.** Prove the node and wallet binaries launch from a
   clean host with all runtime dependencies. See
   [Qualification checklist](exchange-qualification.md).
2. **Bring up testnet.** Complete the [quickstart](exchange-quickstart.md) with
   synthetic wallets and test funds.
3. **Implement deposits.** Persist address assignments before displaying them,
   scan a reorg window, and make crediting idempotent.
4. **Implement withdrawals.** Use a durable state machine and stop automation on
   an ambiguous `sendTransaction` result.
5. **Add operations.** Gate startup on wallet/node synchronization, reconcile the
   issued-address registry, and rehearse restore.
6. **Run acceptance.** Execute every scenario in the
   [qualification checklist](exchange-qualification.md) against the exact release
   candidate you intend to deploy.

## Three rules that prevent expensive mistakes

> **Credit the address transfer, not the wallet total.**
>
> `transaction.amount` is the net effect across the entire wallet. A self-transfer
> into one of the wallet's own deposit addresses can make that value zero or
> negative while the destination `transfer.amount` is positive.

> **Never recycle a deposit address.**
>
> A customer can send to an old address at any time. Keep every issued address and
> index permanently mapped to its original owner.

> **Never blindly retry an ambiguous withdrawal.**
>
> The current `sendTransaction` API has no caller-supplied idempotency key. If the
> request reached walletd but the response was lost, a retry can create a second
> payment.

## The two deposit modes

The wallet container is created in exactly one mode. It cannot be switched later.

| Mode | Customer address | Key model | Use when |
|---|---|---|---|
| `single-key-index` | Short H-I-A-T-C account number | One view key and one spend key; deposits distinguished by `T` | Building an exchange or service integration |
| `aggregated-multikey` | Full PQ address | Shared view key and one derived spend key per deposit | Per-deposit spend-key isolation is more important than compact addresses |

`single-key-index` requires one on-chain account registration before deposit
addresses can be issued. The first customer deposit is `T=1`; `T=0` is the
primary account and is never issued as a customer deposit.

See [Deposit integration](exchange-deposits.md#choose-a-deposit-model) for the
address and index rules, and [Operations and recovery](exchange-operations.md#backup-and-restore)
for the different restore requirements.

## Terms used in these guides

| Term | Meaning |
|---|---|
| Atom | Smallest XDS amount. `1 XDS = 100 atoms`. RPC amounts are integers. |
| H-I-A-C | Registered base account number. |
| H-I-A-T-C | Deposit account number. `T` identifies the deposit bucket. |
| Address selector | Numeric string accepted by some RPC fields: `"0"` is primary, `"1"` is the first issued deposit. |
| Reorg window | Recent block range rescanned on every polling cycle. |
| `submission_unknown` | Internal exchange state used when a withdrawal may have reached walletd but no trustworthy response was received. |

## What these guides do not decide

The exchange must define its own confirmation threshold, hot-wallet limits,
operator approval policy, incident response, and custody controls. Documentation
cannot turn a source build into a qualified release or make a non-idempotent RPC
idempotent.
