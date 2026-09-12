import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BOUNDARY_COUNT,
  DEFAULT_CARDS_PER_PANEL,
  DELAY_TIERS_MS,
  buildPanels,
  normalizeBoundaryCount,
  normalizeCardsPerPanel,
  panelSpec,
  scenarioContract,
} from "./scenario.mjs";
import { validateBody } from "./validate.mjs";

test("boundary counts are bounded safe integers", () => {
  assert.equal(normalizeBoundaryCount("32"), 32);
  for (const invalid of [0, 257, 1.5, "", "not-a-number"]) {
    assert.throws(() => normalizeBoundaryCount(invalid), /1 to 256/);
  }
  assert.equal(normalizeCardsPerPanel("0"), 0);
  assert.throws(() => normalizeCardsPerPanel(97), /0 to 96/);
});

test("panel fixtures have stable unique keys, repeat the delay tiers, and slice the catalogue", () => {
  const panels = buildPanels(DELAY_TIERS_MS.length + 2, 3);
  assert.equal(new Set(panels.map(({ key }) => key)).size, panels.length);
  assert.deepEqual(
    panels.map(({ delayMs }) => delayMs),
    [...DELAY_TIERS_MS, ...DELAY_TIERS_MS.slice(0, 2)],
  );
  assert.equal(panels[0].key, panelSpec(0, 3).key);
  assert.deepEqual(panels.map(({ products }) => products.length), panels.map(() => 3));
  assert.equal(panels[1].products[0].id, 1_003);
  assert.equal(buildPanels(4, 0)[2].products.length, 0);
});

test("the published scenario contract reflects the selected shape", () => {
  const contract = scenarioContract(3, 5);
  assert.equal(contract.boundaries, 3);
  assert.equal(contract.cardsPerPanel, 5);
  assert.equal(contract.productCards, 15);
  assert.equal(contract.longestDelayMs, 12);
  assert.deepEqual(contract.delayTiersMs, [...DELAY_TIERS_MS]);
  assert.equal(scenarioContract().boundaries, DEFAULT_BOUNDARY_COUNT);
  assert.equal(scenarioContract().cardsPerPanel, DEFAULT_CARDS_PER_PANEL);
});

test("the response contract counts panels and product cards", () => {
  const panels = buildPanels(2, 2);
  const shell = '<main data-benchmark-shell="suspense-load">' +
    panels.map((panel) => `<section data-panel-fallback="${panel.key}"></section>`).join("") +
    "</main>";
  const resolved = panels.map((panel) =>
    `<section data-panel-ready="${panel.key}">${panel.products.map((product) => `<a href="/products/${product.id}"></a>`).join("")}</section>`
  ).join("");
  assert.deepEqual(validateBody(shell + resolved, 2, 2), { readyPanels: 2, fallbackPanels: 2, productCards: 4 });
  assert.throws(() => validateBody(shell + resolved.replace('href="/products/1000"', 'href="/x"'), 2, 2), /product cards/);
  const unquoted = resolved.replace(/href="(\/products\/\d+)"/g, "href=$1");
  assert.equal(validateBody(shell + unquoted, 2, 2).productCards, 4);
  assert.throws(() => validateBody(shell, 2, 2), /missing/);
});
