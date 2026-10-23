#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SUITE_IDS, compareCaptures, renderMarkdown } from "./lib.mjs";

export function parseArgs(argv) {
  const options = { json: false, out: null, suite: null, paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--out") {
      options.out = argv[index + 1];
      if (!options.out) throw new Error("--out requires a path");
      index += 1;
      continue;
    }
    if (token === "--suite") {
      options.suite = argv[index + 1];
      if (!SUITE_IDS.includes(options.suite)) {
        throw new Error(`--suite must be one of ${SUITE_IDS.join(", ")}`);
      }
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token.startsWith("-")) throw new Error(`unknown option: ${token}`);
    options.paths.push(token);
  }
  return options;
}

export function usage() {
  return `Compare two retained captures of the same suite.

Usage:
  node compare/run.mjs <earlier.json> <later.json>
  node compare/run.mjs --json --out delta.json <earlier.json> <later.json>
  node compare/run.mjs --suite canonical <earlier.json> <later.json>

Options:
  --json          Write the structured comparison instead of Markdown
  --out <path>    Write the report to a file instead of stdout
  --suite <id>    Require canonical, product-scaling, page-load, or cold-start
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
  if (options.paths.length !== 2) {
    throw new Error("expected two capture paths; see --help");
  }
  const [beforeCapture, afterCapture] = await Promise.all(
    options.paths.map((path) => readCapture(path)),
  );
  const comparison = compareCaptures(beforeCapture, afterCapture, {
    suite: options.suite,
  });
  const body = options.json
    ? `${JSON.stringify(comparison, null, 2)}\n`
    : renderMarkdown(comparison);
  if (options.out) {
    const resolved = isAbsolute(options.out) ? options.out : join(process.cwd(), options.out);
    await io.writeFile(resolved, body);
  } else {
    io.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
