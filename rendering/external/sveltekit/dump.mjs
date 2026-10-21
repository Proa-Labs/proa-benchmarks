#!/usr/bin/env node
// Untimed output of the actual production SvelteKit route. Used for both DOM
// parity and exact per-response byte validation by the HTTP/cold-start suites.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { server } from './build/server/server.js';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const workload = argument('--workload', 'products');
if (!['cards', 'table', 'products'].includes(workload)) throw new Error('Unknown workload');
await server.init({ env: { ...process.env, NODE_ENV: 'production' } });
const response = await server.respond(new Request(`http://127.0.0.1:5173/${workload}`), { getClientAddress: () => '127.0.0.1' });
if (response.status !== 200) throw new Error(`SvelteKit returned ${response.status}`);
const html = await response.text();
const path = argument('--dump');
if (path) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, html); }
console.log(`SvelteKit ${workload}: ${Buffer.byteLength(html)} bytes`);
