# RFC 0020 — Smart reminders

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0005 (typed bridge), RFC 0010 (logging write path), RFC 0019 (progress insights)

## Summary

Add local, daily reminders for the two habits that most predict weight-loss
success: the morning weigh-in and logging the day's food. Reminders are
scheduled with WorkManager as **self-rescheduling one-time work**, stay silent
on days the task is already done ("smart silence"), and open LeanOn when
tapped. Preferences (on/off and time per kind) are persisted on the host and
edited through a ReminderSheet that offers preset time slots. No server,
account, or network is involved. iOS uses `UNUserNotificationCenter` with the
same settings; implementation lands on Android first.

## Motivation

- Frequent self-monitoring (weighing, logging) correlates strongly with weight
  loss and maintenance; the typical failure mode is *forgetting*, not
  unwillingness.
- Reminders raise adherence, but indiscriminate daily alerts nag users who
  already logged in, training them to swipe LeanOn notifications away.
- The app already depends on WorkManager and registers a (currently empty)
  `notification` module. The missing pieces are scheduling, the notification
  itself, and a settings surface.

## Goals

1. Reliable daily local notification at a user-chosen local time for two
   kinds — **weight** (morning) and **meals** (evening) — each independently
   enable-able.
2. Smart silence: if the day's weight (resp. any intake) already exists when
   the job fires, post nothing.
3. Tapping a notification opens LeanOn.
4. Settings persist across restarts and are editable in-app; the Android 13+
   notification permission is requested at the right moment.
5. Fully offline; no exact-alarm permission required.

## Non-goals

- Minute-level custom time picking in v1 (preset slots only); an arbitrary
  time picker may follow.
- Contextual/AI scheduling, quiet hours, a weekly digest, and exercise
  reminders (possible follow-ups).
- Notification action buttons ("Log now") or reply beyond tap-to-open.
- Cross-device sync of settings (stays local; sync arrives with RFC 0008).

## Design

### Settings model (core)

```ts
type ReminderKind = 'weight' | 'meals';

interface ReminderSlot {
  enabled: boolean;
  hour: number;   // 0-23 integer
  minute: number; // 0-59 integer
}

interface ReminderSettings {
  weight: ReminderSlot; // default { enabled: true,  7:30 }
  meals: ReminderSlot;  // default { enabled: true, 21:00 }
}
```

Core owns the types, `DEFAULT_REMINDER_SETTINGS`, and a pure
`normalizeReminderSettings(input)` that fills missing fields and throws
`RangeError` on an invalid hour/minute or a non-boolean `enabled`. Core has no
clock; computing the next trigger instant is host work.

Preset slots offered in the UI:

- **weight**: 06:30, 07:00, 07:30, 08:00
- **meals**: 20:00, 21:00, 22:00

### Bridge contracts

- `notification.getSettings`: `void` → `{ settings: ReminderSettings }`
- `notification.updateSettings`: `{ settings }` →
  `{ success: true, settings }` (host validates, persists, reschedules)
- `notification.requestPermission`: `void` → `{ granted: boolean }` (Android
  13+ `POST_NOTIFICATIONS`; earlier versions and the web return
  `granted: true`)

The existing generic `notification.schedule` (one-off, absolute `triggerAt`)
remains for future use but is not part of this flow.

### Scheduling (Android, WorkManager)

- `ReminderScheduler` uses `enqueueUniqueWork(kind, ExistingWorkPolicy.UPDATE)`
  with a `OneTimeWorkRequest` whose `initialDelay` is the number of
  milliseconds to the next occurrence of that local hour:minute.
- When `ReminderWorker` runs it (a) applies smart silence, (b) posts the
  notification via `Notifier` when due, and (c) enqueues the **next day's**
  one-time work for the same kind. Self-rescheduling keeps the fire time
  anchored (no drift accumulation) while WorkManager still handles Doze,
  reboot persistence, and deferral.
- Disabling a kind cancels its unique work; changing the time cancels and
  re-enqueues.
- No `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` is needed; WorkManager owns the
  underlying alarms.

### Smart silence (pure, unit tested)

A pure Kotlin function `shouldNotify(kind, today, hostData): Boolean`:

- `weight` → no `WeightSample` with `date == today`
- `meals` → no `IntakeSample` with `date == today`

`ReminderWorker` calls it against `RecordsRepository.loadHostData()`; when it
returns `false` the worker skips the notification and still reschedules.

### Notifications

- One `NotificationChannel` with id `reminders` (`IMPORTANCE_HIGH`), created
  before the first post.
- Title/body come from localized string resources per kind; the small icon is
  a dedicated monochrome vector drawable; `contentIntent` is
  `PendingIntent.getActivity(MainActivity, FLAG_IMMUTABLE |
  FLAG_UPDATE_CURRENT)`.
- Notification id is stable per kind.

### Permission

- `POST_NOTIFICATIONS` is declared without a maxSdk and gated at runtime on
  API 33+.
- `requestPermission` flows through the same
  `Activity.onRequestPermissionsResult` bridge as BLE (a dedicated request code
  and result holder); the sheet requests it when the user enables a reminder
  and it has not yet been granted.

### Persistence

- `SettingsRepository` over `SharedPreferences` (`leanon_settings`), separate
  from health records; missing values fall back to defaults.

### UI (pages)

- The Header gains a small Reminders button (a bell-glyph pill) that opens
  `ReminderSheet`.
- `ReminderSheet`: for each kind, an On/Off segmented control and a row of
  preset time segments (the active time highlighted); Save / Cancel. On first
  enable it requests permission and reflects the result. Reopening shows the
  persisted values.
- The preview bridge (web) keeps an in-memory `ReminderSettings` and returns
  `granted: true`.

### iOS

The same `ReminderSettings`; `UNUserNotificationCenter` with daily
date-components triggers, authorization via
`requestAuthorization(options: [.alert])`, and `notificationSettings` for the
permission state. Implemented on macOS later; this RFC ships Android.

## Alternatives

- **AlarmManager `setExactAndAllowWhileIdle` + boot receiver**: precise, but
  needs `SCHEDULE_EXACT_ALARM` (default-denied on Android 14+) and manual
  reboot re-registration. Rejected for v1; `ReminderScheduler` is swappable if
  exact timing is ever needed, with WorkManager as the fallback.
- **PeriodicWork (24 h)**: simpler, but the period is measured from the first
  execution, so Doze drift shifts the daily time; self-rescheduling one-time
  work avoids that.
- **Always notify**: simpler, but nags users who already logged and
  undermines the habit.
- **Store settings in HostData**: convenient for future sync, but couples app
  preferences to health records; kept in dedicated prefs for now (migratable
  when sync lands).

## Open questions

- Add a "Log now" notification action or a reply-based quick add?
- Add a weekly-review / streak-milestone celebration notification?
- Should meals smart silence require a minimum logged kcal rather than any
  intake?
- Add exercise / movement reminders as a third kind?
