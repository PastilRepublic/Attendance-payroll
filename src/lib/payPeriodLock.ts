import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The pay period covering a local (Manila) date whose pay is locked for this
 * employee, if any: either the whole period is finalized, or the period was
 * reopened (another payslip unlocked) but this employee's payslip is still
 * finalized. A finalized payslip is frozen, so attendance for those days must
 * not change either -- otherwise the attendance page would show hours that no
 * longer match what was paid.
 */
export async function findFinalizedPeriodCovering(
  employeeId: string,
  dateKey: string,
  db: Prisma.TransactionClient = prisma
) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return db.payPeriod.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      OR: [
        { status: "FINALIZED" },
        { payslips: { some: { employeeId, status: "FINALIZED" } } },
      ],
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
}

export function finalizedPeriodMessage(period: {
  startDate: Date;
  endDate: Date;
  status: "OPEN" | "FINALIZED";
}): string {
  const start = period.startDate.toISOString().slice(0, 10);
  const end = period.endDate.toISOString().slice(0, 10);
  if (period.status === "FINALIZED") {
    return `This day is in the finalized pay period ${start} to ${end}, so its attendance is locked.`;
  }
  return `This employee's payslip for ${start} to ${end} is finalized, so this day's attendance is locked. Unlock the payslip on Payroll to change it.`;
}
