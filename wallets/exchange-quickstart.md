# Exchange quickstart

Use this path to prove one complete XDS integration loop on testnet: start the
services, register the wallet, issue a deposit address, observe a deposit, and
submit a withdrawal.

> **Use synthetic wallets and test funds only.**
>
> Completing this page proves basic connectivity. It does not replace the full
> [qualification checklist](exchange-qualification.md).

## Before you start

You need:

- a qualified `discreted` and `walletd` build from the same intended release;
- a synced testnet node under your control;
- a throwaway wallet directory;
- an RPC password stored outside shell history; and
- test XDS from a separate wallet.

All examples send JSON-RPC to:

```text
POST http://127.0.0.1:9335/json_rpc
Content-Type: application/json
```

When credentials are configured, add HTTP Basic authentication. Keep walletd on
localhost or a private service network.

## 1. Create the exchange wallet

```bash
walletd --generate-container \
  --container-file exchange.wallet \
  --container-password "$WALLET_PASSWORD" \
  --single-key-index
```

Back up the mnemonic and record that the deposit scheme is
`single-key-index`. Do not create a production wallet from this quickstart.

## 2. Start the services

Start the node RPC locally:

```bash
discreted --rpc-bind-ip 127.0.0.1 --rpc-bind-port 9331
```

Start walletd against that node:

```bash
walletd --container-file exchange.wallet \
  --container-password "$WALLET_PASSWORD" \
  --bind-address 127.0.0.1 \
  --bind-port 9335 \
  --rpc-password "$RPC_PASSWORD" \
  --daemon-address 127.0.0.1 \
  --daemon-port 9331
```

`--daemon-address` takes the host only. Do not pass `host:port` there.

## 3. Pass the startup checks

Call `getStatus`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getStatus",
  "params": {}
}
```

Do not continue until wallet/node/known heights are within your test tolerance,
`lastBlockHash` is non-empty, and the daemon has peers. Then call global
`getBalance` and require `scannedHeight` to be caught up to the safe daemon tip.

Call `getDepositScheme` and require:

```json
{
  "result": {
    "scheme": "single-key-index",
    "tracking": false
  }
}
```

The response also contains the current `depositCount`.

## 4. Register the base account

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "registerAccount",
  "params": {}
}
```

Poll `getAccountStatus` until `registered` is `true`, then apply the
[account-number finality policy](account-numbers.md#finality-recommendations)
before publishing deposit addresses.

## 5. Issue the first deposit address

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "createDepositAddress",
  "params": {}
}
```

Expected shape:

```json
{
  "result": {
    "address": "<H-I-A-1-C>",
    "index": 1
  }
}
```

The first issued deposit is `T=1`. Persist the returned address and index before
displaying the address. Never reassign it to another customer or invoice.

## 6. Observe and credit a deposit

Send test XDS to the returned address from a separate wallet. Query
`getTransactions` over the relevant block range:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "getTransactions",
  "params": {
    "addresses": ["<H-I-A-1-C>"],
    "firstBlockIndex": 120000,
    "blockCount": 100,
    "paymentId": ""
  }
}
```

Replace `firstBlockIndex` and `blockCount` with a bounded range that includes
the test payment; the values above are illustrative.

Credit only when the transaction succeeded, is not coinbase, has enough
confirmations, and contains a positive normal transfer for the exact assigned
address. Do not require whole-wallet `transaction.amount > 0`.

The production polling and reorg algorithm is in
[Deposit integration](exchange-deposits.md).

## 7. Submit one test withdrawal

Validate the destination first, then call `sendTransaction` with an explicit
wallet-owned change address:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "sendTransaction",
  "params": {
    "addresses": [],
    "transfers": [
      { "address": "<test recipient>", "amount": 100 }
    ],
    "fee": 0,
    "changeAddress": "0",
    "unlockHeight": 0
  }
}
```

Store the returned `transactionHash` before advancing internal state. If the
response is lost or malformed, do not retry automatically; follow
[Withdrawal integration](exchange-withdrawals.md#ambiguous-submission).

## Quickstart exit criteria

- [ ] Node and wallet scanner reached the intended testnet tip.
- [ ] `getDepositScheme` returned `single-key-index`.
- [ ] Base account registration reached the required finality.
- [ ] First issued deposit returned `T=1`.
- [ ] One confirmed deposit was credited exactly once.
- [ ] One withdrawal hash was stored and confirmed.
- [ ] Restarting the scanner did not duplicate the credit.

Next: implement the full [deposit](exchange-deposits.md) and
[withdrawal](exchange-withdrawals.md) state machines before qualification.
