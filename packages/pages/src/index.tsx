import { root } from '@lynx-js/react';
import { App } from './App.js';

// Bootstrap (hostData + locale) is provided by the host as initData and read with
// useInitData() inside App; off-device it falls back to the bundled sample.
root.render(<App />);
