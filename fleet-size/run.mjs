#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseHeadroom,
  parseMaxCores,
  parseTargetRates,
  planFleet,
  renderMarkdown,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const defaultCapture = join(root, "page-load", "results", "latest.json");

export function parseArgs(argv) {
  const options = {
    json: false,
    out: null,
    capture: defaultCapture,
    targetRps: null,
    headroom: null,
    maxCores: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--out" || token === "--capture" || token === "--target-rps" || token === "--headroom" || token === "--max-cores") {
      const value = argv[index + 1];
      if (value == null) throw new Error(`${token} requires a value`);
      if (token === "--out") options.out = value;
      if (token === "--capture") options.capture = value;
      if (token === "--target-rps") options.targetRps = value;
      if (token === "--headroom") options.headroom = value;
      if (token === "--max-cores") options.maxCores = value;
      index += 1;
      continue;
    }
    if (token.startsWith("-")) throw new Error(`unknown option: ${token}`);
    throw new Error(`unexpected argument: ${token}`);
  }
  return options;
}

export function usage() {
  return `Translate page-load CPU per response into cores needed at a request rate.

Usage:
  node fleet-size/run.mjs
  node fleet-size/run.mjs --target-rps 1000,10000,50000 --headroom 0.3 --max-cores 16
  node fleet-size/run.mjs --capture page-load/results/latest.json --json

Options:
  --capture <path>     Publication page-load JSON (default: page-load/results/latest.json)
  --target-rps <list>  Comma-separated rates (default: 10000)
  --headroom <n>       Extra capacity as a fraction (0.3 is 30%)
  --max-cores <n>      Flag cells whose provisioned cores exceed this budget
  --json               Write the structured plan instead of Markdown
  --out <path>         Write the report to a file instead of stdout
`;
}

async function readCapture(path) {
  const resolved = isAbsolute(path) ? path : join(process.cwd(), path);
  try {
    return JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`capture not found: ${path}`);
    if (error instanceof SyntaxError) throw new Error(`capture is not JSON: ${path}`);
    throw error;
  }
}

export async function main(argv = process.argv.slice(2), io = {
  stdout: process.stdout,
  writeFile,
}) {
  const options = parseArgs(argv);
  if (options.help) {
    io.stdout.write(usage());
    return 0;
  }
  const capture = await readCapture(options.capture);
  const plan = planFleet(capture, {
    targetRps: parseTargetRates(options.targetRps),
    headroom: parseHeadroom(options.headroom),
    maxCores: parseMaxCores(options.maxCores),
  });
  const body = options.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdown(plan);
  if (options.out) {
    const resolved = isAbsolute(options.out) ? options.out : join(process.cwd(), options.out);
    await io.writeFile(resolved, body);
  } else {
    io.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
  }
  return plan.overflows.length > 0 ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      if (code) process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
