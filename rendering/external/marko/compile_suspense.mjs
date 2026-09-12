#!/usr/bin/env node

import { compileFile } from "@marko/compiler";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sourcePath = join(here, "suspense_app.marko");
const buildDirectory = join(here, "build");
const compiledPath = join(buildDirectory, "suspense_app.compiled.mjs");
const compiled = await compileFile(sourcePath, {
  output: "html",
  optimize: true,
  modules: "esm",
  writeVersionComment: false,
  translator: require.resolve("marko/translator"),
  resolveVirtualDependency(_filename, dependency) {
    return dependency.virtualPath;
  },
});
mkdirSync(buildDirectory, { recursive: true });
writeFileSync(compiledPath, compiled.code);
console.log(`Compiled ${sourcePath} -> ${compiledPath}`);
