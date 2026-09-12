# Allocation analysis

Allocation instrumentation was run separately from latency measurement for the integer-formatting fixture. Each August 2026 cell is the median of 25 release-binary trials and reports `allocations / reallocations / total requested bytes`.

| Rows | Proa independently owned | Askama independently owned | Sailfish independently owned |
| ---: | ---: | ---: | ---: |
| 1 | 3 / 0 / 4,792 | 1 / 1 / 1,395 | 1 / 0 / 600 |
| 10 | 3 / 0 / 4,792 | 1 / 3 / 6,975 | 1 / 0 / 2,789 |
| 100 | 10 / 1 / 47,707 | 1 / 6 / 59,055 | 1 / 0 / 25,098 |
| 1,000 | 59 / 4 / 450,004 | 1 / 9 / 475,695 | 1 / 0 / 249,874 |
| 10,000 | 552 / 8 / 4,516,120 | 1 / 13 / 7,618,095 | 1 / 0 / 2,517,951 |

All 15 prewarmed reusable-contiguous cells recorded `0 / 0 / 0` after one untimed capacity warmup. That is useful allocator evidence, but it is not substituted for the independently owned response contract in the public renderer table.

Run the current audit with:

```sh
./rendering/run_all.sh integers
```
