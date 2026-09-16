import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeByPin } from "@/lib/kioskAuth";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, localDateKey, TIMEZONE } from "@/lib/payroll";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";

const HISTORY_DAYS = 30;

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
  const endDate = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
  const startDate = formatInTimeZone(subDays(new Date(), HISTORY_DAYS - 1), TIMEZONE, "yyyy-MM-dd");

  const [punches, dayStatuses] = await Promise.all([
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
    endDate
  );

  const punchesByDay = new Map<string, typeof relevantPunches>();
  for (const p of relevantPunches) {
    const key = localDateKey(p.timestamp);
    if (!punchesByDay.has(key)) punchesByDay.set(key, []);
    punchesByDay.get(key)!.push(p);
  }

  // Groups a day's punches into IN/OUT segments. A normal day has one segment
  // (a single continuous shift); an actual lunch-break punch-out/in produces
  // a second segment.
  function buildSegments(dayPunches: typeof relevantPunches) {
    const segments: { in?: Date; out?: Date }[] = [];
    let current: { in?: Date; out?: Date } | null = null;
    for (const p of dayPunches) {
      if (p.type === "IN") {
        if (current) segments.push(current);
        current = { in: p.timestamp };
      } else {
        if (current) {
          current.out = p.timestamp;
          segments.push(current);
          current = null;
        } else {
          segments.push({ out: p.timestamp });
        }
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  const formatTime = (t?: Date) => (t ? formatInTimeZone(t, TIMEZONE, "h:mm a") : null);

  return NextResponse.json({
    employeeName: matched.name,
    days: days
      .slice()
      .reverse()
      .map((d) => {
        const dayPunches = (punchesByDay.get(d.date) ?? [])
          .slice()
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const segments = buildSegments(dayPunches);

        // One segment = a normal single continuous shift: In goes under
        // "Morning", Out goes under "Afternoon" (no lunch-break punch was
        // recorded). Two or more segments = an actual split day.
        const slots =
          segments.length <= 1
            ? {
                morningIn: formatTime(segments[0]?.in),
                morningOut: null,
                afternoonIn: null,
                afternoonOut: formatTime(segments[0]?.out),
              }
            : {
                morningIn: formatTime(segments[0]?.in),
                morningOut: formatTime(segments[0]?.out),
                afternoonIn: formatTime(segments[1]?.in),
                afternoonOut: formatTime(segments[1]?.out),
              };

        return {
          date: d.date,
          ...slots,
          regularHours: Math.round((d.regularMinutes / 60) * 100) / 100,
          overtimeHours: Math.round((d.overtimeMinutes / 60) * 100) / 100,
          isLate: d.isLate,
          isUndertime: d.isUndertime,
          dayStatus: d.dayStatus,
        };
      }),
  });
}
