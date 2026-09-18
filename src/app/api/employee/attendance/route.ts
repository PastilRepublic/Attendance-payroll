import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, localDateKey, TIMEZONE } from "@/lib/payroll";
import { computeDayTimeline } from "@/lib/attendanceSlots";
import { formatInTimeZone } from "date-fns-tz";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Keeps a hand-crafted request from asking for years of days at once.
const MAX_RANGE_DAYS = 366;

function addDaysKey(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : null;
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : null;

  if (!pin || !employeeId) {
    return NextResponse.json({ error: "PIN and employeeId are required" }, { status: 400 });
  }

  const matched = await resolveEmployeeByPin(pin, employeeId);
  if (!matched) {
    return NextResponse.json({ error: "PIN not recognized" }, { status: 401 });
  }

  const settings = await getSettings();
  const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  // Any start/end pair (a week or month can straddle months). Defaults to the
  // current month so far; nothing after today has data, so end clamps to today.
  const reqStart = typeof body?.start === "string" && DATE_RE.test(body.start) ? body.start : null;
  const reqEnd = typeof body?.end === "string" && DATE_RE.test(body.end) ? body.end : null;
  const endDate = reqEnd && reqEnd < today ? reqEnd : today;
  let startDate = reqStart ?? `${today.slice(0, 7)}-01`;
  if (startDate > endDate) startDate = endDate;
  const earliestAllowed = addDaysKey(endDate, -(MAX_RANGE_DAYS - 1));
  if (startDate < earliestAllowed) startDate = earliestAllowed;

  const [punches, dayStatuses, shiftOverrides] = await Promise.all([
    prisma.punch.findMany({
      where: { employeeId: matched.id, voided: false },
      orderBy: { timestamp: "asc" },
    }),
    prisma.dayStatus.findMany({
      where: {
        employeeId: matched.id,
        date: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
      },
    }),
    prisma.shiftOverride.findMany({
      where: {
        date: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
      },
    }),
  ]);

  const relevantPunches = punches.filter((p) => {
    const key = localDateKey(p.timestamp);
    return key >= startDate && key <= endDate;
  });

  const days = computeDailyResults(
    relevantPunches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
    dayStatuses.map((d) => ({ date: d.date.toISOString().slice(0, 10), status: d.status })),
    settings,
    startDate,
    endDate,
    shiftOverrides.map((o) => ({
      date: o.date.toISOString().slice(0, 10),
      shiftStartTime: o.shiftStartTime,
      shiftEndTime: o.shiftEndTime,
    }))
  );

  const punchesByDay = new Map<string, typeof relevantPunches>();
  for (const p of relevantPunches) {
    const key = localDateKey(p.timestamp);
    if (!punchesByDay.has(key)) punchesByDay.set(key, []);
    punchesByDay.get(key)!.push(p);
  }

  const earliestDate = punches.length > 0 ? localDateKey(punches[0].timestamp) : today;

  return NextResponse.json({
    employeeName: matched.name,
    start: startDate,
    end: endDate,
    today,
    earliestDate,
    days: days
      .slice()
      .reverse()
      .map((d) => ({
        date: d.date,
        ...computeDayTimeline(punchesByDay.get(d.date) ?? []),
        regularHours: Math.round((d.regularMinutes / 60) * 100) / 100,
        overtimeHours: Math.round((d.overtimeMinutes / 60) * 100) / 100,
        isLate: d.isLate,
        isUndertime: d.isUndertime,
        returnedLateFromBreak: d.returnedLateFromBreak,
        dayStatus: d.dayStatus,
      })),
  });
}
