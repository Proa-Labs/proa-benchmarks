# Canonical rendering protocol

This is the publication contract for the one public server-rendering scoreboard. A useful laboratory measurement is not a public framework comparison unless it satisfies every rule below.

## Benchmark question

The suite measures pure synchronous server-rendering latency from prepared input to one complete, independently owned HTML response. It excludes routing, middleware, databases, HTTP transfer, hydration, network latency, and production-server buffer pooling.

The three fixed workloads are:

| ID | Public label | Required content |
| --- | --- | --- |
| `cards` | Component page | 4 sections, 32 cards, and 160 feature-list items |
| `table` | 1,000-row table | 1,000 rows and 12 columns with escaping, formatting, branches, and variable-length lists |
| `products` | Product grid | 96 product cards and 480 SVG stars |

Fixture data and template/application compilation happen before timing. Helpers that implement render-time semantics—escaping, branches, numeric and date formatting, and iteration—remain inside the render boundary for every adapter.

## Admission and roster rules

[`canonical/roster.json`](canonical/roster.json) is the fixed expected roster. A renderer is `included`, `in_progress`, or `excluded`, with a concrete reason for either non-included state.

An included renderer must:

1. implement every canonical workload;
2. use a production or release build and its pinned canonical runtime;
3. return a complete independently owned response on every measured invocation;
4. pass every parity cell before timing begins; and
5. appear exactly once in the result artifact and generated table.

There are no partial public rows. An unexpected disappearance, missing workload, absent parity decision, or measurement from another capture invalidates report generation. The public Proa row is named exactly `Proa` and uses the ordinary owned-output path. Reuse, chaining, manual writes, capacity experiments, and controls remain in engineering reports.

## Parity gate

Each adapter first emits an untimed HTML dump. Chromium parses it, and the harness compares a canonical DOM requiring the same:

- elements and body order;
- non-class attributes and values;
- class-token membership;
- visible text after adjacent hydration-split text nodes are coalesced; and
- escaping, branch, loop, formatting, date, and attribute semantics encoded by the fixture.

The comparison may ignore renderer-internal comments, resource-preload hints, non-semantic `<head>` order, and class-token order. These allowances do not change the timed bytes. The report records response size, the payload delta from Proa, the canonical DOM digest, and whether exact bytes also match.

Each workload also has a negative control. The runner mutates a semantically relevant output and asserts that the gate rejects it. If any positive or negative parity check fails, timing never starts.

## Sampling

The default policy is fixed in [`canonical/workloads.json`](canonical/workloads.json):

| Workload | Warmups/process | Samples/process |
| --- | ---: | ---: |
| Component page | 200 | 2,000 |
| 1,000-row table | 20 | 200 |
| Product grid | 50 | 500 |

The full run uses five independent renderer processes. Each process constructs the fixture before warmup, compiles templates before warmup, renders one response per sample, and reports the same declared output-ownership policy. Renderer invocation order is rotated between process blocks. Samples are not discarded after framework labels are known.

The headline value is the median of the five within-process P50 values. The detailed report retains the median within-process P95, the full range of process P50s, process count, sample and warmup counts, and payload bytes. The table expresses every value relative to the Proa value from the same workload and capture. It does not calculate a composite score.

## Result artifact

`results/latest.json` is the sole source for the public Markdown. Its schema contains, at minimum:

```json
{
  "schema_version": 2,
  "benchmark_version": "canonical-ssr-v1",
  "capture_id": "...",
  "captured_at": "...",
  "host": {},
  "workloads": [],
  "renderers": [],
  "parity": {},
  "measurements": {},
  "versions": {}
}
```

Every measurement repeats the capture ID. Report validation rejects incomplete rosters, partial included renderers, unapproved renderers, missing parity, mixed captures, measurements attached to non-included renderers, and multiple Proa entries. A synchronization check regenerates the marked README sections in memory and fails if a public value differs from JSON.

The capture also records the host CPU, memory, OS, architecture, harness commit and dirty state, adapter/runtime versions, build and run commands, source fingerprint, timestamps, limitations, and raw-artifact locations.

## Interpretation and limitations

Lower render time is better for this specific boundary. Results answer only the three named workloads on the captured machine. They do not measure request throughput, application latency, browser performance, developer experience, feature breadth, compile time, memory under sustained load, or every possible application shape.

Serializer payload differences remain visible in the detailed report. Tail anomalies and contradictory results remain reported. A production HTTP throughput claim requires a separate suite in which every framework uses its normal server, allocator, pooling, response-management, concurrency, and backpressure behavior.

The current checked-in sample is the September 1, 2026 unified run of all 17 adapters. It contains no value from the older cross-language fixture.
