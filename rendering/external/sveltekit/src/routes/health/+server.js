import { scenarioContract } from '../../../../../../page-load/scenario.mjs';
import { streamingContract } from '#lib/server/scenario.js';

export function GET() {
  const contract = scenarioContract();
  return Response.json({
    status: 'ok', engine: 'sveltekit', framework: 'SvelteKit 3.1.0 / Svelte 5.57.2 / adapter-node 6.0.0',
    nodeEnv: process.env.NODE_ENV, adapter: 'adapter-node',
    ...contract,
    workloads: Object.fromEntries(contract.workloads.map(w => [w.id, { path: w.path, cardinality: w.cardinality }])),
    streaming: streamingContract,
  }, { headers: { 'cache-control': 'no-store' } });
}
