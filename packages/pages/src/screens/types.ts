import type { Locale, Translator } from '@zzzode/i18n';
import type { PushedRoute } from '../state/routes.js';
import type { HostData, TodayState } from '../state/types.js';

/** One exercise session as presented on a screen (RFC 0017/0025). */
export type ExerciseSessionView = TodayState['exerciseSessions'][number];

/** Callbacks the host/screens provide; the UI never owns a clock or storage. */
export interface ScreenActions {
  logFood: () => void;
  logWeight: () => void;
  logExercise: () => void;
  openReminders: () => void;
  openHealthConnections: () => void;
  openRoute: (route: PushedRoute) => void;
  openSettings: () => void;
  setWaterTotal: (totalMl: number) => void;
  editExercise: (session: {
    id: string;
    typeId: string;
    durationMin: number;
  }) => void;
  deleteExercise: (id: string) => Promise<void>;
}

export interface ScreenProps {
  hostData: HostData;
  state: TodayState;
  locale: Locale;
  t: Translator;
  actions: ScreenActions;
}
