import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { localDateKey, TIMEZONE, pairPunches, nextWeeklyPeriod, type PunchType } from "@/lib/payroll";

export type PresenceStatus = "OUT" | "WORKING" | "ON_BREAK" | "DONE";

/** The local (Asia/Manila) calendar-day range containing `now`, as UTC instants. */
export function getTodayRange(now: Date = new Date()): { dayStart: Date; dayEnd: Date } {
  const todayKey = localDateKey(now);
  const dayStart = fromZonedTime(`${todayKey}T00:00:00`, TIMEZONE);
  const dayEnd = addDays(dayStart, 1);
  return { dayStart, dayEnd };
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

export function formatActivityTime(t: Date): string {
  return formatInTimeZone(t, TIMEZONE, "h:mm a");
}

export interface ActivityEntry {
  type: PunchType;
  timestamp: Date;
}

export interface KioskSnapshot {
  status: PresenceStatus;
  allowedActions: PunchType[];
  activityLog: ActivityEntry[];
  totals: { todayMinutes: number; weekMinutes: number };
}

/**
 * Everything the kiosk's post-identify/post-punch screen needs for one
 * employee: current status, what they're allowed to do next, today's
 * activity log, and today/week worked-minute totals (raw clocked time --
 * not the payroll-adjusted regular/overtime split computeDailyResults
 * produces, since this is a "how long have you been working" display, not
 * a pay calculation).
 */
export async function getKioskSnapshot(employeeId: string): Promise<KioskSnapshot> {
  const now = new Date();
  const todayKey = localDateKey(now);
  const { start: weekStart, end: weekEnd } = nextWeeklyPeriod(now);
  const weekStartUtc = fromZonedTime(`${weekStart}T00:00:00`, TIMEZONE);
  const weekEndExclusiveUtc = addDays(fromZonedTime(`${weekEnd}T00:00:00`, TIMEZONE), 1);

  const weekPunches = await prisma.punch.findMany({
    where: {
      employeeId,
      voided: false,
      timestamp: { gte: weekStartUtc, lt: weekEndExclusiveUtc },
    },
    orderBy: { timestamp: "asc" },
    select: { type: true, timestamp: true },
  });

  const punchesByDay = new Map<string, ActivityEntry[]>();
  for (const p of weekPunches) {
    const key = localDateKey(p.timestamp);
    if (!punchesByDay.has(key)) punchesByDay.set(key, []);
    punchesByDay.get(key)!.push(p);
  }

  const activityLog = punchesByDay.get(todayKey) ?? [];
  const { workedMinutes: todayMinutes } = pairPunches(activityLog);
  let weekMinutes = 0;
  for (const dayPunches of punchesByDay.values()) {
    weekMinutes += pairPunches(dayPunches).workedMinutes;
  }

  const lastPunchType = activityLog.length > 0 ? activityLog[activityLog.length - 1].type : null;
  const status = derivePresenceStatus(lastPunchType);
  const breakUsedToday = activityLog.some((p) => p.type === "BREAK_START");
  const allowedActions = getAllowedActions(status, breakUsedToday);

  return { status, allowedActions, activityLog, totals: { todayMinutes, weekMinutes } };
}
