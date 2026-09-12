#!/usr/bin/env node
// React production server for the canonical page workloads. Each request
// renders the shared canonical components with renderToString and sends the
// complete document, which is the ordinary Node SSR path.

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";

import { PRODUCT_COUNT, TABLE_ROW_COUNT } from "../rendering/external/shared/suite_data.mjs";
import { ROOTS } from "../rendering/external/react/suite_components.mjs";

if (process.env.NODE_ENV !== "production") {
  throw new Error("The React page server requires NODE_ENV=production");
}

const require = createRequire(import.meta.url);
const { version: reactVersion } = require("react/package.json");

// Which react-dom server build actually loaded: React chooses at require
// time from NODE_ENV, so this is the ground truth the artifact records.
function reactDomBuild() {
  const loaded = Object.keys(require.cache).filter((path) => /react-dom-server\.node\.(production|development)\.js$/.test(path));
  if (loaded.some((path) => path.endsWith("development.js"))) return "development";
  return loaded.length ? "production" : "unknown";
}

const host = process.env.PROA_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5721);

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
      engine: "react",
      framework: `React ${reactVersion}`,
      nodeEnv: process.env.NODE_ENV,
      reactDomBuild: reactDomBuild(),
      id: "canonical_pages_v1",
      workloads: {
        cards: { path: "/cards", cardinality: 32 },
        table: { path: "/table", cardinality: TABLE_ROW_COUNT },
        products: { path: "/products", cardinality: PRODUCT_COUNT },
      },
      renderPath: "renderToString into response.end; fresh string per request",
    });
    return;
  }
  if (request.url === "/metrics") {
    json(response, processMetrics());
    return;
  }
  const root = ROOTS[request.url.slice(1)];
  if (!root) {
    response.writeHead(404).end("not found\n");
    return;
  }
  const html = renderToString(h(root));
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(html),
  });
  response.end(html);
});

server.listen(port, host, () => {
  console.log(`React page server listening on http://${host}:${port}`);
});
