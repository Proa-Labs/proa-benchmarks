# Shared HTTP load driver

`driver.mjs` and `worker.mjs` are the load generator behind the two HTTP
benchmarks, [`../page-load/`](../page-load/) and
[`../suspense-load/`](../suspense-load/). They exist so that a benchmark
never reports a server knee that was really the client's.

## What the driver guarantees

- **Separate generator processes.** The driver forks several worker processes
  (default: the smaller of 8 and logical CPUs minus 4). Request scheduling,
  response parsing, and body validation run in those workers, never on the
  event loop that samples the server or on the server's own cores.
- **Open-loop and closed-loop phases share one summary shape.** Open-loop
  phases schedule fixed-rate arrivals and measure latency from the scheduled
  arrival, so queueing during saturation stays visible. Closed-loop phases keep
  N connections busy back to back and report what one server core sustains.
- **Every response can be validated.** A phase names a validator module and the
  workers import it; the page benchmark hashes every body against the engine's
  parity-gated dump, the streaming benchmark checks every boundary marker.
- **The generator reports on itself.** Each phase records generator CPU, the
  busiest worker's event-loop utilization, and scheduling lag. A phase whose
  busiest worker exceeds 80% utilization, or whose P95 scheduling lag exceeds
  25 ms, is marked invalid and the publication run aborts.
- **Phases wait for the previous phase's sockets to drain.** A saturated phase
  leaves thousands of client sockets in TIME_WAIT, and macOS offers only about
  16k ephemeral ports, so each phase first waits (up to 90 seconds) for the
  TIME_WAIT count to fall below 1,500 and records how long it waited.
- **The server is measured exactly.** CPU is the server process's own
  CPU-time delta from `getrusage`/`process.resourceUsage()` across all threads;
  RSS is sampled every 100 ms with `ps`.

Timestamps are absolute epoch milliseconds (`performance.timeOrigin +
performance.now()`), so records from different worker processes share one
timeline when the driver merges them.
