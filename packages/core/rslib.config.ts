import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    entry: {
      index: './src/index.ts',
    },
  },
  // Isolated declarations follow the entry graph, excluding colocated *.test.ts.
  // Type checking is handled separately by `tsc --noEmit`.
  lib: [{ format: 'esm', dts: { isolated: true } }],
  output: {
    distPath: { root: './dist' },
  },
});
