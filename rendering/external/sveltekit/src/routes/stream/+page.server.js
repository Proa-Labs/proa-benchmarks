import { streamedPanels } from '#lib/server/scenario.js';
export function load() { return { panels: streamedPanels() }; }
