# walletd — Post-Quantum (PQ) JSON-RPC

`walletd` (the PaymentGate service) is the JSON-RPC wallet a service/exchange runs
against a Discrete node. Discrete is post-quantum from genesis, so the funds a
service holds are **PQ funds**, addressed by a **PQ address** and tracked as a
**PQ balance**.

For an operator-focused exchange runbook, including the recommended
single-key-index / H-I-A-T-C workflow, see the [walletd exchange integration guide](walletd-exchange-guide.md).

This document covers the `walletd` PQ methods. For the distinct single-wallet
server built into the reference CLI, see [simplewallet RPC](simplewallet-rpc.md).

## Running

```
discreted                                  # node
walletd --container-file w.wallet --container-password PW \
        --bind-address 127.0.0.1 --bind-port 8070
```

All examples below POST JSON-RPC 2.0 to `http://127.0.0.1:8070/json_rpc`.

RPC authentication is optional. It is disabled when both `--rpc-user` and
`--rpc-password` are omitted, as in the command above. If either is supplied,
HTTP Basic authentication is required; add `-u USER:PASSWORD` to the curl
examples. Keep unauthenticated RPC on loopback or another trusted local
transport, and never expose a wallet RPC endpoint directly to the public
internet.

## `getAddress`

Returns the wallet's primary PQ address. This is the address payers send PQ
funds to; it is identical to `simplewallet`'s `address` for the same seed.

Request:

```
curl -s -X POST http://127.0.0.1:8070/json_rpc -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "getAddress", "params": {}
}'
```

Response:

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "address": "<primary PQ address>",
    "enabled": true
  }
}
```

`enabled` is `false` (and `address` empty) for a tracking/view-only container,
which has no spend secret and therefore no PQ identity.

## `getBalance`

Returns the PQ available balance (atomic units) and the height the PQ scanner has
reached. Mirrors `simplewallet`'s `balance`.

Request:

```
curl -s -X POST http://127.0.0.1:8070/json_rpc -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": {}
}'
```

Response:

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "availableBalance": 0,
    "lockedAmount": 0,
    "scannedHeight": 12345,
    "enabled": true
  }
}
```

`availableBalance` is what can be spent right now — confirmed AND past its unlock
height. `lockedAmount` is the rest: funds still in the mempool (including a deposit
whose funding transaction was orphaned by a reorg and returned to the pool) plus
immature coinbase. A send can draw at most `availableBalance`; do not treat
`lockedAmount` as spendable. Both are in atomic units (divide by
10^`CRYPTONOTE_DISPLAY_DECIMAL_POINT` for whole coins). With an `address` param the
same two fields are reported for that one deposit bucket.

## `registerAccount` (free, anti-spam PoW)

Registers this wallet's PQ identity for a human-readable account number via a
`TX_FREE_REG` — no funds required, only an anti-spam proof-of-work that walletd
solves for you. Returns the registration transaction hash; poll
`getAccountStatus` until it confirms. Mirrors simplewallet's `register`.

```
curl -s -X POST http://127.0.0.1:8070/json_rpc -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "registerAccount", "params": {}
}'
```

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "transactionHash": "<hex>" } }
```

## `registerAccountPaid`

Registers this wallet's PQ identity with a **fee-paying** `TX_PQ` instead of the
anti-spam PoW: a self-payment of the smallest denomination whose `tx.extra` carries
the registration tag (consensus records it first-registration-wins). Requires a PQ
balance to cover the fee; otherwise use the free `registerAccount`. Returns the
transaction hash; poll `getAccountStatus` until it confirms.

```
curl -s -X POST http://127.0.0.1:8070/json_rpc -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "registerAccountPaid", "params": {}
}'
```

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "transactionHash": "<hex>" } }
```

## `getAccountStatus`

Polls the node's PQ account registry for this wallet's identity. Once the
registration confirms, `registered` becomes `true` and `accountNumber` holds the
human-readable H-I-A-C account number.

```
curl -s -X POST http://127.0.0.1:8070/json_rpc -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "getAccountStatus", "params": {}
}'
```

Before confirmation:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "registered": false, "accountNumber": "", "blockHeight": 0, "txIndex": 0 } }
```

After confirmation:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "registered": true, "accountNumber": "<H-I-A-C>", "blockHeight": 1234, "txIndex": 1 } }
```

Typical flow: call `registerAccount`, wait for the tx to be mined, then poll
`getAccountStatus` until `registered` is `true`. The account number is the same
one simplewallet's `account` shows for the same seed.

`registered: true` reports inclusion in the node's current chain; it is not a
finality signal. Before publishing the number or issuing H-I-A-T-C deposits, apply
the [account-number finality recommendations](account-numbers.md#finality-recommendations).

## Deposit-wallet modes

A walletd container is created in ONE of two deposit-wallet schemes, fixed at
creation and immutable thereafter:

| Flag | Spec | Keys | Use case | Per-deposit spend isolation |
|---|---|---|---|---|
| `--aggregated-multikey` (DEFAULT) | Spec 1 | one shared ML-KEM view key + one ML-DSA spend key **per deposit** | custodial web wallet | YES |
| `--single-key-index` | Spec 2 / H-I-A-T-C | one view + one spend key; deposits are an integer index `T` | exchange | NO (a spend-key compromise exposes every deposit) |

The flags are valid only with `--generate-container`, are mutually exclusive, and
the chosen scheme is persisted in the container:

```
walletd --container-file exchange.wallet --container-password PW -g --single-key-index
walletd --container-file webwallet.wallet --container-password PW -g            # aggregated-multikey (default)
```

### `getDepositScheme`

```
curl ... -d '{ "jsonrpc":"2.0","id":1,"method":"getDepositScheme","params":{} }'
# -> { "result": { "scheme": "single-key-index", "depositCount": 3, "tracking": false } }
```

`depositCount` is how many deposit addresses have been issued. `tracking` is
`true` only for a view-only container.

### `createDepositAddress`

Returns a new deposit address and its index. In aggregated-multikey mode the
address is a full PQ address with its own spend key; in single-key-index mode it
is the **H-I-A-T-C** account number (the base account's `H-I`, the key fingerprint
`A`, the new index `T`, and a check char). single-key-index requires the account to be **registered
first** (run `registerAccount` and wait for confirmation), because H-I-A-T-C
embeds the account's on-chain registration coordinates.

The returned `index` is the deposit's `T`. In single-key-index mode the first
deposit is `T=1`, because `T=0` is the primary address itself (a plain PQ address
and a base H-I-A-C number both pay `T=0`, so `H-I-A-0-C` is never issued); in
aggregated-multikey mode the first deposit index is `0`. Numeric address
selectors count issued addresses in order: selector `"0"` is the primary address
and selector `"1"` is the first deposit, whichever index it carries.

```
curl ... -d '{ "jsonrpc":"2.0","id":1,"method":"createDepositAddress","params":{} }'
# aggregated-multikey -> { "result": { "address": "<full PQ address>", "index": 3 } }
# single-key-index    -> { "result": { "address": "<H-I-A-T-C>", "index": 3 } }
```

### `listDepositAddresses`

```
curl ... -d '{ "jsonrpc":"2.0","id":1,"method":"listDepositAddresses","params":{} }'
# -> { "result": { "addresses": ["...","..."], "indices": [1,2] } }
```

Returns every issued deposit at once. A single-key-index container that is not
registered yet answers with an empty list, because H-I-A-T-C cannot be rendered
before the base H-I-A-C exists.

### `listDepositAddressesPage`

Single-key-index only. Returns one bounded page of the issued deposit registry,
so a service with a large registry can traverse it without requesting the whole
list every time. All four parameters are required; `limit` is `1..256`.

```
curl ... -d '{ "jsonrpc":"2.0","id":1,"method":"listDepositAddressesPage",
  "params":{ "offset":0, "limit":256,
             "expectedAccountNumber":"<H-I-A-C>", "expectedDepositCount":1000 } }'
# -> { "result": { "scheme":"single-key-index", "tracking":false,
#                  "accountNumber":"<H-I-A-C>", "depositCount":1000, "offset":0,
#                  "addresses":["<H-I-A-1-C>", "<H-I-A-2-C>", ...],
#                  "indices":[1, 2, ...] } }
```

`offset` is a 0-based position in the issued sequence, not a `T`; `indices` are
the deposit `T` values of the returned addresses (`offset + 1` onwards, since
issuance starts at `T=1`). The page is conditional on the registry being what the
caller believes it is: `expectedAccountNumber` must equal the `accountNumber`
reported by `getAccountStatus`, and `expectedDepositCount` must equal the current
`getDepositScheme.depositCount`. Keep both fixed for the whole traversal; if either
stops matching, or `offset` exceeds the count, the call fails with
`WRONG_PARAMETERS` and the traversal must be restarted from the refreshed values.
A matching request at `offset == expectedDepositCount` succeeds with an empty
page, which marks the end of the registry.

Unlike `listDepositAddresses`, an unregistered account is an error here
(`ACCOUNT_NOT_REGISTERED`, the same answer `createDepositAddress` gives before
registration), so a paging client cannot mistake it for an empty registry.
Registration lookups go through the connected daemon, so the call also fails
closed with `UNTRUSTED_DAEMON` when that daemon is not trusted to resolve
account numbers (see [resolver trust](account-numbers.md#resolver-trust)).

Paying a deposit address works from any Discrete wallet: `simplewallet`/`greenwallet`
`transfer` accept a raw PQ address (aggregated-multikey deposit), an H-I-A-C account
number, or an H-I-A-T-C deposit subaddress (single-key-index), threading the deposit
index `T` into the payment automatically.

> Status: implemented end-to-end. Scheme selection/persistence, the deposit-address
> API, sender-side H-I-A-T-C resolution, per-deposit scan attribution, and rollback
> accounting are wired through `WalletLedger`/`WalletGreen`. The scanner derives the
> deposit keys for the container's scheme and stamps each owned output with its
> `depositIndex` (persisted across reloads). `getBalance(address)` and aggregate
> `getBalance` both report spendable funds as `availableBalance` and the pending or
> immature/timelocked remainder as `lockedAmount`.

## Verifying parity with simplewallet

Open the same container with `simplewallet` and run `address` / `balance`.
The `getAddress.address` must equal the address `address` prints, and
`getBalance.availableBalance` must equal simplewallet's "Available balance"
(both are the spendable amount; immature/pending funds show as
`getBalance.lockedAmount` and simplewallet's "Locked") once both have scanned to
the same height. The PQ address is derived
deterministically from the container's primary spend secret, so it is stable
across reopen and identical between the two front-ends.
