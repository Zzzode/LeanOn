import './App.css';
import { EnergyCard } from './components/EnergyCard.js';
import { Header } from './components/Header.js';
import { MacroCard } from './components/MacroCard.js';
import { QuickActions } from './components/QuickActions.js';
import { WeightCard } from './components/WeightCard.js';
import type { TodayState } from './state/types.js';

export function App({ state }: { state: TodayState }) {
  return (
    <page className="Page">
      <scroll-view scroll-y className="Scroll">
        <view className="Content">
          <Header
            greeting={state.greeting}
            dateLabel={state.dateLabel}
            streak={state.streak}
          />
          <EnergyCard state={state} />
          {!state.safe && (
            <view className="Notice">
              <text className="Notice-text">
                Your target was raised to the safe minimum.
              </text>
            </view>
          )}
          <WeightCard state={state} />
          <MacroCard state={state} />
          <QuickActions />
          <text className="Footer">LeanOn · not medical advice</text>
        </view>
      </scroll-view>
    </page>
  );
}
