import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE = resolve(ROOT, 'fixtures/proa-buffer-comparison');

export function prepareBufferBench() {
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path',
    resolve(FIXTURE, 'Cargo.toml'), '--format-version', '1', '--locked', '--offline'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  const showcase = metadata.packages.find((p) => p.name === 'proa_showcase');
  if (!showcase) throw new Error('Locked showcase dependency missing');
  const dir = resolve(dirname(showcase.manifest_path), 'src/ebay');
  const path = resolve(dir, 'srp_chrome_real.rs');
  let source = readFileSync(path, 'utf8');
  // The generated page hardcodes RenderBuffer. Generalize only its writer
  // type; keep its original markup and render body byte-for-byte unchanged.
  const substitutions = [
    ["impl<'a, R, T, L: ::proa_core::DataLoader> WebRenderSync<L> for RealSrpDocument<'a, R, T>",
      "impl<'a, R, T, B: proa_core::WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for RealSrpDocument<'a, R, T>"],
    ['    R: WebRenderSync<L>,', '    R: WebRenderSync<L, B>,'],
    ['    T: WebRenderSync<L>,', '    T: WebRenderSync<L, B>,'],
    ['    fn render(self, cx: &mut WebContext<L>)', '    fn render(self, cx: &mut WebContext<L, B>)'],
  ];
  for (const [before, after] of substitutions) {
    if (source.split(before).length !== 2) throw new Error(`Upstream eBay writer changed: ${before}`);
    source = source.replace(before, after);
  }
  source = source.replace(/^\/\/!/gm, '//').replace(/include_str!\("([^"]+)"\)/g,
    (_, file) => `include_str!(${JSON.stringify(resolve(dir, file))})`);
  // The page also uses a crate-private integer formatter. Copy its exact
  // implementation from the same locked source instead of substituting one.
  const srp = readFileSync(resolve(dir, 'srp.rs'), 'utf8');
  const blocks = [
    /^pub\(crate\) struct Commas[\s\S]*?^}/m,
    /^fn format_u64[\s\S]*?^}/m,
    /^fn write_with_commas[\s\S]*?^}/m,
  ].map((pattern) => {
    const match = srp.match(pattern);
    if (!match) throw new Error('Upstream eBay number formatter changed');
    return match[0];
  });
  source = source.replace('use super::srp::{Commas, Listing};',
    'use proa_showcase::ebay::srp::Listing;\nuse proa_core::WriteBuf;');
  source += '\n' + blocks.join('\n\n') + '\n';
  const generated = resolve(FIXTURE, 'target/generated/ebay_real.rs');
  mkdirSync(dirname(generated), { recursive: true });
  writeFileSync(generated, source);
  return { generated, proaRevision: showcase.source.split('#')[1] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { generated } = prepareBufferBench();
  const proa = process.argv[2] || 'proa';
  execFileSync(proa, ['build', '--root', FIXTURE, '--locked', '--offline', '--no-check', '--no-assets',
    '-p', 'proa_buffer_comparison', '--bin', 'proa_buffer_comparison', '--artifact-out', 'target/buffer-bench'],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, PROA_BUFFER_EBAY_MODULE: generated } });
}
