import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, localDateKey } from "@/lib/payroll";
import { computeDaySlots } from "@/lib/attendanceSlots";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import { addPunch, editPunch, voidPunch, setDayStatus } from "./actions";
import AutoRefresh from "./AutoRefresh";

function currentMonthManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM");
}

/** Last day (1-31) of a YYYY-MM month string, via plain calendar math (no timezone involved). */
function daysInMonth(month: string): number {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
}

function nextMonthFirstDay(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return monthNum === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; month?: string }>;
}) {
  const params = await searchParams;

  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const employeeId = params.employeeId ?? employees[0]?.id ?? "";
  const month = params.month ?? currentMonthManila();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

  const settings = await getSettings();

  const [punches, dayStatuses] = employeeId
    ? await Promise.all([
        prisma.punch.findMany({
          where: {
            employeeId,
            voided: false,
            timestamp: {
              gte: fromZonedTime(`${monthStart}T00:00:00`, TIMEZONE),
              lt: fromZonedTime(`${nextMonthFirstDay(month)}T00:00:00`, TIMEZONE),
            },
          },
          orderBy: { timestamp: "asc" },
        }),
        prisma.dayStatus.findMany({
          where: {
            employeeId,
            date: {
              gte: new Date(`${monthStart}T00:00:00.000Z`),
              lte: new Date(`${monthEnd}T00:00:00.000Z`),
            },
          },
        }),
      ])
    : [[], []];

  const punchesByDay = new Map<string, typeof punches>();
  for (const p of punches) {
    const key = localDateKey(p.timestamp);
    if (!punchesByDay.has(key)) punchesByDay.set(key, []);
    punchesByDay.get(key)!.push(p);
  }
  const statusByDay = new Map(
    dayStatuses.map((d) => [d.date.toISOString().slice(0, 10), d.status])
  );

  const days = employeeId
    ? computeDailyResults(
        punches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
        dayStatuses.map((d) => ({ date: d.date.toISOString().slice(0, 10), status: d.status })),
        settings,
        monthStart,
        monthEnd
      )
    : [];

  const monthTotals = days.reduce(
    (sum, d) => ({
      regular: sum.regular + d.regularMinutes,
      overtime: sum.overtime + d.overtimeMinutes,
    }),
    { regular: 0, overtime: 0 }
  );

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  return (
    <div>
      <AutoRefresh />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Attendance</h1>
        <form method="get" className="flex items-center gap-2">
          <select
            name="employeeId"
            defaultValue={employeeId}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-md bg-slate-900 text-white text-sm px-3 py-1.5 hover:bg-slate-800">
            Go
          </button>
        </form>
      </div>

      {employees.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No active employees.</p>
      ) : (
        <div className="bg-white rounded-lg shadow p-4" data-attendance-refresh>
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-slate-900">{selectedEmployee?.name}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
              Month total: {(monthTotals.regular / 60).toFixed(2)}h regular
              {monthTotals.overtime > 0 && ` + ${(monthTotals.overtime / 60).toFixed(2)}h OT`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium text-right">Morning In</th>
                  <th className="px-2 py-2 font-medium text-right">Morning Out</th>
                  <th className="px-2 py-2 font-medium text-right">Afternoon In</th>
                  <th className="px-2 py-2 font-medium text-right">Afternoon Out</th>
                  <th className="px-2 py-2 font-medium text-right">Regular</th>
                  <th className="px-2 py-2 font-medium text-right">OT</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                  <th className="px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const slots = computeDaySlots(punchesByDay.get(d.date) ?? []);
                  const dayStatus = statusByDay.get(d.date) ?? "NORMAL";
                  // Paid Leave / Unpaid Absence pay is fixed regardless of punches,
                  // so showing the raw times next to that status reads as a
                  // contradiction. The punches themselves are untouched and still
                  // reachable via Manage -- just not surfaced as if they counted.
                  const showTimes = dayStatus === "NORMAL";
                  return (
                    <tr key={d.date} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2 whitespace-nowrap text-slate-800">{d.date}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? slots.morningIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? slots.morningOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? slots.afternoonIn ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {showTimes ? slots.afternoonOut ?? <span className="text-slate-300">—</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {(d.regularMinutes / 60).toFixed(2)}h
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700">
                        {(d.overtimeMinutes / 60).toFixed(2)}h
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {d.dayStatus === "PAID_LEAVE" && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                              Paid leave
                            </span>
                          )}
                          {d.dayStatus === "UNPAID_ABSENCE" && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                              Absent
                            </span>
                          )}
                          {d.isLate && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                              Late
                            </span>
                          )}
                          {d.isUndertime && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                              Undertime
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 relative">
                        <ManageDayForm
                          employeeId={employeeId}
                          date={d.date}
                          dayStatus={dayStatus}
                          punches={punchesByDay.get(d.date) ?? []}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
  punches: { id: string; type: string; timestamp: Date; isCorrection: boolean; photoPath: string | null }[];
}) {
  return (
    <details className="text-left">
      <summary className="text-xs text-slate-500 cursor-pointer hover:underline whitespace-nowrap">
        Manage
      </summary>
      <div className="absolute z-10 right-0 mt-1 bg-white shadow-lg rounded-md border border-slate-200 p-3 w-80 text-left">
        <table className="w-full text-xs mb-2">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-1 pr-2 font-normal">Type</th>
              <th className="py-1 pr-2 font-normal">Time</th>
              <th className="py-1 pr-2 font-normal">Source</th>
              <th className="py-1 pr-2 font-normal">Photo</th>
              <th className="py-1 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {punches.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-2">{p.type}</td>
                <td className="py-1.5 pr-2">{formatInTimeZone(p.timestamp, TIMEZONE, "h:mm a")}</td>
                <td className="py-1.5 pr-2 text-slate-500">
                  {p.isCorrection ? "Correction" : "Kiosk"}
                </td>
                <td className="py-1.5 pr-2">
                  {p.photoPath ? (
                    <a
                      href={`/api/admin/punch-photo/${p.photoPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/punch-photo/${p.photoPath}`}
                        alt="Punch photo"
                        className="w-8 h-8 rounded object-cover border border-slate-200 hover:opacity-80"
                      />
                    </a>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-1.5 text-right space-x-2 relative">
                  <EditPunchForm punch={p} date={date} />
                  <VoidPunchForm punchId={p.id} />
                </td>
              </tr>
            ))}
            {punches.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-slate-400">
                  No punches
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <AddPunchForm employeeId={employeeId} date={date} />

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
          <button className="rounded-md bg-slate-100 text-slate-700 text-xs px-2 py-1 hover:bg-slate-200">
            Set
          </button>
        </form>
      </div>
    </details>
  );
}

function AddPunchForm({ employeeId, date }: { employeeId: string; date: string }) {
  return (
    <details>
      <summary className="text-xs text-slate-500 cursor-pointer hover:underline">
        + Add punch
      </summary>
      <form action={addPunch} className="flex flex-wrap items-end gap-2 mt-2">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="date" value={date} />
        <div>
          <label className="block text-xs text-slate-500">Type</label>
          <select name="type" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Time</label>
          <input
            type="time"
            name="time"
            required
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs text-slate-500">Reason (required)</label>
          <input
            type="text"
            name="reason"
            required
            minLength={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <button className="rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 hover:bg-slate-800">
          Add
        </button>
      </form>
    </details>
  );
}

function EditPunchForm({
  punch,
  date,
}: {
  punch: { id: string; type: string; timestamp: Date };
  date: string;
}) {
  const localTime = formatInTimeZone(punch.timestamp, TIMEZONE, "HH:mm");
  return (
    <details className="inline-block text-left">
      <summary className="text-xs text-slate-600 hover:underline cursor-pointer inline">
        Edit
      </summary>
      <form
        action={editPunch}
        className="absolute z-20 mt-1 right-0 bg-white shadow-lg rounded-md border border-slate-200 p-3 flex flex-col gap-2 w-56"
      >
        <input type="hidden" name="punchId" value={punch.id} />
        <input type="hidden" name="date" value={date} />
        <div>
          <label className="block text-xs text-slate-500">Type</label>
          <select
            name="type"
            defaultValue={punch.type}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Time</label>
          <input
            type="time"
            name="time"
            defaultValue={localTime}
            required
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Reason (required)</label>
          <input
            type="text"
            name="reason"
            required
            minLength={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <button className="rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 hover:bg-slate-800">
          Save Correction
        </button>
      </form>
    </details>
  );
}

function VoidPunchForm({ punchId }: { punchId: string }) {
  return (
    <details className="inline-block text-left">
      <summary className="text-xs text-red-600 hover:underline cursor-pointer inline">
        Delete
      </summary>
      <form
        action={voidPunch}
        className="absolute z-20 mt-1 right-0 bg-white shadow-lg rounded-md border border-slate-200 p-3 flex flex-col gap-2 w-56"
      >
        <input type="hidden" name="punchId" value={punchId} />
        <div>
          <label className="block text-xs text-slate-500">Reason (required)</label>
          <input
            type="text"
            name="reason"
            required
            minLength={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <button className="rounded-md bg-red-600 text-white text-xs px-3 py-1.5 hover:bg-red-500">
          Confirm Delete
        </button>
      </form>
    </details>
  );
}
