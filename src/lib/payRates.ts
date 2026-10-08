import { prisma } from "@/lib/prisma";
import { getOperationPayRates } from "@/lib/settings";
import { localDateKey, rateInEffect, type OperationPayRates } from "@/lib/payroll";

/** Effective date of a rate that applies to every day so far (an employee's
 * first rate, or the rates in place when rate history began). */
const RATE_HISTORY_START = new Date("2000-01-01T00:00:00.000Z");

const todayDate = () => new Date(`${localDateKey(new Date())}T00:00:00.000Z`);

/**
 * Records an employee's pay rate after a create or edit. A new employee's
 * first rate covers every day. A changed rate takes effect today (Manila), so
 * the days before it keep their old rate. A changed pay basis restarts the
 * history after the employee's last finalized payslip -- an hourly rate can't
 * price a daily day -- so the new rate covers every unfinalized day, while
 * finalized weeks keep the rates they were paid at.
 */
export async function recordEmployeeRate(
  employeeId: string,
  payRate: number,
  change: "CREATED" | "RATE_CHANGED" | "BASIS_CHANGED",
  previousRate?: number
) {
  if (change === "RATE_CHANGED") {
    // No history yet: the old rate still covers the days before today.
    const hasHistory = await prisma.employeeRateChange.count({ where: { employeeId } });
    if (!hasHistory && previousRate !== undefined) {
      await prisma.employeeRateChange.create({
        data: { employeeId, effectiveDate: RATE_HISTORY_START, payRate: previousRate },
      });
    }
    const effectiveDate = todayDate();
    await prisma.employeeRateChange.upsert({
      where: { employeeId_effectiveDate: { employeeId, effectiveDate } },
      update: { payRate },
      create: { employeeId, effectiveDate, payRate },
    });
    return;
  }
  let effectiveDate = RATE_HISTORY_START;
  if (change === "BASIS_CHANGED") {
    const lastFinalized = await prisma.payslip.findFirst({
      where: { employeeId, status: "FINALIZED" },
      orderBy: { payPeriod: { endDate: "desc" } },
      select: { payPeriod: { select: { endDate: true } } },
    });
    if (lastFinalized) effectiveDate = new Date(lastFinalized.payPeriod.endDate.getTime() + 86400000);
  }
  await prisma.$transaction([
    prisma.employeeRateChange.deleteMany({ where: { employeeId, effectiveDate: { gte: effectiveDate } } }),
    prisma.employeeRateChange.create({ data: { employeeId, effectiveDate, payRate } }),
  ]);
}

/** Records new Production day rates, taking effect today (Manila). */
export async function recordOperationRates(rates: OperationPayRates, previous: OperationPayRates) {
  // No history yet: the old rates still cover the days before today.
  if (!(await prisma.operationRateChange.count())) {
    await prisma.operationRateChange.create({
      data: {
        effectiveDate: RATE_HISTORY_START,
        cookingDayRate: previous.cooking,
        jarFillingDayRate: previous.jarFilling,
      },
    });
  }
  const effectiveDate = todayDate();
  const data = { cookingDayRate: rates.cooking, jarFillingDayRate: rates.jarFilling };
  await prisma.operationRateChange.upsert({
    where: { effectiveDate },
    update: data,
    create: { effectiveDate, ...data },
  });
}

/** An employee's pay rate in effect on each local date, up to `through`. */
export async function getEmployeeRateFor(
  employee: { id: string; payRate: unknown },
  through: Date
): Promise<(date: string) => number> {
  const rows = await prisma.employeeRateChange.findMany({
    where: { employeeId: employee.id, effectiveDate: { lte: through } },
    orderBy: { effectiveDate: "asc" },
  });
  const changes = rows.map((r) => ({
    effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
    rate: Number(r.payRate),
  }));
  const current = { effectiveDate: "", rate: Number(employee.payRate) };
  return (date) => rateInEffect(changes, date, current).rate;
}

/** The Production day rates in effect on each local date, up to `through`. */
export async function getOperationRatesFor(through: Date): Promise<(date: string) => OperationPayRates> {
  const [rows, current] = await Promise.all([
    prisma.operationRateChange.findMany({
      where: { effectiveDate: { lte: through } },
      orderBy: { effectiveDate: "asc" },
    }),
    getOperationPayRates(),
  ]);
  const changes = rows.map((r) => ({
    effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
    rates: { cooking: Number(r.cookingDayRate), jarFilling: Number(r.jarFillingDayRate) },
  }));
  const fallback = { effectiveDate: "", rates: current };
  return (date) => rateInEffect(changes, date, fallback).rates;
}
