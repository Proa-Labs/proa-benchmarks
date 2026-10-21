import { bufferedPanels } from '#lib/server/scenario.js';
export async function load() { return { panels: await bufferedPanels() }; }
