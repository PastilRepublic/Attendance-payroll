import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrRefreshDraftPayslip, adjustmentsTotal } from "@/lib/payrollService";
import {
  addAdjustment,
  removeAdjustment,
  finalizePeriod,
  unlockPayslip,
  addTaskBonusToPayslip,
  addSanitationBonusToPayslip,
  dismissBonusSuggestion,
} from "../actions";

export default async function PayPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const period = await prisma.payPeriod.findUnique({ where: { id } });
  if (!period) notFound();

  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const payslips = await Promise.all(
    employees.map(async (emp) => {
      const payslip = await getOrRefreshDraftPayslip(emp.id, id);
      const suggestedBonuses = await prisma.taskAssignment.findMany({
        where: {
          employeeId: emp.id,
          status: "DONE",
          bonusAmount: { not: null },
          bonusDismissed: false,
          payslipAdjustmentId: null,
          date: { gte: period.startDate, lte: period.endDate },
        },
        include: { template: true },
        orderBy: { date: "asc" },
      });
      const suggestedCleaningBonuses = await prisma.sanitationAssignment.findMany({
        where: {
          employeeId: emp.id,
          status: "DONE",
          inspectionResult: "PASS",
          payslipAdjustmentId: null,
          bonusDismissed: false,
          procedure: { bonusAmount: { not: null } },
          date: { gte: period.startDate, lte: period.endDate },
        },
        include: { procedure: true },
        orderBy: { date: "asc" },
      });
      return { employee: emp, payslip, suggestedBonuses, suggestedCleaningBonuses };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/payroll" className="text-sm text-slate-500 hover:underline">
            ← Pay Periods
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">
            {period.startDate.toISOString().slice(0, 10)} — {period.endDate.toISOString().slice(0, 10)}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${
              period.status === "FINALIZED"
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {period.status}
          </span>
          {period.status === "OPEN" && (
            <form action={finalizePeriod}>
              <input type="hidden" name="payPeriodId" value={period.id} />
              <button className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800">
                Finalize Period
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {payslips.map(({ employee, payslip, suggestedBonuses, suggestedCleaningBonuses }) => {
          const adjTotal = adjustmentsTotal(payslip.adjustments);
          const total = Number(payslip.grossPay) + adjTotal;

          return (
            <div key={employee.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-lg font-bold text-slate-900">{employee.name}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {Number(payslip.regularHours).toFixed(2)}h regular
                    {Number(payslip.overtimeHours) > 0 &&
                      ` + ${Number(payslip.overtimeHours).toFixed(2)}h OT`}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">₱{total.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">
                    base ₱{Number(payslip.grossPay).toFixed(2)}
                    {adjTotal !== 0 && ` ${adjTotal > 0 ? "+" : ""}${adjTotal.toFixed(2)} adj.`}
                  </div>
                </div>
              </div>

              {payslip.adjustments.length > 0 && (() => {
                const sorted = [...payslip.adjustments].sort(
                  (a, b) => Number(b.amount) - Number(a.amount)
                );
                const netTotal = sorted.reduce((s, a) => s + Number(a.amount), 0);

                return (
                  <div className="mb-2 border border-slate-200 rounded-md overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">Type</th>
                          <th className="text-left px-2 py-1.5 font-medium">Label</th>
                          <th className="text-left px-2 py-1.5 font-medium">Note</th>
                          <th className="text-right px-2 py-1.5 font-medium">Amount</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((adj) => {
                          const amount = Number(adj.amount);
                          const isBonus = amount > 0;
                          return (
                            <tr key={adj.id} className="border-t border-slate-100">
                              <td className="px-2 py-1.5">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    isBonus
                                      ? "bg-green-100 text-green-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {isBonus ? "Bonus" : "Deduction"}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-slate-700">{adj.label}</td>
                              <td className="px-2 py-1.5 text-slate-500">{adj.note}</td>
                              <td
                                className={`px-2 py-1.5 text-right font-medium ${
                                  isBonus ? "text-green-700" : "text-red-700"
                                }`}
                              >
                                {isBonus ? "+" : "-"}
                                {Math.abs(amount).toFixed(2)}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {payslip.status !== "FINALIZED" && (
                                  <form action={removeAdjustment}>
                                    <input type="hidden" name="adjustmentId" value={adj.id} />
                                    <button className="text-red-600 hover:underline">
                                      Remove
                                    </button>
                                  </form>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                          <td colSpan={3} className="px-2 py-1.5 text-right text-slate-600">
                            Net adjustments
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right ${
                              netTotal >= 0 ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {netTotal >= 0 ? "+" : "-"}
                            {Math.abs(netTotal).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}

              {payslip.status !== "FINALIZED" && suggestedBonuses.length > 0 && (
                <div className="mb-2 rounded-md bg-amber-50 border border-amber-200 p-2">
                  <p className="text-xs font-medium text-amber-800 mb-1">
                    Suggested bonuses from completed tasks
                  </p>
                  {suggestedBonuses.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="text-slate-700">
                        {a.template.name} — {a.date.toISOString().slice(0, 10)} — ₱
                        {Number(a.bonusAmount).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-2">
                        <form action={addTaskBonusToPayslip}>
                          <input type="hidden" name="payslipId" value={payslip.id} />
                          <input type="hidden" name="taskAssignmentId" value={a.id} />
                          <button className="rounded-md bg-amber-600 text-white px-2 py-1 hover:bg-amber-500">
                            Add to payslip
                          </button>
                        </form>
                        <form action={dismissBonusSuggestion}>
                          <input type="hidden" name="kind" value="TASK" />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input type="hidden" name="payPeriodId" value={period.id} />
                          <button className="rounded-md border border-slate-300 bg-white text-slate-600 px-2 py-1 hover:bg-slate-50">
                            Skip
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payslip.status !== "FINALIZED" && suggestedCleaningBonuses.length > 0 && (
                <div className="mb-2 rounded-md bg-amber-50 border border-amber-200 p-2">
                  <p className="text-xs font-medium text-amber-800 mb-1">
                    Suggested bonuses from passed cleaning duties
                  </p>
                  {suggestedCleaningBonuses.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="text-slate-700">
                        {a.procedure.name} — {a.date.toISOString().slice(0, 10)}
                      </span>
                      <div className="flex items-center gap-2">
                      <form action={addSanitationBonusToPayslip} className="flex items-center gap-2">
                        <input type="hidden" name="payslipId" value={payslip.id} />
                        <input type="hidden" name="sanitationAssignmentId" value={a.id} />
                        <span className="text-slate-500">₱</span>
                        <input
                          name="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          defaultValue={Number(a.procedure.bonusAmount).toFixed(2)}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button className="rounded-md bg-amber-600 text-white px-2 py-1 hover:bg-amber-500">
                          Add to payslip
                        </button>
                      </form>
                      <form action={dismissBonusSuggestion}>
                        <input type="hidden" name="kind" value="SANITATION" />
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <input type="hidden" name="payPeriodId" value={period.id} />
                        <button className="rounded-md border border-slate-300 bg-white text-slate-600 px-2 py-1 hover:bg-slate-50">
                          Skip
                        </button>
                      </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payslip.status !== "FINALIZED" ? (
                <details className="mt-1">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:underline">
                    + Add adjustment
                  </summary>
                  <form action={addAdjustment} className="flex flex-wrap items-end gap-2 mt-2">
                    <input type="hidden" name="payslipId" value={payslip.id} />
                    <div>
                      <label className="block text-xs text-slate-500">Label</label>
                      <select
                        name="label"
                        required
                        defaultValue=""
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="" disabled>
                          Select...
                        </option>
                        <option value="Cash Advance">Cash Advance</option>
                        <option value="Negligence">Negligence</option>
                        <option value="Late">Late</option>
                        <option value="Bonus">Bonus</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">Amount</label>
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="500"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs w-28"
                      />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-slate-500">Note</label>
                      <input
                        name="note"
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <button className="rounded-md bg-slate-900 text-white text-xs px-3 py-1.5 hover:bg-slate-800">
                      Add
                    </button>
                  </form>
                </details>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <Link
                    href={`/admin/payslip/${payslip.id}/print`}
                    target="_blank"
                    className="text-xs text-slate-600 hover:underline"
                  >
                    Print / Export
                  </Link>
                  <details className="text-right">
                    <summary className="text-xs text-red-600 cursor-pointer hover:underline inline">
                      Unlock
                    </summary>
                    <form
                      action={unlockPayslip}
                      className="absolute z-10 mt-1 right-4 bg-white shadow-lg rounded-md border border-slate-200 p-3 flex flex-col gap-2 w-64"
                    >
                      <input type="hidden" name="payslipId" value={payslip.id} />
                      <label className="block text-xs text-slate-500">Reason (required)</label>
                      <input
                        name="reason"
                        required
                        minLength={3}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button className="rounded-md bg-red-600 text-white text-xs px-3 py-1.5 hover:bg-red-500">
                        Confirm Unlock
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
