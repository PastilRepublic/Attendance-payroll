import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/payroll";
import { createTemplate, assignTask, deleteAssignment } from "./actions";

function todayManila(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? todayManila();

  const [templates, employees, assignments] = await Promise.all([
    prisma.taskTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.taskAssignment.findMany({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      include: { template: true, employee: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Tasks</h1>

      <details className="mb-6 bg-white rounded-lg shadow">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
          Task Templates ({templates.length})
        </summary>
        <div className="p-4 pt-0">
          <ul className="text-sm text-slate-700 mb-3 space-y-1">
            {templates.map((t) => (
              <li key={t.id} className="flex items-baseline gap-2">
                <span className="font-medium">{t.name}</span>
                {t.description && <span className="text-slate-400 text-xs">{t.description}</span>}
              </li>
            ))}
            {templates.length === 0 && (
              <li className="text-slate-400">No templates yet — add one below.</li>
            )}
          </ul>
          <form action={createTemplate} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input
                name="name"
                required
                placeholder="Wash Equipment"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-slate-500 mb-1">Description (optional)</label>
              <input
                name="description"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
              + Add Template
            </button>
          </form>
        </div>
      </details>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Assignments</h2>
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

      <div className="bg-white rounded-lg shadow p-4">
        <table className="w-full text-sm mb-4">
          <thead className="text-slate-500 text-left">
            <tr>
              <th className="py-1 pr-2 font-normal">Employee</th>
              <th className="py-1 pr-2 font-normal">Task</th>
              <th className="py-1 pr-2 font-normal">Bonus</th>
              <th className="py-1 pr-2 font-normal">Status</th>
              <th className="py-1 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-2">{a.employee.name}</td>
                <td className="py-1.5 pr-2">{a.template.name}</td>
                <td className="py-1.5 pr-2">
                  {a.bonusAmount ? `₱${Number(a.bonusAmount).toFixed(2)}` : <span className="text-slate-300">—</span>}
                </td>
                <td className="py-1.5 pr-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      a.status === "DONE"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {a.status === "DONE" ? "Done" : "Pending"}
                  </span>
                  {a.payslipAdjustmentId && (
                    <span className="ml-1 text-xs text-slate-400">(in payslip)</span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  {a.status === "PENDING" && !a.payslipAdjustmentId && (
                    <form action={deleteAssignment}>
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <button className="text-red-600 hover:underline text-xs">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No assignments for this date.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form action={assignTask} className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <input type="hidden" name="date" value={date} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Employee</label>
            <select
              name="employeeId"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Task</label>
            <select
              name="templateId"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Bonus (₱, optional)</label>
            <input
              name="bonusAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800">
            Assign
          </button>
        </form>
      </div>
    </div>
  );
}
