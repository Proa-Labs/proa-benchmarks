/**
 * Render the Marko SRP page to standalone HTML for browser preview.
 * Run: node dump_srp.mjs --listings 60 --out /tmp/srp-preview/marko.html
 */

import { compileFile } from "@marko/compiler";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildListings, FACETS } from "./helpers_srp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return argv[i + 1];
}
const LISTINGS = Number(arg("--listings", 60));
const OUT = arg("--out", "/tmp/srp-preview/marko.html");
const NOW_UNIX = 1730100000;

const sourcePath = join(__dirname, "page_srp.marko");
const compiled = await compileFile(sourcePath, {
  output: "html",
  optimize: true,
  modules: "esm",
  writeVersionComment: false,
  translator: require.resolve("marko/translator"),
  resolveVirtualDependency(_filename, dep) {
    return dep.virtualPath;
  },
});
const compiledFile = join(__dirname, "page_srp.compiled.mjs");
writeFileSync(compiledFile, compiled.code);
const Template = (await import(pathToFileURL(compiledFile).href)).default;

const listings = buildListings(LISTINGS);
const input = {
  query: "field recorder",
  totalResults: 32062,
  facets: FACETS,
  listings,
  nowUnix: NOW_UNIX,
};

let html = await Template.render(input);

const styles = `
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #191919; font-family: system-ui, sans-serif; }
  header, main, footer { padding: 1rem 1.5rem; }
  header, footer { border-color: #d9d9d9; }
  main { display: flex; gap: 1.5rem; }
  aside { flex: 0 0 16rem; }
  section { flex: 1; min-width: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  section > ul { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
  section > ul > li { border: 1px solid #d9d9d9; border-radius: .75rem; padding: .75rem; }
  img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
  button, input, select { font: inherit; }
  img[src] {
    background: linear-gradient(135deg, #e5e7eb 25%, #d1d5db 25%, #d1d5db 50%, #e5e7eb 50%, #e5e7eb 75%, #d1d5db 75%);
    background-size: 24px 24px;
  }
  .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
</style>`;

html = html.replace("<head>", "<head>" + styles);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`Wrote Marko SRP preview to ${OUT}`);
console.log(`Open with: open ${OUT}`);
