import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [sveltekit({
    adapter: adapter({ out: 'build', precompress: false }),
    version: { name: 'benchmark' },
  })],
  resolve: {
    dedupe: ['svelte'],
    alias: {
      '#fixtures': fileURLToPath(new URL('../shared/suite_data.mjs', import.meta.url)),
      '#scenario': fileURLToPath(new URL('../../../suspense-load/scenario.mjs', import.meta.url)),
      '#canonical': fileURLToPath(new URL('../svelte', import.meta.url)),
    },
  },
  server: { fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
});
