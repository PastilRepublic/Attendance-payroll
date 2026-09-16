import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, localDateKey } from "@/lib/payroll";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import { addPunch, editPunch, voidPunch, setDayStatus } from "./actions";
import AutoRefresh from "./AutoRefresh";

function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? todayManila();

  const [employees, settings] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);

  const employeeIds = employees.map((e) => e.id);

  const [punches, dayStatuses] = await Promise.all([
    prisma.punch.findMany({
      where: {
        employeeId: { in: employeeIds },
        voided: false,
      },
      orderBy: { timestamp: "asc" },
    }),
    prisma.dayStatus.findMany({
      where: { employeeId: { in: employeeIds }, date: new Date(`${date}T00:00:00.000Z`) },
    }),
  ]);

  const punchesByEmployee = new Map<string, typeof punches>();
  for (const p of punches) {
    if (localDateKey(p.timestamp) !== date) continue;
    if (!punchesByEmployee.has(p.employeeId)) punchesByEmployee.set(p.employeeId, []);
    punchesByEmployee.get(p.employeeId)!.push(p);
  }

  const statusByEmployee = new Map(dayStatuses.map((d) => [d.employeeId, d.status]));

  return (
    <div>
      <AutoRefresh />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Attendance</h1>
        <form method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-md bg-slate-900 text-white text-sm px-3 py-1.5 hover:bg-slate-800">
            Go
          </button>
        </form>
      </div>

      <div className="space-y-4" data-attendance-refresh>
        {employees.map((emp) => {
          const empPunches = punchesByEmployee.get(emp.id) ?? [];
          const dayStatus = statusByEmployee.get(emp.id) ?? "NORMAL";

          const [computed] = computeDailyResults(
            empPunches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
            dayStatus === "NORMAL" ? [] : [{ date, status: dayStatus }],
            settings,
            date,
            date
          );

          return (
            <div key={emp.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-medium text-slate-900">{emp.name}</span>
                  <div className="flex gap-1.5 mt-1">
                    {computed.isLate && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                        Late
                      </span>
                    )}
                    {computed.isUndertime && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                        Undertime
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                      {(computed.regularMinutes / 60).toFixed(2)}h regular
                      {computed.overtimeMinutes > 0 &&
                        ` + ${(computed.overtimeMinutes / 60).toFixed(2)}h OT`}
                    </span>
                  </div>
                </div>

                <form action={setDayStatus} className="flex items-center gap-2">
                  <input type="hidden" name="employeeId" value={emp.id} />
                  <input type="hidden" name="date" value={date} />
                  <select
                    name="status"
                    defaultValue={dayStatus}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
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

              <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
                  {empPunches.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2">{p.type}</td>
                      <td className="py-1.5 pr-2">
                        {formatInTimeZone(p.timestamp, TIMEZONE, "h:mm a")}
                      </td>
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
                              className="w-10 h-10 rounded object-cover border border-slate-200 hover:opacity-80"
                            />
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right space-x-3 relative">
                        <EditPunchForm punch={p} date={date} />
                        <VoidPunchForm punchId={p.id} />
                      </td>
                    </tr>
                  ))}
                  {empPunches.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-2 text-slate-400">
                        No punches
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>

              <AddPunchForm employeeId={emp.id} date={date} />
            </div>
          );
        })}
        {employees.length === 0 && (
          <p className="text-slate-400 text-center py-12">No active employees.</p>
        )}
      </div>
    </div>
  );
}

function AddPunchForm({ employeeId, date }: { employeeId: string; date: string }) {
  return (
    <details className="mt-3">
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
        <div className="flex-1 min-w-[160px]">
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
        className="absolute z-10 mt-1 bg-white shadow-lg rounded-md border border-slate-200 p-3 flex flex-col gap-2 w-64"
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
        className="absolute z-10 mt-1 bg-white shadow-lg rounded-md border border-slate-200 p-3 flex flex-col gap-2 w-64"
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
