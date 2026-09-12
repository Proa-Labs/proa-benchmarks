# Benchmark protocols

The public server-rendering scoreboard follows [`rendering/protocol.md`](rendering/protocol.md). That document defines its workload, ownership, parity, sampling, artifact, and publication contracts.

Two HTTP suites wrap the same pages in each framework's production server and follow the shared load-driver rules in [`load/README.md`](load/README.md):

- [`page-load/`](page-load/) serves the three canonical pages on one core per engine and reports sustained throughput, CPU per response, and memory; and
- [`suspense-load/`](suspense-load/) streams a Suspense-heavy page through Proa, Marko, and React.

The repository's other suites answer different questions and retain their methods beside their evidence:

- [`showcase/`](showcase/) covers application-shaped SSR and verified browser JavaScript;
- [`agent-chain/`](agent-chain/) covers a deterministic browser-agent chain;
- [`travel-agent/`](travel-agent/) covers a multi-site browser-agent workflow; and
- [`rendering/engineering/`](rendering/engineering/) contains mechanism and implementation experiments.

Never join values from those suites into the renderer scoreboard. The pre-refactor classification is recorded in [`rendering/RESULT_TABLE_AUDIT.md`](rendering/RESULT_TABLE_AUDIT.md).
