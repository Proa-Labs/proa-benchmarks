#!/usr/bin/env node

import { createServer } from "node:http";
import { createRequire } from "node:module";

import {
  DEFAULT_BOUNDARY_COUNT,
  DEFAULT_CARDS_PER_PANEL,
  buildPanels,
  delayedPanel,
  normalizeBoundaryCount,
  normalizeCardsPerPanel,
  scenarioContract,
} from "../../../suspense-load/scenario.mjs";

if (process.env.NODE_ENV !== "production") {
  throw new Error("The Marko Suspense server requires NODE_ENV=production");
}

const require = createRequire(import.meta.url);
const { version: markoVersion } = require("marko/package.json");
const host = process.env.SUSPENSE_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5712);
const boundaryCount = normalizeBoundaryCount(
  process.env.SUSPENSE_BOUNDARIES || DEFAULT_BOUNDARY_COUNT,
);
const cardsPerPanel = normalizeCardsPerPanel(
  process.env.SUSPENSE_CARDS_PER_PANEL ?? DEFAULT_CARDS_PER_PANEL,
);

const Template = (await import("./build/suspense_app.compiled.mjs")).default;

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
      ...scenarioContract(boundaryCount, cardsPerPanel),
    });
    return;
  }
  if (request.url === "/metrics") {
    json(response, processMetrics());
    return;
  }
  if (request.url !== "/") {
    response.writeHead(404).end("not found\n");
    return;
  }

  const panels = buildPanels(boundaryCount, cardsPerPanel).map((panel) => ({
    ...panel,
    promise: delayedPanel(panel),
  }));
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-benchmark-engine": "marko",
  });
  Template.render({ panels, starIndexes: [0, 1, 2, 3, 4] }).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Marko await server listening on http://${host}:${port}`);
});
