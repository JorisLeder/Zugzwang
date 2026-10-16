/** Date helpers for streaks and daily activity (D-14). Frozen (WP-00). */

/** The user's IANA time zone (e.g. `Europe/Berlin`); `UTC` if unknown. */
export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Calendar day `YYYY-MM-DD` of `date` in `timeZone` (default: the user's time zone). */
export function localDateKey(date: Date = new Date(), timeZone: string = userTimeZone()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Adds `days` to a `YYYY-MM-DD` key (calendar arithmetic, time-zone independent). */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Current time as ISO string (single place to stub in tests). */
export function nowIso(): string {
  return new Date().toISOString();
}
