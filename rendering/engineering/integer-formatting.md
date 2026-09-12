# Integer-to-ASCII scaling

This August 2026 byte-parity fixture interpolated `u8`, `u16`, `u32`, `u64`, `u128`, `i32`, and `i64` values in text and attributes through each engine's native formatter. Fixture construction was outside timing. Each Criterion cell used 60 samples, a one-second warmup, and a three-second measurement window. Values are raw 95% regression-slope intervals.

## Independently owned output

| Rows | Output bytes | Proa | Askama | Sailfish |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 467 | 156.64 / 157.13 / 157.65 ns | 112.20 / 112.72 / 113.25 ns | 58.523 / 58.671 / 58.805 ns |
| 10 | 2,413 | 486.65 / 488.33 / 490.07 ns | 692.06 / 694.62 / 697.28 ns | 340.36 / 340.97 / 341.61 ns |
| 100 | 22,243 | 4.4434 / 4.4544 / 4.4653 µs | 6.0989 / 6.1189 / 6.1386 µs | 3.2479 / 3.2522 / 3.2568 µs |
| 1,000 | 222,044 | 46.369 / 46.505 / 46.650 µs | 58.985 / 59.163 / 59.341 µs | 33.396 / 33.505 / 33.607 µs |
| 10,000 | 2,238,112 | 473.91 / 496.92 / 529.40 µs | 605.16 / 607.05 / 608.97 µs | 345.16 / 346.10 / 346.98 µs |

## Prewarmed reusable contiguous output

| Rows | Output bytes | Proa | Askama | Sailfish |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 467 | 30.074 / 30.125 / 30.173 ns | 48.482 / 48.672 / 48.879 ns | 34.517 / 34.593 / 34.688 ns |
| 10 | 2,413 | 325.12 / 326.14 / 327.15 ns | 532.25 / 535.14 / 537.80 ns | 319.46 / 319.90 / 320.33 ns |
| 100 | 22,243 | 3.3464 / 3.3556 / 3.3645 µs | 5.6354 / 5.6623 / 5.6906 µs | 3.1704 / 3.1750 / 3.1799 µs |
| 1,000 | 222,044 | 33.665 / 33.729 / 33.797 µs | 58.038 / 58.296 / 58.564 µs | 33.427 / 33.486 / 33.549 µs |
| 10,000 | 2,238,112 | 346.44 / 347.37 / 348.32 µs | 581.05 / 582.88 / 584.75 µs | 345.75 / 346.37 / 346.99 µs |

The results include unfavorable and near-tie cells: Sailfish was lower for every owned-output scale, while the 10,000-row reusable Proa and Sailfish intervals overlapped. This was one Criterion process and remains local engineering evidence.
