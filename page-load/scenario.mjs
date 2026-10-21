// Shared contract for the canonical-pages HTTP benchmark.

export const SCENARIO_ID = "canonical_pages_v1";

export const WORKLOADS = Object.freeze([
  Object.freeze({ id: "cards", label: "Component page", path: "/cards", cardinality: 32, fixedRateRps: 2_000 }),
  Object.freeze({ id: "products", label: "Product grid", path: "/products", cardinality: 96, fixedRateRps: 500 }),
  Object.freeze({ id: "table", label: "1,000-row table", path: "/table", cardinality: 1_000, fixedRateRps: 50 }),
]);

export const ENGINES = Object.freeze([
  Object.freeze({ id: "proa", label: "Proa", language: "Rust", server: "Axum" }),
  Object.freeze({ id: "react", label: "React", language: "JavaScript", server: "node:http" }),
  Object.freeze({ id: "marko", label: "Marko", language: "JavaScript", server: "node:http" }),
  Object.freeze({ id: "go-html-template", label: "Go html/template", language: "Go", server: "net/http" }),
  Object.freeze({ id: "sveltekit", label: "SvelteKit", language: "JavaScript", server: "adapter-node" }),
]);

export const PUBLICATION = Object.freeze({
  closedLoopConcurrency: 64,
  preRollSeconds: 1,
  durationSeconds: 5,
  repeats: 3,
  warmupRequests: 24,
});

export function scenarioContract() {
  return {
    id: SCENARIO_ID,
    workloads: WORKLOADS.map(({ id, label, path, cardinality, fixedRateRps }) => ({ id, label, path, cardinality, fixedRateRps })),
    concurrencyModel: "one server process per engine, pinned to one core of work: Proa one Tokio worker thread, Go GOMAXPROCS=1, Node single process",
    responseContract: "every measured response is byte-identical to the engine's parity-gated canonical dump",
  };
}
