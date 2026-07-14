# Node operation

This guide runs a mainnet `discreted` node for wallets, applications, and the
public peer-to-peer network. The daemon stores and validates the chain locally;
wallet keys are not required unless the same process also mines.

## Network ports

| Service | Default | Recommended exposure |
|---|---:|---|
| P2P | TCP `9330` | Internet, if you want inbound peers |
| Node RPC (HTTP) | TCP `9331` | Loopback or a trusted private network |
| Node RPC (HTTPS) | TCP `9332` | Only when explicitly enabled |

The P2P listener binds to `0.0.0.0` by default. RPC binds to `127.0.0.1` by
default. Do not forward the RPC port merely to make the node reachable by peers;
only P2P port `9330` is needed for that.

## Start a node

With the release binary on `PATH`:

```bash
discreted \
  --p2p-bind-ip 0.0.0.0 \
  --p2p-bind-port 9330 \
  --rpc-bind-ip 127.0.0.1 \
  --rpc-bind-port 9331
```

The node discovers peers, downloads the chain, and validates it before reporting
that it is synchronized. Initial synchronization can take time. In the daemon
console, use:

```text
status       # height, sync percentage, peers, mempool, and network hashrate
height       # local chain height
print_cn     # current connections
print_pl     # known peers
print_pool_sh
```

Wait for `status` to report `Synced` before relying on the node for wallet
balances or starting a miner.

## Accept inbound peers

Allow inbound TCP `9330` in the host firewall and forward it through NAT when
necessary. If the public port differs from the local listener, advertise it with
`--p2p-external-port <port>`. `--hide-my-port` keeps the node from advertising
itself as a peer-list candidate.

For a stable connection to a known peer, add:

```bash
discreted --add-priority-node node.example.org:9330
```

`--add-exclusive-node` is different: when supplied, priority nodes and seed
nodes are ignored and the daemon connects only to the exclusive set. Reserve it
for controlled deployments.

## Data directory and configuration

The default data directory is:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\Discrete` |
| macOS | `~/Library/Application Support/Discrete` |
| Linux and other Unix | `~/.Discrete` |

Override it with `--data-dir <path>`. The default configuration filename is
`Discrete.conf`; a relative config path is resolved inside the data directory.
Command-line settings can be placed in that file without the leading `--`:

```ini
p2p-bind-ip=0.0.0.0
p2p-bind-port=9330
rpc-bind-ip=127.0.0.1
rpc-bind-port=9331
log-level=2
```

Start with `discreted --help` after an upgrade to review the options supported by
that binary.

## Run without an interactive console

Use `--no-console` under a service manager. Send the process its normal stop
signal so it can close the database cleanly. In an interactive session, use
`exit`; avoid terminating the process forcibly.

Keep the data directory on reliable storage with enough free space. The chain
database can be recreated by synchronizing again, so wallet files and wallet
passwords should be backed up separately rather than treated as part of a node
backup.

## RPC security

Node RPC is intended to remain on loopback unless there is a specific remote
client requirement.

- `--restricted-rpc` disables mutating administrative methods.
- `--rpc-user` and `--rpc-password` enable HTTP Basic authentication. When both
  are empty, authentication is disabled.
- `--rpc-bind-ssl-enable`, `--rpc-bind-ssl-port`, `--rpc-chain-file`, and
  `--rpc-key-file` add an HTTPS listener. The HTTP listener still exists, so
  firewall or proxy it appropriately.
- Do not allow untrusted access to unrestricted RPC. Mining control, recovery,
  and other administrative methods are deliberately unavailable in restricted
  mode.

For a wallet on the same host, the default loopback RPC listener is sufficient:

```bash
simplewallet --wallet-file wallet.bin --daemon-address 127.0.0.1:9331
```

## Operational checks

Check `status` regularly. Investigate a node that remains behind the observed
height, has no peers for a prolonged period, or repeatedly reports database or
checkpoint errors. `print_ban` shows locally banned peers; `ban <ip> [seconds]`
and `unban <ip>` are available for incident response.

If the daemon reports a first-seen finality fork warning, do not roll back
blindly. Confirm the canonical tip using independent nodes or the official block
explorer, then follow the [finality recovery guide](finality-recovery.md).

To use the node for CPU mining, continue with the [mining guide](mining.md).
