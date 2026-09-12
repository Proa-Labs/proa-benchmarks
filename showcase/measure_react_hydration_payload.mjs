#!/usr/bin/env node

import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptPath = fileURLToPath(import.meta.url);
const showcaseDirectory = dirname(scriptPath);

export async function measureReactHydrationPayload() {
  const workspaceDirectory = dirname(showcaseDirectory);
  const result = await build({
    entryPoints: [join(workspaceDirectory, "agent-chain", "client.mjs")],
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    legalComments: "none",
    outfile: "react-hydration.js",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (
    result.outputFiles.length !== 1 ||
    !result.outputFiles[0].path.endsWith("react-hydration.js")
  ) {
    throw new Error(
      `React hydration reference expected one JavaScript asset; esbuild produced ${result.outputFiles.length}`,
    );
  }
  const source = result.outputFiles[0].contents;
  return {
    label: "React 19 SSR hydration fixture",
    source: "agent-chain/client.mjs",
    js_requests: 1,
    raw_bytes: source.byteLength,
    gzip_9_bytes: gzipSync(source, { level: 9 }).byteLength,
    brotli_11_bytes: brotliCompressSync(source, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
    boundary:
      "production esbuild ESM containing React hydrateRoot and the agent-chain application; no synthetic padding",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  console.log(
    JSON.stringify(await measureReactHydrationPayload(), null, 2),
  );
}
