import { formatInTimeZone } from "date-fns-tz";

/**
 * Date math for weekly / monthly cleaning duties. Everything works on plain
 * "yyyy-MM-dd" calendar-date keys (Asia/Manila days, as todayManila() returns)
 * and does its arithmetic in UTC so the server's own timezone never matters.
 */

/** How many days before a weekly / monthly cleaning day its reminder starts. */
export const REMINDER_LEAD_DAYS = 2;

export const DEFAULT_WEEKLY_CLEANING_DAY = 6; // Saturday (ISO weekday)

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function toDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO weekday of a date key: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(key: string): number {
  const day = toDate(key).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(key: string, days: number): string {
  const date = toDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** The last given weekday of a month. `month` is 1-12. */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  // Day 0 of the next month is the last day of this one.
  const lastDay = toKey(new Date(Date.UTC(year, month, 0)));
  const back = (isoWeekday(lastDay) - weekday + 7) % 7;
  return addDays(lastDay, -back);
}

/**
 * The monthly cleaning date of the month `key` falls in: the owner's override
 * when it lands in that same month, otherwise the last cleaning weekday of it.
 */
export function monthlyCleaningDateFor(
  key: string,
  weekday: number,
  override: string | null
): string {
  const monthPrefix = key.slice(0, 7);
  if (override && override.startsWith(monthPrefix)) return override;
  return lastWeekdayOfMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7)), weekday);
}

export function isWeeklyDue(todayKey: string, weekday: number): boolean {
  return isoWeekday(todayKey) === weekday;
}

export function isMonthlyDue(todayKey: string, weekday: number, override: string | null): boolean {
  return monthlyCleaningDateFor(todayKey, weekday, override) === todayKey;
}

/** The next weekly cleaning date, today included. */
export function nextWeeklyDate(todayKey: string, weekday: number): string {
  return addDays(todayKey, (weekday - isoWeekday(todayKey) + 7) % 7);
}

/** The next monthly cleaning date, today included -- rolls into next month once this month's has passed. */
export function nextMonthlyDate(todayKey: string, weekday: number, override: string | null): string {
  const thisMonth = monthlyCleaningDateFor(todayKey, weekday, override);
  if (thisMonth >= todayKey) return thisMonth;
  const firstOfNext = toKey(
    new Date(Date.UTC(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)), 1))
  );
  return monthlyCleaningDateFor(firstOfNext, weekday, override);
}

export function reminderDateFor(dueKey: string): string {
  return addDays(dueKey, -REMINDER_LEAD_DAYS);
}

export type ReminderPhase = "due-today" | "coming-up" | "later";

/** Where a due date is relative to today: due now, inside the reminder window, or further out. */
export function reminderPhase(todayKey: string, dueKey: string): ReminderPhase {
  if (dueKey === todayKey) return "due-today";
  return todayKey >= reminderDateFor(dueKey) ? "coming-up" : "later";
}

/** Formats a date key, e.g. formatDateKey("2026-09-26", "EEEE, MMM d") -> "Saturday, Sep 26". */
export function formatDateKey(key: string, pattern: string): string {
  return formatInTimeZone(toDate(key), "UTC", pattern);
}

/** Every date key in the month `key` falls in. */
export function datesInMonth(key: string): string[] {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${key.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`);
}
