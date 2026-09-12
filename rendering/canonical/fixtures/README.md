# Canonical fixtures

The public renderer comparison has exactly three deterministic fixtures:

- `cards`: 4 sections, 32 cards, and 160 feature-list items;
- `table`: 1,000 rows and 12 columns, including escaping, formatting, status
  branches, dates, attributes, and variable-length tag lists; and
- `products`: 96 product cards and 480 SVG stars.

[`workloads.json`](../workloads.json) is the machine-readable workload roster.
The Rust implementation owns the reference semantics; equivalent fixture-data
builders live beside adapters where a language cannot consume that Rust data
directly. The browser parity gate, rather than similar byte length, is the final
authority on equivalence.
