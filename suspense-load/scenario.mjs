import { buildProducts } from "../rendering/external/shared/suite_data.mjs";

// The published page: the canonical 96-card product grid split across eight
// Suspense boundaries, one per delay tier, twelve cards each. Cards per panel
// may be set to 0 for the tiny-panel scheduling stress variant.
export const DEFAULT_BOUNDARY_COUNT = 8;
export const DEFAULT_CARDS_PER_PANEL = 12;
export const DELAY_TIERS_MS = Object.freeze([5, 8, 12, 18, 27, 40, 60, 90]);
export const SHELL_MARKER = 'data-benchmark-shell="suspense-load"';
export const SCENARIO_ID = "suspense_marketplace_v2";

export function normalizeBoundaryCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > 256) {
    throw new Error(`boundary count must be an integer from 1 to 256; received ${value}`);
  }
  return count;
}

export function normalizeCardsPerPanel(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 96) {
    throw new Error(`cards per panel must be an integer from 0 to 96; received ${value}`);
  }
  return count;
}

export function panelSpec(index, cardsPerPanel = DEFAULT_CARDS_PER_PANEL, products = null) {
  const ordinal = index + 1;
  const key = `panel-${String(index).padStart(2, "0")}`;
  const delayMs = DELAY_TIERS_MS[index % DELAY_TIERS_MS.length];
  const cards = normalizeCardsPerPanel(cardsPerPanel);
  const catalogue = products ?? buildProducts((index + 1) * cards);
  return {
    key,
    index,
    delayMs,
    title: `Panel ${String(ordinal).padStart(2, "0")}`,
    eyebrow: `Priority tier ${(index % DELAY_TIERS_MS.length) + 1}`,
    fallbackLabel: `Loading panel ${String(ordinal).padStart(2, "0")}`,
    body: `Resolved panel ${String(ordinal).padStart(2, "0")} after ${delayMs} ms of simulated upstream work.`,
    products: catalogue.slice(index * cards, (index + 1) * cards),
  };
}

export function buildPanels(count = DEFAULT_BOUNDARY_COUNT, cardsPerPanel = DEFAULT_CARDS_PER_PANEL) {
  const boundaries = normalizeBoundaryCount(count);
  const cards = normalizeCardsPerPanel(cardsPerPanel);
  const products = buildProducts(boundaries * cards);
  return Array.from({ length: boundaries }, (_, index) => panelSpec(index, cards, products));
}

export function delayedPanel(panel) {
  return new Promise((resolve) => {
    setTimeout(resolve, panel.delayMs, panel);
  });
}

export function scenarioContract(count = DEFAULT_BOUNDARY_COUNT, cardsPerPanel = DEFAULT_CARDS_PER_PANEL) {
  const boundaries = normalizeBoundaryCount(count);
  const cards = normalizeCardsPerPanel(cardsPerPanel);
  return {
    id: SCENARIO_ID,
    boundaries,
    cardsPerPanel: cards,
    productCards: boundaries * cards,
    delayTiersMs: [...DELAY_TIERS_MS],
    longestDelayMs: Math.max(...Array.from({ length: boundaries }, (_, index) => DELAY_TIERS_MS[index % DELAY_TIERS_MS.length])),
    asyncValueModel: "typed in-memory delayed values; no serialization or external I/O",
    completionBoundary: "HTTP response body end after every async boundary resolves",
    shellBoundary: "first response body byte containing the static shell and fallbacks",
  };
}
