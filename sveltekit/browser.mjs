import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { summarize } from '../suspense-load/stats.mjs';
import { delay } from '../load/driver.mjs';

export const profiles = [
  { id: 'desktop', width: 1440, height: 1000, dpr: 1, cpu: 1, latency: 5, downMbps: 100, upMbps: 100 },
  { id: 'mobile4x', width: 390, height: 844, dpr: 2, cpu: 4, latency: 40, downMbps: 10, upMbps: 5 },
];

async function navigation(browser, endpoint, profile, javascript = true) {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr, javaScriptEnabled: javascript, serviceWorkers: 'block', extraHTTPHeaders: { 'accept-encoding': 'identity' } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downMbps * 1e6 / 8, uploadThroughput: profile.upMbps * 1e6 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await cdp.send('Performance.enable');
    let jsBytes = 0;
    const scriptRequests = new Set();
    cdp.on('Network.responseReceived', event => { if (event.type === 'Script') scriptRequests.add(event.requestId); });
    cdp.on('Network.loadingFinished', event => { if (scriptRequests.has(event.requestId)) jsBytes += event.encodedDataLength; });
    if (javascript) await page.addInitScript(() => {
      const state = window.__streamMeasurement = { shellMs: null, firstPanelMs: null, allPanelsMs: null, panels: {} };
      const check = () => {
        const now = performance.now();
        if (state.shellMs === null && document.querySelector('[data-benchmark-shell]')) state.shellMs = now;
        for (const panel of document.querySelectorAll('[data-panel-ready]')) {
          const cards = panel.querySelectorAll('a[href^="/products/"]');
          if (cards.length !== 12 || panel.querySelectorAll('svg').length !== 60 || !cards[11]?.lastElementChild?.textContent.trim().startsWith('$')) continue;
          const key = panel.getAttribute('data-panel-ready');
          state.panels[key] ??= now;
          state.firstPanelMs ??= now;
        }
        if (Object.keys(state.panels).length === 8 && state.allPanelsMs === null) { state.allPanelsMs = now; observer.disconnect(); }
      };
      const observer = new MutationObserver(check);
      observer.observe(document, { subtree: true, childList: true });
    });
    await page.goto(endpoint.url, { waitUntil: javascript ? 'commit' : 'load' });
    if (!javascript) return { engine: endpoint.id, profile: profile.id, readyPanels: await page.locator('[data-panel-ready]').count(), productCards: await page.locator('a[href^="/products/"]').count(), errors };
    await page.waitForFunction(() => window.__streamMeasurement?.allPanelsMs != null, null, { timeout: 30_000 });
    const sample = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const nav = performance.getEntriesByType('navigation')[0];
      return { ...window.__streamMeasurement, paintOpportunityMs: performance.now(), firstByteMs: nav.responseStart, responseEndMs: nav.responseEnd, documentBytes: nav.encodedBodySize, transferBytes: nav.transferSize + performance.getEntriesByType('resource').reduce((sum, item) => sum + item.transferSize, 0), readyPanels: document.querySelectorAll('[data-panel-ready]').length, productCards: document.querySelectorAll('a[href^="/products/"]').length, svgStars: document.querySelectorAll('[data-panel-ready] svg').length, compatMode: document.compatMode };
    });
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
    Object.assign(sample, { scriptDurationMs: metrics.ScriptDuration * 1000, layoutDurationMs: metrics.LayoutDuration * 1000, taskDurationMs: metrics.TaskDuration * 1000, jsTransferBytes: jsBytes, scriptRequests: scriptRequests.size, errors });
    if (sample.readyPanels !== 8 || sample.productCards !== 96 || sample.svgStars !== 480 || sample.compatMode !== 'BackCompat' || errors.length) throw new Error(`Browser completion failed for ${endpoint.id}: ${JSON.stringify(sample)}`);
    if (endpoint.id === 'sveltekit-data' && !scriptRequests.size) throw new Error('SvelteKit data stream did not load its hydration runtime');
    // Compare only application panels, preserving every element, attribute,
    // class token, text value and order; framework transport scripts stay out.
    sample.canonicalPanels = await page.evaluate(() => {
      const canonical = node => {
        if (node.nodeType === Node.COMMENT_NODE) return null;
        if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim() ? ['#text', node.textContent.replace(/\s+/g, ' ')] : null;
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        const attrs = Array.from(node.attributes).map(({ name, value }) => [name, name === 'class' ? value.split(/\s+/).filter(Boolean).sort().join(' ') : value]).sort(([a],[b])=>a.localeCompare(b));
        const children = [];
        for (const child of Array.from(node.childNodes).map(canonical).filter(Boolean)) {
          const previous = children.at(-1);
          if (child[0] === '#text' && previous?.[0] === '#text') previous[1] = (previous[1] + child[1]).replace(/\s+/g, ' ');
          else children.push(child);
        }
        return [node.tagName.toLowerCase(), attrs, children.map(child => child[0] === '#text' ? ['#text', child[1].trim()] : child)];
      };
      return Array.from(document.querySelectorAll('[data-panel-ready]')).map(canonical);
    });
    sample.resolvedDomSha256 = createHash('sha256').update(JSON.stringify(sample.canonicalPanels)).digest('hex');
    return sample;
  } finally { await context.close(); }
}

export async function measureBrowsers(endpoints, { runs = 30, restarts = 3, profileIds = ['desktop', 'mobile4x'], checkpoint = async()=>{} } = {}) {
  const samples = [];
  const controls = [];
  let reference;
  let version;
  const selected = profiles.filter(p => profileIds.includes(p.id));
  for (let block = 0; block < restarts; block += 1) {
    const browser = await chromium.launch();
    version ??= browser.version();
    try {
      for (const profile of selected) {
        for (const endpoint of endpoints) {
          const warmup = await navigation(browser, endpoint, profile);
          const canonical = JSON.stringify(warmup.canonicalPanels);
          reference ??= canonical;
          if (canonical !== reference) throw new Error(`${endpoint.id} resolved DOM differs from Proa`);
          if (block === 0) {
            const control = await navigation(browser, endpoint, profile, false);
            const expected = endpoint.id === 'sveltekit-buffered' ? 96 : 0;
            if (control.productCards !== expected || control.errors.length) throw new Error('JavaScript-disabled control failed');
            controls.push(control);
          }
        }
        const count = Math.floor(runs/restarts) + (block < runs%restarts ? 1 : 0);
        for (let run = 0; run < count; run += 1) {
          const rotated = endpoints.map((_, i) => endpoints[(i+run+block)%endpoints.length]);
          for (const endpoint of rotated) {
            const sample = await navigation(browser, endpoint, profile);
            if (JSON.stringify(sample.canonicalPanels) !== reference) throw new Error(`${endpoint.id} DOM changed during measurement`);
            delete sample.canonicalPanels;
            samples.push({ engine: endpoint.id, profile: profile.id, block, run, ...sample });
          }
          await checkpoint(samples, controls);
        }
        console.log(`Browser ${profile.id} block ${block+1}/${restarts}: ${count} paired navigations per endpoint passed DOM parity`);
      }
    } finally { await browser.close(); }
    await delay(100);
  }
  const summaries = [];
  const fields = ['shellMs', 'firstPanelMs', 'allPanelsMs', 'paintOpportunityMs', 'firstByteMs', 'responseEndMs', 'documentBytes', 'transferBytes', 'scriptDurationMs', 'layoutDurationMs', 'taskDurationMs', 'jsTransferBytes'];
  for (const profile of selected) for (const endpoint of endpoints) {
    const cell = samples.filter(s => s.engine === endpoint.id && s.profile === profile.id);
    summaries.push({ engine: endpoint.id, profile: profile.id, samples: cell.length, ...Object.fromEntries(fields.map(key => [key, summarize(cell.map(s=>s[key]))])) });
  }
  return { chromiumVersion: version, profiles: selected, samples, controls, summaries, resolvedDomParity: true };
}
