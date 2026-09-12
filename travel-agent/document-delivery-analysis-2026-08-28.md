# HTML document delivery diagnosis

Measured on the same 8-vCPU AMD EPYC Milan Hetzner VPS and Chrome for Testing 149 used by the travel-agent benchmark. Each sample used a fresh browser. All scripts, stylesheets, images, fonts, and API requests were blocked so the main document could not contend with subresources.

`TTFB` ends at the first response byte. `Tail` runs from the first byte through the last encoded response byte; those adjacent phases form the document's network time. `Stable gap` is the repeated ≥50 ms delivery pause found at the same decoded-body offset across conditions, so it is already inside `Tail` and must not be added again.

## Result

| Condition | Surface | n | TTFB p50 | Encoded response | Link floor | Tail p50 | Stable gap p50 | Gap after decoded |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 40ms / 100Mbps | airbnb | 5 | 235.8 ms | 116.6 KiB | 9.6 ms | 582.6 ms | 292.4 ms (5/5) | 507.0 KiB |
| 40ms / 100Mbps | hotels | 5 | 127.7 ms | 317.2 KiB | 26.0 ms | 1.36 s | 1.12 s (5/5) | 1.39 MiB |
| 0ms / 100Mbps | airbnb | 5 | 251.1 ms | 117.3 KiB | 9.6 ms | 523.7 ms | 187.0 ms (5/5) | 507.4 KiB |
| 0ms / 100Mbps | hotels | 5 | 139.0 ms | 317.1 KiB | 26.0 ms | 1.32 s | 1.08 s (5/5) | 1.39 MiB |
| 0ms / 1Gbps | airbnb | 5 | 241.4 ms | 116.7 KiB | 1.0 ms | 524.5 ms | 289.5 ms (5/5) | 507.1 KiB |
| 0ms / 1Gbps | hotels | 5 | 145.0 ms | 317.3 KiB | 2.6 ms | 1.28 s | 1.11 s (5/5) | 1.39 MiB |

## First-byte evidence

These response headers came from the 40ms / 100Mbps control. Server-Timing metrics are origin-provided diagnostics and may overlap; they are not added to TTFB.

| Surface | Cache-Control | CDN cache | Origin p50 | Edge p50 |
|---|---|---:|---:|---:|
| airbnb | no-store, max-age=0, private, must-revalidate (5/5) | MISS 5/5 | 138.0 ms | 69.0 ms |
| hotels | no-cache, no-store, max-age=0, must-revalidate (5/5) | not exposed | — | — |

First byte and body delivery are separate waits. Airbnb's 5 documents were explicitly private/no-store and all reported a CDN miss; its own Server-Timing header reported 138.0 ms origin and 69.0 ms edge p50 inside the 235.8 ms browser-observed TTFB. Google Hotels also disabled caching but did not expose an equivalent origin/edge split. Removing the configured 40 ms latency did not improve either site's TTFB, which points to upstream document generation and edge handling rather than link throughput as the dominant first-byte cost.

Raising the configured link from 100 Mbps to 1 Gbps does not reduce either stable gap. Removing the configured request latency does not remove them either. A separate 1 Mbps validation makes Airbnb's 119 KiB encoded document a smooth ~910 ms transfer, confirming that Chrome's throughput control is active and that the 100 Mbps runs are not bandwidth-limited.

The decoded boundary is also repeatable. Airbnb pauses at roughly 507 KiB, between its SPA boot/auth roots and listing-image preload links. Google Hotels pauses at roughly 1.39 MiB inside the streamed `c-wiz` document markup. This describes where delivery stops; it does not establish whether either page's visible UI is server-rendered.

## Packet correlation

The correlation capture used tcpdump on `any` with a 128-byte snap length and a port-443 filter; it reported 0 dropped packets. Only timing and matching-flow metadata are retained in the repository.

| Surface | Protocol | CDP gap | Matching packet silence | Observation |
|---|---|---:|---:|---|
| airbnb | HTTP/2 over TCP | 299.5 ms | 304.4 ms | No inbound TCP payload arrived during the gap; the advertised receive window remained open, and delivery resumed without a new client packet. |
| hotels | HTTP/3 over QUIC | 1.19 s | 1.19 s | No inbound or outbound QUIC packet appeared on the document connection during the gap; delivery resumed from the remote peer. |

The packet captures show that the delay exists on the wire rather than only in parser or CDP event delivery: the remote flow itself sends no packets during the measured pause. The receiver remained available in the TCP case, and no client packet triggered resumption in either capture. The remaining externally visible boundary is origin/CDN delivery. Without Airbnb or Google's internal tracing, the experiment cannot distinguish application-side deferred work from edge buffering or pacing.

## Every document-only sample

| Condition | Surface | Run | TTFB | Tail | Stable gap | Gap offset | Encoded | Decoded |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 40ms / 100Mbps | airbnb | 1 | 345.5 ms | 432.9 ms | 185.0 ms | 507.0 KiB | 116.5 KiB | 887.5 KiB |
| 40ms / 100Mbps | airbnb | 2 | 198.7 ms | 555.9 ms | 292.4 ms | 507.2 KiB | 116.6 KiB | 885.9 KiB |
| 40ms / 100Mbps | airbnb | 3 | 205.6 ms | 665.4 ms | 476.4 ms | 507.5 KiB | 116.8 KiB | 884.7 KiB |
| 40ms / 100Mbps | airbnb | 4 | 235.8 ms | 601.3 ms | 254.4 ms | 506.9 KiB | 116.2 KiB | 871.6 KiB |
| 40ms / 100Mbps | airbnb | 5 | 239.6 ms | 582.6 ms | 307.4 ms | 507.0 KiB | 116.8 KiB | 887.5 KiB |
| 40ms / 100Mbps | hotels | 1 | 125.6 ms | 1.63 s | 1.41 s | 1.39 MiB | 316.8 KiB | 2.60 MiB |
| 40ms / 100Mbps | hotels | 2 | 131.3 ms | 1.51 s | 1.29 s | 1.39 MiB | 317.2 KiB | 2.60 MiB |
| 40ms / 100Mbps | hotels | 3 | 127.7 ms | 1.27 s | 1.05 s | 1.39 MiB | 317.5 KiB | 2.60 MiB |
| 40ms / 100Mbps | hotels | 4 | 124.5 ms | 1.32 s | 1.05 s | 1.39 MiB | 317.3 KiB | 2.60 MiB |
| 40ms / 100Mbps | hotels | 5 | 140.2 ms | 1.36 s | 1.12 s | 1.39 MiB | 317.2 KiB | 2.60 MiB |
| 0ms / 100Mbps | airbnb | 1 | 252.9 ms | 523.7 ms | 187.0 ms | 507.5 KiB | 117.1 KiB | 887.3 KiB |
| 0ms / 100Mbps | airbnb | 2 | 313.8 ms | 473.9 ms | 161.8 ms | 507.2 KiB | 116.6 KiB | 887.7 KiB |
| 0ms / 100Mbps | airbnb | 3 | 215.9 ms | 487.9 ms | 85.3 ms | 507.5 KiB | 117.5 KiB | 887.2 KiB |
| 0ms / 100Mbps | airbnb | 4 | 193.9 ms | 586.9 ms | 382.6 ms | 507.2 KiB | 117.3 KiB | 886.2 KiB |
| 0ms / 100Mbps | airbnb | 5 | 251.1 ms | 792.1 ms | 543.9 ms | 507.4 KiB | 117.5 KiB | 886.5 KiB |
| 0ms / 100Mbps | hotels | 1 | 116.1 ms | 1.28 s | 1.08 s | 1.39 MiB | 317.3 KiB | 2.60 MiB |
| 0ms / 100Mbps | hotels | 2 | 139.0 ms | 1.32 s | 1.07 s | 1.39 MiB | 317.3 KiB | 2.60 MiB |
| 0ms / 100Mbps | hotels | 3 | 156.2 ms | 1.38 s | 1.10 s | 1.39 MiB | 316.9 KiB | 2.60 MiB |
| 0ms / 100Mbps | hotels | 4 | 179.6 ms | 1.45 s | 1.20 s | 1.39 MiB | 317.0 KiB | 2.60 MiB |
| 0ms / 100Mbps | hotels | 5 | 117.0 ms | 1.28 s | 1.05 s | 1.39 MiB | 317.1 KiB | 2.60 MiB |
| 0ms / 1Gbps | airbnb | 1 | 231.0 ms | 612.7 ms | 357.5 ms | 507.1 KiB | 117.5 KiB | 888.0 KiB |
| 0ms / 1Gbps | airbnb | 2 | 281.4 ms | 451.6 ms | 264.9 ms | 508.7 KiB | 116.5 KiB | 873.5 KiB |
| 0ms / 1Gbps | airbnb | 3 | 424.1 ms | 524.5 ms | 317.8 ms | 507.0 KiB | 116.7 KiB | 883.6 KiB |
| 0ms / 1Gbps | airbnb | 4 | 241.4 ms | 541.9 ms | 289.5 ms | 508.8 KiB | 117.1 KiB | 886.4 KiB |
| 0ms / 1Gbps | airbnb | 5 | 213.6 ms | 514.0 ms | 181.5 ms | 507.0 KiB | 116.5 KiB | 888.4 KiB |
| 0ms / 1Gbps | hotels | 1 | 145.0 ms | 1.67 s | 1.41 s | 1.39 MiB | 317.4 KiB | 2.60 MiB |
| 0ms / 1Gbps | hotels | 2 | 145.6 ms | 1.24 s | 994.5 ms | 1.39 MiB | 317.2 KiB | 2.60 MiB |
| 0ms / 1Gbps | hotels | 3 | 96.8 ms | 1.28 s | 1.11 s | 1.39 MiB | 317.4 KiB | 2.60 MiB |
| 0ms / 1Gbps | hotels | 4 | 119.1 ms | 1.26 s | 1.02 s | 1.39 MiB | 317.3 KiB | 2.60 MiB |
| 0ms / 1Gbps | hotels | 5 | 146.0 ms | 1.47 s | 1.15 s | 1.39 MiB | 317.2 KiB | 2.60 MiB |
