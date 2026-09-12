# Rendering engineering laboratory

These reports answer implementation and mechanism questions. They are intentionally outside the public framework scoreboard because their fixtures, ownership policies, runtime rosters, or measurement boundaries differ.

| Report | Question |
| --- | --- |
| [Proa output construction strategies](proa-buffer-strategies.md) | How do ownership, reuse, chaining, and peer construction paths change renderer cost? |
| [Allocation analysis](allocation-analysis.md) | How do fresh and prewarmed outputs allocate across an integer-heavy scaling fixture? |
| [Integer formatting](integer-formatting.md) | How do native integer-to-ASCII paths scale? |
| [Memcpy floor](memcpy-floor.md) | What is an optimistic hot-buffer copy mechanism floor for the retained page sizes? |
| [Runtime comparisons](runtime-comparisons.md) | How did runtime and framework-local experiments behave on their original fixtures? |
| [Application coverage](application-coverage.md) | Which application-shaped pages have Proa-only or partial peer coverage? |

All values are dated local evidence. The [August 2026 archive](../../archive/public-report-2026-08-31.md) retains the full original tables, prose, environment hashes, and contrary results; only its local links were rebased. The [migration map](../MIGRATION.md) explains every move.

None of these values may be copied into the canonical scoreboard. A renderer becomes public only through one successful `./rendering/run-all` capture.
