import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, localDateKey } from "@/lib/payroll";
import { computeDayTimeline, pickDaySlots } from "@/lib/attendanceSlots";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import { saveDayPunches, setDayStatus, setShiftOverride, removeShiftOverride } from "./actions";
import AutoRefresh from "./AutoRefresh";
import ClosePanesOnOutsideClick from "./ClosePanesOnOutsideClick";
import EmployeeSelect from "./EmployeeSelect";
import { derivePresenceStatus, type PresenceStatus } from "@/lib/kioskAttendance";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Avatar from "@/components/Avatar";
import Button from "@/components/Button";

function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

function currentMonthManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM");
}

/** Last day (1-31) of a YYYY-MM month string, via plain calendar math (no timezone involved). */
function daysInMonth(month: string): number {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
}

/** The day after a YYYY-MM-DD date string, via plain calendar math. */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

// One distinct color per weekday, warmer toward the weekend, so scanning
// down a week/month makes the same weekday easy to pattern-match.
const DAY_ABBREV_STYLES = [
  { label: "Sun", className: "bg-red-100 text-red-700" },
  { label: "Mon", className: "bg-indigo-100 text-indigo-700" },
  { label: "Tue", className: "bg-fuchsia-100 text-fuchsia-700" },
  { label: "Wed", className: "bg-emerald-100 text-emerald-700" },
  { label: "Thu", className: "bg-cyan-100 text-cyan-700" },
  { label: "Fri", className: "bg-yellow-100 text-yellow-800" },
  { label: "Sat", className: "bg-orange-100 text-orange-700" },
] as const;

function dayAbbrev(dateStr: string): { label: string; className: string } {
  const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return DAY_ABBREV_STYLES[dow];
}

/** ISO week string (YYYY-Www) for the week containing this date, via plain calendar math. */
function isoWeekString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  // ISO weeks: Thursday of the week determines the week-year.
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of a given ISO week string (YYYY-Www). */
function mondayOfIsoWeek(weekStr: string): string {
  const [yearStr, weekPart] = weekStr.split("-W");
  const year = Number(yearStr);
  const week = Number(weekPart);
  const jan4 = new Date(Date.UTC(year, 0, 4)); // Jan 4 is always in ISO week 1
  const week1Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000).toISOString().slice(0, 10);
}

type AttendanceRange = "day" | "week" | "month";

function parseRange(value: string | undefined): AttendanceRange {
  return value === "week" || value === "month" ? value : "day";
}

interface PunchRow {
  id: string;
  employeeId: string;
  type: "IN" | "OUT" | "BREAK_START" | "BREAK_END";
  timestamp: Date;
  isCorrection: boolean;
  photoPath: string | null;
}

interface TodayRow {
  employee: { id: string; name: string; photoPath: string | null };
  punches: PunchRow[];
  dayStatus: string;
  timeline: ReturnType<typeof computeDayTimeline>;
  timedIn: boolean;
  isLate: boolean;
  isUndertime: boolean;
  returnedLateFromBreak: boolean;
  /** Live presence, only set when refDate is actually today -- a past day's
   * last punch isn't a "current" status. */
  presence: PresenceStatus | undefined;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    employeeId?: string;
    range?: string;
    date?: string;
    week?: string;
    month?: string;
  }>;
}) {
  const params = await searchParams;

  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const employeeId = params.employeeId ?? "";
  const range = parseRange(params.range);
  const refDate = params.date ?? todayManila();
  const week = params.week ?? isoWeekString(todayManila());
  const month = params.month ?? currentMonthManila();

  let rangeStart: string;
  let rangeEnd: string;
  if (range === "day") {
    rangeStart = rangeEnd = refDate;
  } else if (range === "week") {
    rangeStart = mondayOfIsoWeek(week);
    rangeEnd = addDaysStr(rangeStart, 6);
  } else {
    rangeStart = `${month}-01`;
    rangeEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  }

  const settings = await getSettings();

  const shiftOverrides = await prisma.shiftOverride.findMany({
    where: {
      date: {
        gte: new Date(`${rangeStart}T00:00:00.000Z`),
        lte: new Date(`${rangeEnd}T00:00:00.000Z`),
      },
    },
    orderBy: { date: "asc" },
  });
  const shiftOverrideInputs = shiftOverrides.map((o) => ({
    date: o.date.toISOString().slice(0, 10),
    shiftStartTime: o.shiftStartTime,
    shiftEndTime: o.shiftEndTime,
  }));

  const rangeLabel = range === "day" ? "Today" : range === "week" ? "Week" : "Month";
  const periodPhrase = range === "day" ? "today" : range === "week" ? "this week" : "this month";

  // "Today" is a dashboard across everyone; Week/Month drill into one employee's history.
  let todayRows: TodayRow[] = [];
  const punchesByDay = new Map<string, PunchRow[]>();
  let statusByDay = new Map<string, string>();
  let days: ReturnType<typeof computeDailyResults> = [];
  let periodTotals = { regular: 0, overtime: 0 };
  const selectedEmployee = employees.find((e) => e.id === employeeId);

  if (range === "day") {
    const employeeIds = employees.map((e) => e.id);
    const [allPunches, allDayStatuses] = employeeIds.length
      ? await Promise.all([
          prisma.punch.findMany({
            where: {
              employeeId: { in: employeeIds },
              voided: false,
              timestamp: {
                gte: fromZonedTime(`${refDate}T00:00:00`, TIMEZONE),
                lt: fromZonedTime(`${nextDay(refDate)}T00:00:00`, TIMEZONE),
              },
            },
            orderBy: { timestamp: "asc" },
          }),
          prisma.dayStatus.findMany({
            where: {
              employeeId: { in: employeeIds },
              date: new Date(`${refDate}T00:00:00.000Z`),
            },
          }),
        ])
      : [[], []];

    const punchesByEmployee = new Map<string, PunchRow[]>();
    for (const p of allPunches) {
      if (!punchesByEmployee.has(p.employeeId)) punchesByEmployee.set(p.employeeId, []);
      punchesByEmployee.get(p.employeeId)!.push(p);
    }
    const statusByEmployee = new Map(allDayStatuses.map((d) => [d.employeeId, d.status]));
    const isToday = refDate === todayManila();

    todayRows = employees.map((emp) => {
      const empPunches = punchesByEmployee.get(emp.id) ?? [];
      const dayStatus = statusByEmployee.get(emp.id) ?? "NORMAL";
      const [computed] = computeDailyResults(
        empPunches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
        dayStatus === "NORMAL" ? [] : [{ date: refDate, status: dayStatus as "PAID_LEAVE" | "UNPAID_ABSENCE" }],
        settings,
        refDate,
        refDate,
        shiftOverrideInputs
      );
      const lastPunchType = empPunches.length > 0 ? empPunches[empPunches.length - 1].type : null;
      return {
        employee: emp,
        punches: empPunches,
        dayStatus,
        timeline: computeDayTimeline(empPunches),
        timedIn: empPunches.some((p) => p.type === "IN"),
        isLate: computed.isLate,
        isUndertime: computed.isUndertime,
        returnedLateFromBreak: computed.returnedLateFromBreak,
        presence: isToday ? derivePresenceStatus(lastPunchType) : undefined,
      };
    });
  } else if (employeeId) {
    const [punches, dayStatuses] = await Promise.all([
      prisma.punch.findMany({
        where: {
          employeeId,
          voided: false,
          timestamp: {
            gte: fromZonedTime(`${rangeStart}T00:00:00`, TIMEZONE),
            lt: fromZonedTime(`${nextDay(rangeEnd)}T00:00:00`, TIMEZONE),
          },
        },
        orderBy: { timestamp: "asc" },
      }),
      prisma.dayStatus.findMany({
        where: {
          employeeId,
          date: {
            gte: new Date(`${rangeStart}T00:00:00.000Z`),
            lte: new Date(`${rangeEnd}T00:00:00.000Z`),
          },
        },
      }),
    ]);

    for (const p of punches) {
      const key = localDateKey(p.timestamp);
      if (!punchesByDay.has(key)) punchesByDay.set(key, []);
      punchesByDay.get(key)!.push(p);
    }
    statusByDay = new Map(dayStatuses.map((d) => [d.date.toISOString().slice(0, 10), d.status]));

    days = computeDailyResults(
      punches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
      dayStatuses.map((d) => ({ date: d.date.toISOString().slice(0, 10), status: d.status })),
      settings,
      rangeStart,
      rangeEnd,
      shiftOverrideInputs
    );

    periodTotals = days.reduce(
      (sum, d) => ({
        regular: sum.regular + d.regularMinutes,
        overtime: sum.overtime + d.overtimeMinutes,
      }),
      { regular: 0, overtime: 0 }
    );
  }

  return (
    <div>
      <AutoRefresh />
      <ClosePanesOnOutsideClick />
      <PageHeader
        title="Attendance"
        description="Today's status at a glance, or drill into a week or month for one employee."
        actions={
          <form method="get" className="flex items-center gap-2">
            {range !== "day" && (
              <EmployeeSelect
                employees={employees.map((e) => ({ id: e.id, name: e.name }))}
                defaultValue={employeeId}
              />
            )}
            <select
              name="range"
              defaultValue={range}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm bg-white"
            >
              <option value="day">Today</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
            {range === "month" ? (
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm"
              />
            ) : range === "week" ? (
              <input
                type="week"
                name="week"
                defaultValue={week}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm"
              />
            ) : (
              <input
                type="date"
                name="date"
                defaultValue={refDate}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm"
              />
            )}
            <Button size="sm">Go</Button>
          </form>
        }
      />

      <ShiftOverridesPanel overrides={shiftOverrides} periodPhrase={periodPhrase} />

      {employees.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No active employees.</p>
      ) : range === "day" ? (
        <TodayDashboard rows={todayRows} refDate={refDate} />
      ) : !employeeId ? (
        <p className="text-slate-400 text-center py-12">
          Select an employee above to view their attendance for {periodPhrase}.
        </p>
      ) : (
        <Card padded>
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-bold text-slate-900">{selectedEmployee?.name}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
              {rangeLabel} total: {(periodTotals.regular / 60).toFixed(2)}h regular
              {periodTotals.overtime > 0 && ` + ${(periodTotals.overtime / 60).toFixed(2)}h OT`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium text-right">Time In</th>
                  <th className="px-2 py-2 font-medium text-right">Start Break</th>
                  <th className="px-2 py-2 font-medium text-right">End Break</th>
                  <th className="px-2 py-2 font-medium text-right">Time Out</th>
                  <th className="px-2 py-2 font-medium text-right">Regular</th>
                  <th className="px-2 py-2 font-medium text-right">OT</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const dayPunches = punchesByDay.get(d.date) ?? [];
                  const timeline = computeDayTimeline(dayPunches);
                  const dayStatus = statusByDay.get(d.date) ?? "NORMAL";
                  // Paid Leave / Unpaid Absence pay is fixed regardless of punches,
                  // so showing the raw times next to that status reads as a
                  // contradiction. The punches themselves are untouched and still
                  // reachable via Manage -- just not surfaced as if they counted.
                  const showTimes = dayStatus === "NORMAL";
                  return (
                    <tr key={d.date} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2 whitespace-nowrap text-slate-800">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-9 shrink-0 py-0.5 rounded text-xs font-medium text-center ${dayAbbrev(d.date).className}`}
                          >
                            {dayAbbrev(d.date).label}
                          </span>
                          {d.date}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? timeline.timeIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? timeline.breakIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-2 py-2 text-right whitespace-nowrap ${d.returnedLateFromBreak ? "text-amber-600 font-medium" : "text-slate-700"}`}>
                        {showTimes ? timeline.breakOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? timeline.timeOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {(d.regularMinutes / 60).toFixed(2)}h
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {(d.overtimeMinutes / 60).toFixed(2)}h
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {d.dayStatus === "PAID_LEAVE" && <Badge status="paidLeave" />}
                          {d.dayStatus === "UNPAID_ABSENCE" && <Badge status="unpaidAbsence">Absent</Badge>}
                          {d.isLate && <Badge status="late" />}
                          {d.isUndertime && <Badge status="undertime" />}
                          {d.returnedLateFromBreak && <Badge status="lateFromBreak" />}
                        </div>
                      </td>
                      <td className="px-2 py-2 relative">
                        <ManageDayForm
                          employeeId={employeeId}
                          date={d.date}
                          dayStatus={dayStatus}
                          punches={dayPunches}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TodayDashboard({ rows, refDate }: { rows: TodayRow[]; refDate: string }) {
  return (
    <Card padded>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium text-right">Time In</th>
              <th className="px-2 py-2 font-medium text-right">Start Break</th>
              <th className="px-2 py-2 font-medium text-right">End Break</th>
              <th className="px-2 py-2 font-medium text-right">Time Out</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { employee, punches, dayStatus, timeline, timedIn, isLate, isUndertime, returnedLateFromBreak, presence } = row;
              const showTimes = dayStatus === "NORMAL";
              return (
                <tr key={employee.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <Avatar
                        name={employee.name}
                        photoUrl={employee.photoPath ? `/api/kiosk/employee-photo/${employee.photoPath}` : null}
                        size="sm"
                        ringColor="white"
                        presence={presence}
                      />
                      <span className="text-base font-bold text-slate-900">{employee.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                    {showTimes ? timeline.timeIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                    {showTimes ? timeline.breakIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`px-2 py-2 text-right whitespace-nowrap ${returnedLateFromBreak ? "text-amber-600 font-medium" : "text-slate-700"}`}>
                    {showTimes ? timeline.breakOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                    {showTimes ? timeline.timeOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {dayStatus === "PAID_LEAVE" && <Badge status="paidLeave" />}
                      {dayStatus === "UNPAID_ABSENCE" && <Badge status="unpaidAbsence">Absent</Badge>}
                      {dayStatus === "NORMAL" && !timedIn && <Badge status="notYetTimedIn" />}
                      {dayStatus === "NORMAL" && timedIn && isLate && <Badge status="late" />}
                      {dayStatus === "NORMAL" && timedIn && isUndertime && <Badge status="undertime" />}
                      {dayStatus === "NORMAL" && timedIn && !isLate && !isUndertime && <Badge status="onTime" />}
                      {dayStatus === "NORMAL" && returnedLateFromBreak && <Badge status="lateFromBreak" />}
                    </div>
                  </td>
                  <td className="px-2 py-2 relative">
                    <ManageDayForm
                      employeeId={employee.id}
                      date={refDate}
                      dayStatus={dayStatus}
                      punches={punches}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ShiftOverridesPanel({
  overrides,
  periodPhrase,
}: {
  overrides: { id: string; date: Date; shiftStartTime: string; shiftEndTime: string }[];
  periodPhrase: string;
}) {
  return (
    <details className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
      <summary className="text-sm font-medium text-slate-700 cursor-pointer">
        Shift start/end adjustment for {periodPhrase}
        {overrides.length > 0 && ` (${overrides.length})`}
      </summary>
      <p className="text-xs text-slate-500 mt-2 mb-3">
        Use this when work starts later than usual for everyone that day (e.g. ingredients
        arrived late). It only affects that date&apos;s Late/Undertime flags -- pay is always
        based on actual hours worked.
      </p>

      {overrides.length > 0 && (
        <table className="w-full text-xs mb-3">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-1 pr-2 font-normal">Date</th>
              <th className="py-1 pr-2 font-normal">Shift start</th>
              <th className="py-1 pr-2 font-normal">Shift end</th>
              <th className="py-1 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-2">{o.date.toISOString().slice(0, 10)}</td>
                <td className="py-1.5 pr-2">{o.shiftStartTime}</td>
                <td className="py-1.5 pr-2">{o.shiftEndTime}</td>
                <td className="py-1.5 text-right">
                  <form action={removeShiftOverride}>
                    <input type="hidden" name="overrideId" value={o.id} />
                    <button className="text-red-600 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form action={setShiftOverride} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500">Date</label>
          <input
            type="date"
            name="date"
            required
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Shift start</label>
          <input
            type="time"
            name="shiftStartTime"
            required
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Shift end</label>
          <input
            type="time"
            name="shiftEndTime"
            required
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <Button size="sm">Set</Button>
      </form>
    </details>
  );
}

function ManageDayForm({
  employeeId,
  date,
  dayStatus,
  punches,
}: {
  employeeId: string;
  date: string;
  dayStatus: string;
  punches: { id: string; type: "IN" | "OUT" | "BREAK_START" | "BREAK_END"; timestamp: Date; photoPath: string | null }[];
}) {
  const slots = pickDaySlots(punches);
  const fields = [
    { name: "timeIn", label: "Time In", punch: slots.timeIn },
    { name: "breakStart", label: "Start Break", punch: slots.breakStart },
    { name: "breakEnd", label: "End Break", punch: slots.breakEnd },
    { name: "timeOut", label: "Time Out", punch: slots.timeOut },
  ] as const;

  return (
    <details data-manage-pane className="text-left">
      <summary className="text-xs text-slate-500 cursor-pointer hover:underline whitespace-nowrap">
        Manage
      </summary>
      <div className="absolute z-10 right-0 mt-1 bg-white shadow-lg rounded-md border border-slate-200 p-3 w-72 max-w-[90vw] text-left">
        <form action={saveDayPunches}>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="date" value={date} />
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.name} className="flex items-center gap-3">
                <label htmlFor={`${f.name}-${employeeId}-${date}`} className="w-24 shrink-0 text-xs font-medium text-slate-600">
                  {f.label}
                </label>
                <input
                  id={`${f.name}-${employeeId}-${date}`}
                  type="time"
                  name={f.name}
                  defaultValue={f.punch ? formatInTimeZone(f.punch.timestamp, TIMEZONE, "HH:mm") : ""}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
                />
                {f.punch?.photoPath && (
                  <a
                    href={`/api/admin/punch-photo/${f.punch.photoPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/punch-photo/${f.punch.photoPath}`}
                      alt={`${f.label} photo`}
                      className="w-8 h-8 rounded object-cover border border-slate-200 hover:opacity-80"
                    />
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3">
            <label className="block text-xs text-slate-500 mb-1">Reason for the change (optional)</label>
            <input
              type="text"
              name="reason"
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400">Clear a time to remove that punch.</p>
            <Button size="sm">Save</Button>
          </div>
        </form>

        <form action={setDayStatus} className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="date" value={date} />
          <select
            name="status"
            defaultValue={dayStatus}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs flex-1"
          >
            <option value="NORMAL">Normal</option>
            <option value="PAID_LEAVE">Paid Leave</option>
            <option value="UNPAID_ABSENCE">Unpaid Absence</option>
          </select>
          <Button variant="secondary" size="sm">Set</Button>
        </form>
      </div>
    </details>
  );
}
