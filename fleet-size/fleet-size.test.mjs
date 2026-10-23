import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  DEFAULT_TARGET_RPS,
  closedLoopCpuMs,
  coresForRate,
  displayCores,
  parseHeadroom,
  parseMaxCores,
  parseTargetRates,
  planFleet,
  renderMarkdown,
} from "./lib.mjs";
import { main, parseArgs, usage } from "./run.mjs";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./run.mjs", import.meta.url));
const workspace = fileURLToPath(new URL("..", import.meta.url));
const publicationPath = join(workspace, "page-load", "results", "latest.json");

function phase(mode, cpu, valid = true) {
  return {
    mode,
    completionThroughputRps: 1_000,
    loadGeneratorValid: valid,
    cpu: { cpuMsPerSuccessfulRequest: cpu },
  };
}

function fixture(overrides = {}) {
  const cell = (cpu) => ({
    phases: [phase("closed", cpu), phase("closed", cpu), phase("closed", cpu), phase("open", cpu)],
  });
  return {
    status: "pass",
    captureKind: "publication",
    capturedAt: "2026-10-21T01:25:20.806Z",
    scenario: {
      id: "canonical_pages_v1",
      workloads: [
        { id: "cards", label: "Component page" },
        { id: "products", label: "Product grid" },
      ],
    },
    host: { cpuModel: "Apple M4 Max" },
    source: { sourceSha256: "a".repeat(64) },
    engines: [
      {
        id: "proa",
        label: "Proa",
        workloads: { cards: cell(0.010), products: cell(0.050) },
      },
      {
        id: "react",
        label: "React",
        workloads: { cards: cell(0.100), products: cell(0.640) },
      },
    ],
    ...overrides,
  };
}

test("target-rate, headroom, and max-cores parsers reject invalid input", () => {
  assert.deepEqual(parseTargetRates(undefined), [DEFAULT_TARGET_RPS]);
  assert.deepEqual(parseTargetRates("1000,10000,1000"), [1_000, 10_000]);
  assert.throws(() => parseTargetRates("0"), /positive/);
  assert.throws(() => parseTargetRates("x"), /positive/);
  assert.equal(parseHeadroom(undefined), 0);
  assert.equal(parseHeadroom("0.3"), 0.3);
  assert.throws(() => parseHeadroom("30"), /look like percents/);
  assert.throws(() => parseHeadroom("-1"), /fraction/);
  assert.equal(parseMaxCores(""), null);
  assert.equal(parseMaxCores("16"), 16);
  assert.throws(() => parseMaxCores("0"), /positive/);
});

test("closed-loop CPU uses the median and rejects generator-limited phases", () => {
  const cell = fixture().engines[0].workloads.cards;
  assert.equal(closedLoopCpuMs(cell, "proa/cards"), 0.010);
  const limited = { phases: [phase("closed", 0.011, false)] };
  assert.throws(() => closedLoopCpuMs(limited, "proa/cards"), /generator-limited/);
});

test("cores needed match the published CPU-per-response translation", () => {
  assert.equal(displayCores(coresForRate(0.011, 10_000).provisioned), "0.1");
  assert.equal(displayCores(coresForRate(0.338, 10_000).provisioned), "3.4");
  assert.equal(displayCores(coresForRate(8.440, 10_000).provisioned), "84.4");
  const withHeadroom = coresForRate(0.056, 10_000, 0.3);
  assert.equal(withHeadroom.raw, 0.56);
  assert.equal(displayCores(withHeadroom.provisioned), "0.7");
});

test("planFleet sizes every engine and flags a max-cores overflow", () => {
  const plan = planFleet(fixture(), { targetRps: [10_000, 50_000], headroom: 0, maxCores: 6 });
  assert.equal(plan.tables.length, 2);
  const tenK = plan.tables[0];
  const products = tenK.rows.find((row) => row.workloadId === "products");
  const react = products.cells.find((cell) => cell.engineId === "react");
  assert.equal(react.display, "6.4");
  assert.equal(react.exceedsMax, true);
  const fiftyK = plan.tables[1].rows[0].cells[0];
  assert.equal(fiftyK.display, "0.5");
  assert.ok(plan.overflows.some((row) => row.engine === "React" && row.targetRps === 10_000));
});

test("refuses smoke captures, the wrong suite, and missing engines", () => {
  assert.throws(
    () => planFleet(fixture({ captureKind: "smoke" })),
    /publication page-load/,
  );
  assert.throws(
    () => planFleet(fixture({ scenario: { id: "cold_start_products_v1", workloads: [] } })),
    /not canonical_pages_v1/,
  );
  assert.throws(() => planFleet(fixture({ engines: [] })), /missing engines/);
  assert.throws(() => planFleet(null), /missing/);
});

test("Markdown names the capture and prints one table per request rate", () => {
  const markdown = renderMarkdown(planFleet(fixture(), { targetRps: [10_000], headroom: 0.3, maxCores: 1 }));
  assert.match(markdown, /October 21, 2026/);
  assert.match(markdown, /Apple M4 Max/);
  assert.match(markdown, /10,000 responses\/s/);
  assert.match(markdown, /30% headroom/);
  assert.match(markdown, /Product grid \/ React/);
});

test("CLI defaults to the retained page-load capture and reproduces the published 10k table", async () => {
  const { stdout } = await exec(process.execPath, [cli], { cwd: workspace, maxBuffer: 1024 * 1024 });
  assert.match(stdout, /Fleet size from CPU per response/);
  assert.match(stdout, /\| Component page \| 0\.1 \| 1\.1 \| 0\.3 \| 1\.3 \| 1\.2 \|/);
  assert.match(stdout, /\| Product grid \| 0\.6 \| 6\.4 \| 2\.4 \| 9\.5 \| 8\.5 \|/);
  assert.match(stdout, /\| 1,000-row table \| 3\.4 \| 54\.1 \| 16\.9 \| 124\.2 \| 84\.4 \|/);
});

test("CLI writes JSON, honors headroom, and exits 2 when a max-cores budget is exceeded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fleet-size-"));
  const capturePath = join(directory, "capture.json");
  await writeFile(capturePath, JSON.stringify(fixture()));
  await assert.rejects(
    () => exec(process.execPath, [
      cli,
      "--capture", capturePath,
      "--target-rps", "10000",
      "--max-cores", "1",
    ], { cwd: workspace }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /Over the 1-core budget/);
      return true;
    },
  );
  const code = await main([
    "--capture", capturePath,
    "--target-rps", "10000",
    "--max-cores", "1",
  ], { stdout: { write() {} }, writeFile });
  assert.equal(code, 2);
  const chunks = [];
  await main(["--capture", capturePath, "--json", "--headroom", "0.3"], {
    stdout: { write(chunk) { chunks.push(chunk); } },
    writeFile,
  });
  const parsed = JSON.parse(chunks.join(""));
  assert.equal(parsed.headroom, 0.3);
  assert.equal(parsed.tables[0].rows[1].cells[1].display, "8.3"); // 0.640 × 10 × 1.3
  const outPath = join(directory, "plan.md");
  await main(["--capture", capturePath, "--out", outPath], { stdout: { write() {} }, writeFile });
  assert.match(await readFile(outPath, "utf8"), /Component page/);
});

test("CLI help and argument parsing reject unknown flags", () => {
  assert.match(usage(), /CPU per response/);
  assert.equal(parseArgs([]).capture.endsWith("page-load/results/latest.json"), true);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.throws(() => parseArgs(["extra.json"]), /unexpected argument/);
});

test("retained publication capture is readable through planFleet", async () => {
  const capture = JSON.parse(await readFile(publicationPath, "utf8"));
  const plan = planFleet(capture, { targetRps: [10_000] });
  assert.deepEqual(plan.engines.map((engine) => engine.id), [
    "proa",
    "react",
    "marko",
    "go-html-template",
    "sveltekit",
  ]);
  const table = plan.tables[0].rows.find((row) => row.workloadId === "table");
  assert.equal(table.cells.find((cell) => cell.engineId === "proa").display, "3.4");
});
