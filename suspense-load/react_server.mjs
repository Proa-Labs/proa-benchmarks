#!/usr/bin/env node

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { Suspense, createElement as h, use } from "react";
import { renderToPipeableStream } from "react-dom/server";

import { ProductCard } from "../rendering/external/react/suite_components.mjs";
import {
  DEFAULT_BOUNDARY_COUNT,
  DEFAULT_CARDS_PER_PANEL,
  buildPanels,
  delayedPanel,
  normalizeBoundaryCount,
  normalizeCardsPerPanel,
  scenarioContract,
} from "./scenario.mjs";

if (process.env.NODE_ENV !== "production") {
  throw new Error("The React Suspense server requires NODE_ENV=production");
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

const host = process.env.SUSPENSE_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5711);
const boundaryCount = normalizeBoundaryCount(
  process.env.SUSPENSE_BOUNDARIES || DEFAULT_BOUNDARY_COUNT,
);
const cardsPerPanel = normalizeCardsPerPanel(
  process.env.SUSPENSE_CARDS_PER_PANEL ?? DEFAULT_CARDS_PER_PANEL,
);

function Hero() {
  return h(
    "section",
    { className: "hero-shell" },
    h("p", { className: "eyebrow" }, "Suspense-heavy marketplace"),
    h("h1", null, "Canon FD 50mm f/1.4 S.S.C. Vintage Prime Lens"),
    h("p", { className: "price" }, "Bid US $129.50"),
    h("p", { className: "meta" }, "Condition: Used · Watchers: 214 · 12 bids"),
  );
}

function FallbackPanel({ panel }) {
  return h(
    "section",
    {
      className: "marketplace-panel fallback",
      "data-panel": panel.key,
      "data-panel-fallback": panel.key,
      "aria-busy": "true",
      "aria-label": panel.fallbackLabel,
    },
    h("p", { className: "panel-eyebrow" }, "Fallback"),
    h("h2", null, panel.fallbackLabel),
    h("p", null, "Waiting on upstream service."),
  );
}

function ReadyPanel({ panel }) {
  return h(
    "section",
    {
      className: "marketplace-panel ready",
      "data-panel": panel.key,
      "data-panel-ready": panel.key,
    },
    h("p", { className: "panel-eyebrow" }, panel.eyebrow),
    h("h2", null, panel.title),
    h("p", null, panel.body),
    panel.products.length
      ? h(
        "div",
        { className: "mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" },
        panel.products.map((product) => h(ProductCard, { key: product.id, product })),
      )
      : null,
  );
}

function DelayedPanel({ promise }) {
  return h(ReadyPanel, { panel: use(promise) });
}

function App({ panels }) {
  return h(
    "main",
    { className: "marketplace-pdp", "data-benchmark-shell": "suspense-load" },
    h(Hero),
    h(
      "div",
      { className: "content-grid" },
      ...panels.map((panel) =>
        h(
          Suspense,
          { key: panel.key, fallback: h(FallbackPanel, { panel }) },
          h(DelayedPanel, { promise: panel.promise }),
        ),
      ),
    ),
  );
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
      engine: "react",
      framework: `React ${reactVersion}`,
      nodeEnv: process.env.NODE_ENV,
      reactDomBuild: reactDomBuild(),
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

  // Create every simulated upstream request before entering React, matching
  // the Marko fixture and ensuring a Suspense retry reuses the same promise.
  const panels = buildPanels(boundaryCount, cardsPerPanel).map((panel) => ({
    ...panel,
    promise: delayedPanel(panel),
  }));
  let started = false;
  let finished = false;
  const { pipe, abort } = renderToPipeableStream(h(App, { panels }), {
    onShellReady() {
      started = true;
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-benchmark-engine": "react",
      });
      pipe(response);
    },
    onAllReady() {
      finished = true;
    },
    onShellError(error) {
      console.error(error);
      if (!response.headersSent) response.writeHead(500);
      response.end("render error\n");
    },
    onError(error) {
      if (!started) console.error(error);
    },
  });

  response.once("close", () => {
    if (!finished) abort();
  });
});

server.listen(port, host, () => {
  console.log(`React Suspense server listening on http://${host}:${port}`);
});
