# Block size and capacity growth

Discrete applies two independent block-size controls: an absolute,
height-based consensus cap and a rolling-median reward penalty. A block must
satisfy both.

## Absolute consensus cap

For block height `h`, the cumulative serialized size of the coinbase and all
ordinary transactions may not exceed

```text
absoluteCap(h) = 1,000,000 + floor(h * 524,288 / 350,400) bytes
```

The constants are:

| Constant | Value | Meaning |
|---|---:|---|
| `MAX_BLOCK_SIZE_INITIAL` | 1,000,000 bytes | Exact cap at genesis |
| `MAX_BLOCK_SIZE_GROWTH_SPEED_NUMERATOR` | 512 * 1024 bytes | Growth per target year |
| `MAX_BLOCK_SIZE_GROWTH_SPEED_DENOMINATOR` | 350,400 blocks | Expected blocks per year at the 90-second target |

Integer division makes growth continuous in small steps over block height; it
is not applied as an annual jump. Illustrative values:

| Height | Approximate age | Absolute cap |
|---:|---:|---:|
| 0 | genesis | 1,000,000 bytes |
| 350,400 | 1 year | 1,524,288 bytes |
| 700,800 | 2 years | 2,048,576 bytes |
| 1,752,000 | 5 years | 3,621,440 bytes |
| 3,504,000 | 10 years | 6,242,880 bytes |

Changing any of these constants changes block validity and therefore requires
a coordinated consensus upgrade after launch.

## Rolling-median penalty

The reward calculation uses the median cumulative size of the preceding 100
blocks. The effective median `M` has a floor of 1,000,000 bytes:

```text
M = max(median(previous 100 block sizes), 1,000,000)
```

- At or below `M`, the block subsidy and fees are unpenalized.
- Between `M` and `2M`, subsidy and fees receive the quadratic CryptoNote
  size penalty.
- Above `2M`, reward construction fails and the block is invalid.

Consequently the validity ceiling at height `h` is

```text
min(absoluteCap(h), 2M)
```

The reference miner also targets at most 125% of the median for fee-paying
transactions and measures the actual post-quantum coinbase before finalizing a
template. If coinbase overhead would cross the absolute cap, it removes enough
transactions and rebuilds rather than producing an invalid block.

The height-based cap permits predictable long-term capacity growth; the median
rule makes miners pay an economic cost before recent sustained usage justifies
larger blocks.
