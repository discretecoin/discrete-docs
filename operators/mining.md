# Mining

Discrete uses identity-bound post-quantum proof of work. Every candidate block is
signed by the miner's ML-DSA spend key and its coinbase reward is paid to that
same PQ wallet identity. A bare reward address is therefore not enough: the
miner needs controlled access to the mining wallet's spend secret.

Mining is currently solo CPU mining. Use one of the three supported flows below:
the GUI wallet, the `simplewallet` console, or `discreted` directly.

## Before starting

- Use a wallet whose seed and password are backed up.
- You no longer have to wait for synchronization before asking to mine. Every
  flow *arms* the miner and starts hashing only once the node has caught up, so
  a start request issued during sync is held rather than rejected. Mining on a
  stale chain would only produce work on a tip the network has already moved
  past.
- Treat peerless mining as an exceptional operation. The daemon can be started
  without peers to bootstrap a fresh network, but this mode is not intended for
  normal mining.
- Start with a conservative thread count and watch CPU temperature, cooling,
  power use, and system responsiveness.
- Coinbase rewards remain locked until the protocol maturity period has passed.

## Automatic pause and resume

All supported flows use the daemon's built-in miner, and all of them go through
the same arm-then-start mechanism: a mining request records the identity and
thread count, and worker threads spawn only while the node is synchronized. The
initial start and a recovery after a dropped connection are the same code path.

Once mining is active, losing the last connected peer—including when the network
connection drops—stops hashing automatically while the mining request remains
armed. Reconnecting to a peer is not enough by itself to restart hashing: the
node first catches up, refreshes its block template, and then resumes the same
mining session automatically once it is synchronized.

Running `stop_mining` explicitly cancels the mining request, so mining does not
resume after a later reconnection. Automatic suspension prevents a disconnected
miner from continuing to extend an isolated, stale chain; it does not prove
that a remaining peer is honest or connected to the majority chain.

## GUI wallet

GUI mining requires the built-in embedded node. It is disabled when the wallet
is connected to a remote node because identity-bound mining needs in-process
access to the open wallet's spend secret.

1. In connection settings, select the built-in embedded node.
2. Open the wallet and wait for synchronization and at least one peer.
3. Open the **Mining** view.
4. Choose **Eco**, **Balanced**, or **Max**, or set the CPU core count directly.
5. Select **Start mining**.

The view reports current, average, and peak hashrate, difficulty, estimated block
time, session work, recent finds, and mining events. The expected-time and luck
figures are averages, not a countdown or a promise that a block is due.

Changing the CPU core count while mining updates the worker threads. If the last
peer disconnects, the connectivity protection described above suspends mining
until the embedded node reconnects and catches up. **Start mining automatically**
controls whether the wallet arms mining again after a later application launch;
an already-armed session resumes after reconnection without this setting.

## simplewallet console

Run `simplewallet` against a trusted local daemon:

```bash
simplewallet --wallet-file miner.wallet \
  --daemon-address 127.0.0.1:9331
```

After the wallet is synchronized:

```text
start_mining 4
stop_mining
```

The thread count defaults to `1` and cannot exceed the hardware concurrency
limit reported by the wallet.

This command sends the wallet's spend secret to the daemon's `/start_mining` RPC
method so the daemon can derive the PQ mining identity. Understand what that
secret is: on Discrete the spend secret **is** the wallet's 32-byte master seed,
the single root from which the whole identity derives. It confers full spend
authority over the wallet, not a mining-only credential.

The daemon locks and scrubs the temporary secrets after derivation, but the
transport still carries them. Use this flow only with a co-located daemon over
loopback in a trusted environment. Do not use it through a public or third-party
RPC node. If the wallet file is not already open, prefer the daemon console flow
below, which reads the encrypted container directly and never puts the seed on a
socket.

## Daemon console

When the wallet is not open in `simplewallet`, the daemon can read its encrypted
file directly. In the `discreted` console:

```text
start_mining <wallet-file> [threads]
stop_mining
```

The daemon prompts for the wallet password. For a controlled non-interactive
secret source:

```text
start_mining miner.wallet 4 --mining-password-file C:\secure\miner-password.txt
```

The wallet may also be given as a named option, so a working headless command
line can be pasted into the console unchanged:

```text
start_mining --mining-wallet /secure/miner.wallet \
             --mining-password-file /secure/miner-password.txt
```

The password file contains the password on its first line. Restrict its file
permissions and keep it outside source trees and backups that are not encrypted.
The daemon opens the wallet read-only, derives the mining identity, and scrubs
the temporary secret material.

If the node has not finished synchronizing, the command reports that mining is
armed and hashing begins by itself once sync completes:

```text
Node is not synchronized yet. Mining is armed with 4 thread(s) and will begin
automatically once sync completes.
```

Useful daemon commands while mining:

```text
show_hr       # display hashrate — also the way to confirm this node is mining
hide_hr       # stop displaying hashrate
print_diff    # next-block difficulty
status        # sync, peers, network hashrate, and chain state
```

`status` reports the *network* hashrate, not whether this node is mining. Use
`show_hr` to confirm the local miner is running.

## Headless daemon

For a service-managed miner, provide the wallet when starting `discreted` and ask
it to mine with `--start-mining`:

```bash
discreted \
  --mining-wallet /secure/miner.wallet \
  --mining-password-file /secure/miner-password.txt \
  --start-mining \
  --mining-threads 4 \
  --no-console
```

> **`--start-mining` is required to mine.** `--mining-wallet` on its own only
> opens the container, checks the password, derives the identity, and scrubs it —
> a startup validation that fails fast on a wrong path or password instead of an
> hour into a run. It leaves the miner idle. Service units written before this
> flag existed must add it, or they will start, sync, and never hash.

Without `--start-mining` the daemon says so explicitly:

```text
Mining wallet loaded and verified, but the miner is idle: pass --start-mining
to mine at startup, or use the console command 'start_mining <wallet>'.
```

With it, mining is armed at startup and begins when the node is synchronized:

```text
Mining armed to the wallet's identity with 4 thread(s); it will begin once the
node is synchronized.
...
You are now synchronized with the network.
Mining has started with 4 threads, good luck!
```

If `--mining-threads` is omitted or set to zero, one thread is used. Omitting the
password file causes an interactive password prompt, which is unsuitable for a
headless service.

## Choosing a flow

| Situation | Use |
|---|---|
| Desktop user who wants controls and live charts | GUI wallet with embedded node |
| Wallet already open in the reference CLI | `simplewallet` `start_mining` over loopback |
| Operator with a closed wallet file | Daemon console `start_mining` |
| Unattended miner | Daemon `--mining-wallet` + `--start-mining` startup options |

All four paths derive the same PQ mining identity from the same wallet seed. A
reward found by any of them appears in that wallet after the block is accepted,
the wallet scans it, and coinbase maturity is reached.

For the consensus and security model behind this workflow, see
[DiscretePower](../consensus/pow.md) and [mining security](../consensus/mining-security.md).
