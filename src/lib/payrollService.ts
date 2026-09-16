import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { computeDailyResults, summarizePeriod, computePay, TIMEZONE } from "@/lib/payroll";
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

  const startDate = payPeriod.startDate.toISOString().slice(0, 10);
  const endDate = payPeriod.endDate.toISOString().slice(0, 10);

  const periodStartUtc = fromZonedTime(`${startDate}T00:00:00`, TIMEZONE);
  const periodEndExclusiveUtc = fromZonedTime(
    `${addDays(new Date(`${endDate}T00:00:00.000Z`), 1).toISOString().slice(0, 10)}T00:00:00`,
    TIMEZONE
  );

  const [punches, dayStatuses] = await Promise.all([
    prisma.punch.findMany({
      where: {
        employeeId,
        voided: false,
        timestamp: { gte: periodStartUtc, lt: periodEndExclusiveUtc },
      },
    }),
    prisma.dayStatus.findMany({
      where: { employeeId, date: { gte: payPeriod.startDate, lte: payPeriod.endDate } },
    }),
  ]);

  const days = computeDailyResults(
    punches.map((p) => ({ timestamp: p.timestamp, type: p.type })),
    dayStatuses.map((d) => ({ date: d.date.toISOString().slice(0, 10), status: d.status })),
    settings,
    startDate,
    endDate
  );
  const { regularHours, overtimeHours } = summarizePeriod(days);
  const pay = computePay(regularHours, employee.payBasis, Number(employee.payRate), settings);

  const data = {
    regularHours,
    overtimeHours,
    basePay: pay.basePay,
    grossPay: pay.grossPay,
  };

  const payslip = await prisma.payslip.upsert({
    where: { employeeId_payPeriodId: { employeeId, payPeriodId } },
    update: data,
    create: { employeeId, payPeriodId, ...data },
    include: { adjustments: true },
  });

  return payslip;
}

export function adjustmentsTotal(adjustments: { amount: unknown }[]): number {
  return adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
}
