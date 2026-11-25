// ============================================================
// VibeVault – Date helpers
// All "calendar day" logic uses the device's local date so that
// streaks, price days and labels match what the user sees.
// ============================================================

export const DAY_MS = 86_400_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Local calendar date as YYYY-MM-DD. */
export function toDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parses YYYY-MM-DD as a local date (midnight). Returns null when malformed. */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days since the Unix epoch for the local calendar date. */
export function dayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** Calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

function toDate(input: string | Date): Date | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const asKey = parseDateKey(input);
  if (asKey) return asKey;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "Feb 15, 2026" — accepts YYYY-MM-DD keys, ISO timestamps or Dates. */
export function formatDate(input: string | Date): string {
  const date = toDate(input);
  if (!date) return typeof input === 'string' ? input : '';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "Feb 15" — short form without the year. */
export function formatShortDate(input: string | Date): string {
  const date = toDate(input);
  if (!date) return typeof input === 'string' ? input : '';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
