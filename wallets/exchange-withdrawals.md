# Withdrawal integration

Treat withdrawal submission as a durable state machine, not as a retryable HTTP
request.

```text
created -> validated -> submitting -> submitted -> confirming -> completed
                          |
                          +-> submission_unknown -> operator reconciliation
```

## Required internal state

Create one internal withdrawal record before calling walletd. Enforce a unique
business operation id in the exchange database and prevent concurrent submission
of the same record.

Recommended states:

| State | Meaning |
|---|---|
| `created` | Customer request exists but has not passed validation |
| `validated` | Destination, amount, limits, and approvals passed |
| `submitting` | Exactly one worker owns the walletd call |
| `submitted` | Returned transaction hash is stored durably |
| `confirming` | Transaction is being followed on chain |
| `completed` | Confirmation policy passed |
| `submission_unknown` | The request may have reached walletd but no trustworthy result was received |
| `failed` | A definitive non-ambiguous failure was recorded |

## Submission flow

1. Lock one withdrawal record and move it to `submitting`.
2. Validate the user-provided destination with `validateAddress`.
3. Recheck balance, policy limits, and required operator approval.
4. Call `sendTransaction` with `fee: 0`, `unlockHeight: 0`, and an explicit
   wallet-owned `changeAddress`.
5. On success, atomically store `transactionHash` and move to `submitted`.
6. Poll `getTransaction` or `getTransactions` until policy confirmations pass.
7. Move to `completed` only after confirmation.

Example request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "sendTransaction",
  "params": {
    "addresses": [],
    "transfers": [
      { "address": "<recipient address or account number>", "amount": 10000 }
    ],
    "fee": 0,
    "changeAddress": "0",
    "unlockHeight": 0
  }
}
```

Field rules:

- Empty `addresses` allows any spendable wallet output to be selected.
- `transfers[].address` accepts a full PQ address, H-I-A-C, or H-I-A-T-C.
- `fee: 0` requests automatic fee selection.
- `unlockHeight` must be `0` for TX_PQ.
- `changeAddress` must be one of your own wallet addresses/selectors.

## Ambiguous submission

> **Never automatically retry `sendTransaction` after an ambiguous result.**

The current request has no caller-supplied durable idempotency key. If walletd
built and relayed the transaction but the HTTP response was lost, an unchanged
retry can create a second payment.

Treat all of these as ambiguous when the request may have reached walletd:

- timeout;
- connection drop;
- malformed or truncated response; and
- client cancellation after request transmission.

Move the record to `submission_unknown`, keep it locked against new submission,
and reconcile wallet and chain history before an operator decides what to do.

Time, amount, source-bucket changes, wallet history, and external chain
inspection are evidence, but they are not always a deterministic match when
multiple outgoing transactions could fit the same request.

JSON-RPC `id` only correlates one response. It is not a wallet operation id.

## Failure and retry matrix

| Result | Classification | Action |
|---|---|---|
| JSON-RPC `Invalid Request` or `WRONG_PARAMETERS` | Definitive request failure | Fix the request; do not retry unchanged |
| `ACCOUNT_NOT_REGISTERED` | Definitive precondition failure | Wait for registration/finality before account-number payment |
| `UNTRUSTED_DAEMON` | Definitive trust failure | Fail closed and connect the operator's trusted daemon |
| `CHANGE_ADDRESS_REQUIRED` | Definitive request failure | Supply an explicit wallet-owned change address |
| `INSUFFICIENT_FUNDS` | Definitive balance failure | Retry only after balance or lock state changes |
| `AMOUNT_TOO_LARGE_FOR_ONE_TRANSACTION` | Definitive size failure | Apply an explicit split policy with separately tracked transactions |
| Read-only RPC transport failure | Safe to retry | Retry with bounded backoff |
| `sendTransaction` timeout/disconnect/truncated response | Ambiguous submission | Enter `submission_unknown`; never auto-retry |

Store the method, JSON-RPC code, wallet error text, internal operation id, and
time for every failure. HTTP success alone must not advance accounting state.

## Source selection and sweeping

To spend only one deposit bucket, pass its address in `addresses`. Route change
back to a deliberate wallet-owned destination, normally the primary wallet:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "sendTransaction",
  "params": {
    "addresses": ["<deposit address>"],
    "transfers": [
      { "address": "<cold wallet address>", "amount": 50000 }
    ],
    "fee": 0,
    "changeAddress": "0",
    "unlockHeight": 0
  }
}
```

If a wallet has multiple deposit buckets and no explicit source, omitting
`changeAddress` can return `CHANGE_ADDRESS_REQUIRED` because change routing is
ambiguous.

## Withdrawal implementation checklist

- [ ] One durable internal operation exists before walletd submission.
- [ ] Validation and policy approval happen before spending.
- [ ] Exactly one worker can own `submitting`.
- [ ] Returned hash and `submitted` state are committed atomically.
- [ ] Ambiguous results enter `submission_unknown` without automatic retry.
- [ ] Definitive errors follow the retry matrix.
- [ ] Completion requires the exchange confirmation policy.
- [ ] Hot-to-cold sweeps use the same durable state discipline.

Related: [Operations and recovery](exchange-operations.md),
[Qualification checklist](exchange-qualification.md), and
[walletd RPC reference](walletd-rpc.md).
