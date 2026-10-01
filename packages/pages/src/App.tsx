import './App.css';
import { useMemo, useState } from '@lynx-js/react';
import {
  createTranslator,
  resolveLocale,
  type Locale,
} from '@zzzode/i18n';
import { EnergyCard } from './components/EnergyCard.js';
import { Header } from './components/Header.js';
import { MacroCard } from './components/MacroCard.js';
import { QuickActions } from './components/QuickActions.js';
import { WeightCard } from './components/WeightCard.js';
import { selectToday } from './state/select.js';
import type { HostData } from './state/types.js';

interface AppProps {
  hostData: HostData;
  initialLocale?: string;
}

export function App({ hostData, initialLocale }: AppProps) {
  const [locale, setLocale] = useState<Locale>(resolveLocale(initialLocale));
  const t = useMemo(() => createTranslator(locale), [locale]);
  const state = useMemo(() => selectToday(hostData), [hostData]);

  return (
    <page className="Page">
      <scroll-view scroll-y className="Scroll">
        <view className="Content">
          <Header
            state={state}
            locale={locale}
            t={t}
            onLocaleChange={setLocale}
          />
          <EnergyCard state={state} t={t} />
          {!state.safe && (
            <view className="Notice">
              <text className="Notice-text">{t('notice.safeFloor')}</text>
            </view>
          )}
          <WeightCard state={state} t={t} />
          <MacroCard state={state} t={t} />
          <QuickActions t={t} />
          <text className="Footer">{t('footer.disclaimer')}</text>
        </view>
      </scroll-view>
    </page>
  );
}
