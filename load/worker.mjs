// Load-generator worker. The driver forks several of these so that request
// scheduling, response parsing, and body validation never share one event
// loop with each other or with the server under test. Every timestamp is an
// absolute epoch millisecond (performance.timeOrigin + performance.now()) so
// records from different processes share one timeline.

import http from "node:http";
import { performance } from "node:perf_hooks";

const now = () => performance.timeOrigin + performance.now();

let validator = null;

function tally(records, error) {
  const key = error || "unknown";
  records.errors[key] = (records.errors[key] || 0) + 1;
}

function requestOnce({ port, path, headers, agent, scheduledAt, validate, timeoutMs }, records) {
  const dispatchedAt = now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (entry) => {
      if (settled) return;
      settled = true;
      records.scheduledAt.push(scheduledAt);
      records.dispatchedAt.push(dispatchedAt);
      records.firstByteAt.push(entry.firstByteAt ?? entry.completedAt);
      records.completedAt.push(entry.completedAt);
      records.bytes.push(entry.bytes || 0);
      records.ok.push(entry.ok ? 1 : 0);
      if (!entry.ok) tally(records, entry.error || `HTTP ${entry.statusCode}`);
      resolve();
    };
    const request = http.request(
      { host: "127.0.0.1", port, path, method: "GET", agent, headers },
      (response) => {
        const chunks = validate ? [] : null;
        let bytes = 0;
        let firstByteAt = null;
        response.on("data", (chunk) => {
          firstByteAt ??= now();
          bytes += chunk.length;
          if (chunks) chunks.push(chunk);
        });
        response.once("end", () => {
          const completedAt = now();
          let ok = response.statusCode === 200;
          let error;
          if (ok && validate) {
            try {
              validator(Buffer.concat(chunks, bytes), { bytes, statusCode: response.statusCode });
            } catch (validationError) {
              ok = false;
              error = validationError.message;
            }
          }
          finish({ ok, error, statusCode: response.statusCode, bytes, firstByteAt, completedAt });
        });
        response.once("error", (error) => {
          finish({ ok: false, error: error.message, completedAt: now() });
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("request timed out")));
    request.once("error", (error) => {
      finish({ ok: false, error: error.message, completedAt: now() });
    });
    request.end();
  });
}

function emptyRecords() {
  return {
    scheduledAt: [],
    dispatchedAt: [],
    firstByteAt: [],
    completedAt: [],
    bytes: [],
    ok: [],
    errors: {},
  };
}

async function runOpenLoop(phase) {
  const {
    port, path, headers, startAtMs, intervalMs, firstIndex, indexStep, count,
    validateEvery, maxSockets, timeoutMs,
  } = phase;
  const agent = new http.Agent({ keepAlive: true, maxSockets, maxFreeSockets: maxSockets });
  const records = emptyRecords();
  const pending = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let sent = 0;
  await new Promise((resolve) => {
    const schedule = () => {
      const current = now();
      while (sent < count) {
        const index = firstIndex + sent * indexStep;
        const scheduledAt = startAtMs + index * intervalMs;
        if (scheduledAt > current) break;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const validate = validateEvery > 0 && index % validateEvery === 0;
        pending.push(
          requestOnce({ port, path, headers, agent, scheduledAt, validate, timeoutMs }, records)
            .finally(() => { inFlight -= 1; }),
        );
        sent += 1;
      }
      if (sent >= count) { resolve(); return; }
      const nextAt = startAtMs + (firstIndex + sent * indexStep) * intervalMs;
      const wait = nextAt - now();
      if (wait > 2) setTimeout(schedule, Math.min(10, wait - 1));
      else setImmediate(schedule);
    };
    const initialWait = startAtMs + firstIndex * intervalMs - now();
    setTimeout(schedule, Math.max(0, initialWait - 1));
  });
  await Promise.all(pending);
  agent.destroy();
  return { records, maxInFlight };
}

async function runClosedLoop(phase) {
  const { port, path, headers, startAtMs, endAtMs, concurrency, validateEvery, maxSockets, timeoutMs } = phase;
  const agent = new http.Agent({ keepAlive: true, maxSockets, maxFreeSockets: maxSockets });
  const records = emptyRecords();
  let sequence = 0;
  const wait = startAtMs - now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const loop = async () => {
    while (now() < endAtMs) {
      const index = sequence;
      sequence += 1;
      const validate = validateEvery > 0 && index % validateEvery === 0;
      await requestOnce(
        { port, path, headers, agent, scheduledAt: now(), validate, timeoutMs },
        records,
      );
    }
  };
  await Promise.all(Array.from({ length: concurrency }, loop));
  agent.destroy();
  return { records, maxInFlight: concurrency };
}

process.on("message", async (message) => {
  if (message.type !== "run") return;
  const phase = message.phase;
  try {
    if (phase.validatorModule) {
      const module = await import(phase.validatorModule);
      validator = module.createValidator(phase.validatorOptions || {});
    } else {
      validator = null;
    }
    const cpuBefore = process.cpuUsage();
    const wallStart = performance.now();
    const result = phase.mode === "closed" ? await runClosedLoop(phase) : await runOpenLoop(phase);
    const cpu = process.cpuUsage(cpuBefore);
    process.send({
      type: "done",
      ...result,
      generator: {
        cpuMicros: cpu.user + cpu.system,
        wallMs: performance.now() - wallStart,
      },
    });
  } catch (error) {
    process.send({ type: "error", message: error.stack || String(error) });
  }
});

process.send({ type: "ready" });
