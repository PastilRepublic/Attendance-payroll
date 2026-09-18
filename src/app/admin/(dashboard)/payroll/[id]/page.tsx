import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getOrRefreshDraftPayslip,
  adjustmentsTotal,
  getPeriodDailyResults,
} from "@/lib/payrollService";
import { suggestedLateDeduction, type PayBreakdownLine } from "@/lib/payroll";
import { getSettings, getOperationDayOverrides } from "@/lib/settings";
import { rotationDayForDate, resolveOperationDayForDate } from "@/lib/operationDay";
import {
  setPeriodDayType,
  addAdjustment,
  removeAdjustment,
  finalizePeriod,
  unlockPayslip,
  addSanitationBonusToPayslip,
  dismissBonusSuggestion,
  addLateDeductionToPayslip,
  dismissLateSuggestion,
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

  const settings = await getSettings();

  // Production (OPERATION_DAY) pay depends on each date's operation day, so
  // show the days in this period and let an owner correct one that was wrong.
  const hasProductionStaff = employees.some((e) => e.payBasis === "OPERATION_DAY");
  const dayOverrides = await getOperationDayOverrides(period.startDate, period.endDate);
  const periodDates: string[] = [];
  for (let t = period.startDate.getTime(); t <= period.endDate.getTime(); t += 86400000) {
    periodDates.push(new Date(t).toISOString().slice(0, 10));
  }
  const dayTypeLabels = { COOKING: "Cooking", JAR_FILLING: "Jar filling", OFF: "Off" } as const;

  const payslips = await Promise.all(
    employees.map(async (emp) => {
      const payslip = await getOrRefreshDraftPayslip(emp.id, id);
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
      const lateActions = await prisma.lateDayAction.findMany({
        where: { employeeId: emp.id, date: { gte: period.startDate, lte: period.endDate } },
      });
      const handledLateDays = new Set(
        lateActions
          .filter((a) => a.dismissed || a.payslipAdjustmentId)
          .map((a) => a.date.toISOString().slice(0, 10))
      );
      const dailyResults = await getPeriodDailyResults(emp.id, period, settings);
      // Production staff are paid the full day rate for any day worked, so
      // point out the days they cut short -- the admin decides whether each
      // one needs a "Half day" deduction.
      const earlyOutDays =
        emp.payBasis === "OPERATION_DAY"
          ? dailyResults
              .filter(
                (d) =>
                  (d.isUndertime || d.missingTimeOut) && d.workedMinutes > 0 && d.dayStatus === null
              )
              .map((d) => ({
                date: d.date,
                noTimeOut: d.missingTimeOut,
                dayType: resolveOperationDayForDate(d.date, dayOverrides),
                hours: d.regularMinutes / 60,
              }))
          : [];
      // Worked on a day the rotation says is Off (Sunday) and nobody set the day
      // type: they're paid the Jar Filling rate unless it's set to Cooking.
      const offDaysWorked =
        emp.payBasis === "OPERATION_DAY"
          ? dailyResults
              .filter(
                (d) =>
                  d.workedMinutes > 0 &&
                  d.dayStatus !== "UNPAID_ABSENCE" &&
                  resolveOperationDayForDate(d.date, dayOverrides) === "OFF"
              )
              .map((d) => d.date)
          : [];
      const suggestedLate = dailyResults
        .filter(
          (d) =>
            d.isLate && suggestedLateDeduction(d.lateMinutes) > 0 && !handledLateDays.has(d.date)
        )
        .map((d) => ({
          date: d.date,
          lateMinutes: d.lateMinutes,
          amount: suggestedLateDeduction(d.lateMinutes),
        }));
      return {
        employee: emp,
        payslip,
        suggestedCleaningBonuses,
        suggestedLate,
        earlyOutDays,
        offDaysWorked,
      };
    })
  );

  const unsetOffDays = [...new Set(payslips.flatMap((p) => p.offDaysWorked))].sort();

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

      {period.status === "OPEN" && unsetOffDays.length > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Production staff worked on {unsetOffDays.join(", ")}, which is normally a day off. They&apos;re
          being paid the Jar Filling rate — open &quot;Day types this period&quot; below and set the
          date to Cooking or Jar filling if that&apos;s not right.
        </div>
      )}

      {hasProductionStaff && (
        <details open={unsetOffDays.length > 0} className="mb-4 bg-white rounded-lg shadow p-4">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer">
            Day types this period (sets Production pay rate)
          </summary>
          <p className="text-xs text-slate-500 mt-2 mb-2">
            Each date is a Cooking or Jar Filling day, recorded when a supervisor sets it at the
            kiosk, otherwise following the weekly rotation. Fix any date that was wrong before
            finalizing.
          </p>
          <div className="divide-y divide-slate-100">
            {periodDates.map((date) => {
              const recorded = dayOverrides.get(date);
              const effective = recorded ?? rotationDayForDate(date);
              return (
                <div key={date} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-700">
                    {date}
                    <span className="text-slate-400 ml-2">
                      {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                        weekday: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                  </span>
                  {period.status === "OPEN" ? (
                    <form action={setPeriodDayType} className="flex items-center gap-2">
                      <input type="hidden" name="payPeriodId" value={period.id} />
                      <input type="hidden" name="date" value={date} />
                      <select
                        name="operationDay"
                        defaultValue={recorded ?? "AUTO"}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="AUTO">
                          Rotation ({dayTypeLabels[rotationDayForDate(date)]})
                        </option>
                        <option value="COOKING">Cooking</option>
                        <option value="JAR_FILLING">Jar filling</option>
                      </select>
                      <button className="rounded-md bg-slate-900 text-white text-xs px-3 py-1 hover:bg-slate-800">
                        Save
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-600">{dayTypeLabels[effective]}</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="space-y-4">
        {payslips.map(({ employee, payslip, suggestedCleaningBonuses, suggestedLate, earlyOutDays }) => {
          const adjTotal = adjustmentsTotal(payslip.adjustments);
          const total = Number(payslip.grossPay) + adjTotal;
          const breakdownLines =
            (payslip.payBreakdown as { lines?: PayBreakdownLine[] } | null)?.lines ?? [];

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
                    gross ₱{Number(payslip.grossPay).toFixed(2)}
                    {adjTotal !== 0 && ` ${adjTotal > 0 ? "+" : ""}${adjTotal.toFixed(2)} adj.`}
                  </div>
                </div>
              </div>

              {breakdownLines.length > 0 && (
                <ul className="mb-2 text-xs text-slate-600 space-y-0.5">
                  {breakdownLines.map((l) => (
                    <li key={l.label}>
                      {l.days} × {l.label} @ ₱{l.rate.toFixed(2)} = ₱{l.amount.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}

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

              {payslip.status !== "FINALIZED" && earlyOutDays.length > 0 && (
                <div className="mb-2 rounded-md bg-blue-50 border border-blue-200 p-2">
                  <p className="text-xs font-medium text-blue-800 mb-1">
                    Left early / Half day — paid the full day rate. Add a &quot;Half day&quot; deduction
                    below if it was a half day.
                  </p>
                  {earlyOutDays.map((d) => (
                    <div key={d.date} className="text-xs text-slate-700 py-0.5">
                      {d.date} — {d.dayType === "COOKING" ? "Cooking" : "Jar filling"} day,{" "}
                      {d.hours.toFixed(2)}h worked
                      {d.noTimeOut && " — no Time Out (didn't come back after break?)"}
                    </div>
                  ))}
                </div>
              )}

              {payslip.status !== "FINALIZED" && suggestedLate.length > 0 && (
                <div className="mb-2 rounded-md bg-red-50 border border-red-200 p-2">
                  <p className="text-xs font-medium text-red-800 mb-1">
                    Suggested deductions for late arrivals
                  </p>
                  {suggestedLate.map((l) => (
                    <div key={l.date} className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-700">
                        Late {l.lateMinutes} min — {l.date}
                      </span>
                      <div className="flex items-center gap-2">
                        <form action={addLateDeductionToPayslip} className="flex items-center gap-2">
                          <input type="hidden" name="payslipId" value={payslip.id} />
                          <input type="hidden" name="date" value={l.date} />
                          <span className="text-slate-500">₱</span>
                          <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            defaultValue={l.amount.toFixed(2)}
                            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button className="rounded-md bg-red-600 text-white px-2 py-1 hover:bg-red-500">
                            Deduct from payslip
                          </button>
                        </form>
                        <form action={dismissLateSuggestion}>
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <input type="hidden" name="date" value={l.date} />
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
                        <option value="Half day">Half day</option>
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
