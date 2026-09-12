#!/usr/bin/env node
// Marko production server for the canonical page workloads. Templates are
// compiled ahead of time by compile_suite.mjs; each request renders through
// Marko's normal streaming pipe into the Node HTTP response.

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PRODUCT_COUNT,
  TABLE_ROW_COUNT,
  buildCardSections,
  buildProducts,
  buildTableRows,
} from "../shared/suite_data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "production") {
  throw new Error("The Marko page server requires NODE_ENV=production");
}

const require = createRequire(import.meta.url);
const { version: markoVersion } = require("marko/package.json");
const host = process.env.PROA_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5722);

const inputs = {
  cards: { sections: buildCardSections() },
  table: { rows: buildTableRows() },
  products: { products: buildProducts(), starIndexes: [0, 1, 2, 3, 4] },
};
const templates = {};
for (const workload of Object.keys(inputs)) {
  const compiledPath = join(here, `suite_${workload}.compiled.mjs`);
  templates[workload] = (await import(pathToFileURL(compiledPath).href)).default;
}

function json(response, value) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function processMetrics() {
  const usage = process.resourceUsage();
  return {
    cpuTimeMicros: usage.userCPUTime + usage.systemCPUTime,
    peakRssBytes: usage.maxRSS * 1024,
  };
}

const server = createServer((request, response) => {
  if (request.url === "/health") {
    json(response, {
      status: "ok",
      engine: "marko",
      framework: `Marko ${markoVersion}`,
      nodeEnv: process.env.NODE_ENV,
      id: "canonical_pages_v1",
      workloads: {
        cards: { path: "/cards", cardinality: 32 },
        table: { path: "/table", cardinality: TABLE_ROW_COUNT },
        products: { path: "/products", cardinality: PRODUCT_COUNT },
      },
      renderPath: "compiled Marko template render().pipe(response); fresh response per request",
    });
    return;
  }
  if (request.url === "/metrics") {
    json(response, processMetrics());
    return;
  }
  const workload = request.url.slice(1);
  const template = templates[workload];
  if (!template) {
    response.writeHead(404).end("not found\n");
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  template.render(inputs[workload]).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Marko page server listening on http://${host}:${port}`);
});
