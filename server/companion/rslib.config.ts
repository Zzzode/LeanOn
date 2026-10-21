import { defineConfig } from '@rslib/core';
export default defineConfig({source:{entry:{index:'./src/index.ts',cli:'./src/cli.ts'}},lib:[{format:'esm',dts:{isolated:true}}],output:{target:'node',distPath:{root:'./dist'}}});
