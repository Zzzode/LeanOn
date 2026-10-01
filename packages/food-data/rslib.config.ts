import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    entry: {
      index: './src/index.ts',
    },
  },
  // Isolated declarations follow the entry graph; type checking runs separately.
  lib: [{ format: 'esm', dts: { isolated: true } }],
  output: {
    distPath: { root: './dist' },
  },
});
