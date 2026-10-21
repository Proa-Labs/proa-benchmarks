import { buildPanels, delayedPanel, scenarioContract, normalizeBoundaryCount, normalizeCardsPerPanel } from '#scenario';

const boundaries = normalizeBoundaryCount(process.env.SUSPENSE_BOUNDARIES || 8);
const cards = normalizeCardsPerPanel(process.env.SUSPENSE_CARDS_PER_PANEL ?? 12);
const specifications = buildPanels(boundaries, cards);
export const streamingContract = scenarioContract(boundaries, cards);

export function streamedPanels() {
  return specifications.map(panel => ({ key: panel.key, fallbackLabel: panel.fallbackLabel, promise: delayedPanel(panel) }));
}

export function bufferedPanels() {
  return Promise.all(specifications.map(delayedPanel));
}
