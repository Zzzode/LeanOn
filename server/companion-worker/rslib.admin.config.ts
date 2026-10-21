import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: { entry: { admin: './src/admin.ts', 'local-admin': './src/local-admin.ts' } },
  lib: [{ format: 'esm', dts: { isolated: true } }],
  output: { target: 'node', cleanDistPath: false, distPath: { root: './dist' }, externals: ['@zzzode/companion-server', 'miniflare'] },
});
