import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, localDateKey, TIMEZONE } from "@/lib/payroll";
import { computeDayTimeline } from "@/lib/attendanceSlots";
import { formatInTimeZone } from "date-fns-tz";
import { endOfMonth, parseISO } from "date-fns";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  const currentMonth = today.slice(0, 7);
  const requested = typeof body?.month === "string" && MONTH_RE.test(body.month) ? body.month : null;
  // Future months have nothing to show, so clamp to the current one.
  const month = requested && requested <= currentMonth ? requested : currentMonth;
  const startDate = `${month}-01`;
  const monthEnd = formatInTimeZone(endOfMonth(parseISO(startDate)), TIMEZONE, "yyyy-MM-dd");
  const endDate = monthEnd < today ? monthEnd : today;

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

  const earliestMonth = punches.length > 0 ? localDateKey(punches[0].timestamp).slice(0, 7) : currentMonth;

  return NextResponse.json({
    employeeName: matched.name,
    month,
    earliestMonth,
    currentMonth,
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
