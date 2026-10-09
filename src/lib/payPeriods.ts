import { localDateKey, nextWeeklyPeriod } from "@/lib/payroll";

export interface NextPeriod {
  /** First and last day (YYYY-MM-DD) of the weekly period that would be created next. */
  start: string;
  end: string;
  /** A period can only be created once its first day has arrived (Manila time). */
  canCreate: boolean;
}

/**
 * The pay period "New pay period" would create: the week right after the latest
 * one (or the current week when there is none). It isn't offered before that
 * week begins, so the list can't be filled with future weeks by clicking again
 * and again.
 */
export function nextPeriodToCreate(latestEnd: Date | null, now: Date = new Date()): NextPeriod {
  const after = latestEnd ? new Date(latestEnd.getTime() + 86400000) : now;
  const { start, end } = nextWeeklyPeriod(after);
  return { start, end, canCreate: start <= localDateKey(now) };
}

/** The current month as YYYY-MM in Manila time. */
export function currentMonthKey(now: Date = new Date()): string {
  return localDateKey(now).slice(0, 7);
}

/** True for a real month written YYYY-MM (rejects 2026-13 and the like). */
export function isMonthKey(value: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

/**
 * The dates a month covers, as UTC-midnight dates (how pay periods are stored):
 * from the 1st up to, but not including, the 1st of the next month.
 */
export function monthRange(monthKey: string): { from: Date; to: Date } {
  const [y, m] = monthKey.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** "October 2026" for a YYYY-MM key. */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
