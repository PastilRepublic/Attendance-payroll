import type { PunchType } from "./payroll";

/**
 * The Time In / Break / Time Out rules, kept free of database access so the
 * kiosk route, offline sync and admin edits all check the same thing (and so
 * they can be unit-tested).
 */

export type PresenceStatus = "OUT" | "WORKING" | "ON_BREAK" | "DONE";

interface PunchLike {
  type: PunchType;
  timestamp: Date;
}

/**
 * An employee's current presence, derived from the type of their most
 * recent punch today. Scoped to today only -- someone who forgot to clock
 * out yesterday reads as OUT today, not stuck WORKING. A completed
 * IN -> ... -> OUT cycle today reads as DONE, not OUT, so the day is
 * locked and cannot be re-started until tomorrow.
 */
export function derivePresenceStatus(lastPunchType: PunchType | null): PresenceStatus {
  if (lastPunchType === "BREAK_START") return "ON_BREAK";
  if (lastPunchType === "IN" || lastPunchType === "BREAK_END") return "WORKING";
  if (lastPunchType === "OUT") return "DONE";
  return "OUT";
}

/**
 * Which punch types are valid to submit next, given the current status.
 * Clocking out is not allowed directly from a break -- End Break must
 * happen first (matches Clockify, and guarantees a BREAK_END timestamp
 * always exists whenever a break happened, which the late-return-from-break
 * check in payroll.ts depends on). DONE allows nothing -- once an employee
 * has timed out for the day, only an admin correction can reopen it.
 * One break per day: once `breakUsedToday` is true, WORKING no longer
 * offers BREAK_START again.
 */
export function getAllowedActions(status: PresenceStatus, breakUsedToday = false): PunchType[] {
  if (status === "OUT") return ["IN"];
  if (status === "WORKING") return breakUsedToday ? ["OUT"] : ["BREAK_START", "OUT"];
  if (status === "ON_BREAK") return ["BREAK_END"];
  return [];
}

/** Status and next allowed actions after one day's punches (any order). */
export function dayStateAfter(dayPunches: PunchLike[]): {
  status: PresenceStatus;
  allowedActions: PunchType[];
} {
  const sorted = [...dayPunches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const last = sorted.length > 0 ? sorted[sorted.length - 1].type : null;
  const status = derivePresenceStatus(last);
  const breakUsed = sorted.some((p) => p.type === "BREAK_START");
  return { status, allowedActions: getAllowedActions(status, breakUsed) };
}

/**
 * Replays one day's punches in time order through the kiosk rules and
 * returns the index (in time order) of the first punch that would not have
 * been allowed, or -1 when the whole day is a valid sequence.
 */
export function firstInvalidPunch(dayPunches: PunchLike[]): number {
  const sorted = [...dayPunches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (let i = 0; i < sorted.length; i++) {
    if (!dayStateAfter(sorted.slice(0, i)).allowedActions.includes(sorted[i].type)) return i;
  }
  return -1;
}

/** How far back an offline punch may still be synced at the time it was made. */
export const MAX_OFFLINE_PUNCH_AGE_MS = 24 * 60 * 60 * 1000;

/** The kiosk's device id is a UUID; anything else sent to the punch API is ignored. */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/** How close an earlier identical punch must be for a retried one to count as the same punch. */
const DUPLICATE_RETRY_WINDOW_MS = 10 * 60 * 1000;

/**
 * A queued (retried) punch the server rejected as out of sequence is really a
 * duplicate when it repeats the employee's latest punch of that same type
 * shortly before: the first try was saved but its reply was lost, so the kiosk
 * sent it again. Returns that latest punch, or null.
 */
export function findDuplicateOfLatest<T extends { type: PunchType; timestamp: Date }>(
  before: T[],
  type: PunchType,
  timestamp: Date
): T | null {
  const last = before[before.length - 1];
  if (!last || last.type !== type) return null;
  const gap = timestamp.getTime() - last.timestamp.getTime();
  return gap >= 0 && gap <= DUPLICATE_RETRY_WINDOW_MS ? last : null;
}

export type PunchTimeResult =
  | { ok: true; timestamp: Date; backdated: boolean }
  | { ok: false; error: string; message: string };

/**
 * When a punch should be recorded. A live punch is recorded now. A punch
 * that was queued on the kiosk while offline carries `queuedAt` and is
 * recorded at that moment instead of when it finally synced -- otherwise an
 * 8:00 offline Time In synced at 10:30 would read as 10:30 and flag Late.
 * A device clock running ahead is capped at now; a punch older than
 * MAX_OFFLINE_PUNCH_AGE_MS is rejected so it lands in the kiosk's failed
 * list for the admin to enter by hand instead of silently rewriting history.
 */
export function resolvePunchTime(queuedAt: string | null | undefined, now: Date = new Date()): PunchTimeResult {
  if (!queuedAt) return { ok: true, timestamp: now, backdated: false };
  const t = new Date(queuedAt);
  if (Number.isNaN(t.getTime())) return { ok: true, timestamp: now, backdated: false };
  if (t.getTime() >= now.getTime()) return { ok: true, timestamp: now, backdated: false };
  if (now.getTime() - t.getTime() > MAX_OFFLINE_PUNCH_AGE_MS) {
    return {
      ok: false,
      error: "OFFLINE_PUNCH_TOO_OLD",
      message: "This offline punch is too old to sync. Please ask your admin to enter it.",
    };
  }
  return { ok: true, timestamp: t, backdated: true };
}

export interface DayEditTimes {
  timeIn: string;
  breakStart: string;
  breakEnd: string;
  timeOut: string;
}

/**
 * Checks an admin's Time In / Start Break / End Break / Time Out entry for
 * one day (HH:mm strings, "" for blank) against the same rules the kiosk
 * enforces, plus no times in the future. Returns an error message, or null
 * when the entry is valid. `todayKey`/`nowHHmm` are the current Manila date
 * and time.
 */
export function validateDayEdit(
  t: DayEditTimes,
  date: string,
  todayKey: string,
  nowHHmm: string
): string | null {
  const order = [
    ["Time In", t.timeIn],
    ["Start Break/Lunch", t.breakStart],
    ["End Break/Lunch", t.breakEnd],
    ["Time Out", t.timeOut],
  ] as const;
  const entered = order.filter(([, v]) => v !== "");

  if (entered.length > 0 && date > todayKey) {
    return "You can't enter times for a future date.";
  }
  if (t.breakStart && !t.timeIn) return "Start Break/Lunch needs a Time In.";
  if (t.breakEnd && !t.breakStart) return "End Break/Lunch needs a Start Break/Lunch.";
  if (t.timeOut && !t.timeIn) return "Time Out needs a Time In.";
  if (t.timeOut && t.breakStart && !t.breakEnd) {
    return "Time Out after a break needs an End Break/Lunch. Leave Time Out blank if they never came back.";
  }
  for (let i = 1; i < entered.length; i++) {
    if (entered[i][1] <= entered[i - 1][1]) {
      return "Times must be in order: Time In, Start Break/Lunch, End Break/Lunch, Time Out.";
    }
  }
  if (date === todayKey) {
    const future = entered.find(([, v]) => v > nowHHmm);
    if (future) return `${future[0]} (${future[1]}) is later than the current time.`;
  }
  return null;
}

/** A 24-hour "HH:mm" time (00:00 to 23:59). */
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a real calendar date written YYYY-MM-DD (rejects e.g. 2026-02-31). */
export function isRealDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
