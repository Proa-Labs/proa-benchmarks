# Memcpy mechanism floor

Figure 05 combines the dated core framework matrix with a matched Proa
output-buffer comparison across three core workloads and 11 showcase pages.
Standard and full-size Proa rendering share freshly measured copy controls
for their exact response bytes. Every result is labelled as a multiple of memcpy,
with a 10× guide. See the [source table](../../engineering.md#proa-output-buffer-allocation)
and [capture instructions](../../showcase/README.md#output-buffer-comparison).

The August 31, 2026 representative capture included a control that copied each pre-rendered Proa response into an equal-sized, preallocated destination with `ptr::copy_nonoverlapping`.

| Workload | Bytes copied | Process-median P50 µs [min–max] | Process-median P95 µs |
| --- | ---: | ---: | ---: |
| Component page | 25,108 | 0.257 [0.208–0.304] | 0.338 |
| 1,000-row table | 988,509 | 11.509 [11.358–11.700] | 12.213 |
| Product grid | 284,908 | 3.331 [3.330–3.398] | 3.554 |

The source and destination were warmed and reused. Rendering, allocation, hashing, network transfer, and independent response ownership were outside the measured operation. Each sample copied at least 16 MiB in a batch and divided by the operation count; complete byte equality was asserted afterward.

This is an optimistic hot-buffer mechanism floor, not a renderer or an HTTP/DRAM throughput result. It cannot appear as a technology row. Current local chart artifacts under `rendering/results/` remain engineering artifacts.
