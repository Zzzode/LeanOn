import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: { entry: { worker: './src/entry.ts' } },
  lib: [{ format: 'esm', dts: { isolated: true } }],
  output: { target: 'web', distPath: { root: './dist' }, externals: ['node:crypto'] },
  tools: { rspack: { target: 'webworker' } },
});
