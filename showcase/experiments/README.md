# Render optimization experiments

The [eBay patch](ebay-owned-string.patch) reduces render time with identical
HTML. These are experimental results against Proa `9f8a8fa9bde1`; figure 05
continues to show its original pinned capture.

| eBay cards, 60 listings | Original | Patched | Original / copy | Patched / copy |
| --- | ---: | ---: | ---: | ---: |
| Fresh 4 KiB chunks | 35.542 µs | 27.375 µs | 12.61× | 9.71× |
| Fresh full-size buffer | 32.334 µs | 23.833 µs | 11.47× | 8.45× |

The patch returns ASCII number formatting directly as bytes and finalizes the
typed HTML through `RenderBuffer::into_string()`. Both avoid redundant UTF-8
validation. The full-size experiment uses the same output invariant when
converting its contiguous buffer into a string. Dynamic text uses the existing
HTML escapers.

The [retained capture](../results/ebay-owned-string.json) contains five fresh
processes per cell in seeded randomized order. Each render process records
10,000 samples after 1,000 warmups. Allocation is timed; response destruction
is outside timing. Values are medians of process P50s. The common memcpy floor
is 2.820 µs, pooling five copy processes from each executable. Copy allocation
is excluded, with the same batching and warmed buffers as figure 05.

All processes reproduce the original 240,785-byte HTML SHA-256. Full-size
capacity stays exact on every measured render. All five patched process P50s
are below 10× the common floor: 9.66–9.78× for chunks and 8.44–8.57× for full-size.
Thirteen Rust tests pass, including decimal boundaries and 10,000 generated
integers, Unicode/escaping parity, and the upstream eBay tests. The patched
source also passes Proa's render-allocation lint.

## Reproduce

Build the pinned buffer fixture as described in the
[showcase instructions](../README.md#output-buffer-comparison), then run:

```sh
python3 showcase/experiments/ebay_owned_string.py
python3 showcase/experiments/ebay_owned_string.py --check
```

The script compiles original and patched copies of `srp.rs` against the same
release libraries, using identical optimization flags. Source, patch, library
and executable hashes are retained. Raw samples stay in the ignored
`showcase/results/ebay-owned-string-raw.json` file.

## Other targets

- **Nike product:** the full-size path is already 5.91× memcpy; its default path
  is 10.13×. Its profile shows substantial page allocation, zeroing and copying,
  consistent with the measured benefit from full-size allocation.
- **Sentry OTel:** the default path needs roughly 23.4% less render time to move
  from 13.06× to 10×. In a five-second profile of the warm render loop, 940 of
  4,214 samples landed in `memchr2`/`memchr3`, used for repeated text escaping.
  Short-string escape scans and many small output writes are concrete targets.
  The full-size profile also spends 759 of 3,839 samples in `extend_static` and
  `Vec::extend_from_slice`; inlining the small writer calls is worth testing.
  The full-size path is currently slower (14.79×); no Sentry speedup has been
  measured or incorporated into the figure.
