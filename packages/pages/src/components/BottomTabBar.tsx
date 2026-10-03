import type { Translator } from '@zzzode/i18n';
import {
  PRIMARY_TABS,
  type PrimaryRoute,
  type PrimaryTab,
} from '../state/routes.js';

interface BottomTabBarProps {
  current: PrimaryRoute;
  t: Translator;
  onSelect: (route: PrimaryRoute) => void;
}

/** Inner shapes (24x24). Stroke/fill use currentColor so the host can theme. */
const ICON_SHAPES: Record<PrimaryTab['icon'], string> = {
  sun:
    '<circle cx="12" cy="12" r="4.5"/>' +
    '<path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
  book:
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/>' +
    '<path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>',
  chart:
    '<path d="M4 20V4"/><path d="M4 20h16"/>' +
    '<path d="M8 16l3-4 3 2.5L19 8"/>',
  heart:
    '<path d="M12 20s-7-4.4-9-8.4C1.6 8.6 3 5.5 6 5.5c1.8 0 3 .9 4 2 1-1.1 2.2-2 4-2 3 0 4.4 3.1 3 6.1C19 15.6 12 20 12 20Z"/>',
  user:
    '<circle cx="12" cy="8" r="4"/>' +
    '<path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
};

function svgContent(icon: PrimaryTab['icon']): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    `${ICON_SHAPES[icon]}</svg>`
  );
}

/** Developer-shell bottom tab bar; native hosts render their own tab bar. */
export function BottomTabBar({ current, t, onSelect }: BottomTabBarProps) {
  return (
    <view className="BottomTabBar">
      {PRIMARY_TABS.map((tab) => {
        const active = current === tab.route;
        const color = active ? '#218967' : '#93a09a';
        return (
          <view
            key={tab.route}
            className={active ? 'BottomTab BottomTab-active' : 'BottomTab'}
            bindtap={() => onSelect(tab.route)}
          >
            <view className="BottomTab-icon">
              <svg
                className="BottomTab-svg"
                content={svgContent(tab.icon)}
                current-color={color}
              />
            </view>
            <text
              className={
                active
                  ? 'BottomTab-label BottomTab-label-active'
                  : 'BottomTab-label'
              }
            >
              {t(tab.labelKey)}
            </text>
          </view>
        );
      })}
    </view>
  );
}
