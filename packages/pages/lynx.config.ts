import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';

export default defineConfig({
  source: {
    entry: './src/index.tsx',
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        // Open the page full-screen inside Lynx Explorer.
        return `${url}?fullscreen=true`;
      },
    }),
    pluginReactLynx(),
  ],
  // Build both the native Lynx bundle and a web bundle (used for previews).
  environments: {
    lynx: {},
    web: {},
  },
});
