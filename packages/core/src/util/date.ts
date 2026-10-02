/**
 * Deterministic calendar helpers. All math is done in UTC on whole days so the
 * engine never depends on the host timezone or a mutable clock.
 */

/** Whole days elapsed since the Unix epoch (UTC) for an ISO `YYYY-MM-DD` date. */
export function dayIndex(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new RangeError(`Expected an ISO YYYY-MM-DD date, received: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.UTC uses 0-based months.
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Signed number of whole days between two ISO dates (`b - a`). */
export function daysBetween(a: string, b: string): number {
  return dayIndex(b) - dayIndex(a);
}

/** Inverse of {@link dayIndex}: a whole-day index back to ISO `YYYY-MM-DD` (UTC). */
export function isoFromDayIndex(index: number): string {
  if (!Number.isInteger(index)) {
    throw new RangeError(
      `isoFromDayIndex() expects an integer, received: ${index}`,
    );
  }
  const date = new Date(index * 86_400_000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Completed years of age on a given ISO date, using UTC calendar comparison. */
export function ageOn(birthDate: string, onDate: string): number {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDate);
  if (!birth || !now) {
    throw new RangeError('Expected ISO YYYY-MM-DD dates for ageOn()');
  }
  let age = Number(now[1]) - Number(birth[1]);
  const beforeBirthdayThisYear =
    Number(now[2]) < Number(birth[2]) ||
    (Number(now[2]) === Number(birth[2]) && Number(now[3]) < Number(birth[3]));
  if (beforeBirthdayThisYear) {
    age -= 1;
  }
  return age;
}
