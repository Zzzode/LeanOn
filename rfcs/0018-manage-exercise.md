# RFC 0018 — Edit and delete exercise sessions

- Status: Accepted
- Created: 2026-10-02
- Related: RFC 0017 (exercise logging), RFC 0014 (manage custom foods)

## Summary

RFC 0017 made exercise sessions first-class records but, by design, left them
append-only: there is no way to correct a session logged with the wrong
activity or duration, or to remove a duplicate. This RFC gives each
`ExerciseSample` a stable `id`, adds the `health.updateExercise` and
`health.deleteExercise` RPCs, teaches the exercise sheet an edit mode, and adds
inline Edit / Delete controls (with a two-tap delete confirm) to the Home
exercise card. Other sessions and past days are never rewritten.

## Motivation

A single mistaken session is not harmless. The kilocalories feed the
eat-back budget (RFC 0017), so an overstated or duplicated workout makes the
day's remaining allowance wrong in the direction that encourages over-eating,
and it accumulates in history. Users will only trust the budget if they can
fix obvious mistakes in a tap or two. Custom foods gained the same capability
in RFC 0014; exercise sessions should behave no differently.

## Guide-level explanation

- **Edit.** On the Home exercise card, each session row offers an Edit
  control. Tapping it opens the exercise sheet pre-filled with that session's
  activity and duration. The kilocalories recompute live as in normal logging;
  saving replaces the whole session in place and returns the updated HostData.
- **Delete.** Each row also offers Delete. The first tap turns the control
  into a confirmation; a second tap within the row removes the session. The
  day's totals and the eat-back budget then reflect the removal. Tapping
  elsewhere (or waiting) cancels the confirmation.
- Sessions created before this RFC have no `id`; the host assigns one when the
  records are first read so that they can be edited and deleted as well.

## Reference-level explanation

### Model changes

`ExerciseSample` gains a stable identifier:

```ts
interface ExerciseSample {
  /** Stable per-session id, e.g. `ex-1a2b3c4d`. */
  id: string;
  date: string;
  typeId: string;
  durationMin: number;
  kcal: number;
}
```

The `id` is identity only; it never participates in calorie math.

### Legacy normalization

Sessions persisted by RFC 0017 lack an `id`. When records are loaded the host
walks `exercises`, assigns `ex-<uuid8>` to any session missing a non-empty
`id`, and persists the normalized data once. After this point every session is
addressable by `id`.

### RPCs

- `health.updateExercise`

  Request:

  ```ts
  { id: string; date: string; typeId: string; durationMin: number; kcal: number }
  ```

  Response: `{ success: true; hostData: HostDataDto }`. The host locates the
  session by `id`, replaces `date` / `typeId` / `durationMin` / `kcal` as a
  whole, and keeps the original `id`. As with logging, the page passes the
  kilocalories it calculated; the host only validates and persists. An unknown
  `id` rejects with `not-found`; invalid fields reject with `invalid-request`.

- `health.deleteExercise`

  Request: `{ id: string }`. Response: `{ success: true; hostData: HostDataDto }`.
  The host rebuilds `exercises` without the matching session. An unknown `id`
  rejects with `not-found`.

Both dispatch `records.changed` with the updated HostData after a successful
write, matching the other health write paths.

### Android persistence

- `RecordsRepository.addExercise` generates `ex-<uuid8>` and stores it on the
  new session.
- A normalization pass (run on load) fills ids for legacy sessions.
- `updateExercise(id, date, typeId, durationMin, kcal)` finds the session by
  `id`, replaces it in place, and throws `NoSuchElementException` when absent.
- `deleteExercise(id)` rebuilds the array without the matching session and
  throws when absent.
- `HealthModule` exposes `updateExercise` and `deleteExercise`, mapping
  `NoSuchElementException` to `not-found`, validation failures to
  `invalid-request`, and anything else to `unavailable`.

### UI

- The exercise sheet accepts an optional initial session. When present it
  pre-selects the activity and pre-fills the duration, shows an edit title, and
  saves through `health.updateExercise`; otherwise it logs through
  `health.writeExercise` as before.
- The exercise card renders an Edit and a Delete control on each row. Delete
  uses the same two-tap confirmation pattern as custom-food deletion.

## Drawbacks

- Deleting or editing a session changes that day's total exercise kilocalories
  and therefore its eat-back allowance. This is intended: the removed workout
  should no longer count.
- The `id` field and one-time normalization add a small amount of storage and
  complexity.

## Rationale and alternatives

- **Whole-session replacement vs. partial PATCH.** The edit sheet always has
  the full activity, duration, and recomputed kilocalories, so it submits the
  whole session. This mirrors `updateCustomFood` and avoids ambiguous partial
  updates where `kcal` could disagree with `typeId` / `durationMin`.
- **Identify by `id`, not array index.** Indices shift as sessions are added
  and removed; a stable `id` is safe across re-renders and the bridge round
  trip.
- **Hard delete vs. soft delete / undo.** Sessions are removed outright,
  matching custom foods. An undo affordance or soft-delete/history is left to a
  later RFC.
- **Editing only today vs. any day.** The same mechanism works for any dated
  session; the UI currently surfaces it on the Home (today) card, and history
  screens can reuse it later.

## Unresolved questions

- Should deletion offer a transient Undo (snackbar) rather than only a two-tap
  confirm?
- Should sessions be movable across days (e.g. logged against the wrong date)?
- Bulk selection / multi-delete is out of scope here.

## Implementation plan

- `core`: add `id` to `ExerciseSample`.
- `bridge`: `health.updateExercise` / `health.deleteExercise` contracts and
  client tests.
- Android: id generation, legacy normalization, repository update/delete,
  `HealthModule` methods, regenerated seed.
- Pages: edit-mode sheet, card Edit/Delete with two-tap confirm, select and
  preview updates, bilingual strings.
