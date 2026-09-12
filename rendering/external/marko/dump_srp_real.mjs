/**
 * Render Marko's eBay listings and splice them into the retained SRP capture
 * shell for side-by-side browser inspection.
 *
 *   node dump_srp_real.mjs --listings 60 \
 *     --shell-dir /path/to/proa/proa_showcase/src/ebay/data \
 *     --out /tmp/srp-preview/marko-real.html
 */
import { compileFile } from "@marko/compiler";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildListings } from "./helpers_srp_real.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return argv[i + 1];
}
const LISTINGS = Number(arg("--listings", 60));
const OUT = arg("--out", "/tmp/srp-preview/marko-real.html");
const SHELL_DIR = arg("--shell-dir", null);
if (!SHELL_DIR) {
  throw new Error(
    "--shell-dir is required; point it at proa_showcase/src/ebay/data in a Proa checkout",
  );
}

const sourcePath = join(__dirname, "page_srp_real.marko");
const compiled = await compileFile(sourcePath, {
  output: "html",
  optimize: true,
  modules: "esm",
  writeVersionComment: false,
  translator: require.resolve("marko/translator"),
  resolveVirtualDependency(_filename, dep) { return dep.virtualPath; },
});
const compiledFile = join(__dirname, "page_srp_real.compiled.mjs");
writeFileSync(compiledFile, compiled.code);
const Template = (await import(pathToFileURL(compiledFile).href)).default;

const listings = buildListings(LISTINGS);
const inner = await Template.render({ listings });

const pre = readFileSync(join(SHELL_DIR, "shell_pre.html"), "utf8");
const post = readFileSync(join(SHELL_DIR, "shell_post.html"), "utf8");
const style = readFileSync(join(SHELL_DIR, "srp_chrome_style.css"), "utf8");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(join(dirname(OUT), "srp_chrome_style.css"), style);
const combined = pre + '<ul class="srp-results srp-list clearfix">' + inner + "</ul>" + post;
writeFileSync(OUT, combined);
console.log(`Wrote Marko eBay SRP to ${OUT}`);
console.log(`  cards rendered: ${LISTINGS}`);
console.log(`  inner listings bytes: ${Buffer.byteLength(inner)}`);
console.log(`  total page bytes: ${Buffer.byteLength(combined)}`);
