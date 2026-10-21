import { sourceFiles as kitSources } from '../rendering/external/sveltekit/benchmark.mjs';

// Every measured server implementation, shared fixture, and load/browser driver.
// Reporting code and retained artifacts do not participate in these timings.
export const sourceFiles = [...new Set([...kitSources,
  '.nvmrc', 'Cargo.lock', 'Cargo.toml', 'package.json', 'pnpm-lock.yaml',
  'load/driver.mjs', 'load/worker.mjs', 'page-load/scenario.mjs',
  'rendering/Cargo.toml', 'rendering/src/http_load.rs',
  'rendering/src/bin/proa_suspense_server.rs', 'rendering/src/topcoat_product_grid.rs',
  'rendering/external/shared/suite_data.mjs',
  'suspense-load/scenario.mjs', 'suspense-load/stats.mjs', 'suspense-load/validate.mjs',
  'sveltekit/run.mjs', 'sveltekit/browser.mjs', 'sveltekit/sources.mjs',
])].sort();
