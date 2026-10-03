/**
 * Route model for the native navigation shell (RFC 0028).
 *
 * Primary routes are the five bottom-tab destinations. Pushed routes are whole
 * destinations the native host places on the current tab's back stack. Modal
 * quick-logging sheets are not routes; they stay inside the screen that opened
 * them.
 */
export type PrimaryRoute =
  | 'today'
  | 'diary'
  | 'progress'
  | 'partner'
  | 'me';

export type PushedRoute =
  | 'settings'
  | 'goals'
  | 'profile-edit'
  | 'health-connections'
  | 'food-search';

export type AppRoute = PrimaryRoute | PushedRoute;

/** Icon id resolved to an SVG by the navigation UI; labelKey is an i18n key. */
export interface PrimaryTab {
  route: PrimaryRoute;
  icon: 'sun' | 'book' | 'chart' | 'heart' | 'user';
  labelKey:
    | 'tab.today'
    | 'tab.diary'
    | 'tab.progress'
    | 'tab.partner'
    | 'tab.me';
}

export const PRIMARY_TABS: readonly PrimaryTab[] = [
  { route: 'today', icon: 'sun', labelKey: 'tab.today' },
  { route: 'diary', icon: 'book', labelKey: 'tab.diary' },
  { route: 'progress', icon: 'chart', labelKey: 'tab.progress' },
  { route: 'partner', icon: 'heart', labelKey: 'tab.partner' },
  { route: 'me', icon: 'user', labelKey: 'tab.me' },
];

export function isPrimaryRoute(route: string): route is PrimaryRoute {
  return PRIMARY_TABS.some((tab) => tab.route === route);
}

export function isAppRoute(route: string): route is AppRoute {
  return (
    isPrimaryRoute(route) ||
    (['settings', 'goals', 'profile-edit', 'health-connections', 'food-search']
      .includes(route))
  );
}
