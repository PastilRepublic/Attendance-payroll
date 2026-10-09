import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Badge from "@/components/Badge";
import { formatInTimeZone } from "date-fns-tz";
import { pillClass } from "@/components/ui/styles";
import PeriodSummary from "./PeriodSummary";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getOrRefreshDraftPayslip,
  adjustmentsTotal,
  getEmployeePeriodReview,
  finalizeIssues,
  hasFinalizeIssues,
} from "@/lib/payrollService";
import { localDateKey, type PayBreakdownLine } from "@/lib/payroll";
import { getSettings, getOperationDayOverrides } from "@/lib/settings";
import { rotationDayForDate } from "@/lib/operationDay";
import {
  removeAdjustment,
  dismissBonusSuggestion,
  dismissLateSuggestion,
  dismissHalfDaySuggestion,
  finalizePeriodForm,
  setPeriodDayTypeForm,
  addSanitationBonusForm,
  addHalfDayDeductionForm,
  addLateDeductionForm,
  addAdjustmentForm,
  unlockPayslipForm,
} from "../actions";

// Pay period dates are stored as plain dates (UTC midnight), so format them in UTC.
const fmtDate = (d: Date, pattern: string) => formatInTimeZone(d, "UTC", pattern);

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
      const review = await getEmployeePeriodReview(emp, period, settings, dayOverrides);
      return {
        employee: emp,
        payslip,
        review,
        suggestedCleaningBonuses,
        ...review,
        paidFullDay: emp.payBasis === "FLAT_DAILY",
      };
    })
  );

  // The checklist finalizing requires to be handled (or explicitly overridden).
  const issues = finalizeIssues(payslips);
  const { unsetOffDays } = issues;
  const openIssues = hasFinalizeIssues(issues);
  const endDate = period.endDate.toISOString().slice(0, 10);
  const periodEnded = localDateKey(new Date()) > endDate;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/payroll" className="text-sm text-slate-500 hover:underline">
            ← Pay periods
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {fmtDate(period.startDate, "MMM d")} – {fmtDate(period.endDate, "MMM d, yyyy")}
          </h1>
          <div className="mt-1.5">
            <Badge status={period.status === "FINALIZED" ? "finalized" : "open"} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {period.status === "OPEN" &&
            (periodEnded ? (
              <ActionForm action={finalizePeriodForm} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="payPeriodId" value={period.id} />
                {openIssues && (
                  <label className="flex items-center gap-1.5 text-xs text-rose-700">
                    <input type="checkbox" name="acknowledgeIssues" required />
                    Finalize anyway
                  </label>
                )}
                <button className={pillClass("primary")}>Finalize period</button>
              </ActionForm>
            ) : (
              <span className="rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-600">
                Can be finalized after {fmtDate(period.endDate, "MMM d")}
              </span>
            ))}
        </div>
      </div>

      <PeriodSummary
        grossTotal={payslips.reduce((sum, r) => sum + Number(r.payslip.grossPay), 0)}
        bonusTotal={payslips.reduce(
          (sum, r) => sum + r.payslip.adjustments.reduce((a, x) => a + Math.max(Number(x.amount), 0), 0),
          0
        )}
        deductionTotal={payslips.reduce(
          (sum, r) => sum + r.payslip.adjustments.reduce((a, x) => a + Math.abs(Math.min(Number(x.amount), 0)), 0),
          0
        )}
        openItems={issues.byEmployee.reduce((n, e) => n + e.issues.length, 0) + (unsetOffDays.length > 0 ? 1 : 0)}
        employeeCount={payslips.length}
      />

      {period.status === "OPEN" && openIssues && (
        <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-900">
          <p className="font-medium mb-1">Before finalizing</p>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            {unsetOffDays.length > 0 && (
              <li>
                Production worked on {unsetOffDays.join(", ")} (normally Off) — set the day type below
              </li>
            )}
            {issues.byEmployee.flatMap((e) =>
              e.issues.map((issue) => (
                <li key={`${e.employeeId}:${issue}`}>
                  <span className="font-medium">{e.employeeName}:</span> {issue}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {period.status === "OPEN" && unsetOffDays.length > 0 && (
        <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          Production staff worked on {unsetOffDays.join(", ")}, which is normally a day off. They&apos;re
          being paid the Jar Filling rate — open &quot;Day types this period&quot; below and set the
          date to Cooking or Jar filling if that&apos;s not right.
        </div>
      )}

      {hasProductionStaff && (
        <details open={unsetOffDays.length > 0} className="mb-4 rounded-3xl border border-slate-300 bg-white shadow-sm p-5 sm:p-6">
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
                    <ActionForm action={setPeriodDayTypeForm} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="payPeriodId" value={period.id} />
                      <input type="hidden" name="date" value={date} />
                      <select
                        name="operationDay"
                        defaultValue={recorded ?? "AUTO"}
                        className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                      >
                        <option value="AUTO">
                          Rotation ({dayTypeLabels[rotationDayForDate(date)]})
                        </option>
                        <option value="COOKING">Cooking</option>
                        <option value="JAR_FILLING">Jar filling</option>
                      </select>
                      <button className="rounded-full bg-accent-800 text-white text-xs font-medium px-3.5 py-1.5 hover:bg-accent-900">
                        Save
                      </button>
                    </ActionForm>
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
        {payslips.map(({ employee, payslip, suggestedCleaningBonuses, suggestedLate, earlyOutDays, noTimeOutDays, paidFullDay }) => {
          const adjTotal = adjustmentsTotal(payslip.adjustments);
          const total = Number(payslip.grossPay) + adjTotal;
          const breakdownLines =
            (payslip.payBreakdown as { lines?: PayBreakdownLine[] } | null)?.lines ?? [];

          return (
            <div key={employee.id} className="rounded-3xl border border-slate-300 bg-white shadow-sm p-5 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-lg font-semibold text-slate-900">{employee.name}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {Number(payslip.regularHours).toFixed(2)}h regular
                    {Number(payslip.overtimeHours) > 0 &&
                      ` + ${Number(payslip.overtimeHours).toFixed(2)}h OT`}
                  </span>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-extrabold tracking-tight ${total < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {total < 0 ? "-" : ""}₱{Math.abs(total).toFixed(2)}
                  </div>
                  {total < 0 && (
                    <div className="text-xs font-medium text-red-700">Below zero — check deductions</div>
                  )}
                  <div className="text-xs text-slate-500">
                    gross ₱{Number(payslip.grossPay).toFixed(2)}
                    {adjTotal !== 0 && ` ${adjTotal > 0 ? "+" : ""}${adjTotal.toFixed(2)} adj.`}
                  </div>
                </div>
              </div>

              {breakdownLines.length > 0 && (
                <ul className="mb-2 text-xs text-slate-600 space-y-0.5">
                  {breakdownLines.map((l) => (
                    <li key={`${l.label}-${l.rate}`}>
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
                  <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200">
                    <ul className="divide-y divide-slate-100">
                      {sorted.map((adj) => {
                        const amount = Number(adj.amount);
                        const isBonus = amount > 0;
                        return (
                          <li key={adj.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    isBonus
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {isBonus ? "Bonus" : "Deduction"}
                                </span>
                                <span className="text-sm font-medium text-slate-800">{adj.label}</span>
                              </div>
                              {adj.note && <div className="mt-0.5 text-xs text-slate-500">{adj.note}</div>}
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span
                                className={`text-sm font-semibold ${isBonus ? "text-emerald-700" : "text-rose-700"}`}
                              >
                                {isBonus ? "+" : "−"}
                                {Math.abs(amount).toFixed(2)}
                              </span>
                              {payslip.status !== "FINALIZED" && (
                                <form action={removeAdjustment}>
                                  <input type="hidden" name="adjustmentId" value={adj.id} />
                                  <button className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">
                                    Remove
                                  </button>
                                </form>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium">
                      <span className="text-slate-600">Net adjustments</span>
                      <span className={netTotal >= 0 ? "text-emerald-700" : "text-rose-700"}>
                        {netTotal >= 0 ? "+" : "−"}
                        {Math.abs(netTotal).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {payslip.status !== "FINALIZED" && suggestedCleaningBonuses.length > 0 && (
                <div className="mb-3 rounded-2xl bg-amber-50 border border-amber-200 p-3">
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
                      <ActionForm action={addSanitationBonusForm} className="flex flex-wrap items-center gap-2">
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
                          className="w-24 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                        />
                        <button className="rounded-full bg-amber-600 text-white text-xs font-medium px-3.5 py-1.5 hover:bg-amber-500">
                          Add to payslip
                        </button>
                      </ActionForm>
                      <form action={dismissBonusSuggestion}>
                        <input type="hidden" name="kind" value="SANITATION" />
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <input type="hidden" name="payPeriodId" value={period.id} />
                        <button className="rounded-full border border-slate-300 bg-slate-100 text-slate-700 px-3.5 py-1.5 text-xs font-medium hover:bg-slate-200">
                          Skip
                        </button>
                      </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payslip.status !== "FINALIZED" && noTimeOutDays.length > 0 && (
                <div className="mb-3 rounded-2xl bg-rose-50 border border-rose-200 p-3">
                  <p className="text-xs font-medium text-red-800">
                    {paidFullDay
                      ? `No Time Out on ${noTimeOutDays.join(", ")} — paid the full day rate. Set their actual Time Out on the Attendance page if you want the record complete.`
                      : `No Time Out on ${noTimeOutDays.join(", ")} — only the time up to their last punch is counted. Set their actual Time Out on the Attendance page (whether they worked the full day or went home early) before finalizing.`}
                  </p>
                </div>
              )}

              {payslip.status !== "FINALIZED" && earlyOutDays.length > 0 && (
                <div className="mb-3 rounded-2xl bg-accent-50 border border-accent-200 p-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">
                    Half day — paid the full day rate. Enter the amount to deduct if it
                    was a half day, or Skip.
                  </p>
                  {earlyOutDays.map((d) => (
                    <div key={d.date} className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-700">
                        {d.date} — {d.dayType === "COOKING" ? "Cooking" : "Jar filling"} day,{" "}
                        {d.hours.toFixed(2)}h worked
                        {d.noTimeOut && " — no Time Out (didn't come back after break?)"}
                      </span>
                      <div className="flex items-center gap-2">
                        <ActionForm action={addHalfDayDeductionForm} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="payslipId" value={payslip.id} />
                          <input type="hidden" name="date" value={d.date} />
                          <span className="text-slate-500">₱</span>
                          <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            placeholder="Amount"
                            className="w-24 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                          />
                          <button className="rounded-full bg-accent-800 text-white text-xs font-medium px-3.5 py-1.5 hover:bg-accent-900">
                            Deduct from payslip
                          </button>
                        </ActionForm>
                        <form action={dismissHalfDaySuggestion}>
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <input type="hidden" name="date" value={d.date} />
                          <input type="hidden" name="payPeriodId" value={period.id} />
                          <button className="rounded-full border border-slate-300 bg-slate-100 text-slate-700 px-3.5 py-1.5 text-xs font-medium hover:bg-slate-200">
                            Skip
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payslip.status !== "FINALIZED" && suggestedLate.length > 0 && (
                <div className="mb-3 rounded-2xl bg-rose-50 border border-rose-200 p-3">
                  <p className="text-xs font-medium text-red-800 mb-1">
                    Suggested deductions for late arrivals
                  </p>
                  {suggestedLate.map((l) => (
                    <div key={l.date} className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-700">
                        Late {l.lateMinutes} min — {l.date}
                      </span>
                      <div className="flex items-center gap-2">
                        <ActionForm action={addLateDeductionForm} className="flex flex-wrap items-center gap-2">
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
                            className="w-24 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                          />
                          <button className="rounded-full bg-rose-600 text-white text-xs font-medium px-3.5 py-1.5 hover:bg-rose-500">
                            Deduct from payslip
                          </button>
                        </ActionForm>
                        <form action={dismissLateSuggestion}>
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <input type="hidden" name="date" value={l.date} />
                          <input type="hidden" name="payPeriodId" value={period.id} />
                          <button className="rounded-full border border-slate-300 bg-slate-100 text-slate-700 px-3.5 py-1.5 text-xs font-medium hover:bg-slate-200">
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
                  <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200">
                    + Add adjustment
                  </summary>
                  <ActionForm action={addAdjustmentForm} resetOnSuccess className="flex flex-wrap items-end gap-2 mt-2">
                    <input type="hidden" name="payslipId" value={payslip.id} />
                    <div>
                      <label className="block text-xs text-slate-500">Label</label>
                      <select
                        name="label"
                        required
                        defaultValue=""
                        className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
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
                        className="w-28 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                      />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-slate-500">Note</label>
                      <input
                        name="note"
                        className="w-full rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                      />
                    </div>
                    <button className="rounded-full bg-accent-800 text-white text-xs font-medium px-4 py-2 hover:bg-accent-900">
                      Add
                    </button>
                  </ActionForm>
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
                    <ActionForm
                      action={unlockPayslipForm}
                      className="absolute z-10 mt-1 right-4 bg-white shadow-lg rounded-2xl border border-slate-200 p-4 flex flex-col gap-2 w-64"
                    >
                      <input type="hidden" name="payslipId" value={payslip.id} />
                      <label className="block text-xs text-slate-500">Reason (required)</label>
                      <input
                        name="reason"
                        required
                        minLength={3}
                        className="w-full rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                      />
                      <button className="rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium px-4 py-2 hover:bg-rose-100">
                        Confirm Unlock
                      </button>
                    </ActionForm>
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
