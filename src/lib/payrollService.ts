import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSettings, getOperationDayOverrides } from "@/lib/settings";
import { getEmployeeRateFor, getOperationRatesFor } from "@/lib/payRates";
import { resolveOperationDayForDate, type OperationDay, type ResolvedOperationDay } from "@/lib/operationDay";
import {
  computeDailyResults,
  summarizePeriod,
  computeHoursPay,
  computeDayBasedPay,
  isDayBasedPayBasis,
  isEarlyOutDay,
  suggestedLateDeduction,
  localDateKey,
  TIMEZONE,
  type DailyResult,
  type PayBreakdownLine,
  type PayBasis,
} from "@/lib/payroll";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

/**
 * Returns the payslip for (employeeId, payPeriodId), creating or refreshing
 * a DRAFT row from current punches/day-statuses. A FINALIZED payslip is
 * returned untouched — its locked numbers are authoritative.
 */
export async function getOrRefreshDraftPayslip(employeeId: string, payPeriodId: string) {
  const existing = await prisma.payslip.findUnique({
    where: { employeeId_payPeriodId: { employeeId, payPeriodId } },
    include: { adjustments: true },
  });

  if (existing?.status === "FINALIZED") return existing;

  const [employee, payPeriod, settings] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId } }),
    prisma.payPeriod.findUniqueOrThrow({ where: { id: payPeriodId } }),
    getSettings(),
  ]);

  // Same per-day results as Attendance History and the payroll suggestions
  // (including one-off shift overrides), so pay matches what's shown there.
  const days = await getPeriodDailyResults(employeeId, payPeriod, settings);
  const { regularHours, overtimeHours } = summarizePeriod(days);

  let basePay: number;
  let grossPay: number;
  let payBreakdown: { lines: PayBreakdownLine[] } | null = null;
  // Each day is priced at the rate in effect that day, so a rate change
  // mid-period doesn't reprice the days before it.
  const payRateFor = await getEmployeeRateFor(employee, payPeriod.endDate);
  if (isDayBasedPayBasis(employee.payBasis)) {
    const [ratesFor, overrides] = await Promise.all([
      getOperationRatesFor(payPeriod.endDate),
      getOperationDayOverrides(payPeriod.startDate, payPeriod.endDate),
    ]);
    const pay = computeDayBasedPay(
      days,
      employee.payBasis,
      payRateFor,
      (date) => resolveOperationDayForDate(date, overrides),
      ratesFor
    );
    basePay = pay.basePay;
    grossPay = pay.grossPay;
    payBreakdown = { lines: pay.lines };
  } else {
    const pay = computeHoursPay(days, employee.payBasis, payRateFor, settings);
    basePay = pay.basePay;
    grossPay = pay.grossPay;
  }

  const data = {
    regularHours,
    overtimeHours,
    basePay,
    grossPay,
    payBreakdown: payBreakdown
      ? (payBreakdown as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
  };

  const payslip = await prisma.payslip.upsert({
    where: { employeeId_payPeriodId: { employeeId, payPeriodId } },
    update: data,
    create: { employeeId, payPeriodId, ...data },
    include: { adjustments: true },
  });

  return payslip;
}

/** Per-day results for one employee over a pay period, computed the same way
 * as their Attendance History (including one-off shift overrides). */
export async function getPeriodDailyResults(
  employeeId: string,
  period: { startDate: Date; endDate: Date },
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<DailyResult[]> {
  const startDate = period.startDate.toISOString().slice(0, 10);
  const endDate = period.endDate.toISOString().slice(0, 10);
  const startUtc = fromZonedTime(`${startDate}T00:00:00`, TIMEZONE);
  const endExclusiveUtc = fromZonedTime(
    `${addDays(new Date(`${endDate}T00:00:00.000Z`), 1).toISOString().slice(0, 10)}T00:00:00`,
    TIMEZONE
  );

  const [punches, dayStatuses, shiftOverrides] = await Promise.all([
    prisma.punch.findMany({
      where: { employeeId, voided: false, timestamp: { gte: startUtc, lt: endExclusiveUtc } },
    }),
    prisma.dayStatus.findMany({
      where: { employeeId, date: { gte: period.startDate, lte: period.endDate } },
    }),
    prisma.shiftOverride.findMany({
      where: { date: { gte: period.startDate, lte: period.endDate } },
    }),
  ]);

  return computeDailyResults(
    punches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
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
}

export function adjustmentsTotal(adjustments: { amount: unknown }[]): number {
  return adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
}

export interface EmployeePeriodReview {
  dailyResults: DailyResult[];
  /** Late days with a suggested deduction that hasn't been deducted or skipped. */
  suggestedLate: { date: string; lateMinutes: number; amount: number }[];
  /** Production days cut short that haven't been deducted or skipped. */
  earlyOutDays: { date: string; noTimeOut: boolean; dayType: ResolvedOperationDay; hours: number }[];
  /** Past days with a Time In but no Time Out (not already covered above). */
  noTimeOutDays: string[];
  /** Production days worked on a rotation Off day with no day type recorded. */
  offDaysWorked: string[];
}

/** Everything the payroll page points out for one employee in a pay period --
 * the same checks finalizing a period requires to be handled. */
export async function getEmployeePeriodReview(
  employee: { id: string; payBasis: PayBasis },
  period: { startDate: Date; endDate: Date },
  settings: Awaited<ReturnType<typeof getSettings>>,
  dayOverrides: Map<string, OperationDay>
): Promise<EmployeePeriodReview> {
  const isProduction = employee.payBasis === "OPERATION_DAY";
  const range = { gte: period.startDate, lte: period.endDate };

  const [dailyResults, lateActions, halfDayActions] = await Promise.all([
    getPeriodDailyResults(employee.id, period, settings),
    prisma.lateDayAction.findMany({ where: { employeeId: employee.id, date: range } }),
    isProduction
      ? prisma.halfDayAction.findMany({ where: { employeeId: employee.id, date: range } })
      : Promise.resolve([]),
  ]);

  const handled = (actions: { dismissed: boolean; payslipAdjustmentId: string | null; date: Date }[]) =>
    new Set(
      actions
        .filter((a) => a.dismissed || a.payslipAdjustmentId)
        .map((a) => a.date.toISOString().slice(0, 10))
    );
  const handledLateDays = handled(lateActions);
  const handledHalfDays = handled(halfDayActions);

  // Production staff are paid the full day rate for any day worked, so point
  // out the days they cut short -- the admin can deduct for a half day or skip
  // it. Days already deducted or skipped aren't shown again.
  const earlyOutDays = isProduction
    ? dailyResults
        .filter((d) => isEarlyOutDay(d) && !handledHalfDays.has(d.date))
        .map((d) => ({
          date: d.date,
          noTimeOut: d.missingTimeOut,
          dayType: resolveOperationDayForDate(d.date, dayOverrides),
          hours: d.regularMinutes / 60,
        }))
    : [];

  // A forgotten Time Out only counts the time up to their last punch, so point
  // it out for everyone. Production days that get the Half day suggestion
  // above already carry the note (even once deducted or skipped), so skip
  // those here.
  const today = localDateKey(new Date());
  const earlyOutDates = new Set(isProduction ? dailyResults.filter(isEarlyOutDay).map((d) => d.date) : []);
  const noTimeOutDays = dailyResults
    .filter((d) => d.missingTimeOut && d.dayStatus === null && d.date < today && !earlyOutDates.has(d.date))
    .map((d) => d.date);

  // Worked on a day the rotation says is Off (Sunday) and nobody set the day
  // type: they're paid the Jar Filling rate unless it's set to Cooking.
  const offDaysWorked = isProduction
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
    .filter((d) => d.isLate && suggestedLateDeduction(d.lateMinutes) > 0 && !handledLateDays.has(d.date))
    .map((d) => ({ date: d.date, lateMinutes: d.lateMinutes, amount: suggestedLateDeduction(d.lateMinutes) }));

  return { dailyResults, suggestedLate, earlyOutDays, noTimeOutDays, offDaysWorked };
}

/** What still needs attention on one draft payslip before its period is
 * finalized. Off days worked are period-wide, so they're reported separately
 * (see finalizeIssues). */
export function payslipIssues(
  payBasis: PayBasis,
  review: EmployeePeriodReview,
  netPay: number
): string[] {
  const issues: string[] = [];
  // Flat-daily staff are paid the full day either way, so a missing Time Out
  // doesn't change their pay; production days are covered by the half-day check.
  if (payBasis !== "FLAT_DAILY" && review.noTimeOutDays.length > 0) {
    issues.push(`No Time Out on ${review.noTimeOutDays.join(", ")} — set it on the Attendance page`);
  }
  if (review.earlyOutDays.length > 0) {
    issues.push(`Half day not decided (Deduct or Skip) on ${review.earlyOutDays.map((d) => d.date).join(", ")}`);
  }
  if (review.suggestedLate.length > 0) {
    issues.push(`Late deduction not decided (Deduct or Skip) on ${review.suggestedLate.map((l) => l.date).join(", ")}`);
  }
  if (netPay < 0) {
    issues.push(`Net pay is below zero (₱${netPay.toFixed(2)}) — deductions are more than gross pay`);
  }
  return issues;
}

export interface FinalizeIssues {
  byEmployee: { employeeId: string; employeeName: string; issues: string[] }[];
  unsetOffDays: string[];
}

export function hasFinalizeIssues(f: FinalizeIssues): boolean {
  return f.byEmployee.length > 0 || f.unsetOffDays.length > 0;
}

/** Collects the per-payslip issues into the checklist shown before finalizing.
 * Already-finalized payslips (e.g. after another one was unlocked) are skipped. */
export function finalizeIssues(
  rows: {
    employee: { id: string; name: string; payBasis: PayBasis };
    payslip: { status: string; grossPay: unknown; adjustments: { amount: unknown }[] };
    review: EmployeePeriodReview;
  }[]
): FinalizeIssues {
  const drafts = rows.filter((r) => r.payslip.status !== "FINALIZED");
  const byEmployee = drafts
    .map((r) => ({
      employeeId: r.employee.id,
      employeeName: r.employee.name,
      issues: payslipIssues(
        r.employee.payBasis,
        r.review,
        Number(r.payslip.grossPay) + adjustmentsTotal(r.payslip.adjustments)
      ),
    }))
    .filter((e) => e.issues.length > 0);
  const unsetOffDays = [...new Set(drafts.flatMap((r) => r.review.offDaysWorked))].sort();
  return { byEmployee, unsetOffDays };
}
