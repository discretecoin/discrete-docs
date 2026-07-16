# simplewallet RPC

`simplewallet` has a single-wallet JSON-RPC mode for lightweight integrations.
It is separate from `walletd`: the two servers use different command-line
options, method names, request schemas, and wallet engines.

Use `simplewallet` RPC when an application needs one reference wallet. Use
[walletd RPC](walletd-rpc.md) for a service wallet, deposit addresses, address
scoping, or exchange integration.

## Start the server

Supplying `--rpc-bind-port` selects RPC mode instead of the interactive wallet
console:

```bash
simplewallet \
  --wallet-file service.wallet \
  --password "$WALLET_PASSWORD" \
  --daemon-address 127.0.0.1:9331 \
  --rpc-bind-ip 127.0.0.1 \
  --rpc-bind-port 9333
```

The defaults are loopback IP `127.0.0.1`, HTTP port `9333`, and HTTPS port
`9334`. All examples POST JSON-RPC 2.0 to:

```text
http://127.0.0.1:9333/json_rpc
```

The wallet file is opened exclusively by this process and stored again during a
normal shutdown. Keep the wallet password and file permissions protected.

## Optional authentication

RPC authentication is not mandatory. When both `--rpc-user` and
`--rpc-password` are omitted or empty, requests do not require an Authorization
header:

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_balance","params":{}}' \
  http://127.0.0.1:9333/json_rpc
```

If either credential is non-empty, HTTP Basic authentication is required. For
example:

```bash
simplewallet --wallet-file service.wallet --password "$WALLET_PASSWORD" \
  --rpc-bind-port 9333 --rpc-user app --rpc-password "$RPC_PASSWORD"

curl -s -u "app:$RPC_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"get_balance","params":{}}' \
  http://127.0.0.1:9333/json_rpc
```

Authentication does not encrypt traffic. Keep the server on loopback or behind
an authenticated TLS tunnel or reverse proxy. The built-in SSL options add an
HTTPS listener but do not remove the HTTP listener:

```text
--rpc-bind-ssl-enable
--rpc-bind-ssl-port 9334
--rpc-chain-file <certificate-chain>
--rpc-key-file <private-key>
```

## Methods

`simplewallet` RPC method names use snake_case.

| Method | Purpose | Important parameters |
|---|---|---|
| `get_balance` | Available and locked atomic-unit balances | none |
| `get_address` | Wallet's primary Discrete address | none |
| `get_height` | Wallet node's local height | none |
| `transfer` | Send one transaction | `destinations`, optional `fee`, `unlock_height`, `payment_id`, or `extra` |
| `get_payments` | Confirmed incoming payments for a payment ID | `payment_id` |
| `get_transfers` | Wallet transaction history | none |
| `get_last_transfers` | Most recent history entries | optional `count` |
| `get_transaction` | One wallet transaction and its destinations | `tx_hash` |
| `validate_address` | Validate a PQ address or H-I-A-C/H-I-A-T-C account number | `address` |
| `register_pq_account` | Submit the wallet's fee-paying PQ account registration | none |
| `sign_message` | Sign a message with the wallet identity | `message` |
| `verify_message` | Verify a PQ wallet signature | `message`, `address`, `signature` |
| `get_paymentid` | Generate a random payment ID | none |
| `store` | Store the wallet immediately | none |
| `reset` | Reset and rescan the wallet | none |
| `stop_wallet` | Store the wallet and stop the RPC server | none |
| `change_password` | Change the wallet file password | `old_password`, `new_password` |
| `query_key` | Export mnemonic or paper-wallet key material | `key_type`: `mnemonic` or `paperwallet` |

`query_key`, `change_password`, `transfer`, `reset`, and `stop_wallet` are
administrative methods. The server has no restricted/read-only mode, so every
client that can reach it can attempt every method.

## Balance example

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "get_balance",
  "params": {}
}
```

Response fields are atomic units:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "locked_amount": 0,
    "available_balance": 250000000
  }
}
```

## Transfer example

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "transfer",
  "params": {
    "destinations": [
      {
        "address": "<PQ address or account number>",
        "amount": 100000000
      }
    ]
  }
}
```

On success, `result.tx_hash` contains the transaction hash. Amounts and fees are
atomic units. The server rejects a fee below the node's current minimum.

## PQ account registration

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "register_pq_account",
  "params": {}
}
```

This method submits a fee-paying registration transaction and returns
`result.tx_hash`. It requires a spend-capable wallet with enough available
balance. It is not the free anti-spam-PoW registration exposed by the interactive
`register` command.

Registration inclusion is not finality. Before publishing or paying an H-I-A-C
number, follow the [account-number finality recommendations](account-numbers.md#finality-recommendations).

## Differences from walletd

| Capability | simplewallet RPC | walletd RPC |
|---|---|---|
| Primary use | One reference wallet | Services, custodians, exchanges |
| Method style | `get_balance`, `get_address` | `getBalance`, `getAddress` |
| Deposit-address schemes | No | Aggregated multikey and single-key-index |
| Address-scoped balances | No | Yes |
| Restricted/read-only mode | No | No; isolate the service endpoint |
| RPC authentication | Optional | Optional |

Do not send walletd request bodies to the simplewallet port or assume that a
method with a similar name returns the same fields.
