// Response contract for the Suspense marketplace workload. Loaded inside each
// load worker so validation cost is spread across generator processes.

import { buildPanels } from "./scenario.mjs";

function extractMarkerKeys(html, attribute) {
  const expression = new RegExp(`${attribute}=(?:"([^"]+)"|([^\\s>]+))`, "g");
  return [...html.matchAll(expression)].map((match) => match[1] || match[2]);
}

function decodeProaBoundaryTemplates(html) {
  const templates = /<template[^>]*data-proa-encoding="base64-v1"[^>]*>([^<]*)<\/template>/g;
  return [...html.matchAll(templates)]
    .map((match) => Buffer.from(match[1], "base64").toString("utf8"))
    .join("");
}

export function validateBody(html, boundaries, cardsPerPanel) {
  // Proa transports resolved boundary HTML as base64 inside inert templates;
  // React and Marko keep it as literal template content. Validate the browser-
  // consumable payload in either representation without running client code.
  const resolvedHtml = `${html}${decodeProaBoundaryTemplates(html)}`;
  const readyKeys = extractMarkerKeys(resolvedHtml, "data-panel-ready");
  const fallbackKeys = extractMarkerKeys(html, "data-panel-fallback");
  const ready = new Set(readyKeys);
  const fallback = new Set(fallbackKeys);
  const expected = buildPanels(boundaries, cardsPerPanel).map((panel) => panel.key);
  const expectedSet = new Set(expected);
  const missingReady = expected.filter((key) => !ready.has(key));
  const missingFallback = expected.filter((key) => !fallback.has(key));
  const unexpectedReady = [...ready].filter((key) => !expectedSet.has(key));
  const unexpectedFallback = [...fallback].filter((key) => !expectedSet.has(key));
  const duplicateReady = readyKeys.length - ready.size;
  const duplicateFallback = fallbackKeys.length - fallback.size;
  if (
    !html.includes('data-benchmark-shell="suspense-load"') &&
    !html.includes("data-benchmark-shell=suspense-load")
  ) {
    throw new Error("response is missing the shell marker");
  }
  if (
    missingReady.length ||
    missingFallback.length ||
    unexpectedReady.length ||
    unexpectedFallback.length ||
    duplicateReady ||
    duplicateFallback
  ) {
    throw new Error(
      "response contract failed: " +
        `missing ${missingFallback.length} fallbacks and ${missingReady.length} ready panels; ` +
        `unexpected ${unexpectedFallback.length} fallbacks and ${unexpectedReady.length} ready panels; ` +
        `duplicate ${duplicateFallback} fallbacks and ${duplicateReady} ready panels`,
    );
  }
  const expectedCards = boundaries * cardsPerPanel;
  // Marko serialises attributes without quotes where it can.
  const cards = (resolvedHtml.match(/href=(?:"\/products\/\d+"|\/products\/\d+(?=[\s>]))/g) || []).length;
  if (cards !== expectedCards) {
    throw new Error(`response carried ${cards} product cards; expected ${expectedCards}`);
  }
  return { readyPanels: ready.size, fallbackPanels: fallback.size, productCards: cards };
}

export function createValidator({ boundaries, cardsPerPanel }) {
  return (buffer) => validateBody(buffer.toString("utf8"), boundaries, cardsPerPanel);
}
