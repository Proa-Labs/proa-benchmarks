#!/usr/bin/env node
// Ahead-of-time compile the three canonical Marko templates for the HTTP page
// server so the compiler is never resident in a measured server process.

import { compileFile } from "@marko/compiler";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Compiled output sits beside the .marko sources (as the canonical adapter's
// own output does) so the templates' relative helper imports resolve.
const buildDirectory = here;
const templates = {
  cards: "suite_cards.marko",
  table: "page_table.marko",
  products: "suite_products.marko",
};

for (const [workload, file] of Object.entries(templates)) {
  const compiled = await compileFile(join(here, file), {
    output: "html",
    optimize: true,
    modules: "esm",
    writeVersionComment: false,
    translator: require.resolve("marko/translator"),
    resolveVirtualDependency(_filename, dependency) {
      return dependency.virtualPath;
    },
  });
  const outputPath = join(buildDirectory, `suite_${workload}.compiled.mjs`);
  writeFileSync(outputPath, compiled.code);
  console.log(`Compiled ${file} -> ${outputPath}`);
}
