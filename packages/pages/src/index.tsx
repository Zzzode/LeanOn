import { root } from '@lynx-js/react';
import { App } from './App.js';
import { sampleHostData } from './state/sample.js';
import type { HostData } from './state/types.js';

const injected = lynx.__globalProps?.hostData as HostData | undefined;
const initialLocale = lynx.__globalProps?.locale as string | undefined;

root.render(
  <App hostData={injected ?? sampleHostData} initialLocale={initialLocale} />,
);
