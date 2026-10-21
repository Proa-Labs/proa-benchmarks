#!/usr/bin/env node
import { execFile as executeCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { acquireRunLock, closeWorkers, delay, fetchBody, fetchJson, gitMetadata, hostMetadata, runOpenLoopPhase, sourceSha256, spawnWorkers, startServer, stopServer, waitForHealth } from '../load/driver.mjs';
import { sourceFiles as kitSources, build as buildKit, serverSpec as kitServer } from '../rendering/external/sveltekit/benchmark.mjs';
import { createValidator as kitValidator } from '../rendering/external/sveltekit/stream-validator.mjs';
import { validateBody } from '../suspense-load/validate.mjs';
import { measureBrowsers } from './browser.mjs';
import { sourceFiles } from './sources.mjs';

const execute = promisify(executeCallback);
const root = fileURLToPath(new URL('../', import.meta.url));
const option = (name, fallback) => { const i=process.argv.indexOf(name); return i<0 ? fallback : process.argv[i+1]; };
const smoke = process.argv.includes('--smoke');
const config = {
  rates: String(option('--rates', smoke ? '20,50' : '250,500,1000,2000,3000,4000,5000,6000')).split(',').map(Number),
  repeats: Number(option('--repeats', smoke ? 1 : 3)), durationSeconds: Number(option('--duration', smoke ? 1 : 5)), preRollSeconds: 1,
  workers: Number(option('--workers', 12)), warmupRequests: smoke ? 4 : 24,
  browserRuns: Number(option('--browser-runs', smoke ? 2 : 30)), browserRestarts: smoke ? 1 : 3,
  profileIds: String(option('--profiles', smoke ? 'desktop' : 'desktop,mobile4x')).split(','),
};
for (const n of [...config.rates,config.repeats,config.durationSeconds,config.workers,config.browserRuns]) if (!Number.isInteger(n)||n<1) throw new Error('Numeric controls must be positive integers');
if(config.profileIds.some(p=>!['desktop','mobile4x'].includes(p))) throw new Error('Unknown browser profile');
const output = resolve(root,option('--out',smoke ? 'sveltekit/results/smoke.json' : 'sveltekit/results/latest.json'));
if(output===join(root,'sveltekit/results/latest.json')&&(smoke||config.rates.join(',')!=='250,500,1000,2000,3000,4000,5000,6000'||config.repeats!==3||config.durationSeconds!==5||config.workers!==12||config.browserRuns!==30||config.profileIds.join(',')!=='desktop,mobile4x')) throw new Error('Custom runs require --out');
const variants = [
  { id:'proa', label:'Proa HTML streaming', engine:'proa', path:'/', completion:'body end containing every resolved HTML panel' },
  { id:'sveltekit-data', label:'SvelteKit promised-data streaming', engine:'sveltekit', path:'/stream', completion:'body end containing every resolved data value; browser still renders panels' },
  { id:'sveltekit-buffered', label:'SvelteKit buffered HTML', engine:'sveltekit', path:'/buffered', completion:'body end containing all resolved HTML; no early fallback shell' },
];
let sequence = 0;
async function endpoint(variant, task) {
  const port=19700+sequence++;
  const {spec,env}=variant.engine==='proa'
    ? {spec:{label:'proa',command:join(root,'target/release/proa_suspense_server'),args:[],cwd:root},env:{PORT:String(port),PROA_WORKER_THREADS:'1'}} : kitServer(port);
  const server=startServer(spec,{...env,SUSPENSE_BOUNDARIES:'8',SUSPENSE_CARDS_PER_PANEL:'12'});
  const agent=new http.Agent({keepAlive:true,maxSockets:64,maxFreeSockets:64});
  try {
    const health=await waitForHealth(server,port,agent);
    const contract=variant.engine==='proa'?health:health.streaming;
    if(health.engine!==variant.engine||contract.boundaries!==8||contract.productCards!==96||(variant.engine==='proa'&&health.workerThreads!==1)||(variant.engine==='sveltekit'&&health.nodeEnv!=='production')) throw new Error('Production/fixture contract mismatch');
    return await task({server,agent,port,health,url:`http://127.0.0.1:${port}${variant.path}`});
  } finally {agent.destroy();await stopServer(server);await delay(500);}
}
const release=await acquireRunLock(root,'suspense-load');
let workers=[];
const result={schemaVersion:1,status:'incomplete',captureKind:smoke?'smoke':'comparison',capturedAt:new Date().toISOString(),config,host:hostMetadata(),variants,http:[],browser:null};
const partial=output+'.partial';
await mkdir(dirname(output),{recursive:true});
const save=()=>writeFile(partial,JSON.stringify(result,null,2)+'\n');
try {
  if(!process.argv.includes('--no-build')) {
    console.log('Building release Proa and production SvelteKit fixtures');
    await execute('cargo',['build','--release','--locked','-p','proa_bench','--features','http-load,topcoat','--bin','proa_suspense_server'],{cwd:root,maxBuffer:16*1024*1024});
    await buildKit();
  }
  result.source=await gitMetadata(root,sourceFiles);
  workers=await spawnWorkers(config.workers);
  for(const rate of config.rates) for(let repeat=1;repeat<=config.repeats;repeat++) {
    const rotated=variants.map((_,i)=>variants[(i+repeat-1)%variants.length]);
    for(const variant of rotated) {
      const phase=await endpoint(variant,async({server,agent,port,health})=>{
        const first=await fetchBody(port,variant.path,agent);
        if(first.statusCode!==200) throw new Error('Initial response failed');
        if(variant.id==='proa')validateBody(first.body.toString('utf8'),8,12);
        else kitValidator({mode:variant.id==='sveltekit-data'?'data':'buffered'})(first.body);
        await Promise.all(Array.from({length:config.warmupRequests},()=>fetchBody(port,variant.path,agent)));
        await delay(250);
        const phase=await runOpenLoopPhase({workers,server,port,path:variant.path,headers:{accept:'text/html','accept-encoding':'identity'},rate,preRollSeconds:config.preRollSeconds,durationSeconds:config.durationSeconds,validatorModule:join(root,variant.id==='proa'?'suspense-load/validate.mjs':'rendering/external/sveltekit/stream-validator.mjs'),validatorOptions:variant.id==='proa'?{boundaries:8,cardsPerPanel:12}:{mode:variant.id==='sveltekit-data'?'data':'buffered'},validateEvery:1,metricsAgent:agent});
        return {...phase,engine:variant.id,repeat,health,responseBytes:first.body.length};
      });
      result.http.push(phase);await save();
      console.log(`${variant.id.padEnd(19)} r${repeat} ${rate} offered → ${phase.completionThroughputRps.toFixed(0)} responses/s; P50/P95 ${phase.latencyMs.scheduledComplete.p50.toFixed(1)}/${phase.latencyMs.scheduledComplete.p95.toFixed(1)} ms; ${phase.cpu.cpuMsPerSuccessfulRequest.toFixed(3)} ms CPU/response; ${(phase.memory.peakSampledRssBytes/1048576).toFixed(1)} MiB; ${phase.errorCount} errors; generator ${phase.loadGeneratorValid?'valid':'INVALID'}`);
      if(!phase.loadGeneratorValid)throw new Error('Generator limit exceeded; incomplete capture retained');
    }
  }
  await closeWorkers(workers);workers=[];
  // Keep exactly one native process per framework alive for browser sampling.
  // The two SvelteKit routes share its ordinary production router.
  await endpoint(variants[0],async proa=>{
    await endpoint(variants[1],async kit=>{
      const endpoints=[{...variants[0],url:proa.url},{...variants[1],url:kit.url},{...variants[2],url:kit.url.replace('/stream','/buffered')}];
      result.browser=await measureBrowsers(endpoints,{runs:config.browserRuns,restarts:config.browserRestarts,profileIds:config.profileIds,checkpoint:async(samples,controls)=>{result.browser={samples,controls};await save();}});
    });
  });
  if (await sourceSha256(root, sourceFiles) !== result.source.sourceSha256) throw new Error('Measured sources changed during capture');
  result.completedAt=new Date().toISOString();result.status='pass';await save();await rename(partial,output);
  console.log(`Saved ${output}`);
} finally {await closeWorkers(workers);await release();}
