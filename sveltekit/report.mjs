#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sourceSha256 } from '../load/driver.mjs';
import { sourceFiles } from './sources.mjs';
import { profiles } from './browser.mjs';
import { summarize } from '../suspense-load/stats.mjs';
import { rowsFor, benchmarkSourceFiles as pageSources, validateResult as validatePages } from '../page-load/report.mjs';
import { benchmarkSourceFiles as coldSources, validateResult as validateCold } from '../cold-start/report.mjs';
import { renderingSourceFingerprint } from '../rendering/canonical/source_fingerprint.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const rates = [250, 500, 1000, 2000, 3000, 4000, 5000, 6000];
const ids = ['proa', 'sveltekit-data', 'sveltekit-buffered'];
const names = { proa: 'Proa HTML stream', 'sveltekit-data': 'SvelteKit data stream', 'sveltekit-buffered': 'SvelteKit buffered HTML' };
const median = values => summarize(values).p50;
const n = value => Math.round(value).toLocaleString('en-US');
const f = (value, digits = 1) => value.toFixed(digits);
const ms = value => `${f(value, value < 10 ? 2 : 1)} ms`;
const mib = value => `${f(value / 1048576)} MiB`;
const kib = value => `${f(value / 1024)} KiB`;
const fields = ['shellMs', 'firstPanelMs', 'allPanelsMs', 'paintOpportunityMs', 'firstByteMs', 'responseEndMs', 'documentBytes', 'transferBytes', 'scriptDurationMs', 'layoutDurationMs', 'taskDurationMs', 'jsTransferBytes'];

export function validateStreaming(result) {
  const fail = message => { throw new Error(`Invalid SvelteKit comparison: ${message}`); };
  if (result.schemaVersion !== 1 || result.status !== 'pass' || result.captureKind !== 'comparison') fail('incomplete or smoke capture');
  const expected = { rates, repeats: 3, durationSeconds: 5, preRollSeconds: 1, workers: 12, warmupRequests: 24, browserRuns: 30, browserRestarts: 3, profileIds: ['desktop', 'mobile4x'] };
  if (JSON.stringify(result.config) !== JSON.stringify(expected)) fail('publication protocol differs');
  if (JSON.stringify(result.variants?.map(v=>v.id)) !== JSON.stringify(ids)) fail('variant roster');
  if (!/^[a-f0-9]{64}$/.test(result.source?.sourceSha256 || '')) fail('missing source hash');
  const seen = new Set();
  for (const phase of result.http ?? []) {
    const key = `${phase.engine}/${phase.offeredRps}/${phase.repeat}`;
    if (seen.has(key) || !ids.includes(phase.engine) || !rates.includes(phase.offeredRps) || ![1,2,3].includes(phase.repeat)) fail(`duplicate/foreign HTTP phase ${key}`);
    seen.add(key);
    if (!phase.loadGeneratorValid || phase.generator?.busiestWorkerUtilization > 0.8 || phase.latencyMs?.schedulerLag?.p95 > 25) fail(`generator bottleneck ${key}`);
    if (phase.mode !== 'open' || phase.durationSeconds !== 5 || phase.preRollSeconds !== 1 || phase.generator?.workerCount !== 12) fail(`HTTP protocol ${key}`);
    for (const value of [phase.completionThroughputRps, phase.latencyMs?.scheduledFirstByte?.p50, phase.latencyMs?.scheduledComplete?.p50, phase.latencyMs?.scheduledComplete?.p95, phase.cpu?.cpuMsPerSuccessfulRequest, phase.memory?.peakSampledRssBytes, phase.responseBytes]) if (!Number.isFinite(value) || value < 0) fail(`missing HTTP metrics ${key}`);
    if (!Number.isSafeInteger(phase.steadyStateCompletedResponses) || phase.steadyStateCompletedResponses < 0) fail(`invalid HTTP completion count ${key}`);
    if (Math.abs(phase.completionThroughputRps - phase.steadyStateCompletedResponses / phase.durationSeconds) > 1e-9) fail(`HTTP throughput differs from retained completion count ${key}`);
    const contract = phase.engine === 'proa' ? phase.health : phase.health?.streaming;
    if (contract?.boundaries !== 8 || contract?.productCards !== 96 || JSON.stringify(contract.delayTiersMs) !== '[5,8,12,18,27,40,60,90]') fail(`fixture mismatch ${key}`);
    if (phase.engine === 'proa' ? phase.health?.workerThreads !== 1 : phase.health?.nodeEnv !== 'production') fail(`production/concurrency mismatch ${key}`);
  }
  if (seen.size !== 72) fail(`expected 72 HTTP phases, got ${seen.size}`);
  const b = result.browser;
  if (!b?.resolvedDomParity || !b.chromiumVersion || b.samples?.length !== 180 || b.controls?.length !== 6 || b.summaries?.length !== 6 || JSON.stringify(b.profiles) !== JSON.stringify(profiles)) fail('browser capture incomplete');
  const hashes = new Set();
  for (const profile of ['desktop', 'mobile4x']) for (const engine of ids) {
    const samples = b.samples.filter(s=>s.engine===engine && s.profile===profile);
    if (samples.length !== 30 || new Set(samples.map(s=>`${s.block}/${s.run}`)).size !== 30) fail(`browser cell ${profile}/${engine}`);
    for (const sample of samples) {
      if (![0,1,2].includes(sample.block) || sample.run < 0 || sample.run > 9) fail('browser block/run');
      if (sample.readyPanels !== 8 || sample.productCards !== 96 || sample.svgStars !== 480 || sample.compatMode !== 'BackCompat' || sample.errors?.length !== 0) fail('browser DOM/errors');
      if (!/^[a-f0-9]{64}$/.test(sample.resolvedDomSha256 ?? '')) fail('browser DOM hash missing');
      hashes.add(sample.resolvedDomSha256);
      for (const field of fields) if (!Number.isFinite(sample[field]) || sample[field] < 0) fail(`browser metric ${field}`);
      if (engine === 'sveltekit-data' && (!sample.scriptRequests || !sample.jsTransferBytes)) fail('missing hydration runtime');
    }
    const control = b.controls.filter(s=>s.engine===engine && s.profile===profile);
    const count = engine === 'sveltekit-buffered' ? 96 : 0;
    if (control.length !== 1 || control[0].readyPanels !== count/12 || control[0].productCards !== count || control[0].errors?.length !== 0) fail('JavaScript-disabled control');
    const summary = b.summaries?.find(s=>s.engine===engine && s.profile===profile);
    if (summary?.samples !== 30) fail('browser summary missing');
    for (const field of fields) if (JSON.stringify(summary[field]) !== JSON.stringify(summarize(samples.map(s=>s[field])))) fail(`browser summary differs from raw samples: ${field}`);
  }
  if (hashes.size !== 1) fail('resolved panel DOM differs across engines or profiles');
}

function browserRows(result) {
  return result.browser.summaries.map(s=>`| ${s.profile} | ${names[s.engine]} | ${ms(s.shellMs.p50)} | ${ms(s.firstPanelMs.p50)} | ${ms(s.allPanelsMs.p50)} | ${ms(s.allPanelsMs.p95)} | ${ms(s.paintOpportunityMs.p50)} | ${kib(s.transferBytes.p50)} | ${kib(s.jsTransferBytes.p50)} | ${ms(s.scriptDurationMs.p50)} | ${ms(s.taskDurationMs.p50)} |`).join('\n');
}
function httpRows(result) {
  return rates.flatMap(rate=>ids.map(engine=>{
    const cell = result.http.filter(p=>p.engine===engine && p.offeredRps===rate);
    const pick = fn=>median(cell.map(fn));
    return `| ${names[engine]} | ${n(rate)} | ${n(pick(p=>p.completionThroughputRps))} | ${ms(pick(p=>p.latencyMs.scheduledFirstByte.p50))} | ${ms(pick(p=>p.latencyMs.scheduledComplete.p50))} | ${ms(pick(p=>p.latencyMs.scheduledComplete.p95))} | ${f(pick(p=>p.cpu.cpuMsPerSuccessfulRequest),3)} ms | ${f(pick(p=>p.cpu.averageCpuCores),2)} | ${mib(pick(p=>p.memory.peakSampledRssBytes))} | ${kib(pick(p=>p.responseBytes))} | ${n(cell.reduce((sum,p)=>sum+p.errorCount,0))} |`;
  })).join('\n');
}

function figure(result) {
  const panels = ['desktop','mobile4x'];
  let body = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="410" viewBox="0 0 1040 410" role="img" aria-labelledby="title desc"><title id="title">Proa and SvelteKit: first panel and all 96 cards ready</title><desc id="desc">Navigation start to every resolved product card in the DOM. Dots show median first panel, bars show median all cards, and ticks show all-cards P95 of 30 fresh browser contexts. Same resolved panel DOM across all variants. Lower is better.</desc><rect width="1040" height="410" fill="#faf9f6"/><style>text{font-family:system-ui,sans-serif;fill:#29332d}.heading{font-size:25px;font-weight:650}.label{font-size:13px}.value{font-size:13px;font-weight:600}.muted{fill:#66756b;font-size:12px}</style><text x="30" y="40" class="heading">Streaming: first panel and all 96 cards</text><text x="30" y="66" class="muted">Navigation → panel DOM · dot: first panel P50 · bar: all cards P50 · tick: all cards P95 · 30 per variant/profile</text>`;
  for (const [i,profile] of panels.entries()) {
    const y = 102+i*143;
    const cells = ids.map(id=>result.browser.summaries.find(s=>s.engine===id&&s.profile===profile));
    const max = Math.ceil(Math.max(...result.browser.summaries.map(s=>s.allPanelsMs.p95))/50)*50;
    const x = value=>250+value/max*660;
    body += `<text x="30" y="${y}" class="value">${profile==='desktop'?'Desktop · CDP 5 ms / 100 Mbps':'Mobile · CPU 4× / CDP 40 ms / 10 Mbps'}</text>`;
    for(let j=0;j<3;j++) {
      const rowY = y+21+j*29;
      const s = cells[j];
      body += `<text x="30" y="${rowY+12}" class="label">${names[s.engine]}</text><rect x="250" y="${rowY}" width="${x(s.allPanelsMs.p50)-250}" height="18" rx="3" fill="${j===0?'#287653':j===1?'#5277a8':'#a9b8ad'}"/><path d="M${x(s.allPanelsMs.p95)} ${rowY-3}v24" stroke="#29332d" stroke-width="2"/><circle cx="${x(s.firstPanelMs.p50)}" cy="${rowY+9}" r="3.5" fill="#faf9f6" stroke="#29332d" stroke-width="1.5"/><text x="${x(s.allPanelsMs.p95)+9}" y="${rowY+13}" class="value">${f(s.allPanelsMs.p50)} / ${f(s.allPanelsMs.p95)} ms</text>`;
    }
  }
  return body+`<text x="30" y="399" class="muted">Eight delayed panels (5–90 ms), 12 cards each. Native data-stream and HTML-stream response ends do different work.</text></svg>\n`;
}

export function render(result, canonical, scaling, pages, cold) {
  validateStreaming(result); validatePages(pages); validateCold(cold);
  const framework = result.http.find(p=>p.engine==='sveltekit-data').health.framework;
  const failureTypes = ids.map(id => {
    const errors = [...new Set(result.http.filter(p=>p.engine===id).flatMap(p=>p.errorSamples).map(message=>message.replace(/127\.0\.0\.1:\d+/g,'127.0.0.1:<port>')))];
    return errors.length ? `${names[id]}: ${errors.map(message=>'`'+message+'`').join(', ')}` : null;
  }).filter(Boolean).join('; ') || 'none';
  const throughputRepeats = id => result.http.filter(p=>p.engine===id && p.offeredRps===5000).sort((a,b)=>a.repeat-b.repeat).map(p=>n(p.completionThroughputRps)).join(' / ');
  const rendererRows = ['cards','products','table'].map(id=>`| ${id} | ${f(canonical.measurements.proa[id].p50_us,3)} µs | ${f(canonical.measurements.svelte[id].p50_us,3)} µs | ${f(canonical.measurements.svelte[id].p50_us/canonical.measurements.proa[id].p50_us,2)}× |`).join('\n');
  const scalingRows = [12,96,768].map(count=>`| ${count} | ${f(scaling.measurements.proa[count].p50_us,3)} µs | ${f(scaling.measurements.svelte[count].p50_us,3)} µs |`).join('\n');
  const pageRows = rowsFor(pages).filter(r=>['proa','sveltekit'].includes(r.engineId)).map(r=>`| ${r.workload} | ${r.engine} | ${n(r.sustainedRps)} | ${f(r.cpuMsPerResponse,3)} ms | ${mib(r.peakRssAtCapacity)} | ${n(r.fixedRateRps)} | ${ms(r.fixedRateP50)} | ${ms(r.fixedRateP99)} |`).join('\n');
  const capacity = id => rowsFor(pages).find(row=>row.engineId===id && row.workloadId==='products').sustainedRps;
  const browserFirst = (profile,id) => result.browser.summaries.find(row=>row.engine===id && row.profile===profile).firstPanelMs.p50;
  const browserReady = (profile,id) => result.browser.summaries.find(row=>row.engine===id && row.profile===profile).allPanelsMs.p50;
  const coldRows = cold.engines.filter(e=>['proa','sveltekit'].includes(e.id)).map(e=>`| ${e.label} | ${ms(e.summary.firstResponseMs.p50)} | ${ms(e.summary.firstResponseMs.p95)} | ${mib(e.summary.rssAfterFirstResponseBytes.p50)} |`).join('\n');
  return `# Proa versus SvelteKit

Generated from fresh captures on **${result.host.cpuModel}**, ${result.capturedAt.slice(0,10)} UTC. Proa revision **${result.source.proaRevision.slice(0,8)}**, **${framework}**, Node **${result.host.node}**. Full production builds, no development server, proxy, response cache, or compression.

The static 96-card HTML page sustained **${n(capacity('proa'))} responses/s for Proa** and **${n(capacity('sveltekit'))} for SvelteKit**. In the native streaming browser tests, all 96 cards reached the DOM at median **${ms(browserReady('desktop','proa'))} / ${ms(browserReady('desktop','sveltekit-data'))} on desktop** and **${ms(browserReady('mobile4x','proa'))} / ${ms(browserReady('mobile4x','sveltekit-data'))} on mobile4x** (Proa / SvelteKit data stream). Proa’s first mobile panel arrived at **${ms(browserFirst('mobile4x','proa'))}**, versus **${ms(browserFirst('mobile4x','sveltekit-data'))}** for SvelteKit. The complete tables below retain first-panel timing, transfer size, CPU, overload failures, and every rate in the sweep.

## What the async comparison measures

SvelteKit's native [streaming with promises](https://svelte.dev/docs/kit/load#Streaming-with-promises) streams resolved **data**, then Svelte hydrates and renders the panels in the browser. An SSR [\`{#await}\` block](https://svelte.dev/docs/svelte/await) renders its pending branch on the server. Svelte's [async SSR documentation](https://svelte.dev/docs/svelte/await-expressions#Server-side-rendering) distinguishes blocking awaits from pending boundaries; it does not provide the equivalent of Proa's resolved-HTML boundary stream in this pinned release.

Three native paths are measured:

| Variant | Server response contains | Browser work to show resolved panels |
| --- | --- | --- |
| Proa HTML stream | Early fallback shell, then all 96 cards as resolved HTML inside boundary-replacement envelopes | Decode/insert resolved HTML using Proa's inline stream runtime |
| SvelteKit data stream | Early fallback shell, then all eight promised panel values | Fetch the production client runtime, hydrate, and render 96 cards |
| SvelteKit buffered HTML | All 96 cards after awaiting every delayed value; \`csr=false\` | Parse the completed HTML; no hydration runtime |

Every request uses the same eight delayed panels (5, 8, 12, 18, 27, 40, 60, and 90 ms), 12 cards per panel, five SVG stars per card, and prepared typed input values. SvelteKit's data serialization is part of its native path and is included. There is no external data service. The resolved panel DOM, including text, attributes, classes, element order, and all 480 stars, must match across all browser samples. The fixture preserves the existing benchmark's BackCompat document mode and utility-class markup; it is a rendering workload rather than a styled application. No CSS, product images, or fonts are fetched.

**HTTP response end is a different completion boundary for the data stream.** Its capacity numbers below describe delivering data, not delivering server-rendered product HTML. The browser table compares the same completed UI. This comparison has its own report rather than mixing the data-only response into the existing [HTML-streaming curve](http-capacity.md#suspense-streaming-over-http-one-core-each).

## Browser completion

![First-panel P50 and all-card completion P50 and P95](sveltekit/browser.svg)

Thirty measured fresh browser contexts per variant and profile across three Chromium launches, with variant order rotated. One untimed navigation per variant/profile warms each launch. Browser cache is disabled, service workers are blocked, and requests use identity encoding. Desktop: 1440×1000, 1× CPU, 5 ms latency, 100 Mbps. Mobile4x: 390×844, 2× DPR, 4× CPU slowdown, 40 ms latency, 10 Mbps down / 5 Mbps up. Chromium **${result.browser.chromiumVersion}**. These are simulated network/CPU profiles on the same desktop host, not measurements on a phone. [CDP latency](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions) is a minimum request-to-response-headers delay, rather than an extra RTT added on top of server processing. The buffered control’s 90 ms wait already exceeds that minimum; its mobile result must be interpreted within this emulation.

Times start at navigation. “All cards” is the MutationObserver timestamp when every panel has 12 complete cards and 60 SVG stars; exact resolved DOM parity is checked afterward. “2 rAF” is the next two animation-frame callbacks after completion, an opportunity to paint, not a screenshot-based visual metric. Transfer includes document and client resources completed by that point, with headers. JS transfer counts external script resources; Proa's inline replacement scripts are included in its document bytes. Browser script/task durations are Chromium's reported ScriptDuration and TaskDuration, including the same observer instrumentation and excluding the later DOM parity traversal. They are CDP task timings rather than OS process CPU accounting.

| Profile | Variant | Shell P50 | First panel P50 | All cards P50 | All cards P95 | 2 rAF P50 | Total transfer | External JS | Script duration P50 | Task duration P50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${browserRows(result)}

JavaScript-disabled controls passed in both profiles: Proa and SvelteKit streaming leave the pending shell (zero rendered product cards), while buffered SvelteKit contains all 96 cards. Proa's resolved HTML is transported inertly and needs its replacement script; HTML streaming here does not imply JavaScript-free progressive reveal.

## HTTP streaming capacity and latency

Three fresh processes per variant/rate, order rotated, one Proa Tokio worker or one Node process. Exact server CPU charges every process thread, including GC helpers. Twelve separate generator processes, 24 untimed warmup requests, one-second pre-roll, five-second observation window. Each generator uses a keep-alive agent capped at 256 sockets (3,072 total); any agent queueing is included in scheduled-arrival latency. The shared driver uses a 15-second socket timeout alongside platform TCP connection timeouts. Throughput counts successful responses ending inside that window; scheduled-arrival latencies include queueing and generator lag. Latency percentiles cover successful responses only; failures are reported separately and must be considered alongside them. At overload, failures censor the latency distribution, so a lower successful-response percentile can accompany more failed requests. Rows show medians of the three phase metrics, and errors are summed. High-load overload/errors are retained rather than treated as completed work. Every response is validated: Proa's complete HTML boundary payload, all SvelteKit promised values and product fields, or all buffered panels/cards. The generator must stay below 80% worker utilization and 25 ms P95 scheduling lag; otherwise the capture aborts.

| Variant | Offered rps | Response ends/s | First byte P50 | Response end P50 | Response end P95 | Server CPU/response | Cores | Peak RSS | Document body | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${httpRows(result)}

Recorded failure messages across the full phases: ${failureTypes}. Overload includes the production server’s accept queue and HTTP adapter; connection retries/timeouts and server queueing are part of these scheduled-arrival results. This sweep is not a renderer-only microbenchmark.

Individual repeats can vary substantially near saturation. At 5,000 offered requests/s, the three response-end throughput measurements were **${throughputRepeats('proa')}** for Proa, **${throughputRepeats('sveltekit-data')}** for SvelteKit data streaming, and **${throughputRepeats('sveltekit-buffered')}** for buffered SvelteKit (responses/s, repeat order). Every repeat, including slow ones, is retained; the table above uses their medians. This shared-host capture does not establish the cause of that variation.

## Static pages over HTTP

These are complete server-rendered pages on both sides. SvelteKit uses the production [Node adapter](https://svelte.dev/docs/kit/adapter-node), ordinary filesystem routing, and \`csr=false\`, avoiding an unnecessary hydration payload for the static-page workload. Every served response must hash to its engine's production dump; SvelteKit's full document also passes the canonical Svelte DOM gate and a changed-text negative control. Capacity uses 64 closed-loop connections, five-second windows, three fresh-process repeats. Equal-load latency uses the existing fixed rates below each engine's capacity, with three repeats. The [full five-engine capture](http-capacity.md#canonical-pages-over-http-one-core-each) also refreshes React, Marko, and Go.

| Workload | Engine | Capacity responses/s | CPU/response | Peak RSS | Equal-load rps | P50 | P99 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${pageRows}

## Cold start

Spawn to first complete, validated 96-card product response. Fifteen fresh production processes per engine after two untimed disk-cache warmups; order rotates. This includes module loading, input construction, and the first render, but excludes dependency installation and build time. Warm filesystem cache is intentional; this is not a cold disk or deployed serverless platform measurement. The host one-minute load average at capture start was ${f(cold.host.loadAverage1m,2)} on ${cold.host.logicalCpuCount} logical CPUs; other work was active on this shared development machine.

| Engine | First response P50 | P95 | RSS after response |
| --- | ---: | ---: | ---: |
${coldRows}

## Renderer-only and product scaling

The existing Svelte row uses the **same pinned Svelte compiler** as the SvelteKit app. It measures compiled component rendering through \`svelte/server\`, while the HTTP rows above include the SvelteKit application server. Naming a second renderer-only row “SvelteKit” would measure the same renderer twice. All 17 renderers were rerun with five independent processes per cell; [full scoreboard](scoreboard.md).

| Workload | Proa P50 | Svelte P50 | Svelte ÷ Proa |
| --- | ---: | ---: | ---: |
${rendererRows}

The scaling capture also reruns all 17 renderers at each size, five independent processes per cell. This is a separate renderer-only run, not cached output or a second HTTP measurement.

| Cards | Proa P50 | Svelte P50 |
| --- | ---: | ---: |
${scalingRows}

## Reproduce and inspect

\`npm ci --prefix rendering/external/sveltekit\` installs the pinned Kit/adapter/compiler toolchain. Follow the [repository setup](README.md#reproducing-a-capture) for the other languages and Playwright. Run timed suites sequentially on an idle host:

\`\`\`sh
./rendering/run-all
./rendering/run-all --product-scaling --no-setup
node page-load/run.mjs
node cold-start/run.mjs
node sveltekit/run.mjs
node sveltekit/report.mjs
pnpm run refresh
node --test rendering/external/sveltekit/stream-validator.test.mjs
node sveltekit/report.mjs --check
\`\`\`

Implementation: [production SvelteKit app](rendering/external/sveltekit/), [load runner](sveltekit/run.mjs), [browser observer](sveltekit/browser.mjs), and [promise-value validator](rendering/external/sveltekit/stream-validator.mjs).

Raw evidence: [streaming + browser samples](sveltekit/results/latest.json), [HTTP](page-load/results/latest.json), [cold starts](cold-start/results/latest.json), [renderer-only](rendering/results/latest.json), [scaling](rendering/results/product-scaling.json). Each capture retains timestamps, framework/host metadata and a measured-source SHA-256. The comparison generator refuses incomplete, smoke, stale-source, missing-phase, unsupported-throughput, browser-parity, and inconsistent-summary captures.

The Proa-only writer/memcpy and allocation microbenchmarks, linked showcase corpus, agent chain, and travel-agent studies do not contain equivalent SvelteKit applications. They remain explicitly separate; this change adds no invented SvelteKit rows to those studies. The development host is shared and uses no CPU affinity or exclusive-host isolation. Other desktop work can affect CPU clocks, medians, and tails; engine order rotates and every repeat remains available in the raw captures. These one-host results describe these fixtures and pinned versions, not a universal framework ranking.
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = async path=>JSON.parse(await readFile(join(root,path),'utf8'));
  const [stream, canonical, scaling, pages, cold] = await Promise.all(['sveltekit/results/latest.json','rendering/results/latest.json','rendering/results/product-scaling.json','page-load/results/latest.json','cold-start/results/latest.json'].map(read));
  if (stream.source?.sourceSha256 !== await sourceSha256(root,sourceFiles)) throw new Error('SvelteKit measured sources changed; rerun the comparison');
  for (const capture of [canonical,scaling,pages,cold]) {
    const host = capture.host;
    if ((host.cpuModel ?? host.cpu_model) !== stream.host.cpuModel || (host.arch ?? host.architecture) !== stream.host.arch || (host.logicalCpuCount ?? host.logical_cpus) !== stream.host.logicalCpuCount) throw new Error('Comparison captures came from different hosts');
  }
  const fingerprint = renderingSourceFingerprint(root);
  for(const capture of [canonical,scaling]) if(capture.status !== 'pass' || capture.provenance?.source_sha256 !== fingerprint) throw new Error('Renderer/scaling sources changed; rerun these captures');
  for (const [label,capture,files] of [['HTTP',pages,pageSources],['cold start',cold,coldSources]]) {
    if(capture.source?.sourceSha256 !== await sourceSha256(root,files)) throw new Error(`${label} measured sources changed`);
  }
  const outputs = [['sveltekit.md',render(stream,canonical,scaling,pages,cold)],['sveltekit/browser.svg',figure(stream)]];
  for(const [path,text] of outputs) {
    if(process.argv.includes('--check')) { if(await readFile(join(root,path),'utf8') !== text) throw new Error(`${path} is stale`); }
    else await writeFile(join(root,path),text);
  }
  console.log(process.argv.includes('--check')?'SvelteKit comparison and browser figure are current.':'Generated sveltekit.md and sveltekit/browser.svg.');
}
