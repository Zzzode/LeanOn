import { root } from '@lynx-js/react';
import { App } from './App.js';
import { sampleHostData } from './state/sample.js';
import { selectToday } from './state/select.js';
import type { HostData } from './state/types.js';

const injected = lynx.__globalProps?.hostData as HostData | undefined;
const today = selectToday(injected ?? sampleHostData);

root.render(<App state={today} />);
